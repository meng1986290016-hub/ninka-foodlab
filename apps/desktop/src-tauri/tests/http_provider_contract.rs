use std::sync::Arc;

use food_rd_desktop::agent::{
    model::{
        AgentMessage, AgentMessageRole, AgentMessageStatus, AgentProviderCapabilities,
        AgentProviderConfig, AgentProviderKind, AgentProviderProtocol, ReasoningEffort,
    },
    providers::{
        AgentEventSink, AgentProvider, AgentToolDefinition, ProviderAttachment, ProviderEvent,
        ProviderToolCall, ProviderToolResult, ProviderToolRound, ProviderTurnRequest,
        anthropic::AnthropicProvider, gemini::GeminiProvider, openai::OpenAiProvider,
        openai_compatible::OpenAiCompatibleProvider,
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
) -> AgentProviderConfig {
    AgentProviderConfig {
        id: format!("{kind:?}"),
        kind,
        display_name: format!("{kind:?}"),
        protocol,
        endpoint,
        model: "test-model".into(),
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
            attachment_ids: vec!["selected-attachment".into()],
            status: AgentMessageStatus::Complete,
            created_at: "2026-07-30T00:00:00Z".into(),
        }],
        attachment_ids: vec!["selected-attachment".into()],
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
        tool_rounds: vec![],
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

fn request_with_selected_image() -> ProviderTurnRequest {
    let mut request = request();
    request.attachments = vec![
        ProviderAttachment {
            id: "selected-attachment".into(),
            media_type: "image/png".into(),
            data_base64: Some("U0VMRUNURUQ=".into()),
            extracted_text: Some("蛋白质 34.0 g".into()),
        },
        ProviderAttachment {
            id: "unselected-attachment".into(),
            media_type: "image/png".into(),
            data_base64: Some("VU5TRUxFQ1RFRA==".into()),
            extracted_text: Some("不应发送的附件内容".into()),
        },
    ];
    request
}

fn request_with_tool_round() -> ProviderTurnRequest {
    let mut request = request();
    request.tool_rounds = vec![ProviderToolRound {
        calls: vec![ProviderToolCall {
            id: "call-prior".into(),
            name: "create_ingredient_import_draft".into(),
            arguments: json!({ "materialName": "脱脂乳粉" }),
        }],
        results: vec![ProviderToolResult {
            call_id: "call-prior".into(),
            name: "create_ingredient_import_draft".into(),
            output: json!({ "ok": true, "result": { "draftId": "draft-test" } }),
            is_error: false,
        }],
    }];
    request
}

fn sink() -> AgentEventSink {
    Arc::new(|_| {})
}

fn assert_normalized(result: &food_rd_desktop::agent::providers::ProviderTurnResult) {
    assert!(result.events.iter().any(
        |event| matches!(event, ProviderEvent::TextDelta(text) if text.contains("\"items\""))
    ));
    assert!(result.events.iter().any(|event| {
        matches!(
            event,
            ProviderEvent::ToolCall(call)
                if call.name == "create_ingredient_import_draft"
                    && call.arguments["materialName"] == "脱脂乳粉"
        )
    }));
    assert!(result.events.iter().any(|event| {
        matches!(
            event,
            ProviderEvent::Usage {
                input_tokens: 10,
                output_tokens: 5
            }
        )
    }));
    assert_eq!(result.structured_output, Some(json!({ "items": [] })));
}

async fn assert_minimized_request(server: &MockServer) {
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let body = String::from_utf8_lossy(&requests[0].body);
    for forbidden in [
        "sk-test-secret",
        "internalCode",
        "/Users/",
        "other conversation",
    ] {
        assert!(!body.contains(forbidden), "request leaked {forbidden}");
    }
}

#[tokio::test]
async fn openai_responses_emits_normalized_text_tools_and_usage() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/responses"))
        .and(header("authorization", "Bearer sk-test-secret"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "output": [
                {
                    "type": "message",
                    "content": [{ "type": "output_text", "text": "{\"items\":[]}" }]
                },
                {
                    "type": "function_call",
                    "call_id": "call-openai",
                    "name": "create_ingredient_import_draft",
                    "arguments": "{\"materialName\":\"脱脂乳粉\"}"
                }
            ],
            "usage": { "input_tokens": 10, "output_tokens": 5 }
        })))
        .mount(&server)
        .await;
    let provider = OpenAiProvider::new(
        config(
            AgentProviderKind::OpenAi,
            AgentProviderProtocol::OpenAiResponses,
            server.uri(),
        ),
        "sk-test-secret".into(),
    )
    .unwrap();

    let result = provider
        .run(request_with_tool_round(), sink())
        .await
        .unwrap();

    assert_normalized(&result);
    let requests = server.received_requests().await.unwrap();
    let body: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(
        body["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| { item["type"] == "function_call" && item["call_id"] == "call-prior" })
    );
    assert!(
        body["input"].as_array().unwrap().iter().any(|item| {
            item["type"] == "function_call_output" && item["call_id"] == "call-prior"
        })
    );
    assert_minimized_request(&server).await;
}

