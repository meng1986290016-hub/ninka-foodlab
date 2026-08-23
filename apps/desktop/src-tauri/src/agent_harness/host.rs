use std::{
    collections::BTreeMap,
    env, fs,
    net::{IpAddr, SocketAddr, TcpStream as StdTcpStream},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

#[cfg(target_os = "macos")]
use std::process::Command as StdCommand;

use getrandom::fill;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    process::{Child, Command},
    sync::Mutex,
    task::JoinHandle,
    time::{sleep, timeout},
};
use url::Url;

use super::model::{
    EXPECTED_HARNESS_VERSION, EXPECTED_NODE_VERSION, HarnessHealth, HarnessHealthStatus,
};

const PROFILE_NAME: &str = "foodlab";
const START_TIMEOUT_ATTEMPTS: usize = 300;
const MAX_STARTUP_DIAGNOSTIC_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug, Default)]
pub struct HarnessLaunchEnvironment {
    pub mcp_command: Option<PathBuf>,
    pub mcp_environment: BTreeMap<String, String>,
}

pub struct HarnessHost {
    home: PathBuf,
    runtime: PathBuf,
    node_binary: PathBuf,
    start_guard: Mutex<()>,
    state: Mutex<HostState>,
    verification: Mutex<Option<Result<(), String>>>,
}

enum HostState {
    Stopped,
    Starting,
    Running {
        child: Box<Child>,
        proxy_port: u16,
        token: String,
        proxy_task: JoinHandle<()>,
        diagnostic_task: JoinHandle<()>,
        diagnostics: Arc<StdMutex<StartupDiagnostics>>,
    },
    Failed(String),
}

impl HarnessHost {
    pub fn new(home: PathBuf, runtime: PathBuf, node_binary: PathBuf) -> Self {
        Self {
            home,
            runtime,
            node_binary,
            start_guard: Mutex::new(()),
            state: Mutex::new(HostState::Stopped),
            verification: Mutex::new(None),
        }
    }

    pub fn home(&self) -> &Path {
        &self.home
    }

    pub async fn health(&self) -> HarnessHealth {
        let mut state = self.state.lock().await;
        let failure = match &mut *state {
            HostState::Running {
                child,
                proxy_task,
                diagnostics,
                ..
            } => {
                let child_failure = child.try_wait().ok().flatten().map(|_| {
                    classified_startup_failure(&diagnostic_snapshot(diagnostics))
                        .unwrap_or_else(|| "Agent 服务意外退出，请重试".to_string())
                });
                child_failure.or_else(|| {
                    proxy_task
                        .is_finished()
                        .then(|| "Agent 本地连接已中断，请重试".to_string())
                })
            }
            _ => None,
        };
        if let Some(message) = failure {
            if let HostState::Running {
                proxy_task,
                diagnostic_task,
                ..
            } = &*state
            {
                proxy_task.abort();
                diagnostic_task.abort();
            }
            *state = HostState::Failed(message);
        }

        match &*state {
            HostState::Starting => runtime_health(HarnessHealthStatus::Starting, None),
            HostState::Running { .. } => runtime_health(HarnessHealthStatus::Ready, None),
            HostState::Failed(message) => {
                runtime_health(HarnessHealthStatus::Failed, Some(message.clone()))
            }
            HostState::Stopped => {
                drop(state);
                let verification = self.runtime_verification().await;
                match verification {
                    Ok(()) => runtime_health(HarnessHealthStatus::Idle, None),
                    Err(message) => runtime_health(HarnessHealthStatus::Damaged, Some(message)),
                }
            }
        }
    }

