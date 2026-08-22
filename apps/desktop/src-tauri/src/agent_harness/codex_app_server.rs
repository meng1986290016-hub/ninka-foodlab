use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::env;

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{Mutex, broadcast, oneshot},
    task::JoinHandle,
    time::timeout,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(15 * 60);

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

pub struct CodexAppServerHost {
    home: PathBuf,
    runtime: PathBuf,
    node_binary: PathBuf,
    state: Mutex<HostState>,
    active_login_id: Mutex<Option<String>>,
    next_id: AtomicU64,
}

enum HostState {
    Stopped,
    Running(RunningHost),
    Failed,
}

struct RunningHost {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    notifications: broadcast::Sender<Value>,
    reader: JoinHandle<()>,
}

#[derive(Clone, Debug)]
pub struct CodexTurnResult {
    pub external_turn_id: String,
    pub text: String,
    pub status: String,
    pub tool_items: Vec<Value>,
}

impl CodexAppServerHost {
    pub fn new(home: PathBuf, runtime: PathBuf, node_binary: PathBuf) -> Self {
        Self {
            home,
            runtime,
            node_binary,
            state: Mutex::new(HostState::Stopped),
            active_login_id: Mutex::new(None),
            next_id: AtomicU64::new(1),
        }
    }

    pub async fn account(&self) -> Result<Value, String> {
        self.request("account/read", json!({ "refreshToken": false }))
            .await
    }

