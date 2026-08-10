use std::time::{Duration, Instant};

use reqwest::{
    Client, Response, StatusCode,
    header::{HeaderMap, HeaderName, HeaderValue},
};
use serde_json::{Value, json};

use super::{
    AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult, AgentToolDefinition,
    ProviderAttachment, ProviderEvent, ProviderTestKind, ProviderToolResult, ProviderToolRound,
    ProviderTurnRequest, ProviderTurnResult,
};
use crate::agent::{
    AgentError,
    model::{AgentMessage, AgentMessageRole, AgentProviderConfig, AgentProviderKind},
};

pub(crate) const FOOD_RD_AGENT_INSTRUCTION: &str = "\
你是食品研发 Agent，可以处理普通研发问答、原料资料导入、目标驱动配方设计和产品标签逆向。所有原料识别结果只能创建待人工复核草稿，不能正式保存。\
按规范化后的原料名称、供应商、型号或规格分组：三个非空身份字段一致的多个文件合并为一张草稿；\
供应商或型号规格不同必须分别创建草稿；一个文件包含多个身份组时也必须拆为多张草稿。\
每个草稿应关联全部对应附件，并用 sourceLinks 标记每个字段的原始来源；同时按原文清晰度和推断程度将 confidence 标为 high、medium 或 low，不能判断时使用 null。\
同一字段在来源间冲突时将该字段留空、保留全部来源链接并等待人工确认。\
设计配方时先检索具体供应商原料版本，说明选择理由，并用 evaluate_recipe_proposal 确定性试算后再创建待复核提案；不得用模型心算冒充系统计算。\
逆向标签时一次只处理一款产品，保留用量范围、可信度、配料顺序依据、关键假设和无法判断项，并明确这不是原厂精确配方。\
缺少必要原料时使用 material_need 提出需求，不得编造不存在的供应商原料。得率未知时可暂按100%试算，但必须醒目标注。\
配方提案只能等待用户人工复核后创建研发中工作草稿；你无权接受提案、保存正式版本、归档或删除。";

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
        .filter(|message| !message.content.trim().is_empty())
        .filter_map(|message| {
            let role = match message.role {
                AgentMessageRole::User => "user",
                AgentMessageRole::Assistant => model_role,
                AgentMessageRole::Tool => return None,
            };
            Some(json!({ "role": role, "content": message.content }))
        })
        .collect()
}

pub(crate) fn openai_response_messages(request: &ProviderTurnRequest) -> Vec<Value> {
    let mut messages = vec![json!({
        "role": "system",
        "content": FOOD_RD_AGENT_INSTRUCTION
    })];
    messages.extend(message_values(&request.messages, "assistant"));
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
    for round in &request.tool_rounds {
        for call in &round.calls {
            messages.push(json!({
                "type": "function_call",
                "call_id": call.id,
                "name": call.name,
                "arguments": call.arguments.to_string()
            }));
        }
        for result in &round.results {
            messages.push(json!({
                "type": "function_call_output",
                "call_id": result.call_id,
                "output": result.output.to_string()
            }));
        }
    }
    messages
}

pub(crate) fn chat_completion_messages(request: &ProviderTurnRequest) -> Vec<Value> {
    let mut messages = vec![json!({
        "role": "system",
        "content": FOOD_RD_AGENT_INSTRUCTION
    })];
    messages.extend(message_values(&request.messages, "assistant"));
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
    for round in &request.tool_rounds {
        messages.push(json!({
            "role": "assistant",
            "content": Value::Null,
            "tool_calls": round.calls.iter().map(|call| json!({
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": call.arguments.to_string()
                }
            })).collect::<Vec<_>>()
        }));
        for result in &round.results {
            messages.push(json!({
                "role": "tool",
                "tool_call_id": result.call_id,
                "content": result.output.to_string()
            }));
        }
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
    for round in &request.tool_rounds {
        messages.push(json!({
            "role": "assistant",
            "content": round.calls.iter().map(|call| json!({
                "type": "tool_use",
                "id": call.id,
                "name": call.name,
                "input": call.arguments
            })).collect::<Vec<_>>()
        }));
        messages.push(json!({
            "role": "user",
            "content": round.results.iter().map(|result| json!({
                "type": "tool_result",
                "tool_use_id": result.call_id,
                "content": result.output.to_string(),
                "is_error": result.is_error
            })).collect::<Vec<_>>()
        }));
    }
    messages
}

