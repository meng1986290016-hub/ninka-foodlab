use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read as _, Write as _},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use uuid::Uuid;

use super::{
    AgentError,
    tools::{AgentToolContext, AgentToolRegistry},
};

pub const MCP_PROTOCOL_VERSION: &str = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS: &[&str] =
    &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MAX_CAPABILITY_BYTES: u64 = 256 * 1024;

pub const MCP_TOKEN_ENV: &str = "FOOD_RD_MCP_TOKEN";
pub const MCP_CAPABILITY_ENV: &str = "FOOD_RD_MCP_CAPABILITY_PATH";
pub const MCP_DATABASE_ENV: &str = "FOOD_RD_MCP_DATABASE_PATH";
pub const MCP_ATTACHMENT_ROOT_ENV: &str = "FOOD_RD_MCP_ATTACHMENT_ROOT";

#[derive(Clone, Debug)]
pub struct McpTaskCapability {
    pub token: String,
    pub record_path: PathBuf,
}

#[derive(Clone, Debug)]
pub struct McpTaskLaunchConfig {
    pub server_binary: PathBuf,
    pub database_path: PathBuf,
    pub attachment_root: PathBuf,
    pub context: AgentToolContext,
    pub lifetime: Duration,
}

impl McpTaskLaunchConfig {
    pub fn new(
        server_binary: impl Into<PathBuf>,
        database_path: impl Into<PathBuf>,
        attachment_root: impl Into<PathBuf>,
        context: AgentToolContext,
        lifetime: Duration,
    ) -> Self {
        Self {
            server_binary: server_binary.into(),
            database_path: database_path.into(),
            attachment_root: attachment_root.into(),
            context,
            lifetime,
        }
    }

    pub(crate) fn prepare(&self, directory: &Path) -> Result<PreparedMcpTask, AgentError> {
        if !self.server_binary.is_file() {
            return Err(AgentError::provider_not_configured(
                "找不到食研 MCP 子进程，请重新安装应用",
            ));
        }
        if !self.database_path.is_file() {
            return Err(AgentError::provider_failure("食研数据库暂时不可用"));
        }
        fs::create_dir_all(&self.attachment_root)
            .map_err(|_| AgentError::provider_failure("原料附件目录暂时不可用"))?;
        let capability = McpTaskCapability::issue(directory, &self.context, self.lifetime)?;
        let mut environment = BTreeMap::new();
        environment.insert(MCP_TOKEN_ENV.into(), capability.token);
        environment.insert(
            MCP_CAPABILITY_ENV.into(),
            capability.record_path.to_string_lossy().into_owned(),
        );
        environment.insert(
            MCP_DATABASE_ENV.into(),
            absolute_path(&self.database_path)
                .to_string_lossy()
                .into_owned(),
        );
        environment.insert(
            MCP_ATTACHMENT_ROOT_ENV.into(),
            absolute_path(&self.attachment_root)
                .to_string_lossy()
                .into_owned(),
        );
        Ok(PreparedMcpTask {
            server_binary: absolute_path(&self.server_binary),
            environment,
        })
    }
}

pub(crate) struct PreparedMcpTask {
    pub server_binary: PathBuf,
    pub environment: BTreeMap<String, String>,
}

