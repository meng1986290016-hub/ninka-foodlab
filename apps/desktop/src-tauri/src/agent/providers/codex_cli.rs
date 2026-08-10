use std::time::Instant;

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, AgentToolDefinition,
    ProviderEvent, ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    cli::{
        CliDetectionResult, CliFlavor, CliRuntime, TaskDirectory, ensure_jsonl_line_size,
        failure_from_output, normalize_cli_turn_output, read_result_file,
    },
    http::{emit, no_op_sink, probe_request, successful_test},
};
use crate::agent::{
    AgentError,
    mcp::{McpTaskLaunchConfig, PreparedMcpTask},
    model::{AgentProviderCapabilities, AgentProviderConfig, ReasoningEffort},
};

pub struct CodexCliProvider {
    runtime: CliRuntime,
    mcp: Option<McpTaskLaunchConfig>,
}

impl CodexCliProvider {
    pub fn new(config: AgentProviderConfig) -> Result<Self, AgentError> {
        Ok(Self {
            runtime: CliRuntime::new(config, CliFlavor::Codex)?,
            mcp: None,
        })
    }

    pub fn with_mcp(mut self, mcp: McpTaskLaunchConfig) -> Self {
        self.mcp = Some(mcp);
        self
    }

    pub async fn detect(&self) -> Result<CliDetectionResult, AgentError> {
        self.runtime.detect().await
    }

    fn arguments(&self, task: &TaskDirectory, mcp: Option<&PreparedMcpTask>) -> Vec<String> {
        let mut arguments = vec![
            "exec".into(),
            "--json".into(),
            "--ephemeral".into(),
            "--sandbox".into(),
            "read-only".into(),
            "--skip-git-repo-check".into(),
            "--ignore-user-config".into(),
            "--ignore-rules".into(),
            "--output-schema".into(),
            task.schema_path.to_string_lossy().into_owned(),
            "-o".into(),
            task.result_path.to_string_lossy().into_owned(),
            "--color".into(),
            "never".into(),
        ];
        if !self.runtime.config.model.trim().is_empty() {
            arguments.push("-m".into());
            arguments.push(self.runtime.config.model.trim().into());
        }
        if let Some(effort) = codex_effort(self.runtime.config.reasoning_effort) {
            arguments.push("-c".into());
            arguments.push(format!("model_reasoning_effort=\"{effort}\""));
        }
        if let Some(mcp) = mcp {
            arguments.push("-c".into());
            arguments.push(format!(
                "mcp_servers.food_rd.command={}",
                toml_string(&mcp.server_binary.to_string_lossy())
            ));
            arguments.push("-c".into());
            arguments.push(format!(
                "mcp_servers.food_rd.env={}",
                toml_environment(&mcp.environment)
            ));
            // Codex runs headlessly here, so a prompt-based MCP approval has no
            // UI that can answer it. The food_rd server is already restricted by
            // a single-use, task-scoped capability and can only create reviewable
            // drafts, never accept them as formal data.
            arguments.push("-c".into());
            arguments.push(format!(
                "mcp_servers.food_rd.default_tools_approval_mode={}",
                toml_string("approve")
            ));
        }
        for image in &task.image_paths {
            arguments.push("-i".into());
            arguments.push(image.to_string_lossy().into_owned());
        }
        // `-i/--image` accepts multiple values. Without an explicit option
        // boundary, Codex can consume the prompt as one more image path.
        arguments.push("--".into());
        arguments.push(task.prompt.clone());
        arguments
    }
}

#[async_trait]
impl AgentProvider for CodexCliProvider {
    fn capabilities(&self) -> AgentProviderCapabilities {
        self.runtime.config.capabilities.clone()
    }

    fn cancel(&self) {
        self.runtime.cancel();
    }

    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError> {
        let started = Instant::now();
        match kind {
            ProviderTestKind::Connection => {
                let detected = self.detect().await?;
                if !detected.authenticated {
                    return Err(AgentError::provider_not_configured(detected.message));
                }
            }
            ProviderTestKind::StructuredOutput => {
                self.run(probe_request(), no_op_sink()).await?;
            }
            ProviderTestKind::AgentLoop => {
                super::http::run_agent_loop_probe(self).await?;
            }
        }
        Ok(successful_test(kind, started))
    }