    pub async fn start_chatgpt_login(&self) -> Result<Value, String> {
        if let Some(login_id) = self.active_login_id.lock().await.take() {
            let _ = self
                .request("account/login/cancel", json!({ "loginId": login_id }))
                .await;
        }
        let result = self
            .request(
                "account/login/start",
                json!({ "type": "chatgptDeviceCode" }),
            )
            .await?;
        if let Some(login_id) = result
            .get("loginId")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            *self.active_login_id.lock().await = Some(login_id.to_string());
        }
        Ok(result)
    }

    pub async fn logout(&self) -> Result<Value, String> {
        self.request("account/logout", json!({})).await
    }

    pub async fn stop(&self) {
        let previous = {
            let mut state = self.state.lock().await;
            std::mem::replace(&mut *state, HostState::Stopped)
        };
        if let HostState::Running(mut host) = previous {
            host.reader.abort();
            let _ = host.child.kill().await;
        }
        *self.active_login_id.lock().await = None;
    }

    pub async fn models(&self) -> Result<Value, String> {
        self.request(
            "model/list",
            json!({ "includeHidden": false, "limit": 100 }),
        )
        .await
    }

    pub async fn start_thread(
        &self,
        model: &str,
        developer_instructions: &str,
        config: Value,
    ) -> Result<String, String> {
        let result = self
            .request(
                "thread/start",
                json!({
                    "model": model,
                    "cwd": self.work_dir(),
                    "approvalPolicy": "never",
                    "sandbox": "read-only",
                    "ephemeral": false,
                    "baseInstructions": "You are Ninka Agent, a food research and development assistant. Follow the supplied FoodLab task contract and answer in the user's language.",
                    "developerInstructions": developer_instructions,
                    "config": config,
                }),
            )
            .await?;
        result
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "ChatGPT 会话创建失败，请重试".to_string())
    }

    pub async fn run_turn<F, G>(
        &self,
        thread_id: &str,
        model: &str,
        effort: Option<&str>,
        prompt: &str,
        on_started: F,
        mut on_text: G,
    ) -> Result<CodexTurnResult, String>
    where
        F: FnOnce(&str) + Send,
        G: FnMut(&str) + Send,
    {
        let mut notifications = self.subscribe().await?;
        let mut params = json!({
            "threadId": thread_id,
            "model": model,
            "input": [{ "type": "text", "text": prompt, "text_elements": [] }],
        });
        if let Some(effort) = effort {
            params["effort"] = Value::String(effort.to_string());
        }
        let started = self.request("turn/start", params).await?;
        let turn_id = started
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .ok_or_else(|| "ChatGPT 回答未能启动，请重试".to_string())?
            .to_string();
        on_started(&turn_id);
        let mut answer = String::new();
        let mut tool_items = Vec::new();
        let mut emitted_len = 0;
        let wait = async {
            loop {
                let event = notifications
                    .recv()
                    .await
                    .map_err(|_| "ChatGPT 回答连接已中断，请重试".to_string())?;
                if event.get("method").and_then(Value::as_str) == Some("item/agentMessage/delta")
                    && event.pointer("/params/turnId").and_then(Value::as_str)
                        == Some(turn_id.as_str())
                    && let Some(delta) = event.pointer("/params/delta").and_then(Value::as_str)
                {
                    answer.push_str(delta);
                    if answer.len().saturating_sub(emitted_len) >= 80 || delta.contains('\n') {
                        on_text(&answer);
                        emitted_len = answer.len();
                    }
                }
                if event.get("method").and_then(Value::as_str) == Some("item/completed")
                    && event.pointer("/params/turnId").and_then(Value::as_str)
                        == Some(turn_id.as_str())
                    && event.pointer("/params/item/type").and_then(Value::as_str)
                        == Some("mcpToolCall")
                    && let Some(item) = event.pointer("/params/item").cloned()
                {
                    tool_items.push(item);
                }
                if event.get("method").and_then(Value::as_str) == Some("turn/completed")
                    && event.pointer("/params/turn/id").and_then(Value::as_str)
                        == Some(turn_id.as_str())
                {
                    let status = event
                        .pointer("/params/turn/status")
                        .and_then(Value::as_str)
                        .unwrap_or("failed")
                        .to_string();
                    if answer.len() != emitted_len {
                        on_text(&answer);
                    }
                    return Ok(CodexTurnResult {
                        external_turn_id: turn_id,
                        text: answer,
                        status,
                        tool_items,
                    });
                }
            }
        };
        timeout(TURN_TIMEOUT, wait)
            .await
            .map_err(|_| "ChatGPT 回答超时，可以直接重试".to_string())?
    }

    pub async fn interrupt(&self, thread_id: &str, turn_id: &str) -> Result<Value, String> {
        self.request(
            "turn/interrupt",
            json!({ "threadId": thread_id, "turnId": turn_id }),
        )
        .await
    }

    pub async fn steer(
        &self,
        thread_id: &str,
        turn_id: &str,
        content: &str,
    ) -> Result<Value, String> {
        self.request(
            "turn/steer",
            json!({
                "threadId": thread_id,
                "turnId": turn_id,
                "input": [{ "type": "text", "text": content, "text_elements": [] }],
            }),
        )
        .await
    }

    pub async fn fork_thread(
        &self,
        thread_id: &str,
        last_turn_id: Option<&str>,
    ) -> Result<String, String> {
        let mut params = json!({ "threadId": thread_id });
        if let Some(turn_id) = last_turn_id {
            params["lastTurnId"] = Value::String(turn_id.to_string());
        }
        let result = self.request("thread/fork", params).await?;
        result
            .pointer("/thread/id")
            .or_else(|| result.get("threadId"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "ChatGPT 对话分支创建失败，请重试".to_string())
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.ensure_started().await?;
        self.request_started(method, params).await
    }

    async fn request_started(&self, method: &str, params: Value) -> Result<Value, String> {
        let (stdin, pending) = self.handles().await?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();
        let (sender, receiver) = oneshot::channel();
        pending.lock().await.insert(id.clone(), sender);
        let payload = json!({ "id": id, "method": method, "params": params });
        if write_message(&stdin, &payload).await.is_err() {
            pending.lock().await.remove(&id);
            return Err("ChatGPT 服务连接失败，请重试".into());
        }
        timeout(REQUEST_TIMEOUT, receiver)
            .await
            .map_err(|_| "ChatGPT 服务响应超时，请重试".to_string())?
            .map_err(|_| "ChatGPT 服务连接已中断，请重试".to_string())?
    }

    async fn subscribe(&self) -> Result<broadcast::Receiver<Value>, String> {
        self.ensure_started().await?;
        let mut state = self.state.lock().await;
        match &mut *state {
            HostState::Running(host) => {
                if host.child.try_wait().ok().flatten().is_none() {
                    Ok(host.notifications.subscribe())
                } else {
                    Err("ChatGPT 服务暂不可用，请重试".into())
                }
            }
            _ => Err("ChatGPT 服务暂不可用，请重试".into()),
        }
    }

    async fn handles(&self) -> Result<(Arc<Mutex<ChildStdin>>, Pending), String> {
        let mut state = self.state.lock().await;
        match &mut *state {
            HostState::Running(host) => {
                if host.child.try_wait().ok().flatten().is_none() {
                    Ok((host.stdin.clone(), host.pending.clone()))
                } else {
                    Err("ChatGPT 服务暂不可用，请重试".into())
                }
            }
            _ => Err("ChatGPT 服务暂不可用，请重试".into()),
        }
    }

    async fn ensure_started(&self) -> Result<(), String> {
        {
            let mut state = self.state.lock().await;
            if let HostState::Running(host) = &mut *state
                && host.child.try_wait().ok().flatten().is_none()
            {
                return Ok(());
            }
        }
        self.start().await
    }

    async fn start(&self) -> Result<(), String> {
        let mut state = self.state.lock().await;
        if let HostState::Running(host) = &mut *state
            && host.child.try_wait().ok().flatten().is_none()
        {
            return Ok(());
        }
        let entrypoint = self.runtime.join("node_modules/@openai/codex/bin/codex.js");
        if !self.node_binary.is_file() || !entrypoint.is_file() {
            *state = HostState::Failed;
            return Err("Agent 组件损坏，请重新安装 FoodLab".into());
        }
        prepare_private_directory(&self.home)?;
        prepare_private_directory(&self.work_dir())?;
        let mut command = Command::new(&self.node_binary);
        command
            .arg(entrypoint)
            .arg("app-server")
            .args([
                "--disable",
                "apps",
                "--disable",
                "browser_use",
                "--disable",
                "browser_use_external",
                "--disable",
                "browser_use_full_cdp_access",
                "--disable",
                "computer_use",
                "--disable",
                "hooks",
                "--disable",
                "image_generation",
                "--disable",
                "in_app_browser",
                "--disable",
                "multi_agent",
                "--disable",
                "plugins",
                "--disable",
                "plugin_sharing",
                "--disable",
                "recommended_plugins",
                "--disable",
                "remote_plugin",
                "--disable",
                "shell_snapshot",
                "--disable",
                "shell_tool",
                "--disable",
                "skill_search",
                "--disable",
                "unified_exec",
            ])
            .env_clear()
            .env("CODEX_HOME", &self.home)
            .env("HOME", &self.home)
            .current_dir(self.work_dir())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(target_os = "windows")]
        {
            if let Some(system_root) = env::var_os("SystemRoot") {
                let system32 = PathBuf::from(&system_root).join("System32");
                command
                    .env("SystemRoot", &system_root)
                    .env("WINDIR", &system_root)
                    .env("PATH", &system32);
            }
            command.env("USERPROFILE", &self.home);
            for name in ["TEMP", "TMP", "PATHEXT", "ComSpec"] {
                if let Some(value) = env::var_os(name) {
                    command.env(name, value);
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        command.env("PATH", "/usr/bin:/bin");
        let mut child = command
            .spawn()
            .map_err(|_| "ChatGPT 服务启动失败，请重新安装 FoodLab".to_string())?;
        let stdin = Arc::new(Mutex::new(
            child
                .stdin
                .take()
                .ok_or_else(|| "ChatGPT 服务启动失败，请重试".to_string())?,
        ));
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "ChatGPT 服务启动失败，请重试".to_string())?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let (notifications, _) = broadcast::channel(1_024);
        let reader_pending = pending.clone();
        let reader_notifications = notifications.clone();
        let reader = tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = response_id(&message) {
                    if let Some(sender) = reader_pending.lock().await.remove(&id) {
                        let response = response_result(&message);
                        let _ = sender.send(response);
                    }
                } else if message.get("method").is_some() {
                    let _ = reader_notifications.send(message);
                }
            }
            let mut pending = reader_pending.lock().await;
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("ChatGPT 服务连接已中断，请重试".into()));
            }
        });
        *state = HostState::Running(RunningHost {
            child,
            stdin,
            pending,
            notifications,
            reader,
        });
        drop(state);
        if let Err(error) = self
            .request_started(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "foodlab-agent",
                        "title": "Ninka Agent",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                    "capabilities": { "experimentalApi": true },
                }),
            )
            .await
        {
            let mut state = self.state.lock().await;
            *state = HostState::Failed;
            return Err(error);
        }
        let (stdin, _) = self.handles().await?;
        write_message(&stdin, &json!({ "method": "initialized", "params": {} }))
            .await
            .map_err(|_| "ChatGPT 服务初始化失败，请重试".to_string())
    }

    fn work_dir(&self) -> PathBuf {
        self.home.join("empty-task")
    }
}