pub(crate) fn ensure_attachment_support(
    request: &ProviderTurnRequest,
    config: &AgentProviderConfig,
) -> Result<(), AgentError> {
    let includes_images = selected_attachments(request)
        .iter()
        .any(|attachment| attachment.data_base64.is_some());
    if includes_images && !supports_image_input(config) {
        return Err(AgentError::provider_not_configured(
            "当前模型不支持图片，请选择图片识别模型",
        ));
    }
    Ok(())
}

pub(crate) fn supports_image_input(config: &AgentProviderConfig) -> bool {
    if !config.capabilities.images {
        return false;
    }
    let model = config.model.to_ascii_lowercase();
    match config.kind {
        AgentProviderKind::ZhipuGlm => {
            model.starts_with("glm-")
                && model
                    .split('-')
                    .skip(1)
                    .any(|segment| segment.ends_with('v') || segment == "vision")
        }
        AgentProviderKind::MinimaxCn => model.starts_with("minimax-m3"),
        AgentProviderKind::Bailian => {
            model.contains("-vl") || model.contains("omni") || model.contains("ocr")
        }
        _ => true,
    }
}

pub(crate) fn selected_attachments(request: &ProviderTurnRequest) -> Vec<&ProviderAttachment> {
    request
        .attachments
        .iter()
        .filter(|attachment| request.attachment_ids.contains(&attachment.id))
        .collect()
}

pub(crate) fn add_structured_output_instruction(messages: &mut Vec<Value>, output_schema: &Value) {
    if schema_is_empty(output_schema) {
        return;
    }
    messages.insert(
        0,
        json!({
            "role": "system",
            "content": format!(
                "请只返回符合以下 JSON Schema 的 JSON 对象，不要输出 Markdown 或额外说明：{}",
                output_schema
            )
        }),
    );
}

pub(crate) fn openai_tools(tools: &[AgentToolDefinition], strict: bool) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            let mut definition = json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema
            });
            if strict {
                definition["strict"] = Value::Bool(true);
            }
            definition
        })
        .collect()
}

pub(crate) fn chat_completion_tools(tools: &[AgentToolDefinition], strict: bool) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            let mut definition = json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema
                }
            });
            if strict {
                definition["function"]["strict"] = Value::Bool(true);
            }
            definition
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
        AgentProviderKind::DeepSeek => &["deepseek-v4-pro", "deepseek-v4-flash"],
        AgentProviderKind::KimiCn => &["kimi-k3", "kimi-k2.6"],
        AgentProviderKind::ZhipuGlm => &["glm-5.2", "glm-5v-turbo"],
        AgentProviderKind::MinimaxCn => &["MiniMax-M3", "MiniMax-M2.7"],
        AgentProviderKind::Bailian => &["qwen3.7-max", "qwen3-vl-plus"],
        AgentProviderKind::VolcengineArk => &["doubao-seed-2-0-lite-260215"],
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
            ProviderTestKind::AgentLoop => "模型工具调用与结果回传测试成功".into(),
        },
    }
}

pub(crate) fn connection_probe_request() -> ProviderTurnRequest {
    ProviderTurnRequest {
        messages: vec![AgentMessage {
            id: "provider-connection-test".into(),
            conversation_id: "provider-test".into(),
            run_id: None,
            role: AgentMessageRole::User,
            content: "你好，请简短回复：连接成功".into(),
            attachment_ids: vec![],
            status: crate::agent::model::AgentMessageStatus::Complete,
            created_at: String::new(),
        }],
        attachment_ids: vec![],
        attachments: vec![],
        tools: vec![],
        tool_rounds: vec![],
        output_schema: json!({}),
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
        tool_rounds: vec![],
        output_schema: json!({
            "type": "object",
            "properties": { "ok": { "type": "boolean" } },
            "required": ["ok"],
            "additionalProperties": false
        }),
    }
}