    async fn run(
        &self,
        request: ProviderTurnRequest,
        sink: AgentEventSink,
    ) -> Result<ProviderTurnResult, AgentError> {
        let task = TaskDirectory::create(&request)?;
        let mcp = self
            .mcp
            .as_ref()
            .map(|config| config.prepare(&task.directory))
            .transpose()?;
        let output = self
            .runtime
            .execute(&self.arguments(&task, mcp.as_ref()), &task.directory)
            .await?;
        if !output.status.success() {
            return Err(failure_from_output(&output));
        }
        let result_file = read_result_file(&task.result_path)?;
        parse_codex_jsonl(
            &output.stdout_text(),
            result_file,
            &request.output_schema,
            &request.tools,
            sink,
        )
    }

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        let current_dir = std::env::temp_dir();
        let live_arguments = vec!["debug".into(), "models".into()];
        let output = match self.runtime.execute(&live_arguments, &current_dir).await {
            Ok(output) if output.status.success() => output,
            _ => {
                let bundled_arguments = vec!["debug".into(), "models".into(), "--bundled".into()];
                self.runtime
                    .execute(&bundled_arguments, &current_dir)
                    .await?
            }
        };
        if !output.status.success() {
            let configured = configured_model(&self.runtime.config.model);
            return if configured.is_empty() {
                Err(failure_from_output(&output))
            } else {
                Ok(configured)
            };
        }
        parse_codex_model_catalog(&output.stdout_text(), &self.runtime.config.model)
    }
}

#[derive(Deserialize)]
struct CodexModelCatalog {
    models: Vec<CodexModelCatalogEntry>,
}

#[derive(Deserialize)]
struct CodexModelCatalogEntry {
    slug: String,
    display_name: String,
    visibility: Option<String>,
    priority: Option<u64>,
}

fn parse_codex_model_catalog(
    stdout: &str,
    configured_model_id: &str,
) -> Result<Vec<AgentModelOption>, AgentError> {
    let mut catalog: CodexModelCatalog = serde_json::from_str(stdout)
        .map_err(|_| AgentError::invalid_model_output("Codex CLI 返回的模型目录无法读取"))?;
    catalog
        .models
        .sort_by_key(|model| model.priority.unwrap_or(u64::MAX));
    let mut options = catalog
        .models
        .into_iter()
        .filter(|model| model.visibility.as_deref() == Some("list"))
        .map(|model| AgentModelOption {
            id: model.slug,
            label: model.display_name,
        })
        .collect::<Vec<_>>();

    let configured_model_id = configured_model_id.trim();
    if !configured_model_id.is_empty()
        && !options.iter().any(|model| model.id == configured_model_id)
    {
        options.insert(
            0,
            AgentModelOption {
                id: configured_model_id.into(),
                label: configured_model_id.into(),
            },
        );
    }
    Ok(options)
}

