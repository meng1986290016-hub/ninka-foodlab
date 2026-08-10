use std::{
    collections::BTreeSet,
    env, fs,
    io::Read as _,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::Notify,
};
use uuid::Uuid;

use super::{
    AgentEventSink, AgentToolDefinition, ProviderEvent, ProviderToolCall, ProviderTurnRequest,
    ProviderTurnResult,
    http::{emit, schema_is_empty, structured_output},
};
use crate::agent::{
    AgentError,
    model::{AgentMessageRole, AgentProviderConfig, AgentProviderKind},
};

const MAX_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const DIAGNOSTIC_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliDetectionResult {
    pub kind: AgentProviderKind,
    #[serde(rename = "executablePath")]
    pub path: String,
    pub version: Option<String>,
    pub installed: bool,
    pub authenticated: bool,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CliFlavor {
    Codex,
    Claude,
}

impl CliFlavor {
    fn executable_name(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }

    fn provider_kind(self) -> AgentProviderKind {
        match self {
            Self::Codex => AgentProviderKind::CodexCli,
            Self::Claude => AgentProviderKind::ClaudeCodeCli,
        }
    }

    fn auth_arguments(self) -> &'static [&'static str] {
        match self {
            Self::Codex => &["login", "status"],
            Self::Claude => &["auth", "status"],
        }
    }
}

pub(crate) struct CliRuntime {
    pub config: AgentProviderConfig,
    executable: PathBuf,
    flavor: CliFlavor,
    control: Arc<RunControl>,
}

impl CliRuntime {
    pub fn new(config: AgentProviderConfig, flavor: CliFlavor) -> Result<Self, AgentError> {
        if config.kind != flavor.provider_kind() {
            return Err(AgentError::invalid_input("CLI 类型与模型配置不一致"));
        }
        let executable =
            resolve_executable(config.executable_path.as_deref(), flavor.executable_name())
                .ok_or_else(|| {
                    AgentError::provider_not_configured(format!(
                        "未找到 {}，请先安装或选择可执行文件",
                        flavor.executable_name()
                    ))
                })?;
        Ok(Self {
            config,
            executable,
            flavor,
            control: Arc::new(RunControl::default()),
        })
    }

    pub fn cancel(&self) {
        if self.control.active.load(Ordering::Acquire) {
            self.control.cancelled.notify_waiters();
        }
    }

    pub async fn detect(&self) -> Result<CliDetectionResult, AgentError> {
        detect_executable(self.flavor, &self.executable).await
    }

