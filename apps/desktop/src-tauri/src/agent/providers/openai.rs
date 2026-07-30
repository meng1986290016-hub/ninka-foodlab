use std::time::Instant;

use async_trait::async_trait;
use serde_json::{Value, json};

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, ProviderEvent,
    ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    http::{
        HttpProviderCore, emit, ensure_attachment_support, fallback_models, model_options,
        no_op_sink, openai_response_messages, openai_tools, probe_request, result, schema_is_empty,
        successful_test,
    },
};
use crate::agent::{
    AgentError,
    model::{AgentProviderCapabilities, AgentProviderKind},
};

pub struct OpenAiProvider {
    core: HttpProviderCore,
    secret: String,
}

impl OpenAiProvider {
    pub fn new(
        config: crate::agent::model::AgentProviderConfig,
        secret: String,
    ) -> Result<Self, AgentError> {
        if secret.trim().is_empty() {
            return Err(AgentError::provider_not_configured(
                "请先配置 OpenAI API Key",
            ));
        }
        Ok(Self {
            core: HttpProviderCore::new(config)?,
            secret,
        })
    }

    fn headers(&self) -> Vec<(&'static str, String)> {
        if self.core.config.kind == AgentProviderKind::AzureOpenAi {
            vec![("api-key", self.secret.clone())]
        } else {
            vec![("authorization", format!("Bearer {}", self.secret))]
        }
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
impl AgentProvider for OpenAiProvider {
    fn capabilities(&self) -> AgentProviderCapabilities {
        self.core.config.capabilities.clone()
    }

    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError> {
        let started = Instant::now();
        match kind {
            ProviderTestKind::Connection => {
                self.raw_models().await?;
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
        ensure_attachment_support(&request, self.core.config.capabilities.images)?;
        let mut body = json!({
            "model": self.core.config.model,
            "input": openai_response_messages(&request),
            "tools": openai_tools(&request.tools),
            "parallel_tool_calls": false,
            "store": false
        });
        if !schema_is_empty(&request.output_schema) {
            body["text"] = json!({
                "format": {
                    "type": "json_schema",
                    "name": "food_rd_agent_output",
                    "schema": request.output_schema,
                    "strict": true
                }
            });
        }
        let value = self
            .core
            .post_json(&self.core.url("responses"), self.headers(), body)
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

fn parse_response(
    value: Value,
    output_schema: &Value,
    sink: AgentEventSink,
) -> Result<ProviderTurnResult, AgentError> {
    let mut events = vec![];
    let mut final_text = String::new();
    for item in value
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match item.get("type").and_then(Value::as_str) {
            Some("message") => {
                for block in item
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if block.get("type").and_then(Value::as_str) == Some("output_text")
                        && let Some(text) = block.get("text").and_then(Value::as_str)
                    {
                        final_text.push_str(text);
                        emit(&mut events, &sink, ProviderEvent::TextDelta(text.into()));
                    }
                }
            }
            Some("function_call") => {
                let arguments = item
                    .get("arguments")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AgentError::invalid_model_output("模型工具调用缺少参数，将自动重试一次")
                    })
                    .and_then(|arguments| {
                        serde_json::from_str(arguments).map_err(|_| {
                            AgentError::invalid_model_output(
                                "模型工具调用参数无法读取，将自动重试一次",
                            )
                        })
                    })?;
                let call = ProviderToolCall {
                    id: item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .and_then(Value::as_str)
                        .unwrap_or("openai-tool-call")
                        .into(),
                    name: required_string(item, "name")?,
                    arguments,
                };
                emit(&mut events, &sink, ProviderEvent::ToolCall(call));
            }
            _ => {}
        }
    }
    if let Some(usage) = value.get("usage") {
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
    result(final_text, output_schema, events)
}

fn required_string(value: &Value, key: &str) -> Result<String, AgentError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| AgentError::invalid_model_output("模型工具调用缺少名称，将自动重试一次"))
}