fn parse_codex_jsonl(
    stdout: &str,
    result_file: Option<String>,
    output_schema: &Value,
    tools: &[AgentToolDefinition],
    sink: AgentEventSink,
) -> Result<ProviderTurnResult, AgentError> {
    let mut events = vec![];
    let mut final_text = String::new();
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        ensure_jsonl_line_size(line)?;
        let value: Value = serde_json::from_str(line)
            .map_err(|_| AgentError::invalid_model_output("Codex CLI 返回了无法读取的数据"))?;
        match value.get("type").and_then(Value::as_str) {
            Some("item.completed") => {
                let item = value.get("item").unwrap_or(&Value::Null);
                match item.get("type").and_then(Value::as_str) {
                    Some("agent_message") => {
                        if let Some(text) = item.get("text").and_then(Value::as_str) {
                            final_text = text.into();
                            emit(&mut events, &sink, ProviderEvent::TextDelta(text.into()));
                        }
                    }
                    Some("mcp_tool_call") => {
                        let call = completed_codex_tool_call(item)?;
                        emit(&mut events, &sink, ProviderEvent::ToolObservation(call));
                    }
                    _ => {}
                }
            }
            Some("turn.completed") => {
                let usage = value.get("usage").unwrap_or(&Value::Null);
                emit(
                    &mut events,
                    &sink,
                    ProviderEvent::Usage {
                        input_tokens: usage
                            .get("input_tokens")
                            .and_then(Value::as_u64)
                            .unwrap_or(0),
                        output_tokens: usage
                            .get("output_tokens")
                            .and_then(Value::as_u64)
                            .unwrap_or(0),
                    },
                );
            }
            Some("error") | Some("turn.failed") => {
                return Err(AgentError::provider_failure(
                    value
                        .pointer("/error/message")
                        .or_else(|| value.get("message"))
                        .and_then(Value::as_str)
                        .unwrap_or("Codex CLI 执行失败"),
                ));
            }
            _ => {}
        }
    }
    if let Some(result_file) = result_file {
        final_text = result_file;
    }
    normalize_cli_turn_output(final_text, None, output_schema, tools, events, &sink)
}

fn completed_codex_tool_call(item: &Value) -> Result<ProviderToolCall, AgentError> {
    let name = item
        .get("tool")
        .and_then(Value::as_str)
        .ok_or_else(|| AgentError::invalid_model_output("Codex CLI 工具调用缺少名称"))?;
    let status = item.get("status").and_then(Value::as_str);
    let error_message = item
        .pointer("/error/message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty());
    let result_is_error = item
        .pointer("/result/isError")
        .or_else(|| item.pointer("/result/is_error"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if error_message.is_some() || result_is_error || matches!(status, Some("failed" | "cancelled"))
    {
        let detail = error_message
            .or_else(|| {
                item.pointer("/result/structuredContent/error/message")
                    .or_else(|| item.pointer("/result/structured_content/error/message"))
                    .and_then(Value::as_str)
            })
            .unwrap_or("工具没有返回成功结果");
        return Err(AgentError::provider_failure(format!(
            "Codex CLI 工具调用失败（{name}）：{}",
            detail.chars().take(240).collect::<String>()
        )));
    }
    if !matches!(status, None | Some("completed")) {
        return Err(AgentError::invalid_model_output(format!(
            "Codex CLI 工具调用状态无效（{name}）：{}",
            status.unwrap_or("unknown")
        )));
    }

    Ok(ProviderToolCall {
        id: item
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("codex-tool-call")
            .into(),
        name: name.into(),
        arguments: tool_arguments(item.get("arguments"))?,
    })
}

fn tool_arguments(value: Option<&Value>) -> Result<Value, AgentError> {
    match value {
        Some(Value::Object(_)) => Ok(value.cloned().unwrap_or_default()),
        Some(Value::String(arguments)) => serde_json::from_str(arguments)
            .map_err(|_| AgentError::invalid_model_output("Codex CLI 工具参数无法读取")),
        Some(Value::Null) | None => Ok(Value::Object(Default::default())),
        _ => Err(AgentError::invalid_model_output(
            "Codex CLI 工具参数格式无效",
        )),
    }
}

fn codex_effort(effort: ReasoningEffort) -> Option<&'static str> {
    match effort {
        ReasoningEffort::Low => Some("low"),
        ReasoningEffort::Medium => Some("medium"),
        ReasoningEffort::High => Some("high"),
        ReasoningEffort::Max => Some("xhigh"),
        ReasoningEffort::Auto | ReasoningEffort::Off => None,
    }
}

fn configured_model(model: &str) -> Vec<AgentModelOption> {
    let model = model.trim();
    if model.is_empty() {
        vec![]
    } else {
        vec![AgentModelOption {
            id: model.into(),
            label: model.into(),
        }]
    }
}

fn toml_environment(environment: &std::collections::BTreeMap<String, String>) -> String {
    let entries = environment
        .iter()
        .map(|(key, value)| format!("{}={}", toml_string(key), toml_string(value)))
        .collect::<Vec<_>>()
        .join(",");
    format!("{{{entries}}}")
}

fn toml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into())
}