#[tokio::test]
async fn azure_openai_uses_the_v1_responses_shape_and_api_key_header() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/responses"))
        .and(header("api-key", "sk-test-secret"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": "{\"items\":[]}" }]
            }],
            "usage": { "input_tokens": 10, "output_tokens": 5 }
        })))
        .mount(&server)
        .await;
    let provider = OpenAiProvider::new(
        config(
            AgentProviderKind::AzureOpenAi,
            AgentProviderProtocol::OpenAiResponses,
            server.uri(),
        ),
        "sk-test-secret".into(),
    )
    .unwrap();

    let result = provider.run(request(), sink()).await.unwrap();

    assert_eq!(result.structured_output, Some(json!({ "items": [] })));
    let requests = server.received_requests().await.unwrap();
    assert!(requests[0].headers.get("authorization").is_none());
    assert_minimized_request(&server).await;
}

#[tokio::test]
async fn openai_compatible_chat_completions_normalizes_tool_arguments() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("authorization", "Bearer sk-test-secret"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{
                "message": {
                    "content": "{\"items\":[]}",
                    "tool_calls": [{
                        "id": "call-compatible",
                        "type": "function",
                        "function": {
                            "name": "create_ingredient_import_draft",
                            "arguments": "{\"materialName\":\"脱脂乳粉\"}"
                        }
                    }]
                }
            }],
            "usage": { "prompt_tokens": 10, "completion_tokens": 5 }
        })))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::DeepSeek,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
        ),
        Some("sk-test-secret".into()),
    )
    .unwrap();

    let result = provider
        .run(request_with_tool_round(), sink())
        .await
        .unwrap();

    assert_normalized(&result);
    let requests = server.received_requests().await.unwrap();
    let body: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(body["messages"].as_array().unwrap().iter().any(|message| {
        message["role"] == "assistant" && message["tool_calls"][0]["id"] == "call-prior"
    }));
    assert!(
        body["messages"].as_array().unwrap().iter().any(|message| {
            message["role"] == "tool" && message["tool_call_id"] == "call-prior"
        })
    );
    assert_minimized_request(&server).await;
}

#[tokio::test]
async fn unavailable_model_listing_falls_back_without_rejecting_manual_models() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/models"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::DeepSeek,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
        ),
        Some("sk-test-secret".into()),
    )
    .unwrap();

    let models = provider.list_models().await.unwrap();

    assert!(models.iter().any(|model| model.id == "deepseek-v4-pro"));
}

