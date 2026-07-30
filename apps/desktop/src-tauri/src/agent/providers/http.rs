use std::time::{Duration, Instant};

use reqwest::{
    Client, Response, StatusCode,
    header::{HeaderMap, HeaderName, HeaderValue},
};
use serde_json::{Value, json};

use super::{
    AgentEventSink, AgentModelOption, AgentProviderTestResult, AgentToolDefinition,
    ProviderAttachment, ProviderEvent, ProviderTestKind, ProviderTurnRequest, ProviderTurnResult,
};
use crate::agent::{
    AgentError,
    model::{AgentMessage, AgentMessageRole, AgentProviderConfig, AgentProviderKind},
};

pub(crate) struct HttpProviderCore {
    pub config: AgentProviderConfig,
    client: Client,
}

impl HttpProviderCore {
    pub fn new(config: AgentProviderConfig) -> Result<Self, AgentError> {
        let timeout = Duration::from_secs(config.timeout_seconds.max(1));
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|_| AgentError::provider_failure("无法初始化模型网络连接"))?;
        Ok(Self { config, client })
    }

    pub fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.config.endpoint.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    pub async fn post_json(
        &self,
        url: &str,
        headers: Vec<(&'static str, String)>,
        body: Value,
    ) -> Result<Value, AgentError> {
        let response = self
            .client
            .post(url)
            .headers(build_headers(headers)?)
            .json(&body)
            .send()
            .await
            .map_err(map_request_error)?;
        parse_response(response).await
    }

    pub async fn get_json(
        &self,
        url: &str,
        headers: Vec<(&'static str, String)>,
    ) -> Result<Value, AgentError> {
        let response = self
            .client
            .get(url)
            .headers(build_headers(headers)?)
            .send()
            .await
            .map_err(map_request_error)?;
        parse_response(response).await
    }
}

pub(crate) fn emit(events: &mut Vec<ProviderEvent>, sink: &AgentEventSink, event: ProviderEvent) {
    sink(event.clone());
    events.push(event);
}

pub(crate) fn message_values(messages: &[AgentMessage], model_role: &str) -> Vec<Value> {
    messages
        .iter()
        .map(|message| {
            let role = match message.role {
                AgentMessageRole::User => "user",
                AgentMessageRole::Assistant => model_role,
                AgentMessageRole::Tool => "user",
            };
            let content = match message.role {
                AgentMessageRole::Tool => format!("工具结果：{}", message.content),
                _ => message.content.clone(),
            };
            json!({ "role": role, "content": content })
        })
        .collect()
}

pub(crate) fn openai_response_messages(request: &ProviderTurnRequest) -> Vec<Value> {
    let mut messages = message_values(&request.messages, "assistant");
    let attachments = selected_attachments(request);
    if !attachments.is_empty() {
        let mut content = attachment_text_blocks(&attachments, "input_text");
        content.extend(attachments.iter().filter_map(|attachment| {
            attachment.data_base64.as_ref().map(|data| {
                json!({
                    "type": "input_image",
                    "image_url": data_url(&attachment.media_type, data)
                })
            })
        }));
        messages.push(json!({ "role": "user", "content": content }));
    }
    messages
}

pub(crate) fn chat_completion_messages(request: &ProviderTurnRequest) -> Vec<Value> {
    let mut messages = message_values(&request.messages, "assistant");
    let attachments = selected_attachments(request);
    if !attachments.is_empty() {
        let mut content = attachment_text_blocks(&attachments, "text");
        content.extend(attachments.iter().filter_map(|attachment| {
            attachment.data_base64.as_ref().map(|data| {
                json!({
                    "type": "image_url",
                    "image_url": {
                        "url": data_url(&attachment.media_type, data)
                    }
                })
            })
        }));
        messages.push(json!({ "role": "user", "content": content }));
    }
    messages
}

pub(crate) fn anthropic_messages(request: &ProviderTurnRequest) -> Vec<Value> {
    let mut messages = message_values(&request.messages, "assistant");
    let attachments = selected_attachments(request);
    if !attachments.is_empty() {
        let mut content = attachment_text_blocks(&attachments, "text");
        content.extend(attachments.iter().filter_map(|attachment| {
            attachment.data_base64.as_ref().map(|data| {
                json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": attachment.media_type,
                        "data": data
                    }
                })
            })
        }));
        messages.push(json!({ "role": "user", "content": content }));
    }
    messages
}

pub(crate) fn ensure_attachment_support(
    request: &ProviderTurnRequest,
    images_supported: bool,
) -> Result<(), AgentError> {
    let includes_images = selected_attachments(request)
        .iter()
        .any(|attachment| attachment.data_base64.is_some());
    if includes_images && !images_supported {
        return Err(AgentError::provider_not_configured(
            "当前模型不支持图片，请选择图片识别模型",
        ));
    }
    Ok(())
}

pub(crate) fn selected_attachments(request: &ProviderTurnRequest) -> Vec<&ProviderAttachment> {
    request
        .attachments
        .iter()
        .filter(|attachment| request.attachment_ids.contains(&attachment.id))
        .collect()
}

pub(crate) fn openai_tools(tools: &[AgentToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
                "strict": true
            })
        })
        .collect()
}

pub(crate) fn chat_completion_tools(tools: &[AgentToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                    "strict": true
                }
            })
        })
        .collect()
}

pub(crate) fn structured_output(
    final_text: &str,
    output_schema: &Value,
) -> Result<Option<Value>, AgentError> {
    if final_text.trim().is_empty() || schema_is_empty(output_schema) {
        return Ok(None);
    }
    serde_json::from_str(final_text).map(Some).map_err(|_| {
        AgentError::invalid_model_output("模型返回的结构化结果无法读取，将自动重试一次")
    })
}