pub(crate) async fn run_agent_loop_probe<P: AgentProvider + ?Sized>(
    provider: &P,
) -> Result<(), AgentError> {
    let tool = AgentToolDefinition {
        name: "food_rd_test_echo".into(),
        description: "仅用于模型配置诊断，返回由应用提供的安全测试结果".into(),
        input_schema: json!({
            "type": "object",
            "properties": { "value": { "type": "string", "const": "ping" } },
            "required": ["value"],
            "additionalProperties": false
        }),
    };
    let mut request = connection_probe_request();
    request.messages[0].content =
        "这是工具链路诊断。必须调用 food_rd_test_echo，参数为 {\"value\":\"ping\"}；不要直接回答。"
            .into();
    request.tools = vec![tool];
    let first = provider.run(request.clone(), no_op_sink()).await?;
    let call = first
        .events
        .iter()
        .find_map(|event| match event {
            ProviderEvent::ToolCall(call) if call.name == "food_rd_test_echo" => Some(call.clone()),
            _ => None,
        })
        .ok_or_else(|| AgentError::invalid_model_output("模型没有按要求发起测试工具调用"))?;
    if call.arguments.get("value").and_then(Value::as_str) != Some("ping") {
        return Err(AgentError::invalid_model_output(
            "模型发起了测试工具调用，但参数不符合约定",
        ));
    }

    request.tool_rounds = vec![ProviderToolRound {
        calls: vec![call.clone()],
        results: vec![ProviderToolResult {
            call_id: call.id,
            name: call.name,
            output: json!({ "ok": true, "value": "pong" }),
            is_error: false,
        }],
    }];
    request.messages[0].content =
        "完成 food_rd_test_echo 后，根据应用返回的工具结果简短回复：工具循环成功。不要再次调用工具。"
            .into();
    let second = provider.run(request, no_op_sink()).await?;
    if second.final_text.trim().is_empty()
        || second
            .events
            .iter()
            .any(|event| matches!(event, ProviderEvent::ToolCall(_)))
    {
        return Err(AgentError::invalid_model_output(
            "模型收到测试工具结果后没有结束工具循环",
        ));
    }
    Ok(())
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
    let bytes = response
        .bytes()
        .await
        .map_err(|_| AgentError::invalid_model_output("模型服务返回了无法读取的数据"))?;
    if !status.is_success() {
        return Err(status_error(status, safe_error_detail(&bytes)));
    }
    serde_json::from_slice(&bytes)
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

fn safe_error_detail(bytes: &[u8]) -> Option<String> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    ["/error/message", "/error/code", "/error/param", "/message"]
        .into_iter()
        .find_map(|pointer| value.pointer(pointer).and_then(error_value_text))
        .and_then(sanitize_error_detail)
}

fn error_value_text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn sanitize_error_detail(detail: String) -> Option<String> {
    let detail = detail.split_whitespace().collect::<Vec<_>>().join(" ");
    if detail.is_empty() {
        return None;
    }
    let lower = detail.to_ascii_lowercase();
    if ["bearer ", "authorization", "api key", "api_key", "sk-"]
        .iter()
        .any(|secret_marker| lower.contains(secret_marker))
    {
        return None;
    }
    Some(detail.chars().take(240).collect())
}

fn status_error(status: StatusCode, detail: Option<String>) -> AgentError {
    match status.as_u16() {
        401 | 403 => AgentError::provider_failure("API 密钥无效或没有访问该模型的权限"),
        408 => AgentError::provider_failure("模型服务请求超时，请稍后重试"),
        429 => AgentError::provider_failure("模型服务请求过于频繁，请稍后重试"),
        500..=599 => AgentError::provider_failure("模型服务暂时不可用，请稍后重试"),
        _ => AgentError::provider_failure(match detail {
            Some(detail) => format!("模型服务拒绝了请求（HTTP {}）：{detail}", status.as_u16()),
            None => format!("模型服务拒绝了请求（HTTP {}）", status.as_u16()),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_bounded_safe_provider_error_details() {
        let detail = safe_error_detail(
            br#"{"error":{"message":"tools[0].function.parameters is invalid"}}"#,
        );
        assert_eq!(
            detail.as_deref(),
            Some("tools[0].function.parameters is invalid")
        );
    }

    #[test]
    fn rejects_provider_error_details_that_may_contain_secrets() {
        let detail = safe_error_detail(br#"{"error":{"message":"Bearer sk-sensitive"}}"#);
        assert_eq!(detail, None);
    }

    #[test]
    fn auth_errors_never_include_upstream_details() {
        let error = status_error(StatusCode::UNAUTHORIZED, Some("secret detail".into()));
        assert_eq!(error.message(), "API 密钥无效或没有访问该模型的权限");
    }
}
