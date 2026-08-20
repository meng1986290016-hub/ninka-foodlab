use std::{
    collections::{BTreeSet, VecDeque},
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use food_rd_desktop::{
    agent::{
        AgentError,
        model::{
            AgentMessageInput, AgentMessageRole, AgentMessageStatus, AgentProviderCapabilities,
            AgentProviderConfig, AgentProviderKind, AgentProviderProtocol, AgentRunRequest,
            AgentRunStatus, ReasoningEffort,
        },
        providers::{
            AgentEventSink, AgentModelOption, AgentProvider, AgentProviderTestResult,
            ProviderEvent, ProviderTestKind, ProviderToolCall, ProviderTurnRequest,
            ProviderTurnResult,
        },
        repository::AgentRepository,
        runtime::{AgentRuntime, AgentRuntimeEvent},
        tools::{AgentToolContext, AgentToolRegistry},
    },
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{ImportFileReference, ImportFileReferenceKind},
    },
};
use serde_json::json;
use uuid::Uuid;

struct SequenceProvider {
    responses: Mutex<VecDeque<Result<ProviderTurnResult, AgentError>>>,
    requests: Mutex<Vec<ProviderTurnRequest>>,
    calls: AtomicUsize,
    delay: Duration,
}

impl SequenceProvider {
    fn new(responses: Vec<Result<ProviderTurnResult, AgentError>>) -> Self {
        Self {
            responses: Mutex::new(responses.into()),
            requests: Mutex::new(Vec::new()),
            calls: AtomicUsize::new(0),
            delay: Duration::ZERO,
        }
    }

    fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }

    fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }

    fn requests(&self) -> Vec<ProviderTurnRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl AgentProvider for SequenceProvider {
    fn capabilities(&self) -> AgentProviderCapabilities {
        AgentProviderCapabilities::all()
    }

    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError> {
        Ok(AgentProviderTestResult {
            ok: true,
            kind,
            latency_ms: Some(0),
            message: "ok".into(),
        })
    }

    async fn run(
        &self,
        request: ProviderTurnRequest,
        sink: AgentEventSink,
    ) -> Result<ProviderTurnResult, AgentError> {
        self.requests.lock().unwrap().push(request);
        self.calls.fetch_add(1, Ordering::SeqCst);
        tokio::time::sleep(self.delay).await;
        let response = self.responses.lock().unwrap().pop_front().unwrap();
        if let Ok(result) = &response {
            for event in &result.events {
                sink(event.clone());
            }
        }
        response
    }

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError> {
        Ok(vec![])
    }
}

