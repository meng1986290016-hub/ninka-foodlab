use std::time::Instant;

use async_trait::async_trait;
use serde_json::Value;

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, ProviderEvent,
    ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    cli::{
        CliDetectionResult, CliFlavor, CliRuntime, TaskDirectory, ensure_jsonl_line_size,
        failure_from_output, read_result_file,
    },
    http::{emit, no_op_sink, probe_request, result, successful_test},
};
use crate::agent::{
    AgentError,
    model::{AgentProviderCapabilities, AgentProviderConfig, ReasoningEffort},
};

pub struct CodexCliProvider {
    runtime: CliRuntime,
}

impl CodexCliProvider {
    pub fn new(config: AgentProviderConfig) -> Result<Self, AgentError> {
        Ok(Self {
            runtime: CliRuntime::new(config, CliFlavor::Codex)?,
        })
    }

    pub async fn detect(&self) -> Result<CliDetectionResult, AgentError> {
        self.runtime.detect().await
    }

    fn arguments(&self, task: &TaskDirectory) -> Vec<String> {
        let mut arguments = vec![
            "exec".into(),
            "--json".into(),
            "--ephemeral".into(),
            "--sandbox".into(),
            "read-only".into(),
            "--skip-git-repo-check".into(),
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
        for image in &task.image_paths {
            arguments.push("-i".into());
            arguments.push(image.to_string_lossy().into_owned());
        }
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
        }
        Ok(successful_test(kind, started))
    }

    async fn run(
        &self,
        request: ProviderTurnRequest,
        sink: AgentEventSink,
    ) -> Result<ProviderTurnResult, AgentError> {
        let task = TaskDirectory::create(&request)?;
        let output = self
            .runtime
            .execute(&self.arguments(&task), &task.directory)
            .await?;
        if !output.status.success() {
            return Err(failure_from_output(&output));
        }
        let result_file = read_result_file(&task.result_path)?;
        parse_codex_jsonl(
            &output.stdout_text(),
            result_file,
            &request.output_schema,
            sink,
        )
    }

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        Ok(configured_model(&self.runtime.config.model))
    }
}

fn parse_codex_jsonl(
    stdout: &str,
    result_file: Option<String>,
    output_schema: &Value,
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
                        let call = ProviderToolCall {
                            id: item
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or("codex-tool-call")
                                .into(),
                            name: item
                                .get("tool")
                                .and_then(Value::as_str)
                                .ok_or_else(|| {
                                    AgentError::invalid_model_output("Codex CLI 工具调用缺少名称")
                                })?
                                .into(),
                            arguments: tool_arguments(item.get("arguments"))?,
                        };
                        emit(&mut events, &sink, ProviderEvent::ToolCall(call));
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
    result(final_text, output_schema, events)
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
