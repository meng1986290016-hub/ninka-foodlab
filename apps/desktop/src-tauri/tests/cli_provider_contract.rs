use std::{collections::BTreeSet, fs, path::PathBuf, sync::Arc, time::Duration};

use food_rd_desktop::agent::{
    mcp::McpTaskLaunchConfig,
    model::{
        AgentMessage, AgentMessageRole, AgentMessageStatus, AgentProviderCapabilities,
        AgentProviderConfig, AgentProviderKind, AgentProviderProtocol, ReasoningEffort,
    },
    providers::{
        AgentEventSink, AgentModelOption, AgentProvider, AgentToolDefinition, ProviderAttachment,
        ProviderEvent, ProviderTestKind, ProviderTurnRequest, ProviderTurnResult,
        claude_cli::ClaudeCliProvider, cli::detect_cli, codex_cli::CodexCliProvider,
    },
    tools::AgentToolContext,
};
use serde_json::json;
use uuid::Uuid;

fn fixture(name: &str) -> PathBuf {
    match name {
        "fake-codex" => PathBuf::from(env!("CARGO_BIN_EXE_fake_codex_fixture")),
        "fake-claude" => PathBuf::from(env!("CARGO_BIN_EXE_fake_claude_fixture")),
        _ => panic!("unknown CLI fixture: {name}"),
    }
}

fn config(
    kind: AgentProviderKind,
    protocol: AgentProviderProtocol,
    executable_path: PathBuf,
) -> AgentProviderConfig {
    AgentProviderConfig {
        id: format!("{kind:?}"),
        kind,
        display_name: format!("{kind:?}"),
        protocol,
        endpoint: String::new(),
        model: String::new(),
        context_window: 128_000,
        reasoning_effort: ReasoningEffort::High,
        timeout_seconds: 2,
        executable_path: Some(executable_path.to_string_lossy().into_owned()),
        enabled: true,
        has_secret: false,
        capabilities: AgentProviderCapabilities::all(),
        updated_at: "2026-07-30T00:00:00Z".into(),
    }
}

fn request(content: &str) -> ProviderTurnRequest {
    ProviderTurnRequest {
        messages: vec![AgentMessage {
            id: "message-1".into(),
            conversation_id: "conversation-1".into(),
            run_id: None,
            role: AgentMessageRole::User,
            content: content.into(),
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
            created_at: "2026-07-30T00:00:00Z".into(),
        }],
        attachment_ids: vec![],
        attachments: vec![],
        tools: vec![AgentToolDefinition {
            name: "create_ingredient_import_draft".into(),
            description: "创建待人工复核的原料草稿".into(),
            input_schema: json!({
                "type": "object",
                "properties": { "materialName": { "type": "string" } },
                "required": ["materialName"],
                "additionalProperties": false
            }),
        }],
        tool_rounds: vec![],
        output_schema: json!({
            "type": "object",
            "properties": { "items": { "type": "array" } },
            "required": ["items"],
            "additionalProperties": false
        }),
    }
}

fn request_with_selected_attachment() -> ProviderTurnRequest {
    let mut request = request("请识别所选原料资料");
    request.attachment_ids = vec!["selected".into()];
    request.attachments = vec![
        ProviderAttachment {
            id: "selected".into(),
            media_type: "text/plain".into(),
            data_base64: None,
            extracted_text: Some("蛋白质 34.0 g".into()),
        },
        ProviderAttachment {
            id: "unselected".into(),
            media_type: "text/plain".into(),
            data_base64: None,
            extracted_text: Some("UNSELECTED_SECRET".into()),
        },
    ];
    request
}

fn request_with_image_attachment(content: &str) -> ProviderTurnRequest {
    let mut request = request(content);
    request.attachment_ids = vec!["selected-image".into()];
    request.attachments = vec![ProviderAttachment {
        id: "selected-image".into(),
        media_type: "image/png".into(),
        data_base64: Some("AQ==".into()),
        extracted_text: None,
    }];
    request
}

fn sink() -> AgentEventSink {
    Arc::new(|_| {})
}

fn assert_normalized(result: &ProviderTurnResult) {
    assert_eq!(result.structured_output, None);
    assert!(result.final_text.is_empty());
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
}

#[tokio::test]
async fn both_cli_adapters_emit_the_same_normalized_result() {
    let codex = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();
    let claude = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap();

    assert_normalized(&codex.run(request("请识别原料"), sink()).await.unwrap());
    assert_normalized(&claude.run(request("请识别原料"), sink()).await.unwrap());
}

#[tokio::test]
async fn codex_cli_rejects_failed_mcp_calls_instead_of_reporting_completion() {
    let provider = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();

    let error = provider
        .run(request("__FAILED_MCP__"), sink())
        .await
        .unwrap_err();

    assert_eq!(error.code(), "provider_failure");
    assert!(error.message().contains("read_task_attachments"));
    assert!(error.message().contains("user cancelled MCP tool call"));
}

#[tokio::test]
async fn claude_cli_rejects_failed_mcp_results_instead_of_reporting_completion() {
    let provider = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap();

    let error = provider
        .run(request("__FAILED_MCP__"), sink())
        .await
        .unwrap_err();

    assert_eq!(error.code(), "provider_failure");
    assert!(error.message().contains("read_task_attachments"));
    assert!(error.message().contains("permission denied"));
}

#[tokio::test]
async fn cli_task_only_receives_selected_attachment_content() {
    let provider = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap();

    let result = provider
        .run(request_with_selected_attachment(), sink())
        .await
        .unwrap();

    assert_normalized(&result);
}