struct Fixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    source_path: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-runtime-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("milk-powder.txt");
        fs::write(&source_path, "脱脂乳粉\n供应商 A\n蛋白质 34.0g").unwrap();
        Self {
            database_path: root.join("food-rd.sqlite3"),
            attachment_root: root.join("attachments"),
            source_path,
            root,
        }
    }

    fn runtime(
        &self,
        provider: Arc<dyn AgentProvider>,
        events: Arc<Mutex<Vec<AgentRuntimeEvent>>>,
    ) -> AgentRuntime {
        self.runtime_with_config(provider, events, provider_config())
    }

    fn runtime_with_config(
        &self,
        provider: Arc<dyn AgentProvider>,
        events: Arc<Mutex<Vec<AgentRuntimeEvent>>>,
        config: AgentProviderConfig,
    ) -> AgentRuntime {
        let coordinator =
            IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap();
        let repository = AgentRepository::open_for_runtime(&self.database_path).unwrap();
        let audit = AgentRepository::open_for_runtime(&self.database_path).unwrap();
        AgentRuntime::new(
            repository,
            AgentToolRegistry::with_audit(coordinator, audit),
            provider,
            config,
            Arc::new(move |event| events.lock().unwrap().push(event)),
        )
    }

    fn request(&self, conversation_id: String) -> AgentRunRequest {
        AgentRunRequest {
            conversation_id,
            content: "读取这份资料并建立原料草稿".into(),
            files: vec![ImportFileReference {
                kind: ImportFileReferenceKind::NativePath,
                value: self.source_path.to_string_lossy().into_owned(),
                media_type: Some("text/plain".into()),
            }],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: None,
        }
    }

    fn conversation(&self) -> String {
        let mut repository = AgentRepository::open_for_runtime(&self.database_path).unwrap();
        repository.create_conversation("原料识别").unwrap().id
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn runtime_events_match_the_frontend_camel_case_contract() {
    assert_eq!(
        serde_json::to_value(AgentRuntimeEvent::ToolStarted {
            run_id: "run-1".into(),
            call_id: "call-1".into(),
            tool_name: "search_categories".into(),
        })
        .unwrap(),
        json!({
            "type": "tool_started",
            "runId": "run-1",
            "callId": "call-1",
            "toolName": "search_categories"
        })
    );
}

#[tokio::test]
async fn tool_calls_continue_until_final_message_and_persist_progress() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已创建 1 张原料草稿，请人工复核后保存。")),
    ]));
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut runtime = fixture.runtime(provider.clone(), Arc::clone(&events));

    let run = runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(provider.call_count(), 2);
    let requests = provider.requests();
    assert!(requests[0].tool_rounds.is_empty());
    assert_eq!(requests[1].tool_rounds.len(), 1);
    assert_eq!(requests[1].tool_rounds[0].calls.len(), 1);
    assert_eq!(requests[1].tool_rounds[0].results.len(), 1);
    assert_eq!(
        requests[1].tool_rounds[0].calls[0].id,
        requests[1].tool_rounds[0].results[0].call_id
    );
    assert!(requests[1].tool_rounds[0].results[0].output["ok"] == true);
    assert!(
        requests[1]
            .messages
            .iter()
            .all(|message| message.role != AgentMessageRole::Tool)
    );
    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let messages = repository.list_messages(&conversation_id).unwrap();
    assert_eq!(
        messages.last().unwrap().content,
        "已创建 1 张原料草稿，请人工复核后保存。"
    );
    let drafts = runtime
        .tools()
        .coordinator()
        .list_drafts(run.import_job_id.as_deref().unwrap())
        .unwrap();
    assert_eq!(drafts.len(), 1);
    assert!(
        runtime
            .tools()
            .coordinator()
            .ingredients()
            .list_material_groups("")
            .unwrap()
            .is_empty()
    );
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|event| matches!(event, AgentRuntimeEvent::DraftsChanged { .. }))
    );
}

#[tokio::test]
async fn every_provider_receives_the_real_current_task_attachment_ids() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已读取本次任务附件。")),
    ]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));

    runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap();

    let persisted_user = AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .list_messages(&conversation_id)
        .unwrap()
        .into_iter()
        .find(|message| message.role == AgentMessageRole::User)
        .unwrap();
    let attachment_id = persisted_user.attachment_ids.first().unwrap();
    let requests = provider.requests();
    let provider_user = requests[0]
        .messages
        .iter()
        .rev()
        .find(|message| message.role == AgentMessageRole::User)
        .unwrap();

    assert!(
        provider_user
            .content
            .contains(&format!("attachmentId={attachment_id}"))
    );
    assert!(
        provider_user
            .content
            .contains("attachmentIds 传 null 或空数组")
    );
    assert!(!persisted_user.content.contains(attachment_id));
}