#[tokio::test]
async fn anthropic_messages_normalizes_content_blocks() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "sk-test-secret"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "content": [
                { "type": "text", "text": "{\"items\":[]}" },
                {
                    "type": "tool_use",
                    "id": "call-anthropic",
                    "name": "create_ingredient_import_draft",
                    "input": { "materialName": "脱脂乳粉" }
                }
            ],
            "usage": { "input_tokens": 10, "output_tokens": 5 }
        })))
        .mount(&server)
        .await;
    let provider = AnthropicProvider::new(
        config(
            AgentProviderKind::Anthropic,
            AgentProviderProtocol::AnthropicMessages,
            server.uri(),
        ),
        "sk-test-secret".into(),
    )
    .unwrap();

    let result = provider
        .run(request_with_tool_round(), sink())
        .await
        .unwrap();

    assert_normalized(&result);
    let requests = server.received_requests().await.unwrap();
    let body: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(body["messages"].as_array().unwrap().iter().any(|message| {
        message["role"] == "assistant" && message["content"][0]["type"] == "tool_use"
    }));
    assert!(body["messages"].as_array().unwrap().iter().any(|message| {
        message["role"] == "user" && message["content"][0]["type"] == "tool_result"
    }));
    assert_minimized_request(&server).await;
}

#[tokio::test]
async fn gemini_generate_content_normalizes_function_calls() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/models/test-model:generateContent"))
        .and(header("x-goog-api-key", "sk-test-secret"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "candidates": [{
                "content": {
                    "parts": [
                        { "text": "{\"items\":[]}" },
                        {
                            "functionCall": {
                                "name": "create_ingredient_import_draft",
                                "args": { "materialName": "脱脂乳粉" }
                            }
                        }
                    ]
                }
            }],
            "usageMetadata": {
                "promptTokenCount": 10,
                "candidatesTokenCount": 5
            }
        })))
        .mount(&server)
        .await;
    let provider = GeminiProvider::new(
        config(
            AgentProviderKind::Gemini,
            AgentProviderProtocol::GeminiGenerateContent,
            server.uri(),
        ),
        "sk-test-secret".into(),
    )
    .unwrap();

    let result = provider
        .run(request_with_tool_round(), sink())
        .await
        .unwrap();

    assert_normalized(&result);
    let requests = server.received_requests().await.unwrap();
    let body: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert!(body["contents"].as_array().unwrap().iter().any(|content| {
        content["role"] == "model" && content["parts"][0].get("functionCall").is_some()
    }));
    assert!(body["contents"].as_array().unwrap().iter().any(|content| {
        content["role"] == "user" && content["parts"][0].get("functionResponse").is_some()
    }));
    assert_minimized_request(&server).await;
}

#[tokio::test]
async fn malformed_structured_output_returns_one_retryable_error() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/responses"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": "{invalid" }]
            }]
        })))
        .mount(&server)
        .await;
    let provider = OpenAiProvider::new(
        config(
            AgentProviderKind::OpenAi,
            AgentProviderProtocol::OpenAiResponses,
            server.uri(),
        ),
        "sk-test-secret".into(),
    )
    .unwrap();

    let error = provider.run(request(), sink()).await.unwrap_err();

    assert_eq!(error.code(), "invalid_model_output");
    assert!(error.retryable_once());
}

#[tokio::test]
async fn authentication_and_rate_limit_errors_are_sanitized() {
    for (status, expected_text) in [(401, "密钥"), (429, "频繁")] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(
                ResponseTemplate::new(status)
                    .set_body_json(json!({ "error": "sk-response-secret" })),
            )
            .mount(&server)
            .await;
        let provider = OpenAiCompatibleProvider::new(
            config(
                AgentProviderKind::DeepSeek,
                AgentProviderProtocol::OpenAiCompatible,
                server.uri(),
            ),
            Some("sk-test-secret".into()),
        )
        .unwrap();

        let error = provider.run(request(), sink()).await.unwrap_err();

        assert_eq!(error.code(), "provider_failure");
        assert!(error.message().contains(expected_text));
        assert!(!error.message().contains("sk-response-secret"));
        assert!(!error.message().contains("sk-test-secret"));
    }
}