    pub async fn execute(
        &self,
        arguments: &[String],
        current_dir: &Path,
    ) -> Result<ProcessOutput, AgentError> {
        let _permit = self.control.acquire()?;
        let mut command = Command::new(&self.executable);
        configure_command(&mut command, self.flavor);
        command
            .args(arguments)
            .current_dir(current_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(|_| {
            AgentError::provider_failure("无法启动本机模型 CLI，请检查可执行文件路径")
        })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AgentError::provider_failure("无法读取 CLI 输出"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AgentError::provider_failure("无法读取 CLI 诊断信息"))?;
        let stdout_task = tokio::spawn(read_bounded(stdout, MAX_STDOUT_BYTES));
        let stderr_task = tokio::spawn(read_bounded(stderr, MAX_STDERR_BYTES));
        let timeout = Duration::from_secs(self.config.timeout_seconds.max(1));

        enum Completion {
            Exited(std::io::Result<ExitStatus>),
            Cancelled,
            TimedOut,
        }
        let completion = tokio::select! {
            status = child.wait() => Completion::Exited(status),
            _ = self.control.cancelled.notified() => Completion::Cancelled,
            _ = tokio::time::sleep(timeout) => Completion::TimedOut,
        };

        if !matches!(completion, Completion::Exited(_)) {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        let stdout = stdout_task
            .await
            .map_err(|_| AgentError::provider_failure("CLI 输出读取任务异常"))?
            .map_err(|_| AgentError::provider_failure("CLI 输出无法读取"))?;
        let stderr = stderr_task
            .await
            .map_err(|_| AgentError::provider_failure("CLI 诊断读取任务异常"))?
            .map_err(|_| AgentError::provider_failure("CLI 诊断信息无法读取"))?;

        match completion {
            Completion::Exited(status) => {
                let status =
                    status.map_err(|_| AgentError::provider_failure("无法获取 CLI 退出状态"))?;
                Ok(ProcessOutput {
                    status,
                    stdout,
                    stderr,
                })
            }
            Completion::Cancelled => Err(AgentError::cancelled("已取消本次 Agent 任务")),
            Completion::TimedOut => Err(AgentError::provider_timeout(
                "本机模型 CLI 运行超时，请延长超时时间后重试",
            )),
        }
    }
}

pub async fn detect_cli(
    kind: AgentProviderKind,
    manual_path: Option<&str>,
) -> Result<CliDetectionResult, AgentError> {
    let flavor = match kind {
        AgentProviderKind::CodexCli => CliFlavor::Codex,
        AgentProviderKind::ClaudeCodeCli => CliFlavor::Claude,
        _ => return Err(AgentError::invalid_input("该模型类型不是本机 CLI")),
    };
    let Some(executable) = resolve_executable(manual_path, flavor.executable_name()) else {
        return Ok(CliDetectionResult {
            kind,
            path: String::new(),
            version: None,
            installed: false,
            authenticated: false,
            message: format!(
                "未找到 {}，请先安装或手动选择可执行文件",
                flavor.executable_name()
            ),
        });
    };
    detect_executable(flavor, &executable).await
}

async fn detect_executable(
    flavor: CliFlavor,
    executable: &Path,
) -> Result<CliDetectionResult, AgentError> {
    let version_output = run_diagnostic(executable, &["--version"], flavor).await?;
    let version = first_non_empty_line(&version_output.stdout);
    if !version_output.status.success() {
        return Ok(CliDetectionResult {
            kind: flavor.provider_kind(),
            path: executable.to_string_lossy().into_owned(),
            version,
            installed: true,
            authenticated: false,
            message: diagnostic_message("CLI 已找到，但无法读取版本", &version_output.stderr),
        });
    }

    let auth_output = run_diagnostic(executable, flavor.auth_arguments(), flavor).await?;
    let authenticated = auth_output.status.success();
    Ok(CliDetectionResult {
        kind: flavor.provider_kind(),
        path: executable.to_string_lossy().into_owned(),
        version,
        installed: true,
        authenticated,
        message: if authenticated {
            "CLI 已安装并已登录".into()
        } else {
            diagnostic_message("CLI 尚未登录，请先在终端完成登录", &auth_output.stderr)
        },
    })
}

#[derive(Default)]
struct RunControl {
    active: AtomicBool,
    cancelled: Notify,
}

impl RunControl {
    fn acquire(self: &Arc<Self>) -> Result<RunPermit, AgentError> {
        if self.active.swap(true, Ordering::AcqRel) {
            return Err(AgentError::provider_failure(
                "该本机模型正在执行另一项任务，请稍候",
            ));
        }
        Ok(RunPermit(Arc::clone(self)))
    }
}

struct RunPermit(Arc<RunControl>);

impl Drop for RunPermit {
    fn drop(&mut self) {
        self.0.active.store(false, Ordering::Release);
    }
}

pub(crate) struct TaskDirectory {
    pub directory: PathBuf,
    pub schema_path: PathBuf,
    pub result_path: PathBuf,
    pub mcp_config_path: PathBuf,
    pub schema_json: String,
    pub prompt: String,
    pub image_paths: Vec<PathBuf>,
}

impl TaskDirectory {
    pub fn create(request: &ProviderTurnRequest) -> Result<Self, AgentError> {
        let directory = env::temp_dir()
            .join("food-rd-agent")
            .join(Uuid::new_v4().to_string());
        fs::create_dir_all(&directory)
            .map_err(|_| AgentError::provider_failure("无法创建 CLI 临时任务目录"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| AgentError::provider_failure("无法限制 CLI 临时任务目录权限"))?;
        }

        let schema_json = serde_json::to_string_pretty(&cli_turn_output_schema(request))
            .map_err(|_| AgentError::invalid_input("结构化输出规则无法序列化"))?;
        let schema_path = directory.join("output-schema.json");
        let result_path = directory.join("result.json");
        let mcp_config_path = directory.join("mcp.json");
        fs::write(&schema_path, &schema_json)
            .map_err(|_| AgentError::provider_failure("无法写入 CLI 输出规则"))?;
        fs::write(&mcp_config_path, "{\"mcpServers\":{}}")
            .map_err(|_| AgentError::provider_failure("无法写入 CLI 工具配置"))?;

        let tools_json = serde_json::to_string_pretty(
            &request
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema
                    })
                })
                .collect::<Vec<Value>>(),
        )
        .map_err(|_| AgentError::invalid_input("Agent 工具规则无法序列化"))?;
        fs::write(directory.join("tool-schemas.json"), tools_json)
            .map_err(|_| AgentError::provider_failure("无法写入 CLI 工具规则"))?;

        let mut image_paths = vec![];
        let mut task_files = vec![
            "output-schema.json".to_string(),
            "tool-schemas.json".to_string(),
        ];
        for (index, attachment) in request
            .attachments
            .iter()
            .filter(|attachment| request.attachment_ids.contains(&attachment.id))
            .enumerate()
        {
            if let Some(text) = attachment
                .extracted_text
                .as_deref()
                .filter(|text| !text.trim().is_empty())
            {
                let name = format!("attachment-{}.txt", index + 1);
                fs::write(directory.join(&name), text)
                    .map_err(|_| AgentError::provider_failure("无法写入附件提取内容"))?;
                task_files.push(name);
            }
            if attachment.media_type.starts_with("image/")
                && let Some(data) = attachment.data_base64.as_deref()
            {
                let bytes = BASE64
                    .decode(data)
                    .map_err(|_| AgentError::invalid_input("所选图片附件无法读取"))?;
                let extension = image_extension(&attachment.media_type);
                let name = format!("attachment-{}.{}", index + 1, extension);
                let path = directory.join(&name);
                fs::write(&path, bytes)
                    .map_err(|_| AgentError::provider_failure("无法写入图片附件"))?;
                task_files.push(name);
                image_paths.push(path);
            }
        }

        let prompt = build_prompt(request, &task_files);
        Ok(Self {
            directory,
            schema_path,
            result_path,
            mcp_config_path,
            schema_json,
            prompt,
            image_paths,
        })
    }
}