    pub async fn start(&self, launch: HarnessLaunchEnvironment) -> Result<HarnessHealth, String> {
        // Several surfaces can request lazy startup at nearly the same time
        // (for example the main panel and the detached Agent window). Keep the
        // whole prepare/spawn sequence single-flight so they cannot race while
        // repairing the shared FoodLab profile or bind two local services.
        let _start_guard = self.start_guard.lock().await;
        let health = self.health().await;
        if health.status == HarnessHealthStatus::Ready {
            return Ok(health);
        }
        if health.status == HarnessHealthStatus::Damaged {
            return Ok(health);
        }
        if health.status == HarnessHealthStatus::Starting {
            for _ in 0..START_TIMEOUT_ATTEMPTS {
                sleep(Duration::from_millis(500)).await;
                let next = self.health().await;
                if next.status != HarnessHealthStatus::Starting {
                    return Ok(next);
                }
            }
            let mut state = self.state.lock().await;
            if matches!(&*state, HostState::Starting) {
                *state = HostState::Failed("Agent 服务启动超时，请重试".into());
            }
            drop(state);
            return Ok(self.health().await);
        }

        {
            let mut state = self.state.lock().await;
            *state = HostState::Starting;
        }
        if let Err(message) = self.prepare_profile(&launch) {
            let mut state = self.state.lock().await;
            *state = HostState::Failed(message.clone());
            return Err(message);
        }

        let listener = match std::net::TcpListener::bind("127.0.0.1:0") {
            Ok(listener) => listener,
            Err(_) => {
                let message = local_network_failure();
                let mut state = self.state.lock().await;
                *state = HostState::Failed(message.clone());
                return Err(message);
            }
        };
        let port = match listener.local_addr() {
            Ok(address) => address.port(),
            Err(_) => {
                let message = local_network_failure();
                let mut state = self.state.lock().await;
                *state = HostState::Failed(message.clone());
                return Err(message);
            }
        };
        drop(listener);

        let token = match random_token() {
            Ok(token) => token,
            Err(message) => {
                let mut state = self.state.lock().await;
                *state = HostState::Failed(message.clone());
                return Err(message);
            }
        };
        let mut command = Command::new(&self.node_binary);
        let port_string = port.to_string();
        command
            .arg(self.dsh_entrypoint())
            .args([
                "--profile",
                PROFILE_NAME,
                "--host",
                "127.0.0.1",
                "--port",
                &port_string,
                "--no-open",
            ])
            .env("DSH_HOME", &self.home)
            .env("NODE_PATH", self.runtime.join("node_modules"))
            .env("FOODLAB_HARNESS_SESSION_TOKEN", &token)
            .env("DSH_TELEMETRY_DISABLED", "1")
            // Keep package resolution inside the read-only bundled runtime.
            // Inheriting a launch directory could accidentally resolve optional
            // peers from a developer checkout or an unrelated user directory.
            .current_dir(&self.runtime)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            // Continuously drain a bounded tail so upstream output cannot
            // deadlock startup. Raw diagnostics are never exposed in product
            // UI; only allow-listed, actionable categories are returned.
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(path) = &launch.mcp_command {
            command.env("FOOD_RD_MCP_COMMAND", path);
        }
        for (name, value) in &launch.mcp_environment {
            command.env(name, value);
        }
        remove_unreachable_loopback_proxies(&mut command);

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let message = process_spawn_failure(&error);
                let mut state = self.state.lock().await;
                *state = HostState::Failed(message.clone());
                return Err(message);
            }
        };
        let diagnostics = Arc::new(StdMutex::new(StartupDiagnostics::default()));
        let Some(stderr) = child.stderr.take() else {
            let _ = child.kill().await;
            let message = "Agent 服务无法启动，请重新安装 FoodLab".to_string();
            let mut state = self.state.lock().await;
            *state = HostState::Failed(message.clone());
            return Err(message);
        };
        let mut diagnostic_task =
            tokio::spawn(drain_startup_diagnostics(stderr, Arc::clone(&diagnostics)));
        for _ in 0..START_TIMEOUT_ATTEMPTS {
            if let Ok(Some(status)) = child.try_wait() {
                let _ = status;
                let _ = timeout(Duration::from_millis(250), &mut diagnostic_task).await;
                diagnostic_task.abort();
                let message = classified_startup_failure(&diagnostic_snapshot(&diagnostics))
                    .unwrap_or_else(|| "Agent 服务启动失败，请检查安全软件后重试".to_string());
                let mut state = self.state.lock().await;
                *state = HostState::Failed(message.clone());
                return Err(message);
            }
            // The internal HTTP surface can take longer than 500 ms to render
            // its first page even after the server is ready to accept RPCs.
            // Repeated page requests therefore produced false startup
            // timeouts. Treat a successful loopback TCP connection as the
            // process readiness boundary; all real requests still go through
            // the token-authenticated proxy created immediately below.
            if timeout(
                Duration::from_millis(500),
                TcpStream::connect(("127.0.0.1", port)),
            )
            .await
            .is_ok_and(|connection| connection.is_ok())
            {
                let (proxy_port, proxy_task) = match start_auth_proxy(port, token.clone()).await {
                    Ok(proxy) => proxy,
                    Err(message) => {
                        let _ = child.kill().await;
                        diagnostic_task.abort();
                        let mut state = self.state.lock().await;
                        *state = HostState::Failed(message.clone());
                        return Err(message);
                    }
                };
                let mut state = self.state.lock().await;
                *state = HostState::Running {
                    child: Box::new(child),
                    proxy_port,
                    token,
                    proxy_task,
                    diagnostic_task,
                    diagnostics,
                };
                drop(state);
                return Ok(self.health().await);
            }
            sleep(Duration::from_millis(200)).await;
        }

        let _ = child.kill().await;
        let _ = timeout(Duration::from_millis(250), &mut diagnostic_task).await;
        diagnostic_task.abort();
        let message = classified_startup_failure(&diagnostic_snapshot(&diagnostics))
            .unwrap_or_else(|| "Agent 服务启动超时，请重试".to_string());
        let mut state = self.state.lock().await;
        *state = HostState::Failed(message.clone());
        Err(message)
    }

    pub async fn stop(&self) -> Result<HarnessHealth, String> {
        let mut state = self.state.lock().await;
        let previous = std::mem::replace(&mut *state, HostState::Stopped);
        if let HostState::Running {
            mut child,
            proxy_task,
            diagnostic_task,
            ..
        } = previous
        {
            proxy_task.abort();
            diagnostic_task.abort();
            child
                .kill()
                .await
                .map_err(|_| "无法停止 Agent 服务，请重试".to_string())?;
        }
        drop(state);
        Ok(self.health().await)
    }

    /// Calls the loopback Harness API using the official client request envelope.
    ///
    /// The official server has no authentication layer, so FoodLab sends this
    /// through its loopback token proxy instead of exposing the Harness port.
    pub async fn rpc_with_id(
        &self,
        method: &str,
        payload: Value,
        rpc_id: &str,
    ) -> Result<Value, String> {
        let (port, token) = {
            let state = self.state.lock().await;
            match &*state {
                HostState::Running {
                    proxy_port, token, ..
                } => (*proxy_port, token.clone()),
                _ => return Err("Agent 服务尚未就绪".into()),
            }
        };
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|_| "Agent 服务连接失败".to_string())?;
        let url = format!("http://127.0.0.1:{port}/api/{method}");
        let response = client
            .post(url)
            .header("origin", format!("http://127.0.0.1:{port}"))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "type": "client-request",
                "rpcId": rpc_id,
                "method": method,
                "payload": payload,
            }))
            .send()
            .await
            .map_err(agent_service_transport_error)?;
        let status = response.status();
        let body: Value = response
            .json()
            .await
            .map_err(|_| "Agent 服务返回了无效响应".to_string())?;
        if !status.is_success() {
            return Err(response_error(&body));
        }
        let result = body.get("result").unwrap_or(&body);
        if result.get("ok").and_then(Value::as_bool) == Some(false) {
            return Err(response_error(result));
        }
        Ok(result
            .get("value")
            .cloned()
            .unwrap_or_else(|| result.clone()))
    }

    fn dsh_entrypoint(&self) -> PathBuf {
        self.runtime
            .join("node_modules")
            .join("@deepseek-ai")
            .join("dsh")
            .join("lib")
            .join("bin.js")
    }

    async fn runtime_verification(&self) -> Result<(), String> {
        let mut cached = self.verification.lock().await;
        if let Some(result) = cached.as_ref() {
            return result.clone();
        }
        let result = self.verify_runtime();
        *cached = Some(result.clone());
        result
    }

    fn verify_runtime(&self) -> Result<(), String> {
        let manifest_bytes =
            fs::read(self.runtime.join("runtime-manifest.json")).map_err(|_| damaged_runtime())?;
        let trusted_manifest_sha256 = env!("FOODLAB_AGENT_MANIFEST_SHA256");
        if !trusted_manifest_sha256.is_empty()
            && hex::encode(Sha256::digest(&manifest_bytes)) != trusted_manifest_sha256
        {
            return Err(damaged_runtime());
        }
        let manifest: RuntimeManifest =
            serde_json::from_slice(&manifest_bytes).map_err(|_| damaged_runtime())?;
        let (expected_os, expected_arch, expected_triple, expected_node_sha256) =
            if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
                (
                    "darwin",
                    "arm64",
                    "aarch64-apple-darwin",
                    "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
                )
            } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
                (
                    "darwin",
                    "x64",
                    "x86_64-apple-darwin",
                    "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316",
                )
            } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
                (
                    "win32",
                    "x64",
                    "x86_64-pc-windows-msvc",
                    "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
                )
            } else {
                return Err(damaged_runtime());
            };
        let code_directory_digest_valid = if cfg!(target_os = "macos") {
            manifest
                .node_code_directory_sha256
                .as_deref()
                .is_some_and(is_sha256)
        } else {
            manifest.node_code_directory_sha256.is_none()
        };
        if manifest.schema_version != 1
            || manifest.runtime_version != EXPECTED_HARNESS_VERSION
            || manifest.node_version != EXPECTED_NODE_VERSION
            || manifest.operating_system != expected_os
            || manifest.architecture != expected_arch
            || manifest.target_triple != expected_triple
            || manifest.node_archive_sha256 != expected_node_sha256
            || !is_sha256(&manifest.package_lock_sha256)
            || !is_sha256(&manifest.node_binary_sha256)
            || !code_directory_digest_valid
        {
            return Err(damaged_runtime());
        }
        verify_node_binary(
            &self.node_binary,
            &manifest.node_binary_sha256,
            manifest.node_code_directory_sha256.as_deref(),
        )?;
        let mut required_critical_files = vec![
            "package.json".to_string(),
            "package-lock.json".to_string(),
            "node_modules/@deepseek-ai/dsh/package.json".to_string(),
            "node_modules/@deepseek-ai/dsh/lib/bin.js".to_string(),
            "node_modules/@deepseek-ai/dsh-credentials-local/package.json".to_string(),
            "node_modules/@deepseek-ai/dsh-web-frontend/package.json".to_string(),
            "node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html".to_string(),
            "node_modules/@openai/codex/package.json".to_string(),
            "node_modules/@openai/codex/bin/codex.js".to_string(),
            "node_modules/node-pty/package.json".to_string(),
            "node_modules/koffi/package.json".to_string(),
        ];
        if cfg!(target_os = "windows") {
            required_critical_files.extend([
                "node_modules/@openai/codex-win32-x64/package.json".to_string(),
                format!(
                    "node_modules/@openai/codex-win32-x64/vendor/{expected_triple}/bin/codex.exe"
                ),
                "node_modules/node-pty/prebuilds/win32-x64/conpty.node".to_string(),
                "node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node".to_string(),
                "node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll".to_string(),
                "node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe".to_string(),
                "node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node".to_string(),
            ]);
        } else {
            required_critical_files.extend([
                format!("node_modules/@openai/codex-darwin-{expected_arch}/package.json"),
                format!(
                    "node_modules/@openai/codex-darwin-{expected_arch}/vendor/{expected_triple}/bin/codex"
                ),
                format!("node_modules/node-pty/prebuilds/darwin-{expected_arch}/pty.node"),
                format!("node_modules/node-pty/prebuilds/darwin-{expected_arch}/spawn-helper"),
                format!(
                    "node_modules/@koromix/koffi-darwin-{expected_arch}/darwin_{expected_arch}/koffi.node"
                ),
            ]);
        }
        if required_critical_files
            .iter()
            .any(|relative| !manifest.critical_files.contains_key(relative))
        {
            return Err(damaged_runtime());
        }
        for (relative, expected) in &manifest.critical_files {
            if !is_safe_manifest_path(relative) {
                return Err(damaged_runtime());
            }
            verify_sha256(&self.runtime.join(relative), expected)?;
        }
        Ok(())
    }

    fn prepare_profile(&self, launch: &HarnessLaunchEnvironment) -> Result<(), String> {
        let profile = self.home.join("profiles").join(PROFILE_NAME);
        create_private_directory(&self.home)?;
        create_private_directory(&profile)?;
        create_private_directory(&self.home.join("capabilities"))?;
        let preset = self.home.join(".agent-presets").join(PROFILE_NAME);
        create_private_directory(&preset)?;

        let package = serde_json::json!({
            "private": true,
            "dsh": {
                "profile": {
                    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
                }
            }
        });
        write_private_file(
            &profile.join("package.json"),
            &serde_json::to_vec_pretty(&package).map_err(|error| error.to_string())?,
        )?;

        let mcp_enabled = launch.mcp_command.is_some();
        write_private_file(
            &profile.join("cordis.patch.yml"),
            profile_patch().as_bytes(),
        )?;
        write_private_file(
            &preset.join("preset.yml"),
            "name: FoodLab\ndescription: FoodLab 受限食品研发 Agent，仅提供声明的本地工具与搜索。\n"
                .as_bytes(),
        )?;
        write_private_file(
            &preset.join("agent.cordis.yml"),
            agent_preset(mcp_enabled).as_bytes(),
        )?;
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    schema_version: u32,
    runtime_version: String,
    node_version: String,
    operating_system: String,
    architecture: String,
    target_triple: String,
    node_archive_sha256: String,
    package_lock_sha256: String,
    node_binary_sha256: String,
    #[serde(default)]
    node_code_directory_sha256: Option<String>,
    critical_files: BTreeMap<String, String>,
}

