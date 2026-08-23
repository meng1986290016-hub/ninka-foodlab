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
    repository::AgentRepository,
    tools::{AgentToolContext, AgentToolRegistry},
};
use crate::{
    agent_harness::{model::TaskOutcome, repository::HarnessRepository},
    agent_recipe::repository::AgentRecipeRepository,
    child_process_path,
    ingest::coordinator::IngredientIngestCoordinator,
    rnd_reference::repository::RndReferenceRepository,
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
pub const MCP_V2_MODE_ENV: &str = "FOOD_RD_MCP_V2_MODE";

/// Starts the private FoodLab MCP server using a one-use, task-scoped capability.
///
/// This lives in the library so both the dedicated development binary and the
/// packaged Tauri executable (`--foodlab-mcp`) expose exactly the same surface.
pub async fn run_mcp_from_env() -> Result<(), String> {
    let token = required_env(MCP_TOKEN_ENV)?;
    let capability_path = PathBuf::from(required_env(MCP_CAPABILITY_ENV)?);
    let database_path = PathBuf::from(required_env(MCP_DATABASE_ENV)?);
    let attachment_root = PathBuf::from(required_env(MCP_ATTACHMENT_ROOT_ENV)?);
    let context = McpTaskCapability::consume(&capability_path, &token)
        .map_err(|error| error.message().to_string())?;
    let coordinator = IngredientIngestCoordinator::open(&database_path, &attachment_root)
        .map_err(|error| error.message().to_string())?;
    let audit = AgentRepository::open_for_runtime(&database_path)
        .map_err(|error| error.message().to_string())?;
    let recipe_proposals =
        AgentRecipeRepository::open(&database_path).map_err(|error| error.message().to_string())?;
    let references = RndReferenceRepository::open(&database_path)
        .map_err(|error| error.message().to_string())?;
    let registry = AgentToolRegistry::with_audit_recipes_and_references(
        coordinator,
        audit,
        recipe_proposals,
        references,
    );
    let server = if std::env::var(MCP_V2_MODE_ENV).as_deref() == Ok("1") {
        McpServer::new_with_harness_policy(registry, context, database_path)
    } else {
        McpServer::new(registry, context)
    };
    serve_mcp(server, tokio::io::stdin(), tokio::io::stdout())
        .await
        .map_err(|_| "标准输入输出连接异常".into())
}

fn required_env(name: &str) -> Result<String, String> {
    std::env::var(name).map_err(|_| "缺少任务级授权信息".into())
}

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
            child_process_path::simplified(&capability.record_path)
                .to_string_lossy()
                .into_owned(),
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
    harness_database_path: Option<PathBuf>,
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
            harness_database_path: None,
        }
    }

    pub fn new_with_harness_policy(
        registry: AgentToolRegistry,
        context: AgentToolContext,
        database_path: PathBuf,
    ) -> Self {
        Self {
            registry,
            context,
            state: ServerState::New,
            cancelled: HashSet::new(),
            harness_database_path: Some(database_path),
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
                    "title": "Ninka Agent 工具",
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
        let mut tools = self
            .registry
            .definitions()
            .into_iter()
            .map(|tool| {
                let mut input_schema = tool.input_schema;
                if self.harness_database_path.is_some()
                    && let Some(object) = input_schema.as_object_mut()
                {
                    let properties = object.entry("properties").or_insert_with(|| json!({}));
                    if let Some(properties) = properties.as_object_mut() {
                        properties.insert(
                            "taskId".into(),
                            json!({
                                "type": "string",
                                "description": "FoodLab 当前任务 ID，必须与用户消息一致"
                            }),
                        );
                        properties.insert(
                            "turnId".into(),
                            json!({
                                "type": "string",
                                "description": "FoodLab 当前 Turn ID，必须与用户消息一致"
                            }),
                        );
                    }
                    let required = object.entry("required").or_insert_with(|| json!([]));
                    if let Some(required) = required.as_array_mut() {
                        if !required.iter().any(|value| value == "taskId") {
                            required.push(json!("taskId"));
                        }
                        if !required.iter().any(|value| value == "turnId") {
                            required.push(json!("turnId"));
                        }
                    }
                }
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": input_schema
                })
            })
            .collect::<Vec<_>>();
        if self.harness_database_path.is_some() {
            tools.push(json!({
                "name": "request_task_input",
                "description": "缺少只能由用户决定或提供的必要条件时，生成结构化问题并将任务置为 needs_input；调用后应停止当前任务",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "taskId": { "type": "string" },
                        "turnId": { "type": "string" },
                        "prompt": { "type": "string", "minLength": 1 },
                        "choices": {
                            "type": ["array", "null"],
                            "items": { "type": "string" },
                            "maxItems": 8
                        }
                    },
                    "required": ["taskId", "turnId", "prompt"],
                    "additionalProperties": false
                }
            }));
            tools.push(review_artifact_tool_definition(
                "create_label_compliance_review",
                "登记一份待复核标签合规审查草稿；正式法规结论必须基于本地官方全文或用户提供原文，搜索摘要不能单独作为证据",
                true,
            ));
            tools.push(review_artifact_tool_definition(
                "create_research_report_draft",
                "登记一份待复核研发报告草稿；不会覆盖配方版本、导出文件或向外部发送",
                false,
            ));
        }
        json_rpc_result(id, json!({ "tools": tools }))
    }

    fn call_tool(&mut self, id: Value, params: Option<&Value>) -> Value {
        let Some(name) = params
            .and_then(|params| params.get("name"))
            .and_then(Value::as_str)
        else {
            return json_rpc_error(id, -32602, "工具调用缺少名称");
        };
        let mut arguments = params
            .and_then(|params| params.get("arguments"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        if !arguments.is_object() {
            return json_rpc_error(id, -32602, "工具参数必须是 JSON 对象");
        }
        let virtual_request_input =
            self.harness_database_path.is_some() && name == "request_task_input";
        let virtual_artifact = self
            .harness_database_path
            .as_ref()
            .and_then(|_| virtual_artifact_kind(name));
        if !virtual_request_input
            && virtual_artifact.is_none()
            && !self
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

        let mut execution_context = self.context.clone();
        let mut task_identity: Option<(String, String)> = None;
        if let Some(database_path) = &self.harness_database_path {
            let Some(object) = arguments.as_object_mut() else {
                return json_rpc_error(id, -32602, "工具参数必须是 JSON 对象");
            };
            let task_id = object
                .remove("taskId")
                .and_then(|value| value.as_str().map(str::to_string));
            let turn_id = object
                .remove("turnId")
                .and_then(|value| value.as_str().map(str::to_string));
            let (Some(task_id), Some(turn_id)) = (task_id, turn_id) else {
                return json_rpc_error(id, -32602, "FoodLab 工具调用缺少 taskId 或 turnId");
            };
            let policy = match HarnessRepository::open(database_path).and_then(|repository| {
                let task = repository.get_task(&task_id)?;
                let turn = repository.get_turn(&turn_id)?;
                let bridge = repository.legacy_bridge(&task_id)?;
                let attachment_ids = repository.legacy_attachment_ids(&task_id)?;
                Ok((task, turn, bridge, attachment_ids))
            }) {
                Ok(policy) => policy,
                Err(error) => return json_rpc_error(id, -32602, error.message()),
            };
            let (task, turn, (run_id, import_job_id), attachment_ids) = policy;
            if turn.task_id != task.id || turn.status != TaskOutcome::Running {
                return json_rpc_error(id, -32602, "FoodLab 工具调用不属于当前运行中 Turn");
            }
            if !task
                .task_contract
                .allowed_tools
                .iter()
                .any(|allowed| allowed == name)
            {
                return json_rpc_error(id, -32602, "当前 TaskContract 不允许调用该工具");
            }
            execution_context.run_id = run_id;
            execution_context.import_job_id = import_job_id;
            execution_context.allowed_attachment_ids = attachment_ids.into_iter().collect();
            execution_context.active_recipe_id = task.active_recipe_id;
            execution_context.active_draft_fingerprint = task.active_draft_fingerprint;
            task_identity = Some((task.id, turn.id));
        }

        if virtual_request_input {
            let prompt = arguments
                .get("prompt")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let Some(prompt) = prompt else {
                return json_rpc_error(id, -32602, "补充信息问题不能为空");
            };
            let choices = arguments
                .get("choices")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .take(8)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let value = json!({
                "outcome": "needs_input",
                "question": { "prompt": prompt, "choices": choices }
            });
            return json_rpc_result(
                id,
                json!({
                    "content": [{ "type": "text", "text": value.to_string() }],
                    "structuredContent": value,
                    "isError": false
                }),
            );
        }

        if let Some(kind) = virtual_artifact {
            let title = arguments
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty() && value.chars().count() <= 200);
            let summary = arguments
                .get("summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty() && value.chars().count() <= 20_000);
            let (Some(title), Some(_summary), Some((task_id, turn_id))) =
                (title, summary, task_identity)
            else {
                return json_rpc_error(id, -32602, "待复核成果缺少有效标题或正文");
            };
            let evidence_source = arguments.get("evidenceSource").and_then(Value::as_str);
            if kind == "label_compliance_review"
                && !matches!(
                    evidence_source,
                    Some("local_official_full_text" | "user_provided_original")
                )
            {
                return json_rpc_error(
                    id,
                    -32602,
                    "正式标签结论必须基于本地官方全文或用户提供原文",
                );
            }
            let value = json!({
                "artifactId": format!("{kind}:{task_id}:{turn_id}"),
                "artifactKind": kind,
                "title": title,
                "status": "needs_review",
                "evidenceSource": evidence_source,
            });
            return json_rpc_result(
                id,
                json!({
                    "content": [{ "type": "text", "text": value.to_string() }],
                    "structuredContent": value,
                    "isError": false
                }),
            );
        }

        match self.registry.execute(&execution_context, name, arguments) {
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

fn virtual_artifact_kind(name: &str) -> Option<&'static str> {
    Some(match name {
        "create_label_compliance_review" => "label_compliance_review",
        "create_research_report_draft" => "research_report",
        _ => return None,
    })
}

fn review_artifact_tool_definition(
    name: &str,
    description: &str,
    evidence_required: bool,
) -> Value {
    let mut properties = serde_json::Map::from_iter([
        ("taskId".into(), json!({ "type": "string" })),
        ("turnId".into(), json!({ "type": "string" })),
        (
            "title".into(),
            json!({ "type": "string", "minLength": 1, "maxLength": 200 }),
        ),
        (
            "summary".into(),
            json!({ "type": "string", "minLength": 1, "maxLength": 20000 }),
        ),
    ]);
    let mut required = vec![
        json!("taskId"),
        json!("turnId"),
        json!("title"),
        json!("summary"),
    ];
    if evidence_required {
        properties.insert(
            "evidenceSource".into(),
            json!({
                "type": "string",
                "enum": ["local_official_full_text", "user_provided_original"]
            }),
        );
        required.push(json!("evidenceSource"));
    }
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        }
    })
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
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

fn absolute_path(path: &Path) -> PathBuf {
    child_process_path::canonicalized(path)
}

#[cfg(test)]
mod v2_contract_tests {
    use super::*;

    #[test]
    fn review_artifact_tools_are_explicit_and_compliance_evidence_is_bounded() {
        assert_eq!(
            virtual_artifact_kind("create_label_compliance_review"),
            Some("label_compliance_review")
        );
        assert_eq!(virtual_artifact_kind("save_recipe"), None);
        let definition =
            review_artifact_tool_definition("create_label_compliance_review", "review", true);
        assert_eq!(
            definition.pointer("/inputSchema/properties/evidenceSource/enum"),
            Some(&json!([
                "local_official_full_text",
                "user_provided_original"
            ]))
        );
        assert_eq!(
            definition.pointer("/inputSchema/additionalProperties"),
            Some(&Value::Bool(false))
        );
    }
}
