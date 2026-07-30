use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use food_rd_desktop::agent::{
    model::{
        AgentMessageInput, AgentMessageRole, AgentMessageStatus, AgentProviderCapabilities,
        AgentProviderConfigInput, AgentProviderKind, AgentProviderProtocol, AgentRunInput,
        AgentRunStatus, ReasoningEffort,
    },
    repository::AgentRepository,
};
use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

struct FileFixture {
    database_path: PathBuf,
    root: PathBuf,
}

impl FileFixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-agent-repo-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self {
            database_path: root.join("food-rd.sqlite3"),
            root,
        }
    }

    fn open(&self) -> AgentRepository {
        AgentRepository::open(&self.database_path).unwrap()
    }

    fn bytes(&self) -> Vec<u8> {
        fs::read(&self.database_path).unwrap()
    }
}

impl Drop for FileFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn openai_config(enabled: bool) -> AgentProviderConfigInput {
    AgentProviderConfigInput {
        id: "openai".into(),
        kind: AgentProviderKind::OpenAi,
        display_name: "OpenAI".into(),
        protocol: AgentProviderProtocol::OpenAiResponses,
        endpoint: "https://api.openai.com/v1".into(),
        model: "gpt-5.5".into(),
        context_window: 128_000,
        reasoning_effort: ReasoningEffort::Auto,
        timeout_seconds: 120,
        executable_path: None,
        enabled,
        capabilities: AgentProviderCapabilities::all(),
    }
}

fn deepseek_config(enabled: bool) -> AgentProviderConfigInput {
    AgentProviderConfigInput {
        id: "deepseek".into(),
        kind: AgentProviderKind::DeepSeek,
        display_name: "DeepSeek".into(),
        protocol: AgentProviderProtocol::OpenAiCompatible,
        endpoint: "https://api.deepseek.com".into(),
        model: "deepseek-chat".into(),
        context_window: 128_000,
        reasoning_effort: ReasoningEffort::Auto,
        timeout_seconds: 120,
        executable_path: None,
        enabled,
        capabilities: AgentProviderCapabilities::all(),
    }
}

#[test]
fn fresh_database_seeds_provider_cards_and_enabled_agent_preference() {
    let repository = AgentRepository::open_in_memory_with(
        || "2026-07-30T00:00:00Z".into(),
        || "unused-id".into(),
    )
    .unwrap();

    let providers = repository.list_providers().unwrap();
    assert_eq!(providers.len(), 14);
    assert!(providers.iter().all(|provider| !provider.enabled));
    assert!(providers.iter().all(|provider| !provider.has_secret));
    let ark = providers
        .iter()
        .find(|provider| provider.id == "volcengine_ark")
        .unwrap();
    assert_eq!(ark.protocol, AgentProviderProtocol::OpenAiResponses);
    for id in [
        "kimi_cn",
        "zhipu_glm",
        "minimax_cn",
        "bailian",
        "volcengine_ark",
    ] {
        assert!(
            providers
                .iter()
                .find(|provider| provider.id == id)
                .unwrap()
                .capabilities
                .images
        );
    }
    assert_eq!(
        repository.get_preferences().unwrap(),
        food_rd_desktop::agent::model::AgentPreferences {
            enabled: true,
            vision_provider_config_id: None,
        }
    );
}

#[test]
fn saving_an_enabled_provider_disables_the_previous_active_provider() {
    let mut repository = AgentRepository::open_in_memory_with(
        || "2026-07-30T00:00:00Z".into(),
        || "unused-id".into(),
    )
    .unwrap();

    repository.save_provider(openai_config(true)).unwrap();
    repository.save_provider(deepseek_config(true)).unwrap();

    let providers = repository.list_providers().unwrap();
    assert!(
        !providers
            .iter()
            .find(|item| item.id == "openai")
            .unwrap()
            .enabled
    );
    assert!(
        providers
            .iter()
            .find(|item| item.id == "deepseek")
            .unwrap()
            .enabled
    );
    assert_eq!(providers.iter().filter(|item| item.enabled).count(), 1);
}

#[test]
fn agent_records_survive_reopen_without_secret_values() {
    let fixture = FileFixture::new();
    let (provider_id, conversation_id) = {
        let mut repository = fixture.open();
        let provider = repository.save_provider(openai_config(true)).unwrap();
        repository
            .set_provider_secret_ref(&provider.id, Some("agent/openai"))
            .unwrap();
        let conversation = repository.create_conversation("原料资料导入").unwrap();
        repository
            .append_message(AgentMessageInput {
                conversation_id: conversation.id.clone(),
                run_id: None,
                role: AgentMessageRole::User,
                content: "请读取所选标签".into(),
                attachment_ids: vec![],
                status: AgentMessageStatus::Complete,
            })
            .unwrap();
        (provider.id, conversation.id)
    };

    let reopened = fixture.open();
    assert_eq!(
        reopened
            .list_providers()
            .unwrap()
            .into_iter()
            .find(|provider| provider.id == provider_id)
            .unwrap()
            .id,
        provider_id
    );
    assert_eq!(reopened.list_messages(&conversation_id).unwrap().len(), 1);
    let database_text = String::from_utf8_lossy(&fixture.bytes()).into_owned();
    assert!(database_text.contains("agent/openai"));
    assert!(!database_text.contains("sk-test-secret"));
    assert!(!database_text.contains("\"apiKey\""));
}