impl PreparedMcpTask {
    pub fn write_claude_config(&self, path: &Path) -> Result<(), AgentError> {
        write_private_json(
            path,
            &json!({
                "mcpServers": {
                    "food_rd": {
                        "type": "stdio",
                        "command": self.server_binary,
                        "args": [],
                        "env": self.environment
                    }
                }
            }),
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityRecord {
    token_hash: String,
    context: AgentToolContext,
    expires_at_epoch_millis: u128,
    used: bool,
}

impl McpTaskCapability {
    pub fn issue(
        directory: &Path,
        context: &AgentToolContext,
        lifetime: Duration,
    ) -> Result<Self, AgentError> {
        fs::create_dir_all(directory)
            .map_err(|_| AgentError::provider_failure("无法创建 MCP 任务授权目录"))?;
        restrict_directory_permissions(directory)?;
        let mut random = [0_u8; 32];
        getrandom::fill(&mut random)
            .map_err(|_| AgentError::provider_failure("无法生成 MCP 任务授权"))?;
        let token = hex::encode(random);
        let record = CapabilityRecord {
            token_hash: token_hash(&token),
            context: context.clone(),
            expires_at_epoch_millis: now_epoch_millis().saturating_add(lifetime.as_millis()),
            used: false,
        };
        let record_path = directory.join(format!(".mcp-capability-{}.json", Uuid::new_v4()));
        write_private_json(&record_path, &record)?;
        Ok(Self { token, record_path })
    }

    pub fn consume(record_path: &Path, token: &str) -> Result<AgentToolContext, AgentError> {
        let mut file = fs::File::open(record_path)
            .map_err(|_| AgentError::unauthorized("MCP 任务授权无效或已被使用"))?;
        let mut bytes = Vec::new();
        std::io::Read::by_ref(&mut file)
            .take(MAX_CAPABILITY_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AgentError::unauthorized("MCP 任务授权无法读取"))?;
        if bytes.len() as u64 > MAX_CAPABILITY_BYTES {
            return Err(AgentError::unauthorized("MCP 任务授权无效"));
        }
        let mut record: CapabilityRecord = serde_json::from_slice(&bytes)
            .map_err(|_| AgentError::unauthorized("MCP 任务授权无效"))?;
        if record.used
            || !constant_time_equal(&record.token_hash, &token_hash(token))
            || now_epoch_millis() >= record.expires_at_epoch_millis
        {
            return Err(AgentError::unauthorized(
                "MCP 任务授权无效、已过期或已被使用",
            ));
        }

        let used_path = record_path.with_extension("used");
        fs::rename(record_path, &used_path)
            .map_err(|_| AgentError::unauthorized("MCP 任务授权已被使用"))?;
        record.used = true;
        write_private_json(&used_path, &record)?;
        Ok(record.context)
    }
}

pub struct McpServer {
    registry: AgentToolRegistry,
    context: AgentToolContext,
    state: ServerState,
    cancelled: HashSet<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ServerState {
    New,
    Initializing,
    Ready,
}

impl McpServer {
    pub fn new(registry: AgentToolRegistry, context: AgentToolContext) -> Self {
        Self {
            registry,
            context,
            state: ServerState::New,
            cancelled: HashSet::new(),
        }
    }

    pub fn handle_message(&mut self, message: Value) -> Option<Value> {
        let id = message.get("id").cloned();
        let method = message.get("method").and_then(Value::as_str);
        if message.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || method.is_none() {
            return id.map(|id| json_rpc_error(id, -32600, "无效的 MCP 请求"));
        }
        let method = method.unwrap_or_default();
        if id.is_none() {
            self.handle_notification(method, message.get("params"));
            return None;
        }
        let id = id.unwrap_or(Value::Null);
        match method {
            "initialize" => Some(self.initialize(id, message.get("params"))),
            "ping" => Some(json_rpc_result(id, json!({}))),
            "tools/list" if self.state == ServerState::Ready => Some(self.list_tools(id)),
            "tools/call" if self.state == ServerState::Ready => {
                Some(self.call_tool(id, message.get("params")))
            }
            "tools/list" | "tools/call" => {
                Some(json_rpc_error(id, -32002, "MCP 服务尚未完成初始化"))
            }
            _ => Some(json_rpc_error(id, -32601, "MCP 方法不存在")),
        }
    }

    fn initialize(&mut self, id: Value, params: Option<&Value>) -> Value {
        if self.state != ServerState::New {
            return json_rpc_error(id, -32600, "MCP 服务已经初始化");
        }
        let Some(requested) = params
            .and_then(|params| params.get("protocolVersion"))
            .and_then(Value::as_str)
        else {
            return json_rpc_error(id, -32602, "缺少 MCP 协议版本");
        };
        let protocol_version = if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
            requested
        } else {
            MCP_PROTOCOL_VERSION
        };
        self.state = ServerState::Initializing;
        json_rpc_result(
            id,
            json!({
                "protocolVersion": protocol_version,
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": "food-rd-agent-tools",
                    "title": "Ninka FoodLab Agent 工具",
                    "version": env!("CARGO_PKG_VERSION"),
                    "description": "仅提供当前食品研发任务范围内的读取与待复核草稿操作"
                },
                "instructions": "原料草稿和配方提案都必须由用户人工复核；配方试算必须调用确定性计算工具，模型不能直接保存正式版本。"
            }),
        )
    }

    fn handle_notification(&mut self, method: &str, params: Option<&Value>) {
        match method {
            "notifications/initialized" if self.state == ServerState::Initializing => {
                self.state = ServerState::Ready;
            }
            "notifications/cancelled" => {
                if let Some(request_id) = params
                    .and_then(|params| params.get("requestId"))
                    .map(request_id_key)
                {
                    self.cancelled.insert(request_id);
                }
            }
            _ => {}
        }
    }

    fn list_tools(&self, id: Value) -> Value {
        let tools = self
            .registry
            .definitions()
            .into_iter()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.input_schema
                })
            })
            .collect::<Vec<_>>();
        json_rpc_result(id, json!({ "tools": tools }))
    }

    fn call_tool(&mut self, id: Value, params: Option<&Value>) -> Value {
        let Some(name) = params
            .and_then(|params| params.get("name"))
            .and_then(Value::as_str)
        else {
            return json_rpc_error(id, -32602, "工具调用缺少名称");
        };
        let arguments = params
            .and_then(|params| params.get("arguments"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        if !arguments.is_object() {
            return json_rpc_error(id, -32602, "工具参数必须是 JSON 对象");
        }
        if !self
            .registry
            .definitions()
            .iter()
            .any(|tool| tool.name == name)
        {
            let _ = self.registry.execute(&self.context, name, arguments);
            return json_rpc_error(id, -32602, "未知的食品研发工具");
        }
        if self.cancelled.remove(&request_id_key(&id)) {
            return json_rpc_error(id, -32800, "工具调用已取消");
        }

        match self.registry.execute(&self.context, name, arguments) {
            Ok(value) => {
                let text = serde_json::to_string(&value).unwrap_or_else(|_| "{\"ok\":true}".into());
                json_rpc_result(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": text }],
                        "structuredContent": value,
                        "isError": false
                    }),
                )
            }
            Err(error) => {
                let structured = json!({
                    "error": {
                        "code": error.code(),
                        "message": error.message()
                    }
                });
                let text = serde_json::to_string(&structured).unwrap_or_else(|_| {
                    "{\"error\":{\"code\":\"tool_failure\",\"message\":\"工具调用失败\"}}".into()
                });
                json_rpc_result(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": text }],
                        "structuredContent": structured,
                        "isError": true
                    }),
                )
            }
        }
    }
}

