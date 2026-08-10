use std::time::Instant;

use async_trait::async_trait;
use serde_json::{Value, json};

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, ProviderEvent,
    ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    http::{
        HttpProviderCore, add_structured_output_instruction, chat_completion_messages,
        chat_completion_tools, connection_probe_request, emit, ensure_attachment_support,
        fallback_models, model_options, no_op_sink, probe_request, result, run_agent_loop_probe,
        schema_is_empty, successful_test,
    },
};
use crate::agent::{
    AgentError,
    model::{AgentProviderCapabilities, AgentProviderKind},
};

#[derive(Clone, Copy)]
enum StructuredOutputMode {
    JsonSchema,
    JsonObject,
    PromptOnly,
}

#[derive(Clone, Copy)]
struct CompatibilityProfile {
    strict_tools: bool,
    structured_output: StructuredOutputMode,
    separate_reasoning: bool,
}

pub struct OpenAiCompatibleProvider {
    core: HttpProviderCore,
    secret: Option<String>,
}

impl OpenAiCompatibleProvider {
    pub fn new(
        config: crate::agent::model::AgentProviderConfig,
        secret: Option<String>,
    ) -> Result<Self, AgentError> {
        Ok(Self {
            core: HttpProviderCore::new(config)?,
            secret,
        })
    }

    fn headers(&self) -> Vec<(&'static str, String)> {
        self.secret
            .as_ref()
            .filter(|secret| !secret.trim().is_empty())
            .map(|secret| vec![("authorization", format!("Bearer {secret}"))])
            .unwrap_or_default()
    }

    async fn raw_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        let value = self
            .core
            .get_json(&self.core.url("models"), self.headers())
            .await?;
        Ok(model_options(&value))
    }
}

#[async_trait]
impl AgentProvider for OpenAiCompatibleProvider {
    fn capabilities(&self) -> AgentProviderCapabilities {
        self.core.config.capabilities.clone()
    }

    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError> {
        let started = Instant::now();
        match kind {
            ProviderTestKind::Connection => {
                self.run(connection_probe_request(), no_op_sink()).await?;
            }
            ProviderTestKind::StructuredOutput => {
                self.run(probe_request(), no_op_sink()).await?;
            }
            ProviderTestKind::AgentLoop => run_agent_loop_probe(self).await?,
        }
        Ok(successful_test(kind, started))
    }

    async fn run(
        &self,
        request: ProviderTurnRequest,
        sink: AgentEventSink,
    ) -> Result<ProviderTurnResult, AgentError> {
        ensure_attachment_support(&request, &self.core.config)?;
        let profile = compatibility_profile(self.core.config.kind);
        let mut messages = chat_completion_messages(&request);
        add_structured_output_instruction(&mut messages, &request.output_schema);
        let mut body = json!({
            "model": self.core.config.model,
            "messages": messages,
            "stream": false
        });
        if !request.tools.is_empty() {
            body["tools"] =
                Value::Array(chat_completion_tools(&request.tools, profile.strict_tools));
        }
        if profile.separate_reasoning {
            body["reasoning_split"] = Value::Bool(true);
        }
        if !schema_is_empty(&request.output_schema) {
            match profile.structured_output {
                StructuredOutputMode::JsonSchema => {
                    body["response_format"] = json!({
                        "type": "json_schema",
                        "json_schema": {
                            "name": "food_rd_agent_output",
                            "schema": request.output_schema,
                            "strict": true
                        }
                    });
                }
                StructuredOutputMode::JsonObject => {
                    body["response_format"] = json!({ "type": "json_object" });
                }
                StructuredOutputMode::PromptOnly => {}
            }
        }
        let value = self
            .core
            .post_json(&self.core.url("chat/completions"), self.headers(), body)
            .await?;
        parse_response(value, &request.output_schema, sink)
    }

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        match self.raw_models().await {
            Ok(models) if !models.is_empty() => Ok(models),
            _ => Ok(fallback_models(self.core.config.kind)),
        }
    }
}

fn compatibility_profile(kind: AgentProviderKind) -> CompatibilityProfile {
    match kind {
        AgentProviderKind::KimiCn => CompatibilityProfile {
            strict_tools: false,
            structured_output: StructuredOutputMode::JsonSchema,
            separate_reasoning: false,
        },
        AgentProviderKind::DeepSeek | AgentProviderKind::Bailian => CompatibilityProfile {
            strict_tools: false,
            structured_output: StructuredOutputMode::JsonObject,
            separate_reasoning: false,
        },
        AgentProviderKind::MinimaxCn => CompatibilityProfile {
            strict_tools: false,
            structured_output: StructuredOutputMode::PromptOnly,
            separate_reasoning: true,
        },
        _ => CompatibilityProfile {
            strict_tools: false,
            structured_output: StructuredOutputMode::PromptOnly,
            separate_reasoning: false,
        },
    }
}

fn parse_response(
    value: Value,
    output_schema: &Value,
    sink: AgentEventSink,
) -> Result<ProviderTurnResult, AgentError> {
    let message = value
        .pointer("/choices/0/message")
        .ok_or_else(|| AgentError::invalid_model_output("模型响应缺少消息内容"))?;
    let mut events = vec![];
    let final_text = message
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    if !final_text.is_empty() {
        emit(
            &mut events,
            &sink,
            ProviderEvent::TextDelta(final_text.clone()),
        );
    }
    for tool in message
        .get("tool_calls")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let function = tool.get("function").ok_or_else(|| {
            AgentError::invalid_model_output("模型工具调用格式无效，将自动重试一次")
        })?;
        let arguments = function
            .get("arguments")
            .and_then(Value::as_str)
            .ok_or_else(|| AgentError::invalid_model_output("模型工具调用缺少参数，将自动重试一次"))
            .and_then(|arguments| {
                serde_json::from_str(arguments).map_err(|_| {
                    AgentError::invalid_model_output("模型工具调用参数无法读取，将自动重试一次")
                })
            })?;
        let call = ProviderToolCall {
            id: tool
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("compatible-tool-call")
                .into(),
            name: function
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    AgentError::invalid_model_output("模型工具调用缺少名称，将自动重试一次")
                })?
                .into(),
            arguments,
        };
        emit(&mut events, &sink, ProviderEvent::ToolCall(call));
    }
    if let Some(usage) = value.get("usage") {
        emit(
            &mut events,
            &sink,
            ProviderEvent::Usage {
                input_tokens: usage
                    .get("prompt_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                output_tokens: usage
                    .get("completion_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            },
        );
    }
    result(final_text, output_schema, events)
}
