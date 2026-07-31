use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use tauri::{AppHandle, Emitter, State};

use crate::{
    agent::{
        AgentError,
        mcp::McpTaskLaunchConfig,
        model::{
            AgentConversation, AgentMessage, AgentPreferences, AgentProviderConfig,
            AgentProviderConfigInput, AgentProviderKind, AgentProviderProtocol,
            AgentProviderSecretInput, AgentRun, AgentRunRequest, AgentRunStatus,
        },
        providers::{
            AgentModelOption, AgentProviderTestResult, CustomProviderSubconfig, ProviderRegistry,
            ProviderTestKind,
            cli::{CliDetectionResult, detect_cli},
            factory::build_provider,
        },
        repository::AgentRepository,
        runtime::{AgentProviderFactory, AgentRuntime, AgentRuntimeEvent},
        secrets::KeyringSecretStore,
        tools::AgentToolRegistry,
    },
    ingest::{coordinator::IngredientIngestCoordinator, model::IngredientImportDraft},
};

use super::{AppState, CommandError};

const AGENT_EVENT_NAME: &str = "food-rd://agent-event";

fn repository(state: &State<'_, AppState>) -> Result<AgentRepository, CommandError> {
    AgentRepository::open_for_runtime(&state.database_path).map_err(Into::into)
}

fn provider_registry(
    state: &State<'_, AppState>,
) -> Result<ProviderRegistry<KeyringSecretStore>, CommandError> {
    Ok(ProviderRegistry::new(
        repository(state)?,
        KeyringSecretStore,
    ))
}