#[tokio::test]
async fn cli_timeout_after_a_completed_draft_write_is_a_reviewable_completion() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![Err(
        AgentError::provider_timeout("模型整理最终回复超时"),
    )]));
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut config = provider_config();
    config.id = "codex_cli".into();
    config.kind = AgentProviderKind::CodexCli;
    config.protocol = AgentProviderProtocol::CodexCli;
    let mut runtime = fixture.runtime_with_config(provider, Arc::clone(&events), config);
    let prepared = runtime
        .begin(fixture.request(conversation_id.clone()))
        .unwrap();
    let pending_run = AgentRuntime::prepared_run(&prepared).clone();
    let job_id = pending_run.import_job_id.clone().unwrap();
    let attachment_id = runtime
        .tools()
        .coordinator()
        .list_job_attachments(&job_id)
        .unwrap()[0]
        .id
        .clone();
    let mut arguments = tool_turn()
        .events
        .into_iter()
        .find_map(|event| match event {
            ProviderEvent::ToolCall(call) => Some(call.arguments),
            _ => None,
        })
        .unwrap();
    arguments["attachmentIds"] = json!([attachment_id.clone()]);
    let coordinator =
        IngredientIngestCoordinator::open(&fixture.database_path, &fixture.attachment_root)
            .unwrap();
    let audit = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let mut registry = AgentToolRegistry::with_audit(coordinator, audit);
    registry
        .execute(
            &AgentToolContext {
                run_id: pending_run.id.clone(),
                import_job_id: job_id.clone(),
                allowed_attachment_ids: BTreeSet::from([attachment_id]),
                provider_kind: AgentProviderKind::CodexCli,
                model: "test-model".into(),
                active_recipe_id: None,
                active_recipe_name: None,
                active_draft_fingerprint: None,
            },
            "create_ingredient_import_draft",
            arguments,
        )
        .unwrap();

    let completed = runtime.execute(prepared).await.unwrap();

    assert_eq!(completed.status, AgentRunStatus::Completed);
    assert_eq!(completed.error_code, None);
    let messages = AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .list_messages(&conversation_id)
        .unwrap();
    assert!(messages.last().unwrap().content.contains("草稿已安全保留"));
    assert!(events.lock().unwrap().iter().any(|event| matches!(
        event,
        AgentRuntimeEvent::RunCompleted { run_id } if run_id == &completed.id
    )));
}

#[tokio::test]
async fn invalid_model_output_retries_once_then_preserves_failed_job() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Err(AgentError::invalid_model_output("第一次格式错误")),
        Err(AgentError::invalid_model_output("第二次格式错误")),
    ]));
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut runtime = fixture.runtime(provider.clone(), events);

    let error = runtime
        .start(fixture.request(conversation_id))
        .await
        .unwrap_err();

    assert_eq!(error.code(), "invalid_model_output");
    assert_eq!(provider.call_count(), 2);
    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let run = repository
        .list_conversations()
        .unwrap()
        .into_iter()
        .flat_map(|conversation| repository.list_messages(&conversation.id).unwrap())
        .find_map(|message| message.run_id)
        .and_then(|run_id| repository.get_run(&run_id).ok())
        .unwrap();
    assert_eq!(run.status, AgentRunStatus::Failed);
    assert!(run.import_job_id.is_some());
    assert!(
        runtime
            .tools()
            .coordinator()
            .get_job(run.import_job_id.as_deref().unwrap())
            .is_ok()
    );
}

#[tokio::test]
async fn empty_model_output_retries_once_before_failing() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(final_turn("")),
        Ok(final_turn("")),
    ]));
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut runtime = fixture.runtime(provider.clone(), events);

    let error = runtime
        .start(AgentRunRequest {
            conversation_id,
            content: "帮我分析原料库".into(),
            files: vec![],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: None,
        })
        .await
        .unwrap_err();

    assert_eq!(error.code(), "invalid_model_output");
    assert_eq!(provider.call_count(), 2);
}