pub async fn serve_mcp<R, W>(mut server: McpServer, reader: R, mut writer: W) -> std::io::Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Some(line) = lines.next_line().await? {
        if line.len() > MAX_MESSAGE_BYTES {
            write_message(
                &mut writer,
                &json_rpc_error(Value::Null, -32700, "MCP 消息超过允许大小"),
            )
            .await?;
            continue;
        }
        let message = match serde_json::from_str::<Value>(&line) {
            Ok(message) => message,
            Err(_) => {
                write_message(
                    &mut writer,
                    &json_rpc_error(Value::Null, -32700, "MCP JSON 无法解析"),
                )
                .await?;
                continue;
            }
        };
        if let Some(response) = server.handle_message(message) {
            write_message(&mut writer, &response).await?;
        }
    }
    Ok(())
}

async fn write_message<W: AsyncWrite + Unpin>(
    writer: &mut W,
    message: &Value,
) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(message).map_err(std::io::Error::other)?;
    writer.write_all(&bytes).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await
}

fn json_rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn json_rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
}

fn request_id_key(id: &Value) -> String {
    serde_json::to_string(id).unwrap_or_default()
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn now_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn write_private_json(path: &Path, value: &impl Serialize) -> Result<(), AgentError> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| AgentError::provider_failure("MCP 任务授权无法序列化"))?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            fs::remove_file(path)
                .map_err(|_| AgentError::provider_failure("MCP 任务授权无法更新"))?;
            options
                .open(path)
                .map_err(|_| AgentError::provider_failure("MCP 任务授权无法写入"))?
        }
        Err(_) => return Err(AgentError::provider_failure("MCP 任务授权无法写入")),
    };
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| AgentError::provider_failure("MCP 任务授权无法写入"))
}

fn restrict_directory_permissions(path: &Path) -> Result<(), AgentError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| AgentError::provider_failure("MCP 任务授权目录权限无法设置"))?;
    }
    Ok(())
}

fn absolute_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}
