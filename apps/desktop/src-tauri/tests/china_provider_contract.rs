use std::sync::Arc;

use food_rd_desktop::agent::{
    model::{
        AgentMessage, AgentMessageRole, AgentMessageStatus, AgentProviderCapabilities,
        AgentProviderConfig, AgentProviderKind, AgentProviderProtocol, ReasoningEffort,
    },
    providers::{
        AgentEventSink, AgentProvider, AgentToolDefinition, ProviderEvent, ProviderTurnRequest,
        openai::OpenAiProvider, openai_compatible::OpenAiCompatibleProvider,
    },
};
use serde_json::{Value, json};
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};

fn config(
    kind: AgentProviderKind,
    protocol: AgentProviderProtocol,
    endpoint: String,
    model: &str,
) -> AgentProviderConfig {
    AgentProviderConfig {
        id: format!("{kind:?}"),
        kind,
        display_name: format!("{kind:?}"),
        protocol,
        endpoint,
        model: model.into(),
        context_window: 128_000,
        reasoning_effort: ReasoningEffort::Auto,
        timeout_seconds: 5,
        executable_path: None,
        enabled: true,
        has_secret: true,
        capabilities: AgentProviderCapabilities::all(),
        updated_at: "2026-07-30T00:00:00Z".into(),
    }
}

fn request() -> ProviderTurnRequest {
    ProviderTurnRequest {
        messages: vec![AgentMessage {
            id: "message-1".into(),
            conversation_id: "conversation-1".into(),
            run_id: None,
            role: AgentMessageRole::User,
            content: "请识别所选原料资料".into(),
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
            created_at: "2026-07-30T00:00:00Z".into(),
        }],
        attachment_ids: vec![],
        attachments: vec![],
        tools: vec![AgentToolDefinition {
            name: "create_ingredient_import_draft".into(),
            description: "创建一个待人工复核的原料草稿".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "materialName": { "type": "string" }
                },
                "required": ["materialName"],
                "additionalProperties": false
            }),
        }],
        output_schema: json!({
            "type": "object",
            "properties": {
                "items": { "type": "array" }
            },
            "required": ["items"],
            "additionalProperties": false
        }),
    }
}

fn request_with_image() -> ProviderTurnRequest {
    let mut request = request();
    request.attachment_ids = vec!["label-image".into()];
    request.attachments = vec![food_rd_desktop::agent::providers::ProviderAttachment {
        id: "label-image".into(),
        media_type: "image/png".into(),
        data_base64: Some("TEFCRUw=".into()),
        extracted_text: None,
    }];
    request
}

fn sink() -> AgentEventSink {
    Arc::new(|_| {})
}

fn chat_response() -> Value {
    json!({
        "choices": [{
            "message": {
                "content": "{\"items\":[]}",
                "tool_calls": [{
                    "id": "call-cn-provider",
                    "type": "function",
                    "function": {
                        "name": "create_ingredient_import_draft",
                        "arguments": "{\"materialName\":\"脱脂乳粉\"}"
                    }
                }]
            }
        }],
        "usage": { "prompt_tokens": 10, "completion_tokens": 5 }
    })
}

fn responses_response() -> Value {
    json!({
        "output": [
            {
                "type": "message",
                "content": [{ "type": "output_text", "text": "{\"items\":[]}" }]
            },
            {
                "type": "function_call",
                "call_id": "call-ark",
                "name": "create_ingredient_import_draft",
                "arguments": "{\"materialName\":\"脱脂乳粉\"}"
            }
        ],
        "usage": { "input_tokens": 10, "output_tokens": 5 }
    })
}

fn assert_normalized(result: &food_rd_desktop::agent::providers::ProviderTurnResult) {
    assert_eq!(result.structured_output, Some(json!({ "items": [] })));
    assert!(result.events.iter().any(|event| {
        matches!(
            event,
            ProviderEvent::ToolCall(call)
                if call.name == "create_ingredient_import_draft"
                    && call.arguments["materialName"] == "脱脂乳粉"
        )
    }));
}

async fn received_body(server: &MockServer) -> Value {
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    serde_json::from_slice(&requests[0].body).unwrap()
}

fn assert_schema_prompt(body: &Value, field: &str) {
    let serialized = serde_json::to_string(&body[field]).unwrap();
    assert!(serialized.contains("JSON Schema"));
    assert!(serialized.contains("items"));
}

#[tokio::test]
async fn deepseek_uses_json_object_without_beta_strict_tools() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chat_response()))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::DeepSeek,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
            "deepseek-v4-pro",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert_eq!(body["response_format"], json!({ "type": "json_object" }));
    assert!(body["tools"][0]["function"].get("strict").is_none());
    assert_schema_prompt(&body, "messages");
}

#[tokio::test]
async fn kimi_keeps_native_json_schema_and_strict_tool_contract() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chat_response()))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::KimiCn,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
            "kimi-k3",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert_eq!(body["response_format"]["type"], "json_schema");
    assert_eq!(body["response_format"]["json_schema"]["strict"], true);
    assert_eq!(body["tools"][0]["function"]["strict"], true);
    assert_schema_prompt(&body, "messages");
}

#[tokio::test]
async fn zhipu_uses_documented_openai_tool_shape_and_prompt_schema() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chat_response()))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::ZhipuGlm,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
            "glm-5.2",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert!(body.get("response_format").is_none());
    assert!(body["tools"][0]["function"].get("strict").is_none());
    assert_schema_prompt(&body, "messages");
}

#[tokio::test]
async fn zhipu_text_model_rejects_images_before_any_network_request() {
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::ZhipuGlm,
            AgentProviderProtocol::OpenAiCompatible,
            "http://127.0.0.1:9".into(),
            "glm-5.2",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let error = provider
        .run(request_with_image(), sink())
        .await
        .unwrap_err();

    assert_eq!(error.code(), "provider_not_configured");
    assert!(error.message().contains("不支持图片"));
}

#[tokio::test]
async fn minimax_separates_reasoning_and_uses_prompt_schema() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chat_response()))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::MinimaxCn,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
            "MiniMax-M3",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert_eq!(body["reasoning_split"], true);
    assert!(body.get("response_format").is_none());
    assert!(body["tools"][0]["function"].get("strict").is_none());
    assert_schema_prompt(&body, "messages");
}

#[tokio::test]
async fn bailian_uses_json_object_and_explicit_json_instruction() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chat_response()))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::Bailian,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
            "qwen3.7-max",
        ),
        Some("sk-cn-test".into()),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert_eq!(body["response_format"], json!({ "type": "json_object" }));
    assert!(body["tools"][0]["function"].get("strict").is_none());
    assert_schema_prompt(&body, "messages");
}

#[tokio::test]
async fn volcengine_ark_uses_responses_without_openai_only_strict_fields() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/responses"))
        .and(header("authorization", "Bearer sk-cn-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(responses_response()))
        .mount(&server)
        .await;
    let provider = OpenAiProvider::new(
        config(
            AgentProviderKind::VolcengineArk,
            AgentProviderProtocol::OpenAiResponses,
            server.uri(),
            "doubao-seed-2-0-lite-260215",
        ),
        "sk-cn-test".into(),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();
    let body = received_body(&server).await;

    assert_normalized(&result);
    assert!(body["tools"][0].get("strict").is_none());
    assert!(body.get("text").is_none());
    assert_schema_prompt(&body, "input");
}