#[tokio::test]
async fn retry_reuses_the_failed_run_job_and_attachment_ids() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let failing_provider = Arc::new(SequenceProvider::new(vec![
        Ok(final_turn("")),
        Ok(final_turn("")),
    ]));
    let mut failing_runtime = fixture.runtime(failing_provider, Arc::new(Mutex::new(Vec::new())));
    failing_runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap_err();

    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let first_user = repository
        .list_messages(&conversation_id)
        .unwrap()
        .into_iter()
        .find(|message| message.role == AgentMessageRole::User)
        .unwrap();
    let failed_run_id = first_user.run_id.clone().unwrap();
    let failed_run = repository.get_run(&failed_run_id).unwrap();

    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已重新完成识别，请继续人工复核。")),
    ]));
    let mut retry_runtime = fixture.runtime(provider, Arc::new(Mutex::new(Vec::new())));
    let retried = retry_runtime
        .start(AgentRunRequest {
            conversation_id: conversation_id.clone(),
            content: String::new(),
            files: vec![],
            recipe_context: None,
            retry_run_id: Some(failed_run_id),
            continue_run_id: None,
        })
        .await
        .unwrap();

    assert_eq!(retried.import_job_id, failed_run.import_job_id);
    let messages = AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .list_messages(&conversation_id)
        .unwrap();
    let retried_user = messages
        .iter()
        .find(|message| {
            message.run_id.as_deref() == Some(&retried.id) && message.role == AgentMessageRole::User
        })
        .unwrap();
    assert_eq!(retried_user.attachment_ids, first_user.attachment_ids);
}

#[tokio::test]
async fn completed_run_can_continue_with_the_same_job_and_attachments() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let first_provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("识别完成，请人工复核。")),
    ]));
    let mut first_runtime = fixture.runtime(first_provider, Arc::new(Mutex::new(Vec::new())));
    let first = first_runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap();
    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let first_user = repository
        .list_messages(&conversation_id)
        .unwrap()
        .into_iter()
        .find(|message| {
            message.run_id.as_deref() == Some(&first.id) && message.role == AgentMessageRole::User
        })
        .unwrap();

    let continue_provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已按要求继续调整草稿。")),
    ]));
    let mut continue_runtime = fixture.runtime(continue_provider, Arc::new(Mutex::new(Vec::new())));
    let continued = continue_runtime
        .start(AgentRunRequest {
            conversation_id: conversation_id.clone(),
            content: "重新检查并拆分不同供应商".into(),
            files: vec![],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: Some(first.id),
        })
        .await
        .unwrap();

    assert_eq!(continued.import_job_id, first.import_job_id);
    let messages = AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .list_messages(&conversation_id)
        .unwrap();
    let continued_user = messages
        .iter()
        .find(|message| {
            message.run_id.as_deref() == Some(&continued.id)
                && message.role == AgentMessageRole::User
        })
        .unwrap();
    assert_eq!(continued_user.content, "重新检查并拆分不同供应商");
    assert_eq!(continued_user.attachment_ids, first_user.attachment_ids);
}

#[tokio::test]
async fn cli_tool_observations_are_not_executed_twice_by_runtime() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let mut turn = tool_turn();
    turn.events = turn
        .events
        .into_iter()
        .map(|event| match event {
            ProviderEvent::ToolCall(call) => ProviderEvent::ToolObservation(call),
            other => other,
        })
        .collect();
    turn.final_text = r#"{"message":"CLI 已完成任务"}"#.into();
    turn.structured_output = Some(json!({ "message": "CLI 已完成任务" }));
    turn.events.push(ProviderEvent::TextDelta(
        r#"{"message":"CLI 已完成任务"}"#.into(),
    ));
    let provider = Arc::new(SequenceProvider::new(vec![Ok(turn)]));
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut config = provider_config();
    config.kind = AgentProviderKind::CodexCli;
    config.protocol = AgentProviderProtocol::CodexCli;
    let mut runtime = fixture.runtime_with_config(provider.clone(), Arc::clone(&events), config);

    let run = runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(provider.call_count(), 1);
    let messages = AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .list_messages(&conversation_id)
        .unwrap();
    assert_eq!(messages.last().unwrap().content, "CLI 已完成任务");
    assert!(
        runtime
            .tools()
            .coordinator()
            .list_drafts(run.import_job_id.as_deref().unwrap())
            .unwrap()
            .is_empty()
    );
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|event| matches!(event, AgentRuntimeEvent::ToolCompleted { .. }))
    );
}