#[test]
fn reopening_marks_interrupted_runs_and_streaming_messages_failed() {
    let fixture = FileFixture::new();
    let (conversation_id, run_id, message_id) = {
        let mut repository = fixture.open();
        repository.save_provider(openai_config(true)).unwrap();
        let conversation = repository.create_conversation("中断恢复").unwrap();
        let run = repository
            .create_run(AgentRunInput {
                conversation_id: conversation.id.clone(),
                provider_config_id: "openai".into(),
                import_job_id: None,
                status: AgentRunStatus::Running,
            })
            .unwrap();
        let message = repository
            .append_message(AgentMessageInput {
                conversation_id: conversation.id.clone(),
                run_id: Some(run.id.clone()),
                role: AgentMessageRole::Assistant,
                content: "已识别到脱脂乳粉".into(),
                attachment_ids: vec![],
                status: AgentMessageStatus::Streaming,
            })
            .unwrap();
        (conversation.id, run.id, message.id)
    };

    let reopened = fixture.open();
    let run = reopened.get_run(&run_id).unwrap();
    assert_eq!(run.status, AgentRunStatus::Failed);
    assert_eq!(run.error_code.as_deref(), Some("application_restarted"));
    assert_eq!(
        run.error_summary.as_deref(),
        Some("应用上次在处理任务时退出，请重新运行")
    );
    let messages = reopened.list_messages(&conversation_id).unwrap();
    let message = messages
        .iter()
        .find(|message| message.id == message_id)
        .unwrap();
    assert_eq!(message.status, AgentMessageStatus::Failed);
    assert_eq!(message.content, "已识别到脱脂乳粉");
}

#[test]
fn deleting_a_conversation_cascades_messages_and_runs_but_not_providers() {
    let clock_sequence = Arc::new(AtomicUsize::new(0));
    let clock = {
        let sequence = Arc::clone(&clock_sequence);
        move || {
            let tick = sequence.fetch_add(1, Ordering::SeqCst);
            format!("2026-07-30T00:{tick:02}:00Z")
        }
    };
    let id_sequence = Arc::new(AtomicUsize::new(0));
    let create_id = {
        let sequence = Arc::clone(&id_sequence);
        move || format!("agent-id-{}", sequence.fetch_add(1, Ordering::SeqCst))
    };
    let mut repository = AgentRepository::open_in_memory_with(clock, create_id).unwrap();
    repository.save_provider(openai_config(true)).unwrap();
    let conversation = repository.create_conversation("待删除").unwrap();
    let run = repository
        .create_run(AgentRunInput {
            conversation_id: conversation.id.clone(),
            provider_config_id: "openai".into(),
            import_job_id: None,
            status: AgentRunStatus::Queued,
        })
        .unwrap();
    repository
        .append_message(AgentMessageInput {
            conversation_id: conversation.id.clone(),
            run_id: Some(run.id.clone()),
            role: AgentMessageRole::User,
            content: "测试".into(),
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
        })
        .unwrap();

    repository.delete_conversation(&conversation.id).unwrap();

    assert!(
        repository
            .list_messages(&conversation.id)
            .unwrap()
            .is_empty()
    );
    assert!(repository.get_run(&run.id).is_err());
    assert_eq!(repository.list_providers().unwrap().len(), 14);
}

#[test]
fn custom_provider_seed_keeps_both_protocol_subconfigurations() {
    let repository = AgentRepository::open_in_memory_with(
        || "2026-07-30T00:00:00Z".into(),
        || "unused-id".into(),
    )
    .unwrap();
    let stored = repository.provider_config_json("custom").unwrap();

    assert_eq!(
        stored,
        json!({
            "openaiCompatible": {
                "endpoint": "",
                "model": ""
            },
            "anthropicCompatible": {
                "endpoint": "",
                "model": ""
            }
        })
    );
}

#[test]
fn migration_has_no_plaintext_secret_column() {
    let repository = AgentRepository::open_in_memory_with(
        || "2026-07-30T00:00:00Z".into(),
        || "unused-id".into(),
    )
    .unwrap();
    drop(repository);
    let fixture = FileFixture::new();
    drop(fixture.open());
    let connection = Connection::open(&fixture.database_path).unwrap();
    let mut statement = connection
        .prepare("PRAGMA table_info(agent_provider_configs)")
        .unwrap();
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert!(columns.contains(&"secret_ref".into()));
    assert!(!columns.iter().any(|column| {
        let normalized = column.to_ascii_lowercase();
        normalized.contains("api_key")
            || normalized.contains("apikey")
            || normalized == "secret"
            || normalized == "credential"
    }));
}

#[test]
fn file_fixture_uses_a_real_sqlite_file() {
    let fixture = FileFixture::new();
    drop(fixture.open());
    assert!(Path::new(&fixture.database_path).exists());
}
