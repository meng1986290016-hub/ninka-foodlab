use std::{collections::BTreeSet, fs, path::PathBuf, process::Stdio, time::Duration};

use food_rd_desktop::{
    agent::{
        mcp::{McpServer, McpTaskCapability, serve_mcp},
        model::{AgentProviderKind, AgentRunInput, AgentRunStatus, AgentToolCallStatus},
        repository::AgentRepository,
        tools::{AgentToolContext, AgentToolRegistry},
    },
    ingest::coordinator::IngredientIngestCoordinator,
};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

struct Fixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-mcp-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self {
            database_path: root.join("food-rd.sqlite3"),
            attachment_root: root.join("attachments"),
            root,
        }
    }

    fn registry(&self) -> AgentToolRegistry {
        AgentToolRegistry::new(
            IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap(),
        )
    }

    fn context(&self) -> AgentToolContext {
        AgentToolContext {
            run_id: "run-mcp".into(),
            import_job_id: "job-mcp".into(),
            allowed_attachment_ids: BTreeSet::new(),
            provider_kind: AgentProviderKind::ClaudeCodeCli,
            model: "test-model".into(),
            active_recipe_id: None,
            active_recipe_name: None,
            active_draft_fingerprint: None,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn invalid_or_reused_task_token_is_rejected() {
    let fixture = Fixture::new();
    let capability =
        McpTaskCapability::issue(&fixture.root, &fixture.context(), Duration::from_secs(60))
            .unwrap();

    let invalid = McpTaskCapability::consume(&capability.record_path, "wrong-token").unwrap_err();
    assert_eq!(invalid.code(), "unauthorized");
    let consumed = McpTaskCapability::consume(&capability.record_path, &capability.token).unwrap();
    assert_eq!(consumed, fixture.context());
    let reused =
        McpTaskCapability::consume(&capability.record_path, &capability.token).unwrap_err();
    assert_eq!(reused.code(), "unauthorized");
}

#[test]
fn expired_task_token_is_rejected() {
    let fixture = Fixture::new();
    let capability =
        McpTaskCapability::issue(&fixture.root, &fixture.context(), Duration::ZERO).unwrap();

    std::thread::sleep(Duration::from_millis(5));
    let error = McpTaskCapability::consume(&capability.record_path, &capability.token).unwrap_err();

    assert_eq!(error.code(), "unauthorized");
}

#[test]
fn protocol_lists_exactly_registry_tools_and_no_formal_save() {
    let fixture = Fixture::new();
    let registry_names = fixture
        .registry()
        .definitions()
        .into_iter()
        .map(|tool| tool.name)
        .collect::<Vec<_>>();
    let mut server = McpServer::new(fixture.registry(), fixture.context());
    let initialized = server
        .handle_message(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": { "name": "test", "version": "1" }
            }
        }))
        .unwrap();
    assert_eq!(
        initialized["result"]["protocolVersion"],
        json!("2025-11-25")
    );
    assert_eq!(
        server.handle_message(json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        })),
        None
    );
    let listed = server
        .handle_message(json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }))
        .unwrap();
    let listed_names = listed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_string())
        .collect::<Vec<_>>();

    assert_eq!(listed_names, registry_names);
    assert!(!listed_names.contains(&"save_ingredient_variant".to_string()));
}

#[test]
fn tool_domain_errors_are_returned_as_mcp_tool_results() {
    let fixture = Fixture::new();
    let mut server = McpServer::new(fixture.registry(), fixture.context());
    server.handle_message(initialize());
    server.handle_message(json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }));

    let response = server
        .handle_message(json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "read_task_attachments",
                "arguments": { "attachmentIds": ["outside-task"] }
            }
        }))
        .unwrap();

    assert_eq!(response["result"]["isError"], json!(true));
    assert_eq!(
        response["result"]["structuredContent"]["error"]["code"],
        json!("scope_violation")
    );
}