#[tokio::test]
async fn safe_upstream_validation_detail_is_preserved_for_bad_requests() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({
            "error": { "message": "tools[0].function.parameters is invalid" }
        })))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::KimiCn,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
        ),
        Some("sk-test-secret".into()),
    )
    .unwrap();

    let error = provider.run(request(), sink()).await.unwrap_err();

    assert_eq!(error.code(), "provider_failure");
    assert!(
        error
            .message()
            .contains("tools[0].function.parameters is invalid")
    );
    assert!(!error.message().contains("sk-test-secret"));
}

#[tokio::test]
async fn provider_timeout_is_mapped_without_exposing_request_data() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_secs(2))
                .set_body_json(json!({
                    "choices": [{ "message": { "content": "{\"items\":[]}" } }]
                })),
        )
        .mount(&server)
        .await;
    let mut provider_config = config(
        AgentProviderKind::DeepSeek,
        AgentProviderProtocol::OpenAiCompatible,
        server.uri(),
    );
    provider_config.timeout_seconds = 1;
    let provider =
        OpenAiCompatibleProvider::new(provider_config, Some("sk-test-secret".into())).unwrap();

    let error = provider.run(request(), sink()).await.unwrap_err();

    assert_eq!(error.code(), "provider_failure");
    assert!(error.message().contains("超时"));
    assert!(!error.message().contains("sk-test-secret"));
}

#[tokio::test]
async fn request_body_uses_only_public_tool_schema_and_selected_message_content() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{ "message": { "content": "{\"items\":[]}" } }]
        })))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::Ollama,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
        ),
        None,
    )
    .unwrap();

    provider.run(request(), sink()).await.unwrap();

    let requests = server.received_requests().await.unwrap();
    let body: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(
        body["tools"][0]["function"]["name"],
        "create_ingredient_import_draft"
    );
    assert_eq!(body["messages"].as_array().unwrap().len(), 3);
    assert_eq!(body["messages"][0]["role"], "system");
    assert!(
        body["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("JSON Schema")
    );
    assert_eq!(body["messages"][1]["role"], "system");
    assert!(
        body["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("供应商或型号规格不同必须分别创建草稿")
    );
    assert_eq!(body["messages"][2]["content"], "请识别所选原料资料");
    assert!(requests[0].headers.get("authorization").is_none());
}

#[tokio::test]
async fn only_selected_images_and_extracted_text_are_sent() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{ "message": { "content": "{\"items\":[]}" } }]
        })))
        .mount(&server)
        .await;
    let provider = OpenAiCompatibleProvider::new(
        config(
            AgentProviderKind::Custom,
            AgentProviderProtocol::OpenAiCompatible,
            server.uri(),
        ),
        Some("sk-test-secret".into()),
    )
    .unwrap();

    provider
        .run(request_with_selected_image(), sink())
        .await
        .unwrap();

    let requests = server.received_requests().await.unwrap();
    let body = String::from_utf8_lossy(&requests[0].body);
    assert!(body.contains("蛋白质 34.0 g"));
    assert!(body.contains("data:image/png;base64,U0VMRUNURUQ="));
    assert!(!body.contains("不应发送的附件内容"));
    assert!(!body.contains("VU5TRUxFQ1RFRA=="));
    assert!(!body.contains("selected-attachment"));
}

#[tokio::test]
async fn image_input_requires_an_image_capable_provider() {
    let mut provider_config = config(
        AgentProviderKind::DeepSeek,
        AgentProviderProtocol::OpenAiCompatible,
        "http://127.0.0.1:9".into(),
    );
    provider_config.capabilities.images = false;
    let provider =
        OpenAiCompatibleProvider::new(provider_config, Some("sk-test-secret".into())).unwrap();

    let error = provider
        .run(request_with_selected_image(), sink())
        .await
        .unwrap_err();

    assert_eq!(error.code(), "provider_not_configured");
    assert!(error.message().contains("不支持图片"));
}