#[tauri::command]
pub fn get_agent_preferences(state: State<'_, AppState>) -> Result<AgentPreferences, CommandError> {
    repository(&state)?.get_preferences().map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_agent_preferences(
    input: AgentPreferences,
    state: State<'_, AppState>,
) -> Result<AgentPreferences, CommandError> {
    provider_registry(&state)?
        .save_preferences(input)
        .map_err(Into::into)
}

#[tauri::command]
pub fn list_agent_provider_configs(
    state: State<'_, AppState>,
) -> Result<Vec<AgentProviderConfig>, CommandError> {
    provider_registry(&state)?
        .list_configs()
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_agent_provider_config(
    input: AgentProviderConfigInput,
    state: State<'_, AppState>,
) -> Result<AgentProviderConfig, CommandError> {
    let mut registry = provider_registry(&state)?;
    if input.kind == AgentProviderKind::Custom {
        registry.save_custom(input.protocol, &input.endpoint, &input.model)?;
    }
    registry.save_config(input).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_agent_provider_secret(
    input: AgentProviderSecretInput,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    provider_registry(&state)?
        .set_secret(&input.provider_id, &input.api_key)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_agent_provider_secret(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    provider_registry(&state)?
        .clear_secret(&provider_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_agent_provider_models(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentModelOption>, CommandError> {
    let registry = provider_registry(&state)?;
    let config = registry.get_config(&provider_id)?;
    let secret = registry.resolved_secret(&provider_id)?;
    build_provider(config, secret, None)?
        .list_models()
        .await
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_agent_custom_provider_subconfig(
    protocol: AgentProviderProtocol,
    state: State<'_, AppState>,
) -> Result<CustomProviderSubconfig, CommandError> {
    provider_registry(&state)?
        .custom_subconfig(protocol)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn test_agent_provider(
    provider_id: String,
    kind: ProviderTestKind,
    state: State<'_, AppState>,
) -> Result<AgentProviderTestResult, CommandError> {
    let registry = provider_registry(&state)?;
    let config = registry.get_config(&provider_id)?;
    let secret = registry.resolved_secret(&provider_id)?;
    build_provider(config, secret, None)?
        .test(kind)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn detect_cli_providers(
    state: State<'_, AppState>,
) -> Result<Vec<CliDetectionResult>, CommandError> {
    let configs = provider_registry(&state)?.list_configs()?;
    let codex_path = configs
        .iter()
        .find(|config| config.kind == AgentProviderKind::CodexCli)
        .and_then(|config| config.executable_path.as_deref())
        .map(str::to_owned);
    let claude_path = configs
        .iter()
        .find(|config| config.kind == AgentProviderKind::ClaudeCodeCli)
        .and_then(|config| config.executable_path.as_deref())
        .map(str::to_owned);
    let (codex, claude) = tokio::join!(
        detect_cli(AgentProviderKind::CodexCli, codex_path.as_deref()),
        detect_cli(AgentProviderKind::ClaudeCodeCli, claude_path.as_deref())
    );
    Ok(vec![codex?, claude?])
}

#[tauri::command]
pub fn list_agent_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<AgentConversation>, CommandError> {
    repository(&state)?.list_conversations().map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_agent_conversation(
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<AgentConversation, CommandError> {
    repository(&state)?
        .create_conversation(title.as_deref().unwrap_or("新对话"))
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_agent_conversation(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    let active_ids = state
        .active_agent_runs
        .lock()
        .map_err(|_| CommandError::state_unavailable())?
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    let mut repository = repository(&state)?;
    let has_active_run = active_ids.iter().any(|run_id| {
        repository
            .get_run(run_id)
            .is_ok_and(|run| run.conversation_id == id && run.status == AgentRunStatus::Running)
    });
    if has_active_run {
        return Err(AgentError::invalid_input("请先取消当前任务，再删除该对话").into());
    }
    repository.delete_conversation(&id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_agent_messages(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentMessage>, CommandError> {
    repository(&state)?
        .list_messages(&conversation_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn start_agent_run(
    request: AgentRunRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AgentRun, CommandError> {
    let registry = provider_registry(&state)?;
    let config = registry.active_chat()?;
    let secret = registry.resolved_secret(&config.id)?;
    let database_path = state.database_path.clone();
    let attachment_root = state.attachment_root.clone();
    let server_binary = mcp_server_binary()?;
    let factory: AgentProviderFactory = Arc::new(move |config, context| {
        let mcp = matches!(
            config.kind,
            AgentProviderKind::CodexCli | AgentProviderKind::ClaudeCodeCli
        )
        .then(|| {
            McpTaskLaunchConfig::new(
                &server_binary,
                &database_path,
                &attachment_root,
                context.clone(),
                Duration::from_secs(config.timeout_seconds.saturating_add(60)),
            )
        });
        build_provider(config.clone(), secret.clone(), mcp)
    });

    let coordinator =
        IngredientIngestCoordinator::open(&state.database_path, &state.attachment_root)?;
    let repository = AgentRepository::open_for_runtime(&state.database_path)?;
    let audit = AgentRepository::open_for_runtime(&state.database_path)?;
    let event_sink = Arc::new(move |event: AgentRuntimeEvent| {
        let _ = app.emit(AGENT_EVENT_NAME, event);
    });
    let mut runtime = AgentRuntime::new_with_factory(
        repository,
        AgentToolRegistry::with_audit(coordinator, audit),
        factory,
        config,
        event_sink,
    );
    let prepared = runtime.begin(request)?;
    let run = AgentRuntime::prepared_run(&prepared).clone();
    let active_runs = Arc::clone(&state.active_agent_runs);
    active_runs
        .lock()
        .map_err(|_| CommandError::state_unavailable())?
        .insert(run.id.clone(), runtime.control());
    let run_id = run.id.clone();
    tauri::async_runtime::spawn(async move {
        let _ = runtime.execute(prepared).await;
        if let Ok(mut active) = active_runs.lock() {
            active.remove(&run_id);
        }
    });
    Ok(run)
}

#[tauri::command(rename_all = "camelCase")]
pub fn cancel_agent_run(id: String, state: State<'_, AppState>) -> Result<AgentRun, CommandError> {
    let control = state
        .active_agent_runs
        .lock()
        .map_err(|_| CommandError::state_unavailable())?
        .get(&id)
        .cloned();
    let mut repository = repository(&state)?;
    let run = repository.get_run(&id)?;
    if matches!(
        run.status,
        AgentRunStatus::Completed | AgentRunStatus::Failed | AgentRunStatus::Cancelled
    ) {
        return Ok(run);
    }
    let Some(control) = control else {
        return Err(AgentError::invalid_input("该任务当前未在运行").into());
    };
    control.cancel();
    repository
        .update_run(
            &id,
            AgentRunStatus::Cancelled,
            Some("cancelled"),
            Some("用户已取消本次 Agent 任务"),
        )
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_agent_run(id: String, state: State<'_, AppState>) -> Result<AgentRun, CommandError> {
    repository(&state)?.get_run(&id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_agent_import_drafts(
    run_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<IngredientImportDraft>, CommandError> {
    let run = repository(&state)?.get_run(&run_id)?;
    let Some(job_id) = run.import_job_id else {
        return Ok(vec![]);
    };
    let coordinator = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    let coordinator = coordinator
        .as_ref()
        .ok_or_else(CommandError::state_unavailable)?;
    coordinator.list_drafts(&job_id).map_err(Into::into)
}

fn mcp_server_binary() -> Result<PathBuf, AgentError> {
    let current = std::env::current_exe()
        .map_err(|_| AgentError::provider_failure("无法确定应用程序位置"))?;
    let name = if cfg!(windows) {
        "food_rd_mcp.exe"
    } else {
        "food_rd_mcp"
    };
    Ok(current
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(name))
}
