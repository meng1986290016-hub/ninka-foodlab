use std::{collections::BTreeMap, time::Instant};

use async_trait::async_trait;
use serde_json::Value;

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, AgentToolDefinition,
    ProviderEvent, ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    cli::{
        CliDetectionResult, CliFlavor, CliRuntime, TaskDirectory, ensure_jsonl_line_size,
        failure_from_output, normalize_cli_turn_output,
    },
    http::{emit, no_op_sink, probe_request, successful_test},
};
use crate::agent::{
    AgentError,
    mcp::McpTaskLaunchConfig,
    model::{AgentProviderCapabilities, AgentProviderConfig, ReasoningEffort},
};

pub struct ClaudeCliProvider {
    runtime: CliRuntime,
    mcp: Option<McpTaskLaunchConfig>,
}

impl ClaudeCliProvider {
    pub fn new(config: AgentProviderConfig) -> Result<Self, AgentError> {
        Ok(Self {
            runtime: CliRuntime::new(config, CliFlavor::Claude)?,
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

    fn arguments(&self, task: &TaskDirectory) -> Vec<String> {
        let mut arguments = vec![
            "-p".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--verbose".into(),
            "--json-schema".into(),
            task.schema_json.clone(),
            "--max-turns".into(),
            "12".into(),
            "--mcp-config".into(),
            task.mcp_config_path.to_string_lossy().into_owned(),
            "--strict-mcp-config".into(),
            "--tools".into(),
            String::new(),
            "--allowedTools".into(),
            "mcp__food_rd__*".into(),
            "--no-session-persistence".into(),
        ];
        if !self.runtime.config.model.trim().is_empty() {
            arguments.push("--model".into());
            arguments.push(self.runtime.config.model.trim().into());
        }
        if let Some(effort) = claude_effort(self.runtime.config.reasoning_effort) {
            arguments.push("--effort".into());
            arguments.push(effort.into());
        }
        arguments.push(task.prompt.clone());
        arguments
    }
}

#[async_trait]
impl AgentProvider for ClaudeCliProvider {
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
        if let Some(mcp) = &self.mcp {
            mcp.prepare(&task.directory)?
                .write_claude_config(&task.mcp_config_path)?;
        }
        let output = self
            .runtime
            .execute(&self.arguments(&task), &task.directory)
            .await?;
        if !output.status.success() {
            return Err(failure_from_output(&output));
        }
        parse_claude_jsonl(
            &output.stdout_text(),
            &request.output_schema,
            &request.tools,
            sink,
        )
    }

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        let model = self.runtime.config.model.trim();
        if model.is_empty() {
            Ok(vec![])
        } else {
            Ok(vec![AgentModelOption {
                id: model.into(),
                label: model.into(),
            }])
        }
    }
}

fn parse_claude_jsonl(
    stdout: &str,
    output_schema: &Value,
    tools: &[AgentToolDefinition],
    sink: AgentEventSink,
) -> Result<ProviderTurnResult, AgentError> {
    let mut events = vec![];
    let mut streamed_text = String::new();
    let mut final_text = String::new();
    let mut final_structured = None;
    let mut pending_tool_calls = BTreeMap::new();
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        ensure_jsonl_line_size(line)?;
        let value: Value = serde_json::from_str(line)
            .map_err(|_| AgentError::invalid_model_output("Claude Code 返回了无法读取的数据"))?;
        match value.get("type").and_then(Value::as_str) {
            Some("stream_event") => {
                let delta = value.pointer("/event/delta");
                if delta
                    .and_then(|delta| delta.get("type"))
                    .and_then(Value::as_str)
                    == Some("text_delta")
                    && let Some(text) = delta
                        .and_then(|delta| delta.get("text"))
                        .and_then(Value::as_str)
                {
                    streamed_text.push_str(text);
                    emit(&mut events, &sink, ProviderEvent::TextDelta(text.into()));
                }
            }
            Some("assistant") => {
                for block in value
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if block.get("type").and_then(Value::as_str) == Some("tool_use") {
                        let raw_name =
                            block.get("name").and_then(Value::as_str).ok_or_else(|| {
                                AgentError::invalid_model_output("Claude Code 工具调用缺少名称")
                            })?;
                        let call = ProviderToolCall {
                            id: block
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or("claude-tool-call")
                                .into(),
                            name: raw_name
                                .strip_prefix("mcp__food_rd__")
                                .unwrap_or(raw_name)
                                .into(),
                            arguments: block
                                .get("input")
                                .cloned()
                                .unwrap_or_else(|| Value::Object(Default::default())),
                        };
                        pending_tool_calls.insert(call.id.clone(), call);
                    }
                }
            }
            Some("user") => {
                for block in value
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                        continue;
                    }
                    let call_id = block
                        .get("tool_use_id")
                        .and_then(Value::as_str)
                        .unwrap_or("claude-tool-call");
                    let call = pending_tool_calls.remove(call_id);
                    if block
                        .get("is_error")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                    {
                        let name = call
                            .as_ref()
                            .map(|call| call.name.as_str())
                            .unwrap_or(call_id);
                        return Err(AgentError::provider_failure(format!(
                            "Claude Code 工具调用失败（{name}）：{}",
                            claude_tool_result_text(block)
                        )));
                    }
                    if let Some(call) = call {
                        emit(&mut events, &sink, ProviderEvent::ToolObservation(call));
                    }
                }
            }
            Some("result") => {
                if value.get("subtype").and_then(Value::as_str) != Some("success")
                    || value
                        .get("is_error")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                {
                    return Err(AgentError::provider_failure(
                        value
                            .get("result")
                            .and_then(Value::as_str)
                            .unwrap_or("Claude Code 执行失败"),
                    ));
                }
                final_text = value
                    .get("result")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into();
                final_structured = value.get("structured_output").cloned();
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
            Some("error") => {
                return Err(AgentError::provider_failure(
                    value
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("Claude Code 执行失败"),
                ));
            }
            _ => {}
        }
    }
    if let Some((_, call)) = pending_tool_calls.into_iter().next() {
        return Err(AgentError::provider_failure(format!(
            "Claude Code 工具调用未返回执行结果（{}）",
            call.name
        )));
    }
    if final_text.is_empty() {
        final_text = streamed_text;
    }
    normalize_cli_turn_output(
        final_text,
        final_structured,
        output_schema,
        tools,
        events,
        &sink,
    )
}

fn claude_tool_result_text(block: &Value) -> String {
    let content = block.get("content").unwrap_or(&Value::Null);
    let detail = match content {
        Value::String(text) => text.trim().to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        Value::Null => String::new(),
        other => other.to_string(),
    };
    if detail.is_empty() {
        "工具没有返回成功结果".into()
    } else {
        detail.chars().take(240).collect()
    }
}

fn claude_effort(effort: ReasoningEffort) -> Option<&'static str> {
    match effort {
        ReasoningEffort::Low => Some("low"),
        ReasoningEffort::Medium => Some("medium"),
        ReasoningEffort::High => Some("high"),
        ReasoningEffort::Max => Some("max"),
        ReasoningEffort::Auto | ReasoningEffort::Off => None,
    }
}