impl Drop for HarnessHost {
    fn drop(&mut self) {
        let Ok(mut state) = self.state.try_lock() else {
            return;
        };
        if let HostState::Running {
            child,
            proxy_task,
            diagnostic_task,
            ..
        } = &mut *state
        {
            proxy_task.abort();
            diagnostic_task.abort();
            let _ = child.start_kill();
        }
    }
}

#[derive(Default)]
struct StartupDiagnostics {
    bytes: Vec<u8>,
}

impl StartupDiagnostics {
    fn push(&mut self, chunk: &[u8]) {
        if chunk.len() >= MAX_STARTUP_DIAGNOSTIC_BYTES {
            self.bytes.clear();
            self.bytes
                .extend_from_slice(&chunk[chunk.len() - MAX_STARTUP_DIAGNOSTIC_BYTES..]);
            return;
        }
        self.bytes.extend_from_slice(chunk);
        let excess = self
            .bytes
            .len()
            .saturating_sub(MAX_STARTUP_DIAGNOSTIC_BYTES);
        if excess > 0 {
            self.bytes.drain(..excess);
        }
    }

    fn snapshot(&self) -> String {
        String::from_utf8_lossy(&self.bytes).into_owned()
    }
}

async fn drain_startup_diagnostics<R>(mut reader: R, diagnostics: Arc<StdMutex<StartupDiagnostics>>)
where
    R: AsyncRead + Unpin,
{
    let mut buffer = [0_u8; 2048];
    loop {
        let size = match reader.read(&mut buffer).await {
            Ok(0) | Err(_) => return,
            Ok(size) => size,
        };
        diagnostics
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(&buffer[..size]);
    }
}