impl Drop for TaskDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

pub(crate) struct ProcessOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl ProcessOutput {
    pub fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }
}

fn resolve_executable(manual_path: Option<&str>, name: &str) -> Option<PathBuf> {
    if let Some(path) = manual_path.map(str::trim).filter(|path| !path.is_empty()) {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(absolute_path(path));
        }
        if path.components().count() > 1
            || path.file_name().and_then(|value| value.to_str()) != Some(name)
        {
            return None;
        }
    }

    let mut candidates = env::var_os("PATH")
        .map(|path| {
            env::split_paths(&path)
                .flat_map(|directory| executable_candidates(&directory, name))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for directory in common_directories() {
        candidates.extend(executable_candidates(&directory, name));
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(absolute_path)
}

fn absolute_path(path: PathBuf) -> PathBuf {
    path.canonicalize().unwrap_or(path)
}

fn executable_candidates(directory: &Path, name: &str) -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let extensions = env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
        let mut candidates = vec![directory.join(name)];
        candidates.extend(
            extensions
                .split(';')
                .map(|extension| directory.join(format!("{name}{extension}"))),
        );
        candidates
    }
    #[cfg(not(windows))]
    {
        vec![directory.join(name)]
    }
}

fn common_directories() -> Vec<PathBuf> {
    let mut directories = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        directories.push(home.join(".local/bin"));
        directories.push(home.join(".bun/bin"));
    }
    #[cfg(target_os = "macos")]
    directories.push(PathBuf::from(
        "/Applications/ChatGPT.app/Contents/Resources",
    ));
    directories
}