#[tokio::test]
async fn cli_structured_tool_requests_are_executed_by_the_app_runtime() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已创建 1 张待人工复核原料草稿。")),
    ]));
    let mut config = provider_config();
    config.kind = AgentProviderKind::CodexCli;
    config.protocol = AgentProviderProtocol::CodexCli;
    let mut runtime =
        fixture.runtime_with_config(provider.clone(), Arc::new(Mutex::new(Vec::new())), config);

    let run = runtime
        .start(fixture.request(conversation_id))
        .await
        .unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(provider.call_count(), 2);
    assert_eq!(
        runtime
            .tools()
            .coordinator()
            .list_drafts(run.import_job_id.as_deref().unwrap())
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn attachment_task_cannot_complete_without_a_real_tool_call() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![Ok(final_turn(
        "我已经识别并创建了待复核草稿。",
    ))]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));

    let error = runtime
        .start(fixture.request(conversation_id.clone()))
        .await
        .unwrap_err();

    assert_eq!(error.code(), "required_tool_not_called");
    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let run_id = repository
        .list_messages(&conversation_id)
        .unwrap()
        .into_iter()
        .find_map(|message| message.run_id)
        .unwrap();
    assert_eq!(
        repository.get_run(&run_id).unwrap().status,
        AgentRunStatus::Failed
    );
}

#[tokio::test]
async fn recipe_design_task_cannot_complete_without_a_real_tool_call() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![Ok(final_turn(
        "这是一份高脂曲奇配方。",
    ))]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));

    let error = runtime
        .start(AgentRunRequest {
            conversation_id,
            content: "我想做一个曲奇，脂肪含量高一点".into(),
            files: vec![],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: None,
        })
        .await
        .unwrap_err();

    assert_eq!(error.code(), "required_tool_not_called");
    let requests = provider.requests();
    let tool_names = requests[0]
        .tools
        .iter()
        .map(|tool| tool.name.as_str())
        .collect::<Vec<_>>();
    assert!(tool_names.contains(&"evaluate_recipe_proposal"));
    assert!(tool_names.contains(&"create_recipe_proposal"));
    assert!(!tool_names.contains(&"create_ingredient_import_draft"));
}

#[tokio::test]
async fn conversation_only_task_can_complete_without_tools() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![Ok(final_turn("你好，我在。"))]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));

    let run = runtime
        .start(AgentRunRequest {
            conversation_id,
            content: "你好".into(),
            files: vec![],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: None,
        })
        .await
        .unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert!(provider.requests()[0].tools.is_empty());
}

#[tokio::test]
async fn old_empty_history_is_not_sent_to_strict_chat_providers() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    AgentRepository::open_for_runtime(&fixture.database_path)
        .unwrap()
        .append_message(AgentMessageInput {
            conversation_id: conversation_id.clone(),
            run_id: None,
            role: AgentMessageRole::User,
            content: String::new(),
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
        })
        .unwrap();
    let provider = Arc::new(SequenceProvider::new(vec![Ok(final_turn("你好，我在。"))]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));

    let run = runtime
        .start(AgentRunRequest {
            conversation_id,
            content: "你好".into(),
            files: vec![],
            recipe_context: None,
            retry_run_id: None,
            continue_run_id: None,
        })
        .await
        .unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert!(
        provider.requests()[0]
            .messages
            .iter()
            .all(|message| !message.content.trim().is_empty())
    );
}