fn diagnostic_snapshot(diagnostics: &Arc<StdMutex<StartupDiagnostics>>) -> String {
    diagnostics
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .snapshot()
}

fn classified_startup_failure(diagnostics: &str) -> Option<String> {
    let normalized = diagnostics.to_ascii_lowercase();
    if [
        "listen eperm",
        "listen eacces",
        "wsaeacces",
        "error 10013",
        "forbidden by its access permissions",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
    {
        return Some(local_network_failure());
    }
    if ["eaddrinuse", "error 10048", "address already in use"]
        .iter()
        .any(|marker| normalized.contains(marker))
    {
        return Some("Agent 本机连接端口被占用，请重试".into());
    }
    if [
        "cannot find module",
        "err_module_not_found",
        "module_not_found",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
    {
        return Some("Agent 运行组件缺失，请重新安装 FoodLab".into());
    }
    if [
        "mcp-client(food_rd)",
        "food_rd_mcp",
        "initial connection or tool synchronization failed",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
    {
        return Some("Agent 食研工具服务启动失败，请检查安全软件是否拦截 FoodLab".into());
    }
    if ["plugin tree failed to load", "failed to apply loader entry"]
        .iter()
        .any(|marker| normalized.contains(marker))
    {
        return Some("Agent 组件加载失败，请重新安装 FoodLab；若仍失败请检查安全软件".into());
    }
    None
}

fn local_network_failure() -> String {
    "Agent 无法监听本机连接，请允许 FoodLab 访问本机网络后重试".into()
}

fn process_spawn_failure(error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => "Agent 运行组件缺失，请重新安装 FoodLab".into(),
        std::io::ErrorKind::PermissionDenied => {
            "Agent 程序被系统阻止，请在安全软件中允许 FoodLab 后重试".into()
        }
        _ => "Agent 服务无法启动，请重新安装 FoodLab".into(),
    }
}

fn runtime_health(status: HarnessHealthStatus, last_error: Option<String>) -> HarnessHealth {
    HarnessHealth {
        reinstall_required: status == HarnessHealthStatus::Damaged,
        status,
        last_error,
    }
}

fn damaged_runtime() -> String {
    "Agent 组件损坏，请重新安装 FoodLab".into()
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|_| damaged_runtime())?;
    let actual = hex::encode(Sha256::digest(bytes));
    if actual != expected {
        return Err(damaged_runtime());
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_safe_manifest_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.contains('\\')
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

fn verify_node_binary(
    path: &Path,
    unsigned_sha256: &str,
    signed_code_directory_sha256: Option<&str>,
) -> Result<(), String> {
    if verify_sha256(path, unsigned_sha256).is_ok() {
        return Ok(());
    }
    verify_signed_node_binary(path, signed_code_directory_sha256)
}

#[cfg(not(target_os = "macos"))]
fn verify_signed_node_binary(
    _path: &Path,
    _signed_code_directory_sha256: Option<&str>,
) -> Result<(), String> {
    Err(damaged_runtime())
}

#[cfg(target_os = "macos")]
fn verify_signed_node_binary(
    path: &Path,
    signed_code_directory_sha256: Option<&str>,
) -> Result<(), String> {
    let signed_code_directory_sha256 = signed_code_directory_sha256.ok_or_else(damaged_runtime)?;
    let verified = StdCommand::new("/usr/bin/codesign")
        .args(["--verify", "--strict"])
        .arg(path)
        .output()
        .map_err(|_| damaged_runtime())?;
    if !verified.status.success() {
        return Err(damaged_runtime());
    }
    let inspected = StdCommand::new("/usr/bin/codesign")
        .args(["-d", "--verbose=4"])
        .arg(path)
        .output()
        .map_err(|_| damaged_runtime())?;
    if !inspected.status.success() {
        return Err(damaged_runtime());
    }
    let output = format!(
        "{}\n{}",
        String::from_utf8_lossy(&inspected.stdout),
        String::from_utf8_lossy(&inspected.stderr),
    );
    let actual = output.lines().find_map(|line| {
        line.trim()
            .strip_prefix("CandidateCDHashFull sha256=")
            .map(str::to_ascii_lowercase)
    });
    if actual.as_deref() != Some(signed_code_directory_sha256) {
        return Err(damaged_runtime());
    }
    Ok(())
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    fill(&mut bytes).map_err(|_| "Agent 服务无法启动，请重试".to_string())?;
    Ok(hex::encode(bytes))
}

async fn start_auth_proxy(
    harness_port: u16,
    token: String,
) -> Result<(u16, JoinHandle<()>), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "Agent 服务无法启动，请重试".to_string())?;
    let proxy_port = listener
        .local_addr()
        .map_err(|_| "Agent 服务无法启动，请重试".to_string())?
        .port();
    let task = tokio::spawn(async move {
        loop {
            let Ok((socket, _)) = listener.accept().await else {
                break;
            };
            let token = token.clone();
            tokio::spawn(async move {
                let _ = proxy_connection(socket, harness_port, &token).await;
            });
        }
    });
    Ok((proxy_port, task))
}

async fn proxy_connection(
    mut client: TcpStream,
    harness_port: u16,
    token: &str,
) -> Result<(), std::io::Error> {
    const MAX_HEADER_BYTES: usize = 64 * 1024;
    let mut request = Vec::with_capacity(4096);
    let header_end = loop {
        if request.len() >= MAX_HEADER_BYTES {
            client
                .write_all(b"HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
                .await?;
            return Ok(());
        }
        let mut chunk = [0_u8; 4096];
        let read = client.read(&mut chunk).await?;
        if read == 0 {
            return Ok(());
        }
        request.extend_from_slice(&chunk[..read]);
        if let Some(position) = request.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
    };
    let Ok(header) = std::str::from_utf8(&request[..header_end]) else {
        client
            .write_all(
                b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
            )
            .await?;
        return Ok(());
    };
    let mut lines = header.split("\r\n");
    let Some(request_line) = lines.next() else {
        return Ok(());
    };
    let parts = request_line.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 3 {
        return Ok(());
    }
    let target = parts[1];
    let expected_query = format!("foodlabToken={token}");
    let query_authorized = target
        .split_once('?')
        .map(|(_, query)| query.split('&').any(|pair| pair == expected_query))
        .unwrap_or(false);
    if query_authorized {
        let clean_target = target.split('?').next().unwrap_or("/");
        let response = format!(
            "HTTP/1.1 302 Found\r\nLocation: {clean_target}\r\nSet-Cookie: foodlab_harness={token}; HttpOnly; SameSite=Strict; Path=/\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
        );
        client.write_all(response.as_bytes()).await?;
        return Ok(());
    }

    let expected_bearer = format!("Bearer {token}");
    let expected_cookie = format!("foodlab_harness={token}");
    let mut authorized = false;
    let mut forwarded = Vec::new();
    forwarded.extend_from_slice(format!("{} {} {}\r\n", parts[0], target, parts[2]).as_bytes());
    for line in lines.filter(|line| !line.is_empty()) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let lower = name.trim().to_ascii_lowercase();
        let value = value.trim();
        if lower == "authorization" && value == expected_bearer {
            authorized = true;
            continue;
        }
        if lower == "cookie" {
            authorized |= value
                .split(';')
                .map(str::trim)
                .any(|cookie| cookie == expected_cookie);
            // The proxy owns this credential and never forwards it to Harness.
            continue;
        }
        match lower.as_str() {
            "host" => forwarded
                .extend_from_slice(format!("Host: 127.0.0.1:{harness_port}\r\n").as_bytes()),
            "origin" => forwarded.extend_from_slice(
                format!("Origin: http://127.0.0.1:{harness_port}\r\n").as_bytes(),
            ),
            "referer" => forwarded.extend_from_slice(
                format!("Referer: http://127.0.0.1:{harness_port}/\r\n").as_bytes(),
            ),
            _ => forwarded.extend_from_slice(format!("{name}: {value}\r\n").as_bytes()),
        }
    }
    if !authorized {
        client
            .write_all(b"HTTP/1.1 401 Unauthorized\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
            .await?;
        return Ok(());
    }
    forwarded.extend_from_slice(b"\r\n");
    let mut upstream = TcpStream::connect(("127.0.0.1", harness_port)).await?;
    upstream.write_all(&forwarded).await?;
    upstream.write_all(&request[header_end..]).await?;
    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await?;
    Ok(())
}

fn profile_patch() -> String {
    r#"# Generated by FoodLab. Agent-plane capabilities live only in the pinned foodlab preset.
- id: session-telemetry-otel
  disabled: true
- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('sessions')
    compression: none
- id: web
  config:
    searchProvider: deepseek-official
- id: agent-instructions
  disabled: true
- id: file-reference-local
  disabled: true
- id: code-runtime
  disabled: true
- id: agent-presets
  config:
    default: foodlab
    roots: []
    includeUserRoot: true
- id: system-prompt
  config:
    persona: ''
    includeHarnessIdentity: false
- id: web-runtime
  config:
    openBrowser: false
    printUrl: false
    surfaceContext: false
    trustedHosts: []
"#
    .into()
}

fn agent_preset(mcp_enabled: bool) -> String {
    let mcp = if mcp_enabled {
        r#"
- id: foodlab-private-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: food_rd
    transport: stdio
    command: !!js process.env.FOOD_RD_MCP_COMMAND
    args: ['--foodlab-mcp']
    env:
      FOOD_RD_MCP_TOKEN: !!js process.env.FOOD_RD_MCP_TOKEN
      FOOD_RD_MCP_CAPABILITY_PATH: !!js process.env.FOOD_RD_MCP_CAPABILITY_PATH
      FOOD_RD_MCP_DATABASE_PATH: !!js process.env.FOOD_RD_MCP_DATABASE_PATH
      FOOD_RD_MCP_ATTACHMENT_ROOT: !!js process.env.FOOD_RD_MCP_ATTACHMENT_ROOT
      FOOD_RD_MCP_V2_MODE: '1'
    failOnStartupError: true
    toolCallTimeoutMs: 120000
"#
    } else {
        ""
    };
    format!(
        r#"# Generated by FoodLab. Do not add terminal, filesystem, fetch, browser, or external MCP tools.
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are FoodLab's food R&D agent. Use only the current FoodLab task context and
      the declared FoodLab tools. Every FoodLab MCP call must include the taskId and
      turnId supplied in the user message. Never save, overwrite, delete, publish, transmit, or
      accept a formula or ingredient without explicit user approval. A task is complete
      only when its TaskContract steps, artifacts, and terminal outcome are satisfied.
      When essential user-owned information is missing, call request_task_input exactly
      once and stop the turn instead of declaring completion.
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
{mcp}"#,
    )
}

fn response_error(value: &Value) -> String {
    let code = value
        .pointer("/error/code")
        .or_else(|| value.get("code"))
        .and_then(Value::as_str)
        .unwrap_or("agent_service_failure");
    match code {
        "MISSING_CREDENTIAL" | "missing_credential" => "当前模型尚未配置密钥".into(),
        "UNKNOWN_MODEL" | "unknown_model" => "当前模型不可用，请重新选择模型".into(),
        "settings-conflict" | "SETTINGS_CONFLICT" => {
            "模型设置已在其他窗口更新，请刷新后重试".into()
        }
        _ => format!("Agent 服务请求失败（{code}）"),
    }
}

fn agent_service_transport_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Agent 服务响应超时，请检查网络后重试".into()
    } else if error.is_connect() {
        "Agent 服务连接已中断，请重新打开 Agent 后重试".into()
    } else {
        "Agent 服务请求未能送达，请重试".into()
    }
}