fn configure_command(command: &mut Command, flavor: CliFlavor) {
    command.kill_on_drop(true).env_clear();
    for key in common_environment_keys()
        .iter()
        .chain(provider_environment_keys(flavor))
    {
        if let Some(value) = env::var_os(key) {
            command.env(key, value);
        }
    }
}

fn common_environment_keys() -> &'static [&'static str] {
    &[
        "HOME",
        "PATH",
        "USER",
        "LOGNAME",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "APPDATA",
        "LOCALAPPDATA",
        "TMPDIR",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "SystemRoot",
        "ComSpec",
        "PATHEXT",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ]
}

fn provider_environment_keys(flavor: CliFlavor) -> &'static [&'static str] {
    match flavor {
        CliFlavor::Codex => &[
            "CODEX_HOME",
            "CODEX_ACCESS_TOKEN",
            "OPENAI_API_KEY",
            "OPENAI_BASE_URL",
        ],
        CliFlavor::Claude => &[
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_AUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN",
            "ANTHROPIC_BASE_URL",
            "CLAUDE_CODE_USE_BEDROCK",
            "CLAUDE_CODE_USE_VERTEX",
            "AWS_PROFILE",
            "AWS_REGION",
            "AWS_DEFAULT_REGION",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "CLOUD_ML_REGION",
            "ANTHROPIC_VERTEX_PROJECT_ID",
        ],
    }
}

async fn run_diagnostic(
    executable: &Path,
    arguments: &[&str],
    flavor: CliFlavor,
) -> Result<ProcessOutput, AgentError> {
    let mut command = Command::new(executable);
    configure_command(&mut command, flavor);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| AgentError::provider_failure("CLI 状态检测无法启动"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentError::provider_failure("CLI 状态检测输出无法读取"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentError::provider_failure("CLI 状态诊断无法读取"))?;
    let stdout_task = tokio::spawn(read_bounded(stdout, MAX_STDERR_BYTES));
    let stderr_task = tokio::spawn(read_bounded(stderr, MAX_STDERR_BYTES));
    let status = match tokio::time::timeout(DIAGNOSTIC_TIMEOUT, child.wait()).await {
        Ok(status) => status.map_err(|_| AgentError::provider_failure("CLI 状态检测异常"))?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(AgentError::provider_timeout("CLI 状态检测超时"));
        }
    };
    let stdout = stdout_task
        .await
        .map_err(|_| AgentError::provider_failure("CLI 状态检测输出任务异常"))?
        .map_err(|_| AgentError::provider_failure("CLI 状态检测输出无法读取"))?;
    let stderr = stderr_task
        .await
        .map_err(|_| AgentError::provider_failure("CLI 状态诊断任务异常"))?
        .map_err(|_| AgentError::provider_failure("CLI 状态诊断无法读取"))?;
    Ok(ProcessOutput {
        status,
        stdout,
        stderr,
    })
}

async fn read_bounded<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
) -> std::io::Result<Vec<u8>> {
    let mut captured = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(captured.len());
        if remaining > 0 {
            captured.extend_from_slice(&buffer[..read.min(remaining)]);
        }
    }
    Ok(captured)
}

fn first_non_empty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

fn last_non_empty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .rev()
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

pub(crate) fn failure_from_output(output: &ProcessOutput) -> AgentError {
    AgentError::provider_failure(diagnostic_message("本机模型 CLI 执行失败", &output.stderr))
}