#[test]
fn cancelled_request_is_not_dispatched_to_the_registry() {
    let fixture = Fixture::new();
    let mut server = McpServer::new(fixture.registry(), fixture.context());
    server.handle_message(initialize());
    server.handle_message(json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }));
    assert_eq!(
        server.handle_message(json!({
            "jsonrpc": "2.0",
            "method": "notifications/cancelled",
            "params": { "requestId": 4, "reason": "user cancelled" }
        })),
        None
    );

    let response = server
        .handle_message(json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "search_categories",
                "arguments": { "query": null, "limit": null }
            }
        }))
        .unwrap();

    assert_eq!(response["error"]["code"], json!(-32800));
}

#[tokio::test]
async fn newline_delimited_stdio_framing_emits_only_json_rpc_lines() {
    let fixture = Fixture::new();
    let (client, server) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server);
    let mcp = McpServer::new(fixture.registry(), fixture.context());
    let task = tokio::spawn(async move { serve_mcp(mcp, server_read, server_write).await });
    let (client_read, mut client_write) = tokio::io::split(client);
    let mut responses = BufReader::new(client_read).lines();

    for message in [
        initialize(),
        json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    ] {
        client_write
            .write_all(format!("{}\n", message).as_bytes())
            .await
            .unwrap();
    }
    let initialize_response: Value =
        serde_json::from_str(&responses.next_line().await.unwrap().unwrap()).unwrap();
    let list_response: Value =
        serde_json::from_str(&responses.next_line().await.unwrap().unwrap()).unwrap();
    assert_eq!(initialize_response["id"], json!(1));
    assert_eq!(list_response["id"], json!(2));
    assert!(list_response["result"]["tools"].as_array().unwrap().len() > 10);

    client_write.shutdown().await.unwrap();
    task.await.unwrap().unwrap();
}

#[tokio::test]
async fn standalone_mcp_binary_consumes_capability_and_speaks_stdio() {
    let fixture = Fixture::new();
    drop(fixture.registry());
    let mut repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let conversation = repository.create_conversation("MCP 子进程测试").unwrap();
    let run = repository
        .create_run(AgentRunInput {
            conversation_id: conversation.id,
            provider_config_id: "claude_code_cli".into(),
            import_job_id: None,
            status: AgentRunStatus::Running,
        })
        .unwrap();
    drop(repository);
    let mut context = fixture.context();
    context.run_id = run.id.clone();
    let capability =
        McpTaskCapability::issue(&fixture.root, &context, Duration::from_secs(60)).unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_food_rd_mcp"))
        .env_clear()
        .env("FOOD_RD_MCP_TOKEN", &capability.token)
        .env("FOOD_RD_MCP_CAPABILITY_PATH", &capability.record_path)
        .env("FOOD_RD_MCP_DATABASE_PATH", &fixture.database_path)
        .env("FOOD_RD_MCP_ATTACHMENT_ROOT", &fixture.attachment_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut responses = BufReader::new(stdout).lines();
    for message in [
        initialize(),
        json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "search_categories",
                "arguments": { "query": null, "limit": null }
            }
        }),
    ] {
        stdin
            .write_all(format!("{}\n", message).as_bytes())
            .await
            .unwrap();
    }
    let first: Value =
        serde_json::from_str(&responses.next_line().await.unwrap().unwrap()).unwrap();
    let second: Value =
        serde_json::from_str(&responses.next_line().await.unwrap().unwrap()).unwrap();
    let third: Value =
        serde_json::from_str(&responses.next_line().await.unwrap().unwrap()).unwrap();
    assert_eq!(first["id"], json!(1));
    assert_eq!(second["id"], json!(2));
    assert!(
        !second["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["name"] == "save_ingredient_variant")
    );
    assert_eq!(third["id"], json!(3));
    assert_eq!(third["result"]["isError"], json!(false));

    stdin.shutdown().await.unwrap();
    drop(stdin);
    let status = tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .unwrap()
        .unwrap();
    assert!(status.success());
    assert_eq!(
        McpTaskCapability::consume(&capability.record_path, &capability.token)
            .unwrap_err()
            .code(),
        "unauthorized"
    );
    let audit = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let calls = audit.list_tool_calls(&run.id).unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].tool_name, "search_categories");
    assert_eq!(calls[0].status, AgentToolCallStatus::Completed);
    assert_eq!(
        audit.get_run(&run.id).unwrap().status,
        AgentRunStatus::Running
    );
}

fn initialize() -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": { "name": "test", "version": "1" }
        }
    })
}