const PROXY_ENV_NAMES: &[&str] = &[
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
];

/// A desktop app can inherit proxy variables from the terminal that launched it.
/// Keep working proxies, but do not let a stopped localhost proxy make every model
/// provider appear broken for the lifetime of the Agent process.
fn remove_unreachable_loopback_proxies(command: &mut Command) {
    for name in PROXY_ENV_NAMES {
        if env::var(name)
            .ok()
            .is_some_and(|value| unreachable_loopback_proxy(&value))
        {
            command.env_remove(name);
        }
    }
}

fn unreachable_loopback_proxy(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    let port = url.port_or_known_default().unwrap_or(80);
    let ip = if host.eq_ignore_ascii_case("localhost") {
        IpAddr::from([127, 0, 0, 1])
    } else if let Ok(ip) = host.parse::<IpAddr>() {
        ip
    } else {
        return false;
    };
    if !ip.is_loopback() {
        return false;
    }
    StdTcpStream::connect_timeout(&SocketAddr::new(ip, port), Duration::from_millis(150)).is_err()
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("无法创建 {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("无法限制 {} 的权限: {error}", path.display()))?;
    }
    Ok(())
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|error| format!("无法写入 {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("无法限制 {} 的权限: {error}", path.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use crate::{
        agent::{
            mcp::McpTaskLaunchConfig, model::AgentProviderKind, repository::AgentRepository,
            tools::AgentToolContext,
        },
        ingest::coordinator::IngredientIngestCoordinator,
    };

    use super::*;

    #[test]
    fn generated_profile_disables_high_risk_capabilities() {
        let patch = profile_patch();
        let preset = agent_preset(true);
        assert!(patch.contains("includeUserRoot: true"));
        assert!(patch.contains("roots: []"));
        assert!(patch.contains("default: foodlab"));
        assert!(patch.contains("includeHarnessIdentity: false"));
        assert!(patch.contains("openBrowser: false"));
        assert!(patch.contains("surfaceContext: false"));
        assert!(!preset.contains("tool-bash"));
        assert!(!preset.contains("tool-fs"));
        assert!(preset.contains("request_task_input"));
        assert!(!preset.contains("tool-ask-user"));
        assert!(preset.contains("compaction-basic"));
        assert!(preset.contains("fetch: false"));
        assert!(preset.contains("foodlab-private-mcp"));
        assert!(!preset.contains("web-fetch-http"));
    }

    #[test]
    fn startup_diagnostics_are_bounded_and_classified_without_raw_output() {
        let mut diagnostics = StartupDiagnostics::default();
        diagnostics.push(&vec![b'x'; MAX_STARTUP_DIAGNOSTIC_BYTES + 32]);
        assert_eq!(diagnostics.bytes.len(), MAX_STARTUP_DIAGNOSTIC_BYTES);

        assert_eq!(
            classified_startup_failure("Error: listen EACCES: permission denied 127.0.0.1:18327"),
            Some(local_network_failure())
        );
        assert_eq!(
            classified_startup_failure("Error: listen EADDRINUSE 127.0.0.1:18327"),
            Some("Agent 本机连接端口被占用，请重试".into())
        );
        assert_eq!(
            classified_startup_failure("Error [ERR_MODULE_NOT_FOUND]: secret-path"),
            Some("Agent 运行组件缺失，请重新安装 FoodLab".into())
        );
        assert_eq!(classified_startup_failure("unrecognized secret-path"), None);
    }

    #[test]
    fn missing_bundled_runtime_requires_reinstall() {
        let host = HarnessHost::new(
            PathBuf::from("/tmp/Food Lab"),
            PathBuf::from("/tmp/missing-foodlab-agent-runtime"),
            PathBuf::from("/tmp/missing-foodlab-agent-node"),
        );
        assert_eq!(host.verify_runtime(), Err(damaged_runtime()));
    }

    #[test]
    fn only_unreachable_loopback_proxy_is_scrubbed() {
        assert!(unreachable_loopback_proxy("http://127.0.0.1:1"));
        assert!(unreachable_loopback_proxy("http://localhost:1"));
        assert!(!unreachable_loopback_proxy(
            "https://proxy.example.com:8443"
        ));
        assert!(!unreachable_loopback_proxy("not a url"));
    }

    #[test]
    fn runtime_manifest_accepts_only_normal_relative_paths() {
        assert!(is_safe_manifest_path(
            "node_modules/@openai/codex/package.json"
        ));
        assert!(!is_safe_manifest_path("../credentials.yaml"));
        assert!(!is_safe_manifest_path("/tmp/runtime"));
        assert!(!is_safe_manifest_path("C:\\runtime\\node.exe"));
        assert!(!is_safe_manifest_path("\\\\server\\share\\runtime"));
    }

    #[test]
    fn installed_runtime_matches_the_rust_host_contract_when_requested() {
        let (Ok(runtime), Ok(node_binary)) = (
            std::env::var("FOODLAB_INSTALLED_RUNTIME_ROOT"),
            std::env::var("FOODLAB_INSTALLED_NODE_BINARY"),
        ) else {
            return;
        };
        let host = HarnessHost::new(
            PathBuf::from("unused-runtime-verification-home"),
            PathBuf::from(runtime),
            PathBuf::from(node_binary),
        );
        assert_eq!(host.verify_runtime(), Ok(()));
    }

    #[tokio::test]
    async fn installed_agent_service_starts_when_requested() {
        let (Ok(runtime), Ok(node_binary), Ok(mcp_binary)) = (
            std::env::var("FOODLAB_INSTALLED_RUNTIME_ROOT"),
            std::env::var("FOODLAB_INSTALLED_NODE_BINARY"),
            std::env::var("FOODLAB_INSTALLED_MCP_BINARY"),
        ) else {
            return;
        };
        let root = std::env::temp_dir().join(format!(
            "foodlab-installed-agent-smoke-{}",
            uuid::Uuid::new_v4()
        ));
        let database_path = root.join("food-rd.sqlite3");
        let attachment_root = root.join("attachments");
        let home = root.join("foodlab-agent");

        let result: Result<(), String> = async {
            let coordinator = IngredientIngestCoordinator::open(&database_path, &attachment_root)
                .map_err(|error| error.to_string())?;
            drop(coordinator);
            let repository =
                AgentRepository::open(&database_path).map_err(|error| error.to_string())?;
            drop(repository);

            let context = AgentToolContext {
                run_id: "installed-agent-smoke".into(),
                import_job_id: "installed-agent-smoke".into(),
                allowed_attachment_ids: BTreeSet::new(),
                provider_kind: AgentProviderKind::DeepSeek,
                model: "foodlab-agent".into(),
                active_recipe_id: None,
                active_recipe_name: None,
                active_draft_fingerprint: None,
            };
            let prepared = McpTaskLaunchConfig::new(
                PathBuf::from(mcp_binary),
                &database_path,
                &attachment_root,
                context,
                Duration::from_secs(5 * 60),
            )
            .prepare(&home.join("capabilities"))
            .map_err(|error| error.message().to_string())?;
            let host = HarnessHost::new(home, PathBuf::from(runtime), PathBuf::from(node_binary));
            let health = host
                .start(HarnessLaunchEnvironment {
                    mcp_command: Some(prepared.server_binary),
                    mcp_environment: prepared.environment,
                })
                .await?;
            if health.status != HarnessHealthStatus::Ready {
                return Err(health
                    .last_error
                    .unwrap_or_else(|| "Agent did not reach the ready state".into()));
            }
            host.stop().await?;
            Ok(())
        }
        .await;

        let _ = fs::remove_dir_all(&root);
        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    #[ignore = "requires local loopback permission"]
    async fn auth_proxy_rejects_missing_token_and_forwards_bearer_requests() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_port = upstream.local_addr().unwrap().port();
        let upstream_task = tokio::spawn(async move {
            let (mut socket, _) = upstream.accept().await.unwrap();
            let mut buffer = [0_u8; 4096];
            let _ = socket.read(&mut buffer).await.unwrap();
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 2\r\n\r\nok")
                .await
                .unwrap();
        });
        let (proxy_port, proxy_task) = start_auth_proxy(upstream_port, "test-token".into())
            .await
            .unwrap();

        let unauthorized = raw_http_request(
            proxy_port,
            "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(unauthorized.starts_with("HTTP/1.1 401"));

        let bootstrap = raw_http_request(
            proxy_port,
            "GET /?foodlabToken=test-token HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(bootstrap.starts_with("HTTP/1.1 302"));
        assert!(bootstrap.contains("HttpOnly"));

        let authorized = raw_http_request(
            proxy_port,
            "GET /api/ping HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer test-token\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(authorized.starts_with("HTTP/1.1 200"));
        assert!(authorized.ends_with("ok"));
        proxy_task.abort();
        upstream_task.await.unwrap();
    }

    async fn raw_http_request(port: u16, request: &str) -> String {
        let mut socket = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        socket.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).await.unwrap();
        response
    }
}