pub(crate) fn schema_is_empty(schema: &Value) -> bool {
    schema.is_null() || schema.as_object().is_some_and(serde_json::Map::is_empty)
}

pub(crate) fn fallback_models(kind: AgentProviderKind) -> Vec<AgentModelOption> {
    let options: &[&str] = match kind {
        AgentProviderKind::OpenAi | AgentProviderKind::AzureOpenAi => &["gpt-5.5", "gpt-5.4-mini"],
        AgentProviderKind::Anthropic => &["claude-sonnet-4.6", "claude-opus-4.6"],
        AgentProviderKind::Gemini => &["gemini-3.5-flash", "gemini-3.5-pro"],
        AgentProviderKind::DeepSeek => &["deepseek-chat", "deepseek-reasoner"],
        AgentProviderKind::KimiCn => &["kimi-k2.6"],
        AgentProviderKind::ZhipuGlm => &["glm-5", "glm-4.6v"],
        AgentProviderKind::MinimaxCn => &["MiniMax-M2.7"],
        AgentProviderKind::Bailian => &["qwen3-max", "qwen3-vl-plus"],
        AgentProviderKind::VolcengineArk => &["doubao-seed-2-0-pro"],
        AgentProviderKind::Ollama
        | AgentProviderKind::Custom
        | AgentProviderKind::CodexCli
        | AgentProviderKind::ClaudeCodeCli => &[],
    };
    options
        .iter()
        .map(|id| AgentModelOption {
            id: (*id).into(),
            label: (*id).into(),
        })
        .collect()
}

pub(crate) fn model_options(value: &Value) -> Vec<AgentModelOption> {
    value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| model.get("id").and_then(Value::as_str))
        .map(|id| AgentModelOption {
            id: id.into(),
            label: id.into(),
        })
        .collect()
}

pub(crate) fn successful_test(kind: ProviderTestKind, started: Instant) -> AgentProviderTestResult {
    AgentProviderTestResult {
        ok: true,
        kind,
        latency_ms: Some(started.elapsed().as_millis() as u64),
        message: match kind {
            ProviderTestKind::Connection => "模型服务连接成功".into(),
            ProviderTestKind::StructuredOutput => "模型结构化输出测试成功".into(),
        },
    }
}

pub(crate) fn probe_request() -> ProviderTurnRequest {
    ProviderTurnRequest {
        messages: vec![AgentMessage {
            id: "provider-test".into(),
            conversation_id: "provider-test".into(),
            run_id: None,
            role: AgentMessageRole::User,
            content: "仅返回 JSON：{\"ok\":true}".into(),
            attachment_ids: vec![],
            status: crate::agent::model::AgentMessageStatus::Complete,
            created_at: String::new(),
        }],
        attachment_ids: vec![],
        attachments: vec![],
        tools: vec![],
        output_schema: json!({
            "type": "object",
            "properties": { "ok": { "type": "boolean" } },
            "required": ["ok"],
            "additionalProperties": false
        }),
    }
}

fn attachment_text_blocks(attachments: &[&ProviderAttachment], block_type: &str) -> Vec<Value> {
    attachments
        .iter()
        .filter_map(|attachment| attachment.extracted_text.as_deref())
        .filter(|text| !text.trim().is_empty())
        .map(|text| {
            json!({
                "type": block_type,
                "text": format!("所选附件提取内容：\n{text}")
            })
        })
        .collect()
}

fn data_url(media_type: &str, data: &str) -> String {
    format!("data:{media_type};base64,{data}")
}

pub(crate) fn no_op_sink() -> AgentEventSink {
    std::sync::Arc::new(|_| {})
}

pub(crate) fn result(
    final_text: String,
    output_schema: &Value,
    events: Vec<ProviderEvent>,
) -> Result<ProviderTurnResult, AgentError> {
    let structured_output = structured_output(&final_text, output_schema)?;
    Ok(ProviderTurnResult {
        final_text,
        structured_output,
        events,
    })
}

fn build_headers(values: Vec<(&'static str, String)>) -> Result<HeaderMap, AgentError> {
    let mut headers = HeaderMap::new();
    for (name, value) in values {
        let name = HeaderName::from_static(name);
        let value = HeaderValue::from_str(&value)
            .map_err(|_| AgentError::provider_failure("模型服务认证信息格式无效"))?;
        headers.insert(name, value);
    }
    Ok(headers)
}

async fn parse_response(response: Response) -> Result<Value, AgentError> {
    let status = response.status();
    if !status.is_success() {
        return Err(status_error(status));
    }
    response
        .json()
        .await
        .map_err(|_| AgentError::invalid_model_output("模型服务返回了无法读取的数据"))
}

fn map_request_error(error: reqwest::Error) -> AgentError {
    if error.is_timeout() {
        AgentError::provider_failure("连接模型服务超时，请检查网络或延长超时时间")
    } else if error.is_connect() {
        AgentError::provider_failure("无法连接模型服务，请检查 Endpoint 和网络")
    } else {
        AgentError::provider_failure("模型服务请求失败，请稍后重试")
    }
}

fn status_error(status: StatusCode) -> AgentError {
    match status.as_u16() {
        401 | 403 => AgentError::provider_failure("API 密钥无效或没有访问该模型的权限"),
        408 => AgentError::provider_failure("模型服务请求超时，请稍后重试"),
        429 => AgentError::provider_failure("模型服务请求过于频繁，请稍后重试"),
        500..=599 => AgentError::provider_failure("模型服务暂时不可用，请稍后重试"),
        _ => {
            AgentError::provider_failure(format!("模型服务拒绝了请求（HTTP {}）", status.as_u16()))
        }
    }
}