pub(crate) fn read_result_file(path: &Path) -> Result<Option<String>, AgentError> {
    let Ok(mut file) = fs::File::open(path) else {
        return Ok(None);
    };
    let mut bytes = Vec::new();
    file.by_ref()
        .take((MAX_STDOUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| AgentError::provider_failure("无法读取 CLI 结构化结果"))?;
    if bytes.len() > MAX_STDOUT_BYTES {
        return Err(AgentError::invalid_model_output(
            "CLI 结构化结果超过允许大小",
        ));
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| AgentError::invalid_model_output("CLI 结构化结果不是有效文本"))?;
    Ok((!text.trim().is_empty()).then_some(text))
}

pub(crate) fn ensure_jsonl_line_size(line: &str) -> Result<(), AgentError> {
    if line.len() > 512 * 1024 {
        Err(AgentError::invalid_model_output("CLI 单条输出超过允许大小"))
    } else {
        Ok(())
    }
}

fn diagnostic_message(prefix: &str, bytes: &[u8]) -> String {
    let detail = last_non_empty_line(bytes)
        .map(|line| line.chars().take(240).collect::<String>())
        .unwrap_or_default();
    if detail.is_empty() {
        prefix.into()
    } else {
        format!("{prefix}：{detail}")
    }
}

fn build_prompt(request: &ProviderTurnRequest, task_files: &[String]) -> String {
    let mut prompt = format!(
        "{}\n仅处理本次任务目录中的资料。\n\n对话：\n",
        super::http::FOOD_RD_AGENT_INSTRUCTION
    );
    for message in &request.messages {
        if message.content.trim().is_empty() {
            continue;
        }
        let role = match message.role {
            AgentMessageRole::User => "用户",
            AgentMessageRole::Assistant => "助手",
            AgentMessageRole::Tool => "工具",
        };
        prompt.push_str(role);
        prompt.push('：');
        prompt.push_str(&message.content);
        prompt.push('\n');
    }
    for round in &request.tool_rounds {
        for call in &round.calls {
            prompt.push_str("助手工具请求：");
            prompt.push_str(
                &json!({
                    "id": call.id,
                    "name": call.name,
                    "arguments": call.arguments
                })
                .to_string(),
            );
            prompt.push('\n');
        }
        for result in &round.results {
            prompt.push_str("工具结果：");
            prompt.push_str(&result.output.to_string());
            prompt.push('\n');
        }
    }
    let mut extracted_characters = 0_usize;
    for attachment in request
        .attachments
        .iter()
        .filter(|attachment| request.attachment_ids.contains(&attachment.id))
    {
        let Some(text) = attachment
            .extracted_text
            .as_deref()
            .filter(|text| !text.trim().is_empty())
        else {
            continue;
        };
        if extracted_characters == 0 {
            prompt.push_str("\n所选附件的已提取内容：\n");
        }
        let remaining = 256_000_usize.saturating_sub(extracted_characters);
        if remaining == 0 {
            break;
        }
        let excerpt: String = text.chars().take(remaining).collect();
        extracted_characters += excerpt.chars().count();
        prompt.push_str("---\n");
        prompt.push_str(&excerpt);
        prompt.push('\n');
    }
    prompt.push_str("\n本次任务文件：");
    prompt.push_str(&task_files.join("、"));
    prompt.push_str(
        "\n\n工具调用协议：tool-schemas.json 中列出的食品研发工具由 Ninka FoodLab 应用运行时执行，即使它们没有出现在 CLI 的原生工具列表中，也不代表工具不可用。不得回复“只看到工具定义”“工具未开放”或自行伪造工具结果。需要读取资料、检索数据、计算、创建待复核草稿或配方提案时，请在 toolCalls 中填写一个或多个真实工具请求；每个 arguments 字段必须是严格匹配对应 inputSchema 的 JSON 对象字符串，应用会解析、校验并执行，然后在下一轮以“工具”消息返回结果。此时 finalResponse 只需填写符合 schema 的占位内容，应用不会展示它。不需要工具、或已经根据工具结果完成任务时，toolCalls 必须为空，并在 finalResponse 中给出最终答复。不要用 shell 或直接读写数据库代替食品研发工具。\n请严格按 output-schema.json 返回最终 JSON。",
    );
    prompt
}

fn cli_turn_output_schema(request: &ProviderTurnRequest) -> Value {
    let tool_names = request
        .tools
        .iter()
        .map(|tool| Value::String(tool.name.clone()))
        .collect::<Vec<_>>();
    let tool_name_schema = if tool_names.is_empty() {
        json!({ "type": "string" })
    } else {
        json!({ "type": "string", "enum": tool_names })
    };
    let final_response_schema = if schema_is_empty(&request.output_schema) {
        json!({ "type": "object" })
    } else {
        request.output_schema.clone()
    };

    json!({
        "type": "object",
        "properties": {
            "finalResponse": final_response_schema,
            "toolCalls": {
                "type": "array",
                "description": "需要应用执行的食品研发工具请求；最终答复时必须为空数组",
                "maxItems": if request.tools.is_empty() { 0 } else { 8 },
                "items": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "name": tool_name_schema,
                        "arguments": {
                            "type": "string",
                            "description": "严格匹配对应 inputSchema 的 JSON 对象字符串"
                        }
                    },
                    "required": ["id", "name", "arguments"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["finalResponse", "toolCalls"],
        "additionalProperties": false
    })
}

pub(crate) fn normalize_cli_turn_output(
    final_text: String,
    final_structured: Option<Value>,
    output_schema: &Value,
    tools: &[AgentToolDefinition],
    mut events: Vec<ProviderEvent>,
    sink: &AgentEventSink,
) -> Result<ProviderTurnResult, AgentError> {
    let value = match final_structured {
        Some(value) => value,
        None => serde_json::from_str(&final_text).map_err(|_| {
            AgentError::invalid_model_output("本机模型返回的结构化结果无法读取，将自动重试一次")
        })?,
    };

    let Some(tool_calls) = value.get("toolCalls") else {
        // Backward compatibility for older CLI fixtures and already-running
        // tasks that returned the original final schema directly.
        let normalized = value.to_string();
        return Ok(ProviderTurnResult {
            final_text: normalized,
            structured_output: structured_output(&value.to_string(), output_schema)?,
            events,
        });
    };
    let final_response = value
        .get("finalResponse")
        .ok_or_else(|| AgentError::invalid_model_output("本机模型结果缺少 finalResponse"))?;
    let calls = tool_calls
        .as_array()
        .ok_or_else(|| AgentError::invalid_model_output("本机模型结果中的 toolCalls 格式无效"))?;
    let allowed_names = tools
        .iter()
        .map(|tool| tool.name.as_str())
        .collect::<BTreeSet<_>>();
    let mut call_ids = BTreeSet::new();

    for (index, call) in calls.iter().enumerate() {
        let id = call
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| AgentError::invalid_model_output("本机模型工具请求缺少调用 ID"))?;
        if !call_ids.insert(id.to_string()) {
            return Err(AgentError::invalid_model_output(
                "本机模型返回了重复的工具调用 ID",
            ));
        }
        let name = call
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| AgentError::invalid_model_output("本机模型工具请求缺少名称"))?;
        if !allowed_names.contains(name) {
            return Err(AgentError::tool_denied(name));
        }
        let arguments = match call.get("arguments") {
            Some(Value::String(arguments)) => serde_json::from_str::<Value>(arguments)
                .ok()
                .filter(Value::is_object),
            // Accept the object form from older app builds and test fixtures.
            Some(arguments @ Value::Object(_)) => Some(arguments.clone()),
            _ => None,
        }
        .ok_or_else(|| {
            AgentError::invalid_model_output(format!(
                "本机模型第 {} 个工具请求参数不是有效的 JSON 对象",
                index + 1
            ))
        })?;
        emit(
            &mut events,
            sink,
            ProviderEvent::ToolCall(ProviderToolCall {
                id: id.into(),
                name: name.into(),
                arguments,
            }),
        );
    }

    if !calls.is_empty() {
        return Ok(ProviderTurnResult {
            final_text: String::new(),
            structured_output: None,
            events,
        });
    }

    let final_text = final_response.to_string();
    Ok(ProviderTurnResult {
        structured_output: structured_output(&final_text, output_schema)?,
        final_text,
        events,
    })
}

fn image_extension(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::diagnostic_message;

    #[test]
    fn diagnostic_message_prefers_the_actionable_final_line() {
        let message = diagnostic_message(
            "本机模型 CLI 执行失败",
            b"Reading prompt from stdin...\nNo prompt provided via stdin.\n",
        );

        assert_eq!(
            message,
            "本机模型 CLI 执行失败：No prompt provided via stdin."
        );
    }
}
