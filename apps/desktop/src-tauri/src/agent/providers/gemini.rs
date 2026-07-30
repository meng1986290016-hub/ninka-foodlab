use std::time::Instant;

use async_trait::async_trait;
use serde_json::{Value, json};

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, ProviderEvent,
    ProviderTestKind, ProviderToolCall, ProviderTurnRequest, ProviderTurnResult,
    http::{
        HttpProviderCore, emit, ensure_attachment_support, fallback_models, no_op_sink,
        probe_request, result, schema_is_empty, selected_attachments, successful_test,
    },
};
use crate::agent::{
    AgentError,
    model::{AgentMessageRole, AgentProviderCapabilities},
};

pub struct GeminiProvider {
    core: HttpProviderCore,
    secret: String,
}

impl GeminiProvider {
    pub fn new(
        config: crate::agent::model::AgentProviderConfig,
        secret: String,
    ) -> Result<Self, AgentError> {
        if secret.trim().is_empty() {
            return Err(AgentError::provider_not_configured(
                "请先配置 Gemini API Key",
            ));
        }
        Ok(Self {
            core: HttpProviderCore::new(config)?,
            secret,
        })
    }

    fn headers(&self) -> Vec<(&'static str, String)> {
        vec![("x-goog-api-key", self.secret.clone())]
    }

    async fn raw_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        let value = self
            .core
            .get_json(&self.core.url("models"), self.headers())
            .await?;
        let models = value
            .get("models")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|model| model.get("name").and_then(Value::as_str))
            .map(|name| name.trim_start_matches("models/"))
            .map(|id| AgentModelOption {
                id: id.into(),
                label: id.into(),
            })
            .collect();
        Ok(models)
    }
}

#[async_trait]
impl AgentProvider for GeminiProvider {
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
        let mut contents = request
            .messages
            .iter()
            .map(|message| {
                let role = match message.role {
                    AgentMessageRole::Assistant => "model",
                    AgentMessageRole::User | AgentMessageRole::Tool => "user",
                };
                let text = match message.role {
                    AgentMessageRole::Tool => format!("工具结果：{}", message.content),
                    _ => message.content.clone(),
                };
                json!({ "role": role, "parts": [{ "text": text }] })
            })
            .collect::<Vec<_>>();
        let selected = selected_attachments(&request);
        if !selected.is_empty() {
            let mut parts = selected
                .iter()
                .filter_map(|attachment| attachment.extracted_text.as_deref())
                .filter(|text| !text.trim().is_empty())
                .map(|text| json!({ "text": format!("所选附件提取内容：\n{text}") }))
                .collect::<Vec<_>>();
            parts.extend(selected.iter().filter_map(|attachment| {
                attachment.data_base64.as_ref().map(|data| {
                    json!({
                        "inlineData": {
                            "mimeType": attachment.media_type,
                            "data": data
                        }
                    })
                })
            }));
            contents.push(json!({ "role": "user", "parts": parts }));
        }
        let declarations = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "parametersJsonSchema": tool.input_schema
                })
            })
            .collect::<Vec<_>>();
        let mut body = json!({
            "contents": contents,
            "tools": [{ "functionDeclarations": declarations }]
        });
        if !schema_is_empty(&request.output_schema) {
            body["generationConfig"] = json!({
                "responseMimeType": "application/json",
                "responseJsonSchema": request.output_schema
            });
        }
        let model = self.core.config.model.trim_start_matches("models/");
        let value = self
            .core
            .post_json(
                &self.core.url(&format!("models/{model}:generateContent")),
                self.headers(),
                body,
            )
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
    let parts = value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .ok_or_else(|| AgentError::invalid_model_output("模型响应缺少内容"))?;
    let mut events = vec![];
    let mut final_text = String::new();
    for (index, part) in parts.iter().enumerate() {
        if let Some(text) = part.get("text").and_then(Value::as_str) {
            final_text.push_str(text);
            emit(&mut events, &sink, ProviderEvent::TextDelta(text.into()));
        }
        if let Some(function) = part.get("functionCall") {
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    AgentError::invalid_model_output("模型工具调用缺少名称，将自动重试一次")
                })?;
            let call = ProviderToolCall {
                id: format!("gemini-{index}-{name}"),
                name: name.into(),
                arguments: function.get("args").cloned().ok_or_else(|| {
                    AgentError::invalid_model_output("模型工具调用缺少参数，将自动重试一次")
                })?,
            };
            emit(&mut events, &sink, ProviderEvent::ToolCall(call));
        }
    }
    if let Some(usage) = value.get("usageMetadata") {
        emit(
            &mut events,
            &sink,
            ProviderEvent::Usage {
                input_tokens: usage
                    .get("promptTokenCount")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                output_tokens: usage
                    .get("candidatesTokenCount")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            },
        );
    }
    result(final_text, output_schema, events)
}