#[tokio::test]
async fn current_attachment_only_message_is_scoped_before_empty_history_filtering() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(SequenceProvider::new(vec![
        Ok(tool_turn()),
        Ok(final_turn("已读取附件并创建待复核草稿。")),
    ]));
    let mut runtime = fixture.runtime(provider.clone(), Arc::new(Mutex::new(Vec::new())));
    let mut request = fixture.request(conversation_id);
    request.content.clear();

    runtime.start(request).await.unwrap();

    let requests = provider.requests();
    let current_user = requests[0]
        .messages
        .iter()
        .rev()
        .find(|message| message.role == AgentMessageRole::User)
        .unwrap();
    assert!(!current_user.content.trim().is_empty());
    assert!(current_user.content.contains("attachmentId="));
}

#[tokio::test]
async fn cancellation_marks_the_run_cancelled_without_deleting_its_job() {
    let fixture = Fixture::new();
    let conversation_id = fixture.conversation();
    let provider = Arc::new(
        SequenceProvider::new(vec![Ok(final_turn("不应保存为完成"))])
            .with_delay(Duration::from_millis(50)),
    );
    let events = Arc::new(Mutex::new(Vec::new()));
    let mut runtime = fixture.runtime(provider, events);
    let control = runtime.control();
    let cancel = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(10)).await;
        control.cancel();
    });

    let error = runtime
        .start(fixture.request(conversation_id))
        .await
        .unwrap_err();
    cancel.await.unwrap();

    assert_eq!(error.code(), "cancelled");
    let repository = AgentRepository::open_for_runtime(&fixture.database_path).unwrap();
    let run = repository
        .list_conversations()
        .unwrap()
        .into_iter()
        .flat_map(|conversation| repository.list_messages(&conversation.id).unwrap())
        .find_map(|message| message.run_id)
        .and_then(|run_id| repository.get_run(&run_id).ok())
        .unwrap();
    assert_eq!(run.status, AgentRunStatus::Cancelled);
    assert!(
        runtime
            .tools()
            .coordinator()
            .get_job(run.import_job_id.as_deref().unwrap())
            .is_ok()
    );
}

fn provider_config() -> AgentProviderConfig {
    AgentProviderConfig {
        id: "openai".into(),
        kind: AgentProviderKind::OpenAi,
        display_name: "OpenAI".into(),
        protocol: AgentProviderProtocol::OpenAiResponses,
        endpoint: String::new(),
        model: "test-model".into(),
        context_window: 128_000,
        reasoning_effort: ReasoningEffort::Auto,
        timeout_seconds: 30,
        executable_path: Some("/fake/codex".into()),
        enabled: true,
        has_secret: false,
        capabilities: AgentProviderCapabilities::all(),
        updated_at: "2026-07-30T00:00:00Z".into(),
    }
}

fn tool_turn() -> ProviderTurnResult {
    ProviderTurnResult {
        final_text: String::new(),
        structured_output: None,
        events: vec![ProviderEvent::ToolCall(ProviderToolCall {
            id: "call-create-draft".into(),
            name: "create_ingredient_import_draft".into(),
            arguments: json!({
                "review": {
                    "materialGroupId": null,
                    "materialName": "脱脂乳粉",
                    "categoryId": null,
                    "categoryName": "乳制品",
                    "supplierId": null,
                    "supplierName": "供应商 A",
                    "modelOrSpecification": "",
                    "currentPrice": null,
                    "priceUnit": "kg",
                    "densityGPerMl": null,
                    "nutritionBasis": "每100g",
                    "nutrients": [{
                        "definitionId": "protein",
                        "name": "蛋白质",
                        "unit": "g",
                        "value": "34.0"
                    }],
                    "containsAllergens": ["乳及乳制品"],
                    "mayContainAllergens": [],
                    "source": "供应商标签",
                    "researchNotes": "",
                    "duplicateConfirmed": false
                },
                "attachmentIds": []
            }),
        })],
    }
}

fn final_turn(message: &str) -> ProviderTurnResult {
    ProviderTurnResult {
        final_text: message.into(),
        structured_output: None,
        events: vec![ProviderEvent::TextDelta(message.into())],
    }
}