#[tokio::test]
async fn codex_image_prompt_is_separated_from_variadic_image_arguments() {
    let provider = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();

    let result = provider
        .run(
            request_with_image_attachment("__EXPECT_IMAGE_PROMPT_BOUNDARY__"),
            sink(),
        )
        .await
        .unwrap();

    assert_normalized(&result);
}

#[tokio::test]
async fn codex_cli_lists_visible_models_from_cli_catalog() {
    let provider = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();

    assert_eq!(
        provider.list_models().await.unwrap(),
        vec![AgentModelOption {
            id: "gpt-5.6-sol".into(),
            label: "GPT-5.6-Sol".into(),
        }]
    );
}

#[tokio::test]
async fn manual_path_detection_reports_version_and_login_without_model_request() {
    let codex = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();
    let detected = codex.detect().await.unwrap();

    assert!(detected.installed);
    assert!(detected.authenticated);
    assert_eq!(detected.version.as_deref(), Some("codex-cli 9.9.9"));
    assert_eq!(
        fs::canonicalize(&detected.path).unwrap(),
        fs::canonicalize(fixture("fake-codex")).unwrap()
    );
    assert!(codex.test(ProviderTestKind::Connection).await.unwrap().ok);
}

#[tokio::test]
async fn claude_manual_path_detection_reports_version_and_login() {
    let claude = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap();
    let detected = claude.detect().await.unwrap();

    assert!(detected.installed);
    assert!(detected.authenticated);
    assert_eq!(detected.version.as_deref(), Some("2.1.0 (Claude Code)"));
    assert_eq!(
        fs::canonicalize(&detected.path).unwrap(),
        fs::canonicalize(fixture("fake-claude")).unwrap()
    );
}

#[tokio::test]
async fn missing_manual_executable_is_reported_without_starting_a_shell() {
    let detected = detect_cli(
        AgentProviderKind::ClaudeCodeCli,
        Some("/definitely/not/a/real/claude"),
    )
    .await
    .unwrap();

    assert!(!detected.installed);
    assert!(!detected.authenticated);
    assert!(detected.path.is_empty());
}

#[tokio::test]
async fn structured_output_test_uses_the_same_cli_adapter() {
    let provider = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap();

    let result = provider
        .test(ProviderTestKind::StructuredOutput)
        .await
        .unwrap();

    assert!(result.ok);
    assert_eq!(result.kind, ProviderTestKind::StructuredOutput);
}

#[tokio::test]
async fn cancellation_terminates_a_running_cli_process() {
    let mut hanging_config = config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    );
    hanging_config.timeout_seconds = 30;
    let provider = Arc::new(CodexCliProvider::new(hanging_config).unwrap());
    let running_provider = Arc::clone(&provider);
    let run = tokio::spawn(async move { running_provider.run(request("__HANG__"), sink()).await });
    tokio::time::sleep(Duration::from_millis(100)).await;

    provider.cancel();

    let error = run.await.unwrap().unwrap_err();
    assert_eq!(error.code(), "cancelled");
}

#[tokio::test]
async fn configured_timeout_terminates_a_running_cli_process() {
    let mut hanging_config = config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    );
    hanging_config.timeout_seconds = 1;
    let provider = ClaudeCliProvider::new(hanging_config).unwrap();

    let error = provider.run(request("__HANG__"), sink()).await.unwrap_err();

    assert_eq!(error.code(), "provider_timeout");
}

#[cfg(unix)]
#[tokio::test]
async fn user_prompt_is_passed_as_one_argument_without_shell_expansion() {
    let marker = std::env::temp_dir().join(format!("food-rd-cli-marker-{}", Uuid::new_v4()));
    let prompt = format!("$(touch {})", marker.to_string_lossy());
    let provider = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap();

    provider.run(request(&prompt), sink()).await.unwrap();

    assert!(!marker.exists());
}

#[tokio::test]
async fn both_cli_adapters_receive_the_same_task_scoped_mcp_context() {
    let root = std::env::temp_dir().join(format!("food-rd-cli-mcp-{}", Uuid::new_v4()));
    fs::create_dir_all(root.join("attachments")).unwrap();
    fs::write(root.join("food-rd.sqlite3"), b"fixture").unwrap();
    let launch = McpTaskLaunchConfig::new(
        fixture("fake-codex"),
        root.join("food-rd.sqlite3"),
        root.join("attachments"),
        AgentToolContext {
            run_id: "run-cli-mcp".into(),
            import_job_id: "job-cli-mcp".into(),
            allowed_attachment_ids: BTreeSet::new(),
            provider_kind: AgentProviderKind::CodexCli,
            model: "test-model".into(),
            active_recipe_id: None,
            active_recipe_name: None,
            active_draft_fingerprint: None,
        },
        Duration::from_secs(60),
    );
    let codex = CodexCliProvider::new(config(
        AgentProviderKind::CodexCli,
        AgentProviderProtocol::CodexCli,
        fixture("fake-codex"),
    ))
    .unwrap()
    .with_mcp(launch.clone());
    let mut claude_launch = launch;
    claude_launch.context.provider_kind = AgentProviderKind::ClaudeCodeCli;
    let claude = ClaudeCliProvider::new(config(
        AgentProviderKind::ClaudeCodeCli,
        AgentProviderProtocol::ClaudeCodeCli,
        fixture("fake-claude"),
    ))
    .unwrap()
    .with_mcp(claude_launch);

    assert_normalized(&codex.run(request("__EXPECT_MCP__"), sink()).await.unwrap());
    assert_normalized(&claude.run(request("__EXPECT_MCP__"), sink()).await.unwrap());
    fs::remove_dir_all(root).unwrap();
}