impl Drop for RunningHost {
    fn drop(&mut self) {
        self.reader.abort();
        let _ = self.child.start_kill();
    }
}

fn response_id(message: &Value) -> Option<String> {
    message.get("id").and_then(|id| match id {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}

fn response_result(message: &Value) -> Result<Value, String> {
    if let Some(result) = message.get("result") {
        return Ok(result.clone());
    }
    if let Some(error) = message.get("error") {
        let code = error
            .get("code")
            .and_then(Value::as_i64)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".into());
        let detail = error
            .get("message")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("request failed");
        return Err(format!("ChatGPT App Server error {code}: {detail}"));
    }
    Err("ChatGPT 服务未能完成请求，请检查账号状态".into())
}

async fn write_message(stdin: &Arc<Mutex<ChildStdin>>, value: &Value) -> std::io::Result<()> {
    let mut stdin = stdin.lock().await;
    stdin.write_all(value.to_string().as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await
}

fn prepare_private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "ChatGPT 本地数据目录不可用".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| "ChatGPT 本地数据目录不可用".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{response_id, response_result};
    use serde_json::json;

    #[test]
    fn response_ids_accept_string_and_number_without_exposing_payloads() {
        assert_eq!(
            response_id(&json!({ "id": "7", "result": {} })).as_deref(),
            Some("7")
        );
        assert_eq!(
            response_id(&json!({ "id": 8, "result": {} })).as_deref(),
            Some("8")
        );
        assert_eq!(response_id(&json!({ "method": "turn/completed" })), None);
    }

    #[test]
    fn json_rpc_errors_are_not_misreported_as_missing_results() {
        let error = response_result(&json!({
            "id": "9",
            "error": { "code": -32603, "message": "failed to start login server" }
        }))
        .unwrap_err();
        assert!(error.contains("-32603"));
        assert!(error.contains("failed to start login server"));
    }
}
