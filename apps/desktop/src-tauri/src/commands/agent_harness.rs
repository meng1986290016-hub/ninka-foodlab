use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::{
    agent::{
        mcp::McpTaskLaunchConfig,
        model::{AgentProviderKind, AgentRunInput, AgentRunStatus},
        repository::AgentRepository,
        secrets::SecretStore,
        tools::AgentToolContext,
    },
    agent_harness::{
        contract::{Workflow, contract_for},
        host::HarnessLaunchEnvironment,
        model::{
            AgentConversationView, AgentDeliveryMode, AgentEngine, AgentModelRoute,
            AgentQueuedMessage, AgentQueuedMessageState, AgentTask, AgentTaskEvent, AgentTurn,
            ArtifactManifest, CreateAgentTaskRequest, CreateAgentTurnRequest,
            EditAgentQueuedMessageRequest, EditAgentTurnRequest, HarnessHealth,
            HarnessStartRequest, HarnessTaskListScope, LegacyResetPreview, LegacyResetResult,
            SubmitAgentMessageRequest,
        },
        projection::ingest_history,
        repository::HarnessRepository,
        reset::LegacyAgentReset,
    },
    agent_recipe::{
        model::{AgentRecipeProposal, AgentRecipeProposalStatus},
        repository::AgentRecipeRepository,
    },
    ingest::coordinator::IngredientIngestCoordinator,
    ingredients::repository::IngredientRepository,
    recipes::repository::RecipeRepository,
};

use super::{AppState, CommandError};

const MODEL_SETTINGS_SESSION_ID: &str = "00000000-0000-4000-8000-000000000001";
const PROVIDER_TEST_SESSION_ID: &str = "00000000-0000-4000-8000-000000000002";
const MODEL_CAPABILITY_CACHE_SETTING: &str = "agent.model_input_capabilities.v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentProviderProfileRequest {
    settings_ns: String,
    settings_path: Vec<String>,
    profile: Value,
    expected_revision: Value,
    credential_ref: Option<String>,
    credential_value: Option<String>,
}

fn repository(state: &State<'_, AppState>) -> Result<HarnessRepository, CommandError> {
    HarnessRepository::open(&state.database_path).map_err(Into::into)
}

fn ensure_conversation_writable(task: &AgentTask) -> Result<(), CommandError> {
    if task.archived_at.is_some() {
        return Err(CommandError {
            code: "conversation_archived".into(),
            message: "请先恢复这个已归档会话，再继续操作".into(),
            field: None,
        });
    }
    Ok(())
}

fn chatgpt_route_disabled() -> CommandError {
    CommandError {
        code: "model_route_unavailable".into(),
        message: "此订阅模型路线已停用，请选择已配置的 API Provider".into(),
        field: None,
    }
}

#[tauri::command]
pub async fn get_harness_health(state: State<'_, AppState>) -> Result<HarnessHealth, CommandError> {
    Ok(state.harness.health().await)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn start_harness(
    request: Option<HarnessStartRequest>,
    state: State<'_, AppState>,
) -> Result<HarnessHealth, CommandError> {
    let preliminary = state.harness.health().await;
    if preliminary.status == crate::agent_harness::model::HarnessHealthStatus::Ready {
        return Ok(preliminary);
    }
    if preliminary.status == crate::agent_harness::model::HarnessHealthStatus::Damaged {
        return Ok(preliminary);
    }
    let _ = request;

    // The process-wide MCP bridge receives the real task/run identifiers only
    // after validating every tool call against the V2 TaskContract. These
    // placeholders never reach a permitted FoodLab tool execution.
    let context = AgentToolContext {
        run_id: "foodlab-agent-v2-host".into(),
        import_job_id: "foodlab-agent-v2-host".into(),
        allowed_attachment_ids: BTreeSet::new(),
        provider_kind: AgentProviderKind::DeepSeek,
        model: "foodlab-agent".into(),
        active_recipe_id: None,
        active_recipe_name: None,
        active_draft_fingerprint: None,
    };
    let server_binary = super::agent::mcp_server_binary()?;
    let prepared = McpTaskLaunchConfig::new(
        server_binary,
        &state.database_path,
        &state.attachment_root,
        context,
        Duration::from_secs(5 * 60),
    )
    .prepare(&state.harness.home().join("capabilities"))?;
    let launch = HarnessLaunchEnvironment {
        mcp_command: Some(prepared.server_binary),
        mcp_environment: prepared.environment,
    };
    state.harness.start(launch).await.map_err(command_failure)
}

#[tauri::command]
pub async fn stop_harness(state: State<'_, AppState>) -> Result<HarnessHealth, CommandError> {
    state.harness.stop().await.map_err(command_failure)
}

#[tauri::command]
pub fn read_third_party_licenses() -> String {
    include_str!("../../../../../THIRD_PARTY_LICENSES.md").to_string()
}

/// Restricted bridge for the FoodLab-native model settings UI. The browser can
/// reach only the upstream settings/credential/model methods listed here; it
/// never receives the local service address or its bearer token.
#[tauri::command(rename_all = "camelCase")]
pub async fn agent_runtime_settings_call(
    method: String,
    payload: Value,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let payload = validate_settings_call(&method, payload)?;
    state
        .harness
        .rpc_with_id(
            &method,
            payload,
            &format!("settings-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)
}

/// Saves a provider profile and its optional write-only API key as one FoodLab
/// operation. Settings are written first so a credential failure can restore
/// the previous redacted settings value without ever reading the old secret.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_agent_provider_profile(
    request: SaveAgentProviderProfileRequest,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let path = request
        .settings_path
        .iter()
        .cloned()
        .map(Value::String)
        .collect::<Vec<_>>();
    let mutation = validate_settings_mutation(json!({
        "ns": request.settings_ns,
        "ops": [{ "op": "set", "path": path, "value": request.profile }],
        "expectedRevision": request.expected_revision,
    }))?;
    let credential = match (request.credential_ref, request.credential_value) {
        (Some(reference), Some(value)) => Some(validate_credential_write(
            json!({ "ref": reference, "value": value }),
            true,
        )?),
        (None, None) => None,
        _ => return Err(invalid_settings_request("API Key 保存请求不完整")),
    };

    let namespace = mutation
        .get("ns")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_settings_request("模型设置缺少命名空间"))?
        .to_string();
    let operation_path = mutation
        .pointer("/ops/0/path")
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| invalid_settings_request("模型设置路径无效"))?;
    let before = state
        .harness
        .rpc_with_id(
            "settings.describe",
            json!({}),
            &format!("settings-before-save-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let previous_user_value = before
        .get("namespaces")
        .and_then(Value::as_array)
        .and_then(|namespaces| {
            namespaces
                .iter()
                .find(|item| item.get("ns").and_then(Value::as_str) == Some(namespace.as_str()))
        })
        .and_then(|item| item.get("user"))
        .and_then(|user| value_at_path(user, &operation_path))
        .cloned();

    let changed = state
        .harness
        .rpc_with_id(
            "settings.mutate",
            mutation,
            &format!("settings-save-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let Some(credential) = credential else {
        return Ok(changed);
    };
    if let Err(_credential_error) = state
        .harness
        .rpc_with_id(
            "credentials.set",
            credential,
            &format!("credential-save-{}", uuid::Uuid::new_v4()),
        )
        .await
    {
        let rollback_operation = previous_user_value.map_or_else(
            || json!({ "op": "unset", "path": operation_path }),
            |value| json!({ "op": "set", "path": operation_path, "value": value }),
        );
        let rollback = json!({
            "ns": namespace,
            "ops": [rollback_operation],
            "expectedRevision": changed.get("revision").cloned().unwrap_or(Value::Null),
        });
        let rollback_result = state
            .harness
            .rpc_with_id(
                "settings.mutate",
                rollback,
                &format!("settings-rollback-{}", uuid::Uuid::new_v4()),
            )
            .await;
        return Err(CommandError {
            code: "provider_save_failed".into(),
            message: if rollback_result.is_ok() {
                "API Key 保存失败，模型设置已恢复，请重试".into()
            } else {
                "API Key 保存失败，模型设置恢复也未完成；请重新读取设置后再试".into()
            },
            field: None,
        });
    }
    Ok(changed)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn test_agent_provider_connection(
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    validate_identifier("Provider", &provider)?;
    validate_identifier("模型", &model)?;
    if let Some(value) = reasoning_effort.as_deref() {
        validate_identifier("推理强度", value)?;
    }
    if !usable_model_providers(&state.harness)
        .await?
        .contains(&provider)
    {
        return Err(CommandError {
            code: "provider_not_configured".into(),
            message: "请先保存该 Provider 的 API Key，再测试连接".into(),
            field: None,
        });
    }

    let _ = state
        .harness
        .rpc_with_id(
            "session.create",
            json!({
                "sessionId": PROVIDER_TEST_SESSION_ID,
                "agentPreset": "foodlab",
            }),
            &format!("provider-test-create-{}", uuid::Uuid::new_v4()),
        )
        .await;
    let _ = state
        .harness
        .rpc_with_id(
            "session.cancel",
            json!({ "sessionId": PROVIDER_TEST_SESSION_ID }),
            &format!("provider-test-cancel-{}", uuid::Uuid::new_v4()),
        )
        .await;
    let mut selection = json!({
        "sessionId": PROVIDER_TEST_SESSION_ID,
        "provider": provider,
        "model": model,
    });
    if let Some(value) = reasoning_effort {
        selection["reasoningEffort"] = json!(value);
    }
    state
        .harness
        .rpc_with_id(
            "session.selectModel",
            selection,
            &format!("provider-test-model-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let before = latest_session_seq(&state.harness, PROVIDER_TEST_SESSION_ID).await?;
    state
        .harness
        .rpc_with_id(
            "session.prompt",
            json!({
                "sessionId": PROVIDER_TEST_SESSION_ID,
                "mode": "queue",
                "content": [{ "type": "text", "text": "FoodLab connection test. Reply only OK." }],
            }),
            &format!("provider-test-prompt-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;

    for _ in 0..80 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let history = state
            .harness
            .rpc_with_id(
                "session.history",
                json!({ "sessionId": PROVIDER_TEST_SESSION_ID, "maxMessages": 120 }),
                &format!("provider-test-history-{}", uuid::Uuid::new_v4()),
            )
            .await
            .map_err(command_failure)?;
        let finished = history
            .get("events")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                entry
                    .get("event")
                    .or_else(|| entry.get("type").map(|_| entry))
            })
            .filter(|event| {
                event
                    .get("seq")
                    .and_then(Value::as_i64)
                    .is_some_and(|seq| seq > before)
            })
            .find(|event| event.get("type").and_then(Value::as_str) == Some("turn/end"));
        let Some(event) = finished else {
            continue;
        };
        let reason = event.pointer("/data/reason").unwrap_or(&Value::Null);
        return match reason.get("kind").and_then(Value::as_str) {
            Some("completed") => Ok(json!({ "ok": true })),
            _ => Err(provider_connection_failure(reason)),
        };
    }
    let _ = state
        .harness
        .rpc_with_id(
            "session.cancel",
            json!({ "sessionId": PROVIDER_TEST_SESSION_ID }),
            &format!("provider-test-timeout-{}", uuid::Uuid::new_v4()),
        )
        .await;
    Err(CommandError {
        code: "provider_timeout".into(),
        message: "Provider 响应超时，请检查网络后重试".into(),
        field: None,
    })
}

#[tauri::command]
pub async fn get_agent_model_directory(state: State<'_, AppState>) -> Result<Value, CommandError> {
    let mut directory = ensure_model_settings_session(&state.harness).await?;
    let usable = usable_model_providers(&state.harness).await?;
    normalize_model_directory(&mut directory);
    let context = model_capability_context(&state.harness, &state.database_path).await;
    annotate_model_capabilities(&mut directory, &context);
    if let Some(object) = directory.as_object_mut() {
        if let Some(groups) = object.get_mut("groups").and_then(Value::as_array_mut) {
            groups.retain(|group| {
                group.get("engine").and_then(Value::as_str) != Some("codex_app_server")
            });
        }
        let saved_route = repository(&state)?.default_route()?;
        let saved_codex = saved_route
            .as_ref()
            .is_some_and(|route| route.engine == AgentEngine::CodexAppServer);
        let saved_foodlab = saved_route.as_ref().filter(|route| {
            route.engine == AgentEngine::FoodlabRuntime && usable.contains(&route.provider)
        });
        let runtime_current_usable = object
            .get("current")
            .and_then(Value::as_object)
            .and_then(|current| current.get("provider"))
            .and_then(Value::as_str)
            .is_some_and(|provider| usable.contains(provider))
            && object.get("routable").and_then(Value::as_bool) == Some(true);
        if saved_codex {
            object.insert(
                "current".into(),
                json!({ "engine": "foodlab_runtime", "provider": "", "model": "" }),
            );
            object.insert("routable".into(), Value::Bool(false));
            object.insert("currentUsable".into(), Value::Bool(false));
        } else if let Some(route) = saved_foodlab {
            object.insert(
                "current".into(),
                serde_json::to_value(route).unwrap_or(Value::Null),
            );
            object.insert("currentUsable".into(), Value::Bool(true));
        } else {
            if let Some(current) = object.get_mut("current").and_then(Value::as_object_mut) {
                current.insert("engine".into(), json!("foodlab_runtime"));
            }
            object.insert("currentUsable".into(), Value::Bool(runtime_current_usable));
        }
        object.insert("hasUsableProvider".into(), Value::Bool(!usable.is_empty()));
    }
    Ok(directory)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn select_agent_default_model(
    engine: Option<AgentEngine>,
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    validate_identifier("Provider", &provider)?;
    validate_identifier("模型", &model)?;
    if let Some(value) = reasoning_effort.as_deref() {
        validate_identifier("推理强度", value)?;
    }
    let engine = engine.unwrap_or(AgentEngine::FoodlabRuntime);
    let route = AgentModelRoute {
        engine,
        provider: provider.clone(),
        model: model.clone(),
        reasoning_effort: reasoning_effort.clone(),
    };
    match engine {
        AgentEngine::FoodlabRuntime => {
            if !usable_model_providers(&state.harness)
                .await?
                .contains(&provider)
            {
                return Err(CommandError {
                    code: "provider_not_configured".into(),
                    message: "请先配置该 Provider 的 API Key，再将它设为默认模型".into(),
                    field: None,
                });
            }
            ensure_model_settings_session(&state.harness).await?;
            let mut payload = json!({
                "sessionId": MODEL_SETTINGS_SESSION_ID,
                "provider": provider,
                "model": model,
            });
            if let Some(value) = reasoning_effort {
                payload["reasoningEffort"] = json!(value);
            }
            state
                .harness
                .rpc_with_id(
                    "session.selectModel",
                    payload,
                    &format!("select-model-{}", uuid::Uuid::new_v4()),
                )
                .await
                .map_err(command_failure)?;
        }
        AgentEngine::CodexAppServer => return Err(chatgpt_route_disabled()),
    }
    repository(&state)?.save_default_route(&route)?;
    Ok(json!({ "selected": route }))
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_harness_tasks(
    scope: Option<HarnessTaskListScope>,
    state: State<'_, AppState>,
) -> Result<Vec<AgentTask>, CommandError> {
    repository(&state)?
        .list_tasks(scope.unwrap_or_default())
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_agent_conversation_view(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    conversation_view(&state, &conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn submit_agent_message(
    request: SubmitAgentMessageRequest,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    if request.content.trim().is_empty() {
        return Err(invalid_settings_request("消息内容不能为空"));
    }
    let mut task = repository(&state)?.get_task(&request.conversation_id)?;
    ensure_conversation_writable(&task)?;
    let route = current_agent_route(&state).await?;
    let snapshot = if let Some(reference) = request.references.first() {
        Some(recipe_snapshot(&state, &reference.recipe_id)?)
    } else if let Some(recipe_id) = task.active_recipe_id.as_deref() {
        Some(recipe_snapshot(&state, recipe_id)?)
    } else {
        None
    };
    if let Some(snapshot) = snapshot.as_ref() {
        task = repository(&state)?.update_task_recipe_context(
            &task.id,
            Some(&snapshot.recipe_id),
            Some(&snapshot.recipe_name),
            snapshot.draft_fingerprint.as_deref(),
        )?;
    }
    let running_turn = repository(&state)?
        .list_turns(&task.id)?
        .into_iter()
        .rev()
        .find(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running);
    if let Some(running_turn) = running_turn {
        let recipe_id = snapshot
            .as_ref()
            .map(|value| value.recipe_id.as_str())
            .or(task.active_recipe_id.as_deref());
        let recipe_name = snapshot
            .as_ref()
            .map(|value| value.recipe_name.as_str())
            .or(task.active_recipe_name.as_deref());
        let fingerprint = snapshot
            .as_ref()
            .and_then(|value| value.draft_fingerprint.as_deref())
            .or(task.active_draft_fingerprint.as_deref());
        let state_value = if request.mode == AgentDeliveryMode::Steer {
            AgentQueuedMessageState::Steering
        } else {
            AgentQueuedMessageState::Queued
        };
        let queued = repository(&state)?.enqueue_message(
            &task.id,
            Some(&running_turn.id),
            &running_turn.branch_id,
            &request.content,
            &request.references,
            request.mode,
            state_value,
            &route,
            recipe_id,
            recipe_name,
            fingerprint,
        )?;
        if request.mode == AgentDeliveryMode::Steer
            && let Err(error) =
                steer_running_turn(&state, &task, &running_turn, &request.content).await
        {
            let _ = repository(&state)?.delete_queued_message_any(&queued.id);
            // A racing completion must never lose the user's message.
            if repository(&state)?.get_turn(&running_turn.id)?.status
                != crate::agent_harness::model::TaskOutcome::Running
            {
                repository(&state)?.enqueue_message(
                    &task.id,
                    Some(&running_turn.id),
                    &running_turn.branch_id,
                    &request.content,
                    &request.references,
                    AgentDeliveryMode::Queue,
                    AgentQueuedMessageState::Queued,
                    &route,
                    recipe_id,
                    recipe_name,
                    fingerprint,
                )?;
            } else {
                return Err(error);
            }
        }
        return conversation_view(&state, &task.id);
    }

    task = repository(&state)?.set_task_route(&task.id, &route)?;
    let parent_turn_id = task.active_leaf_turn_id.clone();
    create_harness_turn(
        CreateAgentTurnRequest {
            task_id: task.id.clone(),
            parent_turn_id,
            content: request.content,
            active_recipe_id: task.active_recipe_id.clone(),
            active_draft_fingerprint: None,
            branch_id: None,
        },
        state.clone(),
    )
    .await?;
    conversation_view(&state, &task.id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn edit_agent_queued_message(
    request: EditAgentQueuedMessageRequest,
    state: State<'_, AppState>,
) -> Result<AgentQueuedMessage, CommandError> {
    repository(&state)?
        .update_queued_message(&request.message_id, &request.content, &request.references)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_agent_queued_message(
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    repository(&state)?
        .delete_queued_message(&message_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stop_agent_conversation(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    repository(&state)?.set_queue_paused(&conversation_id, true)?;
    let has_running_turn = repository(&state)?
        .list_turns(&conversation_id)?
        .iter()
        .any(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running);
    if has_running_turn {
        let _ = cancel_harness_task(conversation_id.clone(), state.clone()).await;
    }
    repository(&state)?.interrupt_running_task(&conversation_id)?;
    conversation_view(&state, &conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn resume_agent_queue(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    let task = repository(&state)?.set_queue_paused(&conversation_id, false)?;
    ensure_conversation_writable(&task)?;
    if repository(&state)?
        .list_turns(&conversation_id)?
        .iter()
        .any(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running)
    {
        return conversation_view(&state, &conversation_id);
    }
    let Some(message) = repository(&state)?
        .list_queued_messages(&conversation_id)?
        .into_iter()
        .find(|message| message.state == AgentQueuedMessageState::Queued)
    else {
        return conversation_view(&state, &conversation_id);
    };
    if message.route.engine == AgentEngine::CodexAppServer {
        repository(&state)?.set_queue_paused(&conversation_id, true)?;
        return Err(chatgpt_route_disabled());
    }
    repository(&state)?.set_task_route(&conversation_id, &message.route)?;
    if let Some(recipe_id) = message.recipe_id.as_deref() {
        repository(&state)?.update_task_recipe_context(
            &conversation_id,
            Some(recipe_id),
            message.recipe_name.as_deref(),
            message.draft_fingerprint.as_deref(),
        )?;
    }
    create_harness_turn(
        CreateAgentTurnRequest {
            task_id: conversation_id.clone(),
            parent_turn_id: task.active_leaf_turn_id,
            content: message.content.clone(),
            // The queued message already restored its captured recipe snapshot above.
            // Do not resolve the latest draft again when the queue is resumed.
            active_recipe_id: None,
            active_draft_fingerprint: None,
            branch_id: None,
        },
        state.clone(),
    )
    .await?;
    repository(&state)?.delete_queued_message(&message.id)?;
    conversation_view(&state, &conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn select_agent_branch(
    conversation_id: String,
    turn_id: String,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    repository(&state)?.select_visible_leaf(&conversation_id, &turn_id)?;
    conversation_view(&state, &conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn edit_agent_turn(
    request: EditAgentTurnRequest,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    if request.content.trim().is_empty() {
        return Err(invalid_settings_request("消息内容不能为空"));
    }
    let source = repository(&state)?.get_turn(&request.turn_id)?;
    let source_task = repository(&state)?.get_task(&source.task_id)?;
    ensure_conversation_writable(&source_task)?;
    if source.route.engine == AgentEngine::CodexAppServer {
        return Err(chatgpt_route_disabled());
    }
    if source.status == crate::agent_harness::model::TaskOutcome::Running {
        return Err(CommandError {
            code: "invalid_state".into(),
            message: "请先停止当前回答，再编辑这条消息".into(),
            field: None,
        });
    }
    if repository(&state)?
        .list_turns(&source.task_id)?
        .iter()
        .any(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running)
    {
        return Err(CommandError {
            code: "invalid_state".into(),
            message: "当前回答结束或停止后才能编辑历史消息".into(),
            field: None,
        });
    }
    let mut task = repository(&state)?.get_task(&source.task_id)?;
    let route = current_agent_route(&state).await?;
    task = repository(&state)?.set_task_route(&task.id, &route)?;
    if let Some(recipe_id) = source.recipe_id.as_deref() {
        task = repository(&state)?.update_task_recipe_context(
            &task.id,
            Some(recipe_id),
            source.recipe_name.as_deref(),
            source.draft_fingerprint.as_deref(),
        )?;
    }
    let branch_id = uuid::Uuid::new_v4().to_string();
    match source.route.engine {
        AgentEngine::FoodlabRuntime => {
            let source_session = repository(&state)?
                .branch_runtime_session(&task.id, &source.branch_id, AgentEngine::FoodlabRuntime)?
                .map(|(session, _)| session)
                .or(task.harness_session_id.clone())
                .ok_or_else(|| command_failure("当前会话尚未初始化".into()))?;
            let forked = state
                .harness
                .rpc_with_id(
                    "session.fork",
                    json!({ "sessionId": source_session }),
                    &format!("fork-{}", uuid::Uuid::new_v4()),
                )
                .await
                .map_err(command_failure)?;
            let external = forked
                .get("sessionId")
                .and_then(Value::as_str)
                .ok_or_else(|| command_failure("回答分支创建失败，请重试".into()))?;
            repository(&state)?.bind_branch_runtime_session(
                &task.id,
                &branch_id,
                AgentEngine::FoodlabRuntime,
                external,
                source.parent_turn_id.as_deref(),
            )?;
        }
        AgentEngine::CodexAppServer => {
            let (source_thread, _) = repository(&state)?
                .branch_runtime_session(&task.id, &source.branch_id, AgentEngine::CodexAppServer)?
                .or(repository(&state)?.runtime_session(&task.id, &source.route)?)
                .ok_or_else(|| command_failure("当前会话尚未初始化".into()))?;
            let parent_external = if let Some(turn_id) = source.parent_turn_id.as_deref() {
                repository(&state)?.get_turn(turn_id)?.harness_turn_id
            } else {
                None
            };
            let external = state
                .codex
                .fork_thread(&source_thread, parent_external.as_deref())
                .await
                .map_err(codex_failure)?;
            repository(&state)?.bind_branch_runtime_session(
                &task.id,
                &branch_id,
                AgentEngine::CodexAppServer,
                &external,
                source.parent_turn_id.as_deref(),
            )?;
        }
    }
    create_harness_turn(
        CreateAgentTurnRequest {
            task_id: task.id.clone(),
            parent_turn_id: source.parent_turn_id.clone(),
            content: request.content,
            // Editing branches from the historical turn snapshot instead of today's recipe draft.
            active_recipe_id: None,
            active_draft_fingerprint: None,
            branch_id: Some(branch_id),
        },
        state.clone(),
    )
    .await?;
    conversation_view(&state, &task.id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn bind_agent_recipe(
    conversation_id: String,
    recipe_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<AgentConversationView, CommandError> {
    if let Some(recipe_id) = recipe_id {
        let snapshot = recipe_snapshot(&state, &recipe_id)?;
        repository(&state)?.update_task_recipe_context(
            &conversation_id,
            Some(&snapshot.recipe_id),
            Some(&snapshot.recipe_name),
            snapshot.draft_fingerprint.as_deref(),
        )?;
    } else {
        repository(&state)?.clear_task_recipe_context(&conversation_id)?;
    }
    conversation_view(&state, &conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn resolve_agent_recipe_references(
    query: String,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let summaries = RecipeRepository::open(&state.database_path)?.list_recipe_summaries()?;
    let normalized_query = normalize_recipe_match(&query);
    let mut candidates = summaries
        .into_iter()
        .filter(|summary| summary.recipe.archived_at.is_none())
        .filter_map(|summary| {
            let name = normalize_recipe_match(&summary.recipe.name);
            let code = summary
                .recipe
                .code
                .as_deref()
                .map(normalize_recipe_match)
                .unwrap_or_default();
            let matched = (!name.is_empty() && normalized_query.contains(&name))
                || (!code.is_empty() && normalized_query.contains(&code));
            matched.then_some((name.chars().count().max(code.chars().count()), summary))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.0));
    if let Some(maximum) = candidates.first().map(|candidate| candidate.0) {
        candidates.retain(|candidate| candidate.0 == maximum);
    }
    let matches = candidates
        .into_iter()
        .map(|(_, summary)| {
            json!({
                "recipeId": summary.recipe.id,
                "recipeName": summary.recipe.name,
                "code": summary.recipe.code,
                "productId": summary.recipe.product_id,
                "schemeName": summary.recipe.scheme_name,
                "updatedAt": summary.recipe.updated_at,
            })
        })
        .collect::<Vec<_>>();
    let kind = match matches.len() {
        0 => "none",
        1 => "unique",
        _ => "ambiguous",
    };
    Ok(json!({ "kind": kind, "matches": matches }))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_harness_task(
    request: CreateAgentTaskRequest,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    let route = current_agent_route(&state).await?;
    let workflow = match request.workflow.as_deref() {
        Some(workflow) => parse_workflow(workflow)?,
        None => infer_workflow(
            request.content.as_deref().unwrap_or(&request.title),
            !request.files.is_empty(),
        )?,
    };
    let task = repository(&state)?
        .create_task(
            &request.title,
            &contract_for(workflow),
            request.active_recipe_id.as_deref(),
            None,
        )
        .map_err(CommandError::from)?;
    let mut task = repository(&state)?.set_task_route(&task.id, &route)?;
    if let Some(recipe_id) = request.active_recipe_id.as_deref() {
        let snapshot = recipe_snapshot(&state, recipe_id)?;
        task = repository(&state)?.update_task_recipe_context(
            &task.id,
            Some(&snapshot.recipe_id),
            Some(&snapshot.recipe_name),
            snapshot.draft_fingerprint.as_deref(),
        )?;
    }
    if let Err(error) = create_task_bridge(&state, &task, request.files) {
        let _ = repository(&state)?.update_task_outcome(
            &task.id,
            crate::agent_harness::model::TaskOutcome::Failed,
            Some("task_bridge_failed"),
            Some(&error.message),
        );
        return Err(error);
    }
    let initialized = match route.engine {
        AgentEngine::FoodlabRuntime => ensure_foodlab_session(&state, &task).await,
        AgentEngine::CodexAppServer => Err(chatgpt_route_disabled()),
    };
    match initialized {
        Ok(task) => Ok(task),
        Err(error) => {
            let _ = repository(&state)?.update_task_outcome(
                &task.id,
                crate::agent_harness::model::TaskOutcome::Failed,
                Some("session_initialization_failed"),
                Some(&error.message),
            );
            Err(error)
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn rename_harness_task(
    task_id: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    if title.trim().is_empty() || title.chars().count() > 120 {
        return Err(invalid_settings_request("会话标题无效"));
    }
    repository(&state)?
        .rename_task(&task_id, &title)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn archive_harness_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    let has_running_turn = repository(&state)?
        .list_turns(&task_id)?
        .iter()
        .any(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running);
    if has_running_turn {
        let _ = cancel_harness_task(task_id.clone(), state.clone()).await;
    }
    repository(&state)?
        .archive_task_and_interrupt_running(&task_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn restore_harness_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    repository(&state)?
        .restore_task(&task_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn select_harness_task_model(
    task_id: String,
    engine: AgentEngine,
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    validate_identifier("Provider", &provider)?;
    validate_identifier("模型", &model)?;
    if let Some(value) = reasoning_effort.as_deref() {
        validate_identifier("推理强度", value)?;
    }
    let task = repository(&state)?.get_task(&task_id)?;
    if repository(&state)?
        .list_turns(&task_id)?
        .iter()
        .any(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running)
    {
        return Err(CommandError {
            code: "invalid_state".into(),
            message: "当前回答结束或停止后才能切换模型".into(),
            field: None,
        });
    }
    match engine {
        AgentEngine::FoodlabRuntime => {
            if !usable_model_providers(&state.harness)
                .await?
                .contains(&provider)
            {
                return Err(CommandError {
                    code: "provider_not_configured".into(),
                    message: "请先配置该 Provider，再切换模型".into(),
                    field: None,
                });
            }
            let task = ensure_foodlab_session(&state, &task).await?;
            let session_id = task
                .harness_session_id
                .as_deref()
                .ok_or_else(|| command_failure("当前会话尚未初始化".into()))?;
            let mut payload = json!({
                "sessionId": session_id,
                "provider": provider,
                "model": model,
            });
            if let Some(value) = reasoning_effort.as_deref() {
                payload["reasoningEffort"] = json!(value);
            }
            state
                .harness
                .rpc_with_id(
                    "session.selectModel",
                    payload,
                    &format!("select-conversation-model-{}", uuid::Uuid::new_v4()),
                )
                .await
                .map_err(command_failure)?;
        }
        AgentEngine::CodexAppServer => return Err(chatgpt_route_disabled()),
    }
    repository(&state)?
        .set_task_route(
            &task_id,
            &AgentModelRoute {
                engine,
                provider,
                model,
                reasoning_effort,
            },
        )
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_harness_turn(
    request: CreateAgentTurnRequest,
    state: State<'_, AppState>,
) -> Result<AgentTurn, CommandError> {
    if request.content.trim().is_empty() {
        return Err(command_failure("任务内容不能为空".into()));
    }
    let mut task = repository(&state)?.get_task(&request.task_id)?;
    ensure_conversation_writable(&task)?;
    if let Some(recipe_id) = request.active_recipe_id.as_deref() {
        let snapshot = recipe_snapshot(&state, recipe_id)?;
        task = repository(&state)?.update_task_recipe_context(
            &request.task_id,
            Some(&snapshot.recipe_id),
            Some(&snapshot.recipe_name),
            snapshot.draft_fingerprint.as_deref(),
        )?;
    }
    if task.active_route.provider.trim().is_empty() || task.active_route.model.trim().is_empty() {
        let route = current_agent_route(&state).await?;
        task = repository(&state)?.set_task_route(&task.id, &route)?;
    }
    match task.active_route.engine {
        AgentEngine::FoodlabRuntime => {
            ensure_model_route_usable(&state.harness, &task.active_route).await?;
            task = match ensure_foodlab_session(&state, &task).await {
                Ok(task) => task,
                Err(error) => {
                    let _ = repository(&state)?.update_task_outcome(
                        &task.id,
                        crate::agent_harness::model::TaskOutcome::Failed,
                        Some("session_initialization_failed"),
                        Some(&error.message),
                    );
                    return Err(error);
                }
            };
        }
        AgentEngine::CodexAppServer => return Err(chatgpt_route_disabled()),
    }
    let sends_images = repository(&state)?.list_turns(&request.task_id)?.is_empty()
        && task_has_image_attachments(&state, &task)?;
    let image_capability = if sends_images {
        current_model_image_capability(&state, &task.active_route).await
    } else {
        ModelImageCapability::Unknown
    };
    if sends_images && image_capability == ModelImageCapability::Unsupported {
        return Err(CommandError {
            code: "model_does_not_support_images".into(),
            message: "当前模型仅支持文本，不能读取图片。请切换到标注为“支持图片”的模型后重试"
                .into(),
            field: None,
        });
    }
    let parent_turn_id = request
        .parent_turn_id
        .as_deref()
        .or(task.active_leaf_turn_id.as_deref());
    let branch_id = request.branch_id.clone().unwrap_or_else(|| {
        parent_turn_id
            .and_then(|parent| repository(&state).ok()?.get_turn(parent).ok())
            .map(|turn| turn.branch_id)
            .unwrap_or_else(|| "root".into())
    });
    let turn = repository(&state)?.create_turn_with_snapshot(
        &request.task_id,
        parent_turn_id,
        &request.content,
        &task.active_route,
        &branch_id,
        task.active_recipe_id.as_deref(),
        task.active_recipe_name.as_deref(),
        task.active_draft_fingerprint.as_deref(),
    )?;
    repository(&state)?.update_task_outcome(
        &task.id,
        crate::agent_harness::model::TaskOutcome::Running,
        None,
        None,
    )?;
    let prompt = render_task_prompt(&task, &turn, &request.content)?;
    let synchronized_prompt = format!(
        "{}{}",
        runtime_context_prefix(&repository(&state)?, &task, &turn)?,
        prompt,
    );
    match task.active_route.engine {
        AgentEngine::FoodlabRuntime => {
            let session_id = repository(&state)?
                .branch_runtime_session(&task.id, &turn.branch_id, AgentEngine::FoodlabRuntime)?
                .map(|(session_id, _)| session_id)
                .or(task.harness_session_id.clone())
                .ok_or_else(|| command_failure("当前任务尚未初始化".into()))?;
            if let Err(message) =
                select_foodlab_session_route(&state.harness, &session_id, &task.active_route).await
            {
                return fail_turn(&state, &task, &turn, "model_route_failed", &message);
            }
            let prompt_content = task_prompt_content(&state, &task, &synchronized_prompt)?;
            match state
                .harness
                .rpc_with_id(
                    "session.prompt",
                    json!({
                        "sessionId": session_id,
                        "mode": "queue",
                        "content": prompt_content,
                    }),
                    &turn.id,
                )
                .await
            {
                Ok(_) => Ok(turn),
                Err(message) => {
                    if sends_images
                        && image_capability == ModelImageCapability::Unknown
                        && is_model_image_unsupported_message(&message)
                    {
                        let _ = cache_model_image_capability(
                            &state,
                            &task.active_route,
                            ModelImageCapability::Unsupported,
                        )
                        .await;
                    }
                    fail_turn(
                        &state,
                        &task,
                        &turn,
                        prompt_failure_code(&message),
                        &message,
                    )
                }
            }
        }
        AgentEngine::CodexAppServer => Err(chatgpt_route_disabled()),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn sync_harness_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    let task = repository(&state)?.get_task(&task_id)?;
    if task.active_route.engine == AgentEngine::CodexAppServer {
        return Ok(task);
    }
    let sends_images = task_has_image_attachments(&state, &task).unwrap_or(false);
    let image_capability = if sends_images {
        current_model_image_capability(&state, &task.active_route).await
    } else {
        ModelImageCapability::Unknown
    };
    let active_branch = if let Some(turn_id) = task.active_leaf_turn_id.as_deref() {
        repository(&state)?.get_turn(turn_id)?.branch_id
    } else {
        "root".into()
    };
    let session_id = repository(&state)?
        .branch_runtime_session(&task_id, &active_branch, AgentEngine::FoodlabRuntime)?
        .map(|(session, _)| session)
        .or(task.harness_session_id)
        .ok_or_else(|| command_failure("当前任务尚未初始化".into()))?;
    let entries = fetch_complete_history(&state.harness, &session_id).await?;
    let updated = ingest_history(&mut repository(&state)?, &task_id, &entries)?;
    if sends_images && image_capability == ModelImageCapability::Unknown {
        match updated.status {
            crate::agent_harness::model::TaskOutcome::Completed
            | crate::agent_harness::model::TaskOutcome::NeedsInput
            | crate::agent_harness::model::TaskOutcome::NeedsReview => {
                let _ = cache_model_image_capability(
                    &state,
                    &task.active_route,
                    ModelImageCapability::Supported,
                )
                .await;
            }
            crate::agent_harness::model::TaskOutcome::Failed
                if updated
                    .error_summary
                    .as_deref()
                    .is_some_and(is_model_image_unsupported_message) =>
            {
                let _ = cache_model_image_capability(
                    &state,
                    &task.active_route,
                    ModelImageCapability::Unsupported,
                )
                .await;
            }
            _ => {}
        }
    }
    if updated.status != crate::agent_harness::model::TaskOutcome::Running {
        let _ = repository(&state)?.clear_steering_messages(&task_id);
    }
    if let Some(last) = repository(&state)?
        .list_turns(&task_id)?
        .into_iter()
        .rev()
        .find(|turn| turn.status != crate::agent_harness::model::TaskOutcome::Running)
    {
        let _ = repository(&state)?.bind_runtime_session(
            &task_id,
            &task.active_route,
            &session_id,
            Some(&last.id),
        );
        let _ = repository(&state)?.bind_branch_runtime_session(
            &task_id,
            &active_branch,
            AgentEngine::FoodlabRuntime,
            &session_id,
            Some(&last.id),
        );
    }
    Ok(updated)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_harness_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<AgentTask, CommandError> {
    let task = repository(&state)?.get_task(&task_id)?;
    if task.active_route.engine == AgentEngine::CodexAppServer {
        if let Some(turn) = repository(&state)?
            .list_turns(&task_id)?
            .into_iter()
            .rev()
            .find(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running)
        {
            let external_thread = repository(&state)?
                .branch_runtime_session(&task_id, &turn.branch_id, AgentEngine::CodexAppServer)?
                .or(repository(&state)?.runtime_session(&task_id, &turn.route)?);
            if let (Some(external_turn_id), Some((external_thread_id, _))) =
                (turn.harness_turn_id.as_deref(), external_thread)
            {
                state
                    .codex
                    .interrupt(&external_thread_id, external_turn_id)
                    .await
                    .map_err(codex_failure)?;
            }
            let blocks = turn.content_blocks.clone();
            repository(&state)?.settle_turn(
                &turn.id,
                crate::agent_harness::model::TaskOutcome::Cancelled,
                &blocks,
            )?;
        }
        return repository(&state)?
            .update_task_outcome(
                &task_id,
                crate::agent_harness::model::TaskOutcome::Cancelled,
                None,
                None,
            )
            .map_err(Into::into);
    }
    let running_branch = repository(&state)?
        .list_turns(&task_id)?
        .into_iter()
        .rev()
        .find(|turn| turn.status == crate::agent_harness::model::TaskOutcome::Running)
        .map(|turn| turn.branch_id)
        .unwrap_or_else(|| "root".into());
    let session_id = repository(&state)?
        .branch_runtime_session(&task_id, &running_branch, AgentEngine::FoodlabRuntime)?
        .map(|(session, _)| session)
        .or(task.harness_session_id)
        .ok_or_else(|| command_failure("当前任务尚未初始化".into()))?;
    state
        .harness
        .rpc_with_id(
            "session.cancel",
            json!({ "sessionId": session_id }),
            &format!("cancel-{task_id}"),
        )
        .await
        .map_err(command_failure)?;
    sync_harness_task(task_id, state).await
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_harness_turns(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentTurn>, CommandError> {
    repository(&state)?.list_turns(&task_id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_harness_events(
    task_id: String,
    after_seq: i64,
    state: State<'_, AppState>,
) -> Result<Vec<AgentTaskEvent>, CommandError> {
    repository(&state)?
        .list_events(&task_id, after_seq)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_harness_artifacts(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ArtifactManifest>, CommandError> {
    let repository = repository(&state)?;
    let mut artifacts = repository.list_artifacts(&task_id)?;
    let legacy_bridge = repository.legacy_bridge(&task_id);
    drop(repository);

    if let Ok((run_id, import_job_id)) = legacy_bridge {
        let draft_ids = state.coordinator.lock().ok().and_then(|coordinator| {
            coordinator.as_ref().and_then(|coordinator| {
                coordinator
                    .list_drafts(&import_job_id)
                    .ok()
                    .map(|drafts| drafts.into_iter().map(|draft| draft.id).collect::<Vec<_>>())
            })
        });
        if let Some(draft_ids) = draft_ids {
            reconcile_legacy_ingredient_artifact_refs(&mut artifacts, &draft_ids);
        }
        let proposals =
            AgentRecipeRepository::open(&state.database_path)?.list_proposals_for_run(&run_id)?;
        reconcile_legacy_recipe_artifact_refs(&mut artifacts, &proposals);
    }

    Ok(artifacts)
}

fn reconcile_legacy_recipe_artifact_refs(
    artifacts: &mut [ArtifactManifest],
    proposals_by_position: &[AgentRecipeProposal],
) {
    let mut proposals = proposals_by_position.iter();
    for artifact in artifacts.iter_mut().filter(|artifact| {
        artifact.kind == "recipe_proposal"
            && artifact.provenance.get("tool").and_then(Value::as_str)
                == Some("create_recipe_proposal")
    }) {
        let Some(proposal) = proposals.next() else {
            artifact.domain_ref = None;
            artifact.status = crate::agent_harness::model::ArtifactStatus::Stale;
            artifact.title = "未生成有效配方提案".into();
            continue;
        };
        artifact.domain_ref = Some(format!("recipe_proposal:{}", proposal.id));
        artifact.title = format!("配方提案 · {}", proposal.payload.product_name);
        artifact.status = match proposal.status {
            AgentRecipeProposalStatus::PendingReview => {
                crate::agent_harness::model::ArtifactStatus::NeedsReview
            }
            AgentRecipeProposalStatus::Accepted => {
                crate::agent_harness::model::ArtifactStatus::Accepted
            }
            AgentRecipeProposalStatus::Discarded => {
                crate::agent_harness::model::ArtifactStatus::Rejected
            }
        };
    }
}

fn reconcile_legacy_ingredient_artifact_refs(
    artifacts: &mut [ArtifactManifest],
    draft_ids_by_position: &[String],
) {
    let create_artifacts = artifacts.iter_mut().filter(|artifact| {
        artifact.kind == "ingredient_import_draft"
            && artifact.provenance.get("tool").and_then(Value::as_str)
                == Some("create_ingredient_import_draft")
    });
    for (artifact, draft_id) in create_artifacts.zip(draft_ids_by_position) {
        artifact.domain_ref = Some(format!("ingredient_import_draft:{draft_id}"));
    }
}

#[tauri::command]
pub fn preview_legacy_agent_reset(
    state: State<'_, AppState>,
) -> Result<LegacyResetPreview, CommandError> {
    LegacyAgentReset::open(&state.database_path, state.attachment_root.clone())?
        .preview()
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn execute_legacy_agent_reset(
    preview_id: String,
    confirmation_phrase: String,
    state: State<'_, AppState>,
) -> Result<LegacyResetResult, CommandError> {
    let preview = LegacyAgentReset::open(&state.database_path, state.attachment_root.clone())?
        .stored_preview(&preview_id)?;
    let mut result = LegacyAgentReset::open(&state.database_path, state.attachment_root.clone())?
        .execute(&preview_id, &confirmation_phrase)?;
    result.cleared_keychain_accounts = 0;
    for account in preview.keychain_accounts {
        match state
            .provider_secrets
            .delete(crate::agent::providers::CREDENTIAL_SERVICE, &account)
        {
            Ok(()) => result.cleared_keychain_accounts += 1,
            Err(error) => result
                .cleanup_failures
                .push(format!("凭据 {account}：{}", error.message())),
        }
    }
    Ok(result)
}

fn parse_workflow(value: &str) -> Result<Workflow, CommandError> {
    match value {
        "ingredient_import" => Ok(Workflow::IngredientImport),
        "recipe_import" => Ok(Workflow::RecipeImport),
        "recipe_proposal" => Ok(Workflow::RecipeProposal),
        "recipe_analysis" => Ok(Workflow::RecipeAnalysis),
        "recipe_estimate" => Ok(Workflow::RecipeEstimate),
        "label_compliance" => Ok(Workflow::LabelCompliance),
        "version_reporting" => Ok(Workflow::VersionReporting),
        "local_knowledge" => Ok(Workflow::LocalKnowledge),
        _ => Err(command_failure("未知的 FoodLab 任务工作流".into())),
    }
}

fn validate_settings_call(method: &str, payload: Value) -> Result<Value, CommandError> {
    match method {
        "llm.providers" => Ok(json!({})),
        "llm.models" | "llm.discoverModels" => {
            payload
                .as_object()
                .filter(|value| value.len() <= 12)
                .ok_or_else(|| invalid_settings_request("模型请求无效"))?;
            validate_model_request(&payload)?;
            Ok(payload)
        }
        // The upstream contract always returns a redacted settings view and
        // accepts an empty request object only.
        "settings.describe" => Ok(json!({})),
        "settings.mutate" => validate_settings_mutation(payload),
        "credentials.describe" => validate_credential_describe(payload),
        "credentials.set" => validate_credential_write(payload, true),
        "credentials.unset" => validate_credential_write(payload, false),
        _ => Err(invalid_settings_request("不允许调用该模型设置方法")),
    }
}

fn validate_model_request(payload: &Value) -> Result<(), CommandError> {
    let object = payload
        .as_object()
        .ok_or_else(|| invalid_settings_request("模型请求无效"))?;
    let allowed = [
        "settingsNs",
        "provider",
        "baseURL",
        "api",
        "apiKey",
        "sessionId",
    ];
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid_settings_request("模型请求包含不允许的字段"));
    }
    for (key, value) in object {
        let text = value
            .as_str()
            .ok_or_else(|| invalid_settings_request("模型请求字段无效"))?;
        if text.is_empty() || text.len() > 16 * 1024 || text.chars().any(char::is_control) {
            return Err(invalid_settings_request("模型请求字段无效"));
        }
        if key == "apiKey" && !text.bytes().all(|byte| (0x21..=0x7e).contains(&byte)) {
            return Err(invalid_settings_request("API Key 格式无效"));
        }
    }
    Ok(())
}

fn validate_settings_mutation(payload: Value) -> Result<Value, CommandError> {
    let object = payload
        .as_object()
        .ok_or_else(|| invalid_settings_request("模型设置请求无效"))?;
    let namespace = object
        .get("ns")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_settings_request("模型设置缺少命名空间"))?;
    if !matches!(namespace, "llm-deepseek" | "llm-pi-ai") {
        return Err(invalid_settings_request("不允许修改该设置区域"));
    }
    let operations = object
        .get("ops")
        .and_then(Value::as_array)
        .filter(|ops| !ops.is_empty() && ops.len() <= 100)
        .ok_or_else(|| invalid_settings_request("模型设置操作无效"))?;
    for operation in operations {
        let operation = operation
            .as_object()
            .ok_or_else(|| invalid_settings_request("模型设置操作无效"))?;
        let kind = operation
            .get("op")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_settings_request("模型设置操作无效"))?;
        if !matches!(kind, "set" | "unset") {
            return Err(invalid_settings_request("不允许执行该设置操作"));
        }
        let path = operation
            .get("path")
            .and_then(Value::as_array)
            .filter(|path| path.len() <= 12)
            .ok_or_else(|| invalid_settings_request("模型设置路径无效"))?;
        if path.iter().any(|part| {
            part.as_str().is_none_or(|part| {
                part.is_empty() || part.len() > 128 || part.chars().any(char::is_control)
            })
        }) {
            return Err(invalid_settings_request("模型设置路径无效"));
        }
        if kind == "set" {
            let value = operation
                .get("value")
                .ok_or_else(|| invalid_settings_request("模型设置缺少值"))?;
            reject_literal_secrets(value)?;
        }
    }
    Ok(payload)
}

fn reject_literal_secrets(value: &Value) -> Result<(), CommandError> {
    match value {
        Value::Array(values) => {
            for value in values {
                reject_literal_secrets(value)?;
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if key.eq_ignore_ascii_case("apiKey")
                    || key.eq_ignore_ascii_case("token")
                    || key.eq_ignore_ascii_case("password")
                {
                    return Err(invalid_settings_request("密钥只能通过只写凭据接口保存"));
                }
                reject_literal_secrets(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_credential_describe(payload: Value) -> Result<Value, CommandError> {
    let refs = payload
        .get("refs")
        .and_then(Value::as_array)
        .filter(|refs| refs.len() <= 100)
        .ok_or_else(|| invalid_settings_request("凭据查询无效"))?;
    for reference in refs {
        validate_credential_ref(
            reference
                .as_str()
                .ok_or_else(|| invalid_settings_request("凭据引用无效"))?,
        )?;
    }
    Ok(payload)
}

fn validate_credential_write(payload: Value, requires_value: bool) -> Result<Value, CommandError> {
    let reference = payload
        .get("ref")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_settings_request("凭据引用无效"))?;
    validate_credential_ref(reference)?;
    if requires_value {
        let value = payload
            .get("value")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_settings_request("API Key 无效"))?;
        if value.is_empty()
            || value.len() > 16 * 1024
            || !value.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
        {
            return Err(invalid_settings_request("API Key 格式无效"));
        }
    }
    Ok(payload)
}

fn validate_credential_ref(value: &str) -> Result<(), CommandError> {
    let mut chars = value.chars();
    let valid_start = chars
        .next()
        .is_some_and(|value| value == '_' || value.is_ascii_uppercase());
    if !valid_start
        || value.len() > 128
        || !chars.all(|value| value == '_' || value.is_ascii_uppercase() || value.is_ascii_digit())
    {
        return Err(invalid_settings_request("凭据引用无效"));
    }
    Ok(())
}

fn validate_identifier(field: &str, value: &str) -> Result<(), CommandError> {
    if value.trim().is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(invalid_settings_request(&format!("{field} 无效")));
    }
    Ok(())
}

async fn ensure_model_settings_session(
    host: &crate::agent_harness::host::HarnessHost,
) -> Result<Value, CommandError> {
    let request_id = format!("models-{}", uuid::Uuid::new_v4());
    if let Ok(value) = host
        .rpc_with_id(
            "session.models",
            json!({ "sessionId": MODEL_SETTINGS_SESSION_ID }),
            &request_id,
        )
        .await
    {
        return Ok(value);
    }
    let _ = host
        .rpc_with_id(
            "session.create",
            json!({
                "sessionId": MODEL_SETTINGS_SESSION_ID,
                "agentPreset": "foodlab",
            }),
            &format!("models-session-{}", uuid::Uuid::new_v4()),
        )
        .await;
    host.rpc_with_id(
        "session.models",
        json!({ "sessionId": MODEL_SETTINGS_SESSION_ID }),
        &format!("models-reload-{}", uuid::Uuid::new_v4()),
    )
    .await
    .map_err(command_failure)
}

fn normalize_model_directory(directory: &mut Value) {
    let Some(object) = directory.as_object_mut() else {
        return;
    };
    if let Some(groups) = object.get_mut("groups").and_then(Value::as_array_mut) {
        for group in groups {
            let Some(group) = group.as_object_mut() else {
                continue;
            };
            if let Some(id) = group.remove("id") {
                group.insert("provider".into(), id);
            }
            if let Some(name) = group.remove("name") {
                group.insert("displayName".into(), name);
            }
        }
    }
    if let Some(failures) = object.get_mut("failures").and_then(Value::as_array_mut) {
        for failure in failures {
            let Some(failure) = failure.as_object_mut() else {
                continue;
            };
            if let Some(id) = failure.remove("id") {
                failure.insert("provider".into(), id);
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ModelImageCapability {
    Supported,
    Unsupported,
    Unknown,
}

#[derive(Default)]
struct ModelCapabilityContext {
    base_urls: BTreeMap<String, String>,
    cache: BTreeMap<String, ModelImageCapability>,
}

async fn model_capability_context(
    host: &crate::agent_harness::host::HarnessHost,
    database_path: &std::path::Path,
) -> ModelCapabilityContext {
    let mut context = ModelCapabilityContext::default();
    if let (Ok(providers), Ok(settings)) = (
        host.rpc_with_id(
            "llm.providers",
            json!({}),
            &format!("capability-providers-{}", uuid::Uuid::new_v4()),
        )
        .await,
        host.rpc_with_id(
            "settings.describe",
            json!({}),
            &format!("capability-settings-{}", uuid::Uuid::new_v4()),
        )
        .await,
    ) {
        context.base_urls = provider_base_urls(&providers, &settings);
    }
    if let Ok(repository) = IngredientRepository::open(database_path)
        && let Ok(Some(Value::Object(values))) =
            repository.get_setting(MODEL_CAPABILITY_CACHE_SETTING)
    {
        context.cache = values
            .into_iter()
            .filter_map(|(key, value)| match value.as_str() {
                Some("image") => Some((key, ModelImageCapability::Supported)),
                Some("text") => Some((key, ModelImageCapability::Unsupported)),
                _ => None,
            })
            .collect();
    }
    context
}

fn provider_base_urls(providers: &Value, settings: &Value) -> BTreeMap<String, String> {
    let namespaces = settings
        .get("namespaces")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    providers
        .get("providers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let provider = entry.get("provider")?.as_str()?;
            let namespace = entry.get("settingsNs")?.as_str()?;
            let path = entry
                .get("settingsPath")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let section = namespaces
                .iter()
                .find(|value| value.get("ns").and_then(Value::as_str) == Some(namespace))?
                .get("value")?;
            let profile = value_at_path(section, &path)?;
            Some((
                provider.to_string(),
                profile
                    .get("baseURL")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim_end_matches('/')
                    .to_ascii_lowercase(),
            ))
        })
        .collect()
}

fn annotate_model_capabilities(directory: &mut Value, context: &ModelCapabilityContext) {
    let Some(groups) = directory.get_mut("groups").and_then(Value::as_array_mut) else {
        return;
    };
    for group in groups {
        let Some(group) = group.as_object_mut() else {
            continue;
        };
        let provider = group
            .get("provider")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let base_url = context
            .base_urls
            .get(&provider)
            .map(String::as_str)
            .unwrap_or("");
        let Some(models) = group.get_mut("models").and_then(Value::as_array_mut) else {
            continue;
        };
        for model in models {
            let Some(model) = model.as_object_mut() else {
                continue;
            };
            let id = model
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let key = model_capability_key(&provider, base_url, &id);
            let catalog = declared_image_capability(model)
                .or_else(|| bundled_image_capability(&provider, &id));
            let (capability, status, source) = if let Some(capability) = catalog {
                (capability, "known", "catalog")
            } else if let Some(capability) = context.cache.get(&key).copied() {
                (capability, "probed", "runtime_probe")
            } else {
                (ModelImageCapability::Unknown, "unknown", "unknown")
            };
            let modalities = match capability {
                ModelImageCapability::Supported => json!(["text", "image"]),
                ModelImageCapability::Unsupported | ModelImageCapability::Unknown => {
                    json!(["text"])
                }
            };
            model.insert("inputModalities".into(), modalities);
            model.insert("capabilityStatus".into(), json!(status));
            model.insert("capabilitySource".into(), json!(source));
            model.insert("capabilityKey".into(), json!(key));
        }
    }
}

fn declared_image_capability(
    model: &serde_json::Map<String, Value>,
) -> Option<ModelImageCapability> {
    let modalities = model
        .get("inputModalities")
        .or_else(|| model.get("input_modalities"))?
        .as_array()?;
    if modalities
        .iter()
        .any(|value| value.as_str() == Some("image"))
    {
        Some(ModelImageCapability::Supported)
    } else if modalities
        .iter()
        .any(|value| value.as_str() == Some("text"))
    {
        Some(ModelImageCapability::Unsupported)
    } else {
        None
    }
}

fn bundled_image_capability(provider: &str, model: &str) -> Option<ModelImageCapability> {
    let provider = provider.to_ascii_lowercase();
    let model = model.to_ascii_lowercase();
    if (provider.contains("deepseek") && model.starts_with("deepseek-v4"))
        || matches!(
            model.as_str(),
            "kimi-k2-0711-preview"
                | "kimi-k2-0905-preview"
                | "kimi-k2-thinking"
                | "kimi-k2-thinking-turbo"
                | "kimi-k2-turbo-preview"
                | "gpt-4"
                | "o3-mini"
        )
    {
        return Some(ModelImageCapability::Unsupported);
    }
    if model.starts_with("kimi-k2.5")
        || model.starts_with("kimi-k2.6")
        || model.starts_with("kimi-k2.7")
        || model.starts_with("kimi-k3")
    {
        return Some(ModelImageCapability::Supported);
    }
    None
}

fn model_capability_key(provider: &str, base_url: &str, model: &str) -> String {
    let identity = format!(
        "{}\0{}\0{}",
        provider.trim().to_ascii_lowercase(),
        base_url.trim_end_matches('/').to_ascii_lowercase(),
        model.trim().to_ascii_lowercase(),
    );
    hex::encode(Sha256::digest(identity.as_bytes()))
}

async fn current_model_image_capability(
    state: &State<'_, AppState>,
    route: &AgentModelRoute,
) -> ModelImageCapability {
    let Ok(mut directory) = ensure_model_settings_session(&state.harness).await else {
        return bundled_image_capability(&route.provider, &route.model)
            .unwrap_or(ModelImageCapability::Unknown);
    };
    normalize_model_directory(&mut directory);
    let context = model_capability_context(&state.harness, &state.database_path).await;
    annotate_model_capabilities(&mut directory, &context);
    directory
        .get("groups")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|group| group.get("provider").and_then(Value::as_str) == Some(&route.provider))
        .and_then(|group| group.get("models").and_then(Value::as_array))
        .into_iter()
        .flatten()
        .find(|model| model.get("id").and_then(Value::as_str) == Some(&route.model))
        .map(|model| {
            if model
                .get("inputModalities")
                .and_then(Value::as_array)
                .is_some_and(|values| values.iter().any(|value| value.as_str() == Some("image")))
            {
                ModelImageCapability::Supported
            } else if model.get("capabilityStatus").and_then(Value::as_str) != Some("unknown") {
                ModelImageCapability::Unsupported
            } else {
                ModelImageCapability::Unknown
            }
        })
        .unwrap_or(ModelImageCapability::Unknown)
}

async fn cache_model_image_capability(
    state: &State<'_, AppState>,
    route: &AgentModelRoute,
    capability: ModelImageCapability,
) -> Result<(), CommandError> {
    let context = model_capability_context(&state.harness, &state.database_path).await;
    let base_url = context
        .base_urls
        .get(&route.provider)
        .map(String::as_str)
        .unwrap_or("");
    let key = model_capability_key(&route.provider, base_url, &route.model);
    let mut values = context
        .cache
        .into_iter()
        .map(|(key, value)| {
            let value = match value {
                ModelImageCapability::Supported => "image",
                ModelImageCapability::Unsupported => "text",
                ModelImageCapability::Unknown => "unknown",
            };
            (key, json!(value))
        })
        .collect::<serde_json::Map<_, _>>();
    values.insert(
        key,
        json!(match capability {
            ModelImageCapability::Supported => "image",
            ModelImageCapability::Unsupported => "text",
            ModelImageCapability::Unknown => "unknown",
        }),
    );
    IngredientRepository::open(&state.database_path)?
        .set_setting(MODEL_CAPABILITY_CACHE_SETTING, &Value::Object(values))?;
    Ok(())
}

fn task_has_image_attachments(
    state: &State<'_, AppState>,
    task: &AgentTask,
) -> Result<bool, CommandError> {
    let (_, job_id) = repository(state)?.legacy_bridge(&task.id)?;
    let coordinator =
        IngredientIngestCoordinator::open(&state.database_path, &state.attachment_root)?;
    Ok(coordinator
        .list_job_attachments(&job_id)?
        .iter()
        .any(|attachment| attachment.media_type.starts_with("image/")))
}

fn is_model_image_unsupported_message(message: &str) -> bool {
    let diagnostic = message.to_ascii_lowercase();
    diagnostic.contains("model_does_not_support_images")
        || diagnostic.contains("模型仅支持文本")
        || (diagnostic.contains("model")
            && diagnostic.contains("support")
            && diagnostic.contains("image"))
}

fn prompt_failure_code(message: &str) -> &'static str {
    if is_model_image_unsupported_message(message) {
        "model_does_not_support_images"
    } else if message.contains("超过当前模型允许的大小") {
        "attachment_too_large"
    } else if message.contains("图片数量超出限制") {
        "attachment_too_many"
    } else if message.contains("尺寸或总像素超出限制") {
        "attachment_dimensions_exceeded"
    } else if message.contains("图片格式与文件内容不匹配") {
        "attachment_unsupported_format"
    } else if message.contains("图片损坏或无法读取") {
        "attachment_corrupt"
    } else if message.contains("附件未能完成校验或发送") {
        "attachment_read_failed"
    } else if message.contains("密钥") {
        "provider_auth_failed"
    } else if message.contains("网络") || message.contains("连接") || message.contains("超时")
    {
        "provider_network_unavailable"
    } else {
        "prompt_failed"
    }
}

async fn usable_model_providers(
    host: &crate::agent_harness::host::HarnessHost,
) -> Result<BTreeSet<String>, CommandError> {
    let providers = host
        .rpc_with_id(
            "llm.providers",
            json!({}),
            &format!("providers-ready-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let settings = host
        .rpc_with_id(
            "settings.describe",
            json!({}),
            &format!("settings-ready-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let referenced = provider_credential_candidates(&providers, &settings);
    let mut usable = BTreeSet::new();
    if referenced.is_empty() {
        return Ok(usable);
    }
    let refs = referenced
        .iter()
        .map(|(_, reference)| reference.clone())
        .collect::<BTreeSet<_>>();
    let credentials = host
        .rpc_with_id(
            "credentials.describe",
            json!({ "refs": refs }),
            &format!("credentials-ready-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    let credentials = credentials.get("credentials").and_then(Value::as_object);
    for (provider, reference) in referenced {
        if credentials
            .and_then(|values| values.get(&reference))
            .and_then(|value| value.get("configured"))
            .and_then(Value::as_bool)
            == Some(true)
        {
            usable.insert(provider);
        }
    }
    Ok(usable)
}

fn provider_credential_candidates(providers: &Value, settings: &Value) -> Vec<(String, String)> {
    let namespaces = settings
        .get("namespaces")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut referenced = Vec::new();
    for provider in providers
        .get("providers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if provider.get("active").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(provider_id) = provider.get("provider").and_then(Value::as_str) else {
            continue;
        };
        let Some(namespace) = provider.get("settingsNs").and_then(Value::as_str) else {
            continue;
        };
        let path = provider
            .get("settingsPath")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let Some(section) = namespaces
            .iter()
            .find(|value| value.get("ns").and_then(Value::as_str) == Some(namespace))
            .and_then(|value| value.get("value"))
        else {
            continue;
        };
        let Some(profile) = value_at_path(section, &path) else {
            continue;
        };
        match profile.get("apiKeyEnv").and_then(Value::as_str) {
            Some(reference) if !reference.is_empty() => {
                referenced.push((provider_id.to_string(), reference.to_string()));
            }
            _ => {}
        }
    }
    referenced
}

async fn ensure_model_route_usable(
    host: &crate::agent_harness::host::HarnessHost,
    route: &AgentModelRoute,
) -> Result<(), CommandError> {
    let usable = usable_model_providers(host).await?;
    if !route.provider.trim().is_empty()
        && !route.model.trim().is_empty()
        && usable.contains(&route.provider)
    {
        return Ok(());
    }
    Err(CommandError {
        code: "provider_not_configured".into(),
        message: "当前会话所选 Provider 尚未配置，请先在模型设置中保存 API Key".into(),
        field: None,
    })
}

async fn select_foodlab_session_route(
    host: &crate::agent_harness::host::HarnessHost,
    session_id: &str,
    route: &AgentModelRoute,
) -> Result<(), String> {
    let mut payload = json!({
        "sessionId": session_id,
        "provider": route.provider,
        "model": route.model,
    });
    if let Some(value) = route.reasoning_effort.as_deref() {
        payload["reasoningEffort"] = json!(value);
    }
    host.rpc_with_id(
        "session.selectModel",
        payload,
        &format!("select-turn-model-{}", uuid::Uuid::new_v4()),
    )
    .await
    .map(|_| ())
}

async fn current_foodlab_route(
    host: &crate::agent_harness::host::HarnessHost,
) -> Result<AgentModelRoute, CommandError> {
    let directory = ensure_model_settings_session(host).await?;
    let provider = directory
        .pointer("/current/provider")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_settings_request("尚未选择默认 Provider"))?;
    let model = directory
        .pointer("/current/model")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_settings_request("尚未选择默认模型"))?;
    let usable = usable_model_providers(host).await?;
    if directory.get("routable").and_then(Value::as_bool) != Some(true)
        || !usable.contains(provider)
    {
        return Err(CommandError {
            code: "provider_not_configured".into(),
            message: "请先在模型设置中配置 Provider、API Key 和默认模型".into(),
            field: None,
        });
    }
    Ok(AgentModelRoute {
        engine: AgentEngine::FoodlabRuntime,
        provider: provider.to_string(),
        model: model.to_string(),
        reasoning_effort: directory
            .pointer("/current/reasoningEffort")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn infer_workflow(content: &str, has_files: bool) -> Result<Workflow, CommandError> {
    let workflow = if contains_any(
        content,
        &["加入配方", "录入配方", "导入配方", "读取配方", "配方表"],
    ) {
        Workflow::RecipeImport
    } else if contains_any(
        content,
        &["加入原料", "录入原料", "导入原料", "读取原料", "原料表"],
    ) {
        Workflow::IngredientImport
    } else if contains_any(content, &["标签", "法规", "合规", "营养成分表"]) {
        Workflow::LabelCompliance
    } else if contains_any(content, &["甜度", "估算", "参考卡", "指标"]) {
        Workflow::RecipeEstimate
    } else if contains_any(content, &["对比", "提案", "替代", "优化配方", "生成配方"])
    {
        Workflow::RecipeProposal
    } else if contains_any(content, &["营养", "成本", "计算", "分析配方"]) {
        Workflow::RecipeAnalysis
    } else if has_files && contains_any(content, &["配方"]) {
        Workflow::RecipeImport
    } else if has_files && contains_any(content, &["原料"]) {
        Workflow::IngredientImport
    } else if contains_any(content, &["版本", "报告", "导出"]) {
        Workflow::VersionReporting
    } else if has_files {
        return Err(CommandError {
            code: "attachment_purpose_required".into(),
            message: "请说明附件用途，例如“导入原料”或“导入配方”，本次尚未创建 Agent 会话。".into(),
            field: None,
        });
    } else {
        Workflow::LocalKnowledge
    };
    Ok(workflow)
}

fn contains_any(content: &str, keywords: &[&str]) -> bool {
    let normalized = content.to_lowercase();
    keywords.iter().any(|keyword| normalized.contains(keyword))
}

fn conversation_view(
    state: &State<'_, AppState>,
    conversation_id: &str,
) -> Result<AgentConversationView, CommandError> {
    let repository = repository(state)?;
    let conversation = repository.get_task(conversation_id)?;
    let active_turns = repository.list_active_turns(conversation_id)?;
    let queued_messages = repository.list_queued_messages(conversation_id)?;
    let queue_paused = conversation.queue_paused;
    Ok(AgentConversationView {
        conversation,
        active_turns,
        queued_messages,
        queue_paused,
    })
}

struct RecipeSnapshot {
    recipe_id: String,
    recipe_name: String,
    draft_fingerprint: Option<String>,
}

fn recipe_snapshot(
    state: &State<'_, AppState>,
    recipe_id: &str,
) -> Result<RecipeSnapshot, CommandError> {
    let repository = RecipeRepository::open(&state.database_path)?;
    let recipe = repository.get_recipe(recipe_id)?;
    if recipe.archived_at.is_some() {
        return Err(CommandError {
            code: "recipe_unavailable".into(),
            message: "该配方已归档，请重新选择一个可用配方".into(),
            field: None,
        });
    }
    let draft_fingerprint = repository
        .get_draft(recipe_id)?
        .map(|draft| {
            let bytes = serde_json::to_vec(&json!({
                "id": draft.id,
                "payloadVersion": draft.payload_version,
                "payload": draft.payload,
                "calculation": draft.calculation,
                "calculationIssues": draft.calculation_issues,
                "updatedAt": draft.updated_at,
            }))?;
            Ok::<_, serde_json::Error>(format!("sha256:{}", hex::encode(Sha256::digest(bytes))))
        })
        .transpose()
        .map_err(|error| command_failure(error.to_string()))?;
    Ok(RecipeSnapshot {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        draft_fingerprint,
    })
}

fn normalize_recipe_match(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace() && !character.is_ascii_punctuation())
        .flat_map(char::to_lowercase)
        .collect()
}

async fn steer_running_turn(
    state: &State<'_, AppState>,
    task: &AgentTask,
    turn: &AgentTurn,
    content: &str,
) -> Result<(), CommandError> {
    match turn.route.engine {
        AgentEngine::FoodlabRuntime => {
            let session_id = task
                .harness_session_id
                .as_deref()
                .ok_or_else(|| command_failure("当前会话尚未初始化".into()))?;
            state
                .harness
                .rpc_with_id(
                    "session.prompt",
                    json!({
                        "sessionId": session_id,
                        "mode": "steer",
                        "content": [{ "type": "text", "text": content.trim() }],
                    }),
                    &format!("steer-{}", uuid::Uuid::new_v4()),
                )
                .await
                .map_err(command_failure)?;
        }
        AgentEngine::CodexAppServer => return Err(chatgpt_route_disabled()),
    }
    Ok(())
}

async fn current_agent_route(state: &State<'_, AppState>) -> Result<AgentModelRoute, CommandError> {
    if let Some(route) = repository(state)?.default_route()? {
        match route.engine {
            AgentEngine::CodexAppServer => return Err(chatgpt_route_disabled()),
            AgentEngine::FoodlabRuntime
                if usable_model_providers(&state.harness)
                    .await?
                    .contains(&route.provider) =>
            {
                return Ok(route);
            }
            _ => {}
        }
    }
    current_foodlab_route(&state.harness).await
}

async fn ensure_foodlab_session(
    state: &State<'_, AppState>,
    task: &AgentTask,
) -> Result<AgentTask, CommandError> {
    if task.harness_session_id.is_some() {
        return Ok(task.clone());
    }
    let value = state
        .harness
        .rpc_with_id(
            "session.create",
            json!({
                "sessionId": task.id,
                "agentPreset": if task.task_contract.allowed_tools.iter().any(|tool| tool == "web_search") {
                    "foodlab-web"
                } else {
                    "foodlab"
                }
            }),
            &format!("create-runtime-session-{}", task.id),
        )
        .await
        .map_err(command_failure)?;
    let session_id = value
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or(&task.id);
    repository(state)?
        .bind_harness_session(&task.id, session_id)
        .map_err(Into::into)
}

#[allow(dead_code)] // Retained only to decode and support existing Codex-backed history.
async fn ensure_codex_thread_for_branch(
    state: &State<'_, AppState>,
    task: &AgentTask,
    branch_id: &str,
) -> Result<String, CommandError> {
    if let Some((session_id, _)) = repository(state)?.branch_runtime_session(
        &task.id,
        branch_id,
        AgentEngine::CodexAppServer,
    )? {
        return Ok(session_id);
    }
    if let Some((session_id, _)) =
        repository(state)?.runtime_session(&task.id, &task.active_route)?
        && branch_id == "root"
    {
        return Ok(session_id);
    }
    let server_binary = std::env::current_exe()
        .map_err(|_| command_failure("无法确定 FoodLab 工具服务位置".into()))?;
    let capability_root = state
        .database_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("foodlab-chatgpt/capabilities");
    let context = AgentToolContext {
        run_id: format!("codex:{}", task.id),
        import_job_id: format!("codex:{}", task.id),
        allowed_attachment_ids: BTreeSet::new(),
        provider_kind: AgentProviderKind::OpenAi,
        model: task.active_route.model.clone(),
        active_recipe_id: task.active_recipe_id.clone(),
        active_recipe_name: None,
        active_draft_fingerprint: task.active_draft_fingerprint.clone(),
    };
    let prepared = McpTaskLaunchConfig::new(
        server_binary,
        &state.database_path,
        &state.attachment_root,
        context,
        Duration::from_secs(8 * 60 * 60),
    )
    .prepare(&capability_root)?;
    let mut environment = prepared.environment;
    environment.insert(crate::agent::mcp::MCP_V2_MODE_ENV.into(), "1".into());
    let config = json!({
        "mcp_servers": {
            "food_rd": {
                "command": prepared.server_binary,
                "args": ["--foodlab-mcp"],
                "env": environment,
                "enabled": true,
                "startup_timeout_sec": 15,
                "tool_timeout_sec": 300
            }
        }
    });
    let instructions = format!(
        "Use only the private FoodLab MCP tools allowed by this contract. Do not use shell commands or inspect files. Every MCP call must include taskId={} and the current turnId supplied in the user message. Allowed tools: {}.",
        task.id,
        task.task_contract.allowed_tools.join(", "),
    );
    let external = state
        .codex
        .start_thread(&task.active_route.model, &instructions, config)
        .await
        .map_err(codex_failure)?;
    repository(state)?.bind_runtime_session(&task.id, &task.active_route, &external, None)?;
    repository(state)?.bind_branch_runtime_session(
        &task.id,
        branch_id,
        AgentEngine::CodexAppServer,
        &external,
        None,
    )?;
    Ok(external)
}

fn runtime_context_prefix(
    repository: &HarnessRepository,
    task: &AgentTask,
    current_turn: &AgentTurn,
) -> Result<String, CommandError> {
    let last_synced = repository
        .branch_runtime_session(&task.id, &current_turn.branch_id, current_turn.route.engine)?
        .or(repository.runtime_session(&task.id, &current_turn.route)?)
        .and_then(|(_, turn_id)| turn_id);
    let turns = repository.list_active_turns(&task.id)?;
    let mut include = last_synced.is_none();
    let mut visible = String::new();
    for turn in turns {
        if turn.id == current_turn.id {
            break;
        }
        if !include {
            if last_synced.as_deref() == Some(turn.id.as_str()) {
                include = true;
            }
            continue;
        }
        visible.push_str("\n用户：");
        visible.push_str(&turn.user_content);
        let assistant = visible_blocks_text(&turn.content_blocks);
        if !assistant.is_empty() {
            visible.push_str("\nNinka Agent：");
            visible.push_str(&assistant);
        }
    }
    if visible.is_empty() {
        return Ok(String::new());
    }
    let bounded = if visible.chars().count() > 60_000 {
        let tail = visible.chars().rev().take(60_000).collect::<Vec<_>>();
        format!(
            "较早对话已在 FoodLab 本地保留；以下是与当前回答最接近的可见内容：{}",
            tail.into_iter().rev().collect::<String>()
        )
    } else {
        visible
    };
    Ok(format!(
        "[FoodLab Visible Conversation Updates]\n{bounded}\n[End Visible Conversation Updates]\n\n"
    ))
}

fn visible_blocks_text(blocks: &[crate::agent_harness::model::FoodLabContentBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            crate::agent_harness::model::FoodLabContentBlock::Markdown { text } => {
                Some(text.clone())
            }
            crate::agent_harness::model::FoodLabContentBlock::Table { columns, rows } => {
                Some(format!(
                    "表格：{}；{}",
                    columns
                        .iter()
                        .map(|column| column.label.as_str())
                        .collect::<Vec<_>>()
                        .join("、"),
                    serde_json::to_string(rows).unwrap_or_default(),
                ))
            }
            crate::agent_harness::model::FoodLabContentBlock::Citations { sources } => {
                Some(format!(
                    "来源：{}",
                    sources
                        .iter()
                        .map(|source| source.url.as_str())
                        .collect::<Vec<_>>()
                        .join("、"),
                ))
            }
            crate::agent_harness::model::FoodLabContentBlock::Question { prompt, .. } => {
                Some(format!("问题：{prompt}"))
            }
            crate::agent_harness::model::FoodLabContentBlock::Action { action, .. } => {
                Some(format!("动作：{action}"))
            }
            crate::agent_harness::model::FoodLabContentBlock::ArtifactRef { .. } => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[allow(dead_code)] // Retained only to decode and support existing Codex-backed history.
fn settle_codex_turn(
    database_path: &std::path::Path,
    task: &AgentTask,
    turn: &AgentTurn,
    result: Result<crate::agent_harness::codex_app_server::CodexTurnResult, String>,
) {
    let Ok(mut repository) = HarnessRepository::open(database_path) else {
        return;
    };
    match result {
        Ok(result) => {
            let mut completed_tools = Vec::new();
            let mut artifact_kinds = Vec::new();
            let mut blocks = vec![crate::agent_harness::model::FoodLabContentBlock::Markdown {
                text: if result.text.trim().is_empty() {
                    "本轮没有生成可见回答。".into()
                } else {
                    result.text
                },
            }];
            let mut needs_input = false;
            for item in result.tool_items {
                let tool = item
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or("foodlab_tool");
                let call_id = item.get("id").and_then(Value::as_str);
                let success = item.get("status").and_then(Value::as_str) == Some("completed")
                    && item.get("error").is_none_or(Value::is_null);
                if success {
                    completed_tools.push(tool.to_string());
                }
                let structured = item.pointer("/result/structuredContent");
                if structured
                    .and_then(|value| value.get("outcome"))
                    .and_then(Value::as_str)
                    == Some("needs_input")
                {
                    needs_input = true;
                    if let Some(prompt) = structured
                        .and_then(|value| value.pointer("/question/prompt"))
                        .and_then(Value::as_str)
                    {
                        let choices = structured
                            .and_then(|value| value.pointer("/question/choices"))
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .filter_map(Value::as_str)
                            .enumerate()
                            .map(
                                |(index, label)| crate::agent_harness::model::ContentChoice {
                                    id: format!("choice-{index}"),
                                    label: label.to_string(),
                                },
                            )
                            .collect();
                        blocks.push(crate::agent_harness::model::FoodLabContentBlock::Question {
                            prompt: prompt.to_string(),
                            choices,
                        });
                    }
                }
                let kind = structured
                    .and_then(|value| value.get("artifactKind"))
                    .and_then(Value::as_str)
                    .or_else(|| artifact_kind_for_tool(tool));
                if success && let Some(kind) = kind {
                    let title = structured
                        .and_then(|value| value.get("title"))
                        .and_then(Value::as_str)
                        .unwrap_or("FoodLab 研发成果");
                    if repository
                        .create_artifact(
                            &task.id,
                            &turn.id,
                            call_id,
                            kind,
                            title,
                            structured
                                .and_then(|value| value.get("artifactId"))
                                .and_then(Value::as_str),
                            crate::agent_harness::model::ArtifactStatus::NeedsReview,
                            &json!({ "engine": "codex_app_server", "tool": tool }),
                        )
                        .is_ok()
                    {
                        artifact_kinds.push(kind.to_string());
                    }
                }
                if let Ok(current) = repository.get_task(&task.id) {
                    let _ = repository.append_event(
                        &task.id,
                        current.last_event_seq + 1,
                        "tool/result",
                        Some(&turn.id),
                        None,
                        call_id,
                        &json!({ "data": { "name": tool, "message": { "isError": !success } } }),
                    );
                }
            }
            let outcome = if needs_input {
                crate::agent_harness::model::TaskOutcome::NeedsInput
            } else if result.status != "completed" {
                crate::agent_harness::model::TaskOutcome::Interrupted
            } else {
                match crate::agent_harness::contract::validate_completion(
                    &task.task_contract,
                    &completed_tools,
                    &artifact_kinds,
                ) {
                    Ok(()) if artifact_kinds.is_empty() => {
                        crate::agent_harness::model::TaskOutcome::Completed
                    }
                    Ok(()) => crate::agent_harness::model::TaskOutcome::NeedsReview,
                    Err(_) => {
                        blocks.push(crate::agent_harness::model::FoodLabContentBlock::Markdown {
                            text: "本轮未满足任务必需步骤或成果要求，未标记为完成。可以继续补充或重试。".into(),
                        });
                        crate::agent_harness::model::TaskOutcome::Failed
                    }
                }
            };
            let _ = repository.settle_turn(&turn.id, outcome, &blocks);
            let _ = repository.update_task_outcome(&task.id, outcome, None, None);
            if let Ok(Some((external, _))) =
                repository.runtime_session(&task.id, &task.active_route)
            {
                let _ = repository.bind_runtime_session(
                    &task.id,
                    &task.active_route,
                    &external,
                    Some(&turn.id),
                );
            }
            if let Ok(Some((external, _))) = repository.branch_runtime_session(
                &task.id,
                &turn.branch_id,
                AgentEngine::CodexAppServer,
            ) {
                let _ = repository.bind_branch_runtime_session(
                    &task.id,
                    &turn.branch_id,
                    AgentEngine::CodexAppServer,
                    &external,
                    Some(&turn.id),
                );
            }
        }
        Err(message) => {
            let blocks = [crate::agent_harness::model::FoodLabContentBlock::Markdown {
                text: message.clone(),
            }];
            let _ = repository.settle_turn(
                &turn.id,
                crate::agent_harness::model::TaskOutcome::Failed,
                &blocks,
            );
            let _ = repository.update_task_outcome(
                &task.id,
                crate::agent_harness::model::TaskOutcome::Failed,
                Some("chatgpt_turn_failed"),
                Some(&message),
            );
        }
    }
    let _ = repository.clear_steering_messages(&task.id);
}

#[allow(dead_code)] // Used by the dormant historical Codex projection path above.
fn artifact_kind_for_tool(tool: &str) -> Option<&'static str> {
    Some(match tool {
        "create_ingredient_import_draft" | "update_ingredient_import_draft" => {
            "ingredient_import_draft"
        }
        "create_recipe_proposal" | "update_recipe_proposal" => "recipe_proposal",
        "diagnose_recipe" | "review_recipe_development" => "recipe_analysis",
        "create_recipe_estimate_card" => "recipe_estimate_card",
        "create_label_compliance_review" => "label_compliance_review",
        "create_research_report_draft" => "research_report",
        _ => return None,
    })
}

fn fail_turn(
    state: &State<'_, AppState>,
    task: &AgentTask,
    turn: &AgentTurn,
    code: &str,
    message: &str,
) -> Result<AgentTurn, CommandError> {
    let blocks = [crate::agent_harness::model::FoodLabContentBlock::Markdown {
        text: message.to_string(),
    }];
    let _ = repository(state)?.settle_turn(
        &turn.id,
        crate::agent_harness::model::TaskOutcome::Failed,
        &blocks,
    );
    let _ = repository(state)?.update_task_outcome(
        &task.id,
        crate::agent_harness::model::TaskOutcome::Failed,
        Some(code),
        Some(message),
    );
    Err(CommandError {
        code: code.to_string(),
        message: message.to_string(),
        field: None,
    })
}

fn codex_failure(_message: String) -> CommandError {
    CommandError {
        code: "chatgpt_service_failure".into(),
        message: "ChatGPT 服务暂不可用，请重试；若持续失败，请重新安装 FoodLab".into(),
        field: None,
    }
}

fn value_at_path<'a>(mut value: &'a Value, path: &[Value]) -> Option<&'a Value> {
    for part in path {
        value = value.get(part.as_str()?)?;
    }
    Some(value)
}

fn invalid_settings_request(message: &str) -> CommandError {
    CommandError {
        code: "invalid_input".into(),
        message: message.into(),
        field: None,
    }
}

fn render_task_prompt(
    task: &AgentTask,
    turn: &AgentTurn,
    user_content: &str,
) -> Result<String, CommandError> {
    let contract = serde_json::to_string_pretty(&task.task_contract)
        .map_err(|error| command_failure(error.to_string()))?;
    let workflow_rules = match task.workflow.as_str() {
        "recipe_import" => {
            r#"
- Treat attachments as source records to transcribe, not as a request to optimize or redesign a formula.
- Infer the table structure semantically; do not require fixed sheet names, headers, columns, or cell positions.
- Create exactly one attachment_import proposal for each recipe found. Preserve recipe order, ingredient order, original g/kg units, finished mass, attachment IDs, notes, and an explicitly supplied recipe code; use null when no code is clearly supplied.
- Use the sum of converted ingredient amounts as inputMassGrams. If a declared total differs, add a warning and never rescale ingredient amounts.
- Bind an existing supplier variant only when the attachment material name identifies the same generic material. Similar names are different identities and must remain material_need items with their original names, specifications, and purposes.
"#
        }
        "ingredient_import" => {
            r#"
- Treat attachments as ingredient source records. Create reviewable ingredient drafts only; do not create recipe proposals.
"#
        }
        _ => "",
    };
    Ok(format!(
        r#"[FoodLab Task Context]
taskId: {task_id}
turnId: {turn_id}
sessionScope: current_task_only
recipeContext: injected_by_foodlab

TaskContract:
{contract}

Rules:
- Only call tools in allowedTools. Every FoodLab MCP call must include this exact taskId and turnId.
- Recipe identity and the saved-draft fingerprint are injected by FoodLab. Never ask the user for a database ID or fingerprint, and never add either field to tool arguments.
- If a required condition can only come from the user, call request_task_input once with a concise question and optional choices, then stop the Turn.
- Do not read another task unless the user explicitly references it.
- Reading, searching, deterministic calculation, comparison, and reviewable drafts are allowed.
- Saving, overwriting, deleting, publishing, transmitting, or accepting formulas/ingredients requires explicit confirmation.
- web_search may discover regulatory candidates, but a formal compliance conclusion requires local official full text or user-provided source text.
- Never put a formula, package image/text, test report, supplier document, or other task attachment into a web_search query or any third-party regulatory service.
- A formal label review must first confirm China-mainland domestic ordinary prepackaged-food scope; otherwise return needs_input and only extract visible packaging facts.
- Regulatory search records must distinguish official full text, metadata only, user-provided text, not found, and ambiguous results. Search snippets are never formal evidence.
- Never expose raw JSON to the user. Use concise Markdown and structured sources.
{workflow_rules}

[User Request]
{user_content}"#,
        task_id = task.id,
        turn_id = turn.id,
        user_content = user_content.trim(),
        workflow_rules = workflow_rules,
    ))
}

fn create_task_bridge(
    state: &State<'_, AppState>,
    task: &AgentTask,
    files: Vec<crate::ingest::model::ImportFileReference>,
) -> Result<(), CommandError> {
    let mut coordinator =
        IngredientIngestCoordinator::open(&state.database_path, &state.attachment_root)?;
    let job = coordinator.create_agent_job(files)?;
    let mut old_repository = AgentRepository::open_for_runtime(&state.database_path)?;
    let conversation =
        old_repository.create_conversation(&format!("Ninka Agent · {}", task.title))?;
    let run = old_repository.create_run(AgentRunInput {
        conversation_id: conversation.id,
        provider_config_id: "deepseek".into(),
        import_job_id: Some(job.id.clone()),
        status: AgentRunStatus::Running,
    })?;
    repository(state)?.bind_legacy_bridge(&task.id, &run.id, &job.id)?;
    Ok(())
}

fn task_prompt_content(
    state: &State<'_, AppState>,
    task: &AgentTask,
    prompt: &str,
) -> Result<Vec<Value>, CommandError> {
    // Attachments enter the first Turn only. Later Turns rely on the same
    // task-scoped MCP job instead of resending bytes to the provider.
    if repository(state)?.list_turns(&task.id)?.len() != 1 {
        return Ok(vec![json!({ "type": "text", "text": prompt })]);
    }
    let (_, job_id) = repository(state)?.legacy_bridge(&task.id)?;
    let coordinator =
        IngredientIngestCoordinator::open(&state.database_path, &state.attachment_root)?;
    let attachments = coordinator.list_job_attachments(&job_id)?;
    if attachments.is_empty() {
        return Ok(vec![json!({ "type": "text", "text": prompt })]);
    }
    let ids = attachments
        .iter()
        .map(|attachment| attachment.id.clone())
        .collect::<Vec<_>>();
    let documents = coordinator.read_job_extractions(&job_id, &ids)?;
    let extracted = documents
        .iter()
        .filter_map(extracted_document_text)
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");
    let text = if extracted.is_empty() {
        prompt.to_string()
    } else {
        format!("{prompt}\n\n[Current Task Attachments - extracted locally]\n{extracted}")
    };
    let mut content = vec![json!({ "type": "text", "text": text })];
    for attachment in attachments
        .iter()
        .filter(|attachment| attachment.media_type.starts_with("image/"))
    {
        content.push(json!({
            "type": "image",
            "mediaType": attachment.media_type,
            "data": BASE64.encode(coordinator.read_attachment_bytes(attachment)?),
            "name": attachment.original_name,
        }));
    }
    Ok(content)
}

fn extracted_document_text(
    document: &crate::ingest::extractors::ExtractedDocument,
) -> Option<String> {
    let mut sections = document
        .text_blocks
        .iter()
        .map(|block| block.text.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    sections.extend(document.tables.iter().filter_map(|table| {
        let rows = table
            .rows
            .iter()
            .map(|row| row.join("\t"))
            .collect::<Vec<_>>()
            .join("\n");
        (!rows.trim().is_empty()).then_some(rows)
    }));
    (!sections.is_empty())
        .then(|| format!("## {}\n{}", document.source_name, sections.join("\n\n")))
}

async fn fetch_complete_history(
    host: &crate::agent_harness::host::HarnessHost,
    session_id: &str,
) -> Result<Vec<Value>, CommandError> {
    let mut before_seq: Option<i64> = None;
    let mut entries = Vec::new();
    for page in 0..100_u32 {
        let mut payload = json!({ "sessionId": session_id, "maxMessages": 500 });
        if let Some(before_seq) = before_seq {
            payload["beforeSeq"] = json!(before_seq);
        }
        let value = host
            .rpc_with_id(
                "session.history",
                payload,
                &format!("history-{session_id}-{page}"),
            )
            .await
            .map_err(command_failure)?;
        let page_entries = value
            .get("events")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let has_more = value
            .get("hasMore")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let earliest = page_entries
            .iter()
            .filter_map(|entry| {
                entry
                    .pointer("/event/seq")
                    .or_else(|| entry.get("seq"))
                    .and_then(Value::as_i64)
            })
            .min();
        entries.extend(page_entries);
        if !has_more {
            entries.sort_by_key(|entry| {
                entry
                    .pointer("/event/seq")
                    .or_else(|| entry.get("seq"))
                    .and_then(Value::as_i64)
                    .unwrap_or(i64::MAX)
            });
            entries.dedup_by_key(|entry| {
                entry
                    .pointer("/event/seq")
                    .or_else(|| entry.get("seq"))
                    .and_then(Value::as_i64)
                    .unwrap_or(i64::MAX)
            });
            return Ok(entries);
        }
        before_seq = earliest;
        if before_seq.is_none() {
            break;
        }
    }
    Err(command_failure(
        "Agent 任务历史超过安全上限，已停止不完整恢复".into(),
    ))
}

async fn latest_session_seq(
    host: &crate::agent_harness::host::HarnessHost,
    session_id: &str,
) -> Result<i64, CommandError> {
    let history = host
        .rpc_with_id(
            "session.history",
            json!({ "sessionId": session_id, "maxMessages": 1 }),
            &format!("latest-seq-{session_id}-{}", uuid::Uuid::new_v4()),
        )
        .await
        .map_err(command_failure)?;
    Ok(history
        .get("events")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .pointer("/event/seq")
                .or_else(|| entry.get("seq"))
                .and_then(Value::as_i64)
        })
        .max()
        .unwrap_or(-1))
}

fn provider_connection_failure(reason: &Value) -> CommandError {
    let provider_code = reason
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("provider_failure");
    let provider_message = reason
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("");
    let diagnostic = format!("{provider_code} {provider_message}").to_ascii_lowercase();
    let (code, message) = if diagnostic.contains("401")
        || diagnostic.contains("403")
        || diagnostic.contains("auth")
        || diagnostic.contains("credential")
        || diagnostic.contains("api key")
    {
        (
            "provider_auth_failed",
            "API Key 无效、已过期或无权访问该模型",
        )
    } else if diagnostic.contains("402")
        || diagnostic.contains("balance")
        || diagnostic.contains("quota")
        || diagnostic.contains("insufficient")
    {
        ("provider_quota_exceeded", "Provider 余额或额度不足")
    } else if diagnostic.contains("429") || diagnostic.contains("rate") {
        ("provider_rate_limited", "Provider 请求过于频繁，请稍后重试")
    } else if diagnostic.contains("model") && diagnostic.contains("not") {
        (
            "provider_model_unavailable",
            "当前模型不可用，请重新选择模型",
        )
    } else if diagnostic.contains("transport")
        || diagnostic.contains("network")
        || diagnostic.contains("fetch")
        || diagnostic.contains("connect")
    {
        (
            "provider_network_unavailable",
            "无法连接 Provider，请检查网络后重试",
        )
    } else {
        ("provider_request_failed", "Provider 拒绝或未能完成测试请求")
    };
    CommandError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

fn command_failure(message: String) -> CommandError {
    CommandError {
        code: "agent_runtime_failure".into(),
        message,
        field: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_routing_respects_explicit_recipe_and_ingredient_intent() {
        assert_eq!(
            infer_workflow("请把附件里的三个配方加入配方库", true).unwrap(),
            Workflow::RecipeImport
        );
        assert_eq!(
            infer_workflow("导入这份原料表", true).unwrap(),
            Workflow::IngredientImport
        );
        let ambiguous = infer_workflow("帮我识别这个附件", true).unwrap_err();
        assert_eq!(ambiguous.code, "attachment_purpose_required");
        assert!(ambiguous.message.contains("导入配方"));
    }

    #[test]
    fn legacy_ingredient_artifacts_are_reconciled_with_job_draft_positions() {
        let artifact = |id: &str, kind: &str, tool: &str, domain_ref: &str| ArtifactManifest {
            id: id.into(),
            task_id: "task-1".into(),
            turn_id: "turn-1".into(),
            tool_call_id: Some(format!("call-{id}")),
            kind: kind.into(),
            title: "待复核成果".into(),
            domain_ref: Some(domain_ref.into()),
            logical_path: None,
            mime_type: None,
            sha256: None,
            byte_size: None,
            status: crate::agent_harness::model::ArtifactStatus::NeedsReview,
            provenance: json!({ "tool": tool }),
            created_at: "2026-08-29T00:00:00Z".into(),
            updated_at: "2026-08-29T00:00:00Z".into(),
        };
        let mut artifacts = vec![
            artifact(
                "first",
                "ingredient_import_draft",
                "create_ingredient_import_draft",
                "ingredient_import_draft:wrong-category-id",
            ),
            artifact(
                "other",
                "recipe_proposal",
                "create_recipe_proposal",
                "recipe_proposal:keep-me",
            ),
            artifact(
                "second",
                "ingredient_import_draft",
                "create_ingredient_import_draft",
                "ingredient_import_draft:wrong-supplier-id",
            ),
            artifact(
                "update",
                "ingredient_import_draft",
                "update_ingredient_import_draft",
                "ingredient_import_draft:untouched-update",
            ),
        ];

        reconcile_legacy_ingredient_artifact_refs(
            &mut artifacts,
            &["draft-position-0".into(), "draft-position-1".into()],
        );

        assert_eq!(
            artifacts[0].domain_ref.as_deref(),
            Some("ingredient_import_draft:draft-position-0")
        );
        assert_eq!(
            artifacts[1].domain_ref.as_deref(),
            Some("recipe_proposal:keep-me")
        );
        assert_eq!(
            artifacts[2].domain_ref.as_deref(),
            Some("ingredient_import_draft:draft-position-1")
        );
        assert_eq!(
            artifacts[3].domain_ref.as_deref(),
            Some("ingredient_import_draft:untouched-update")
        );
    }

    #[test]
    fn recipe_artifacts_use_real_proposals_and_mark_excess_history_stale() {
        let artifact = |id: &str| ArtifactManifest {
            id: id.into(),
            task_id: "task-1".into(),
            turn_id: "turn-1".into(),
            tool_call_id: Some(format!("call-{id}")),
            kind: "recipe_proposal".into(),
            title: "配方提案".into(),
            domain_ref: Some(format!("recipe_proposal:ghost-{id}")),
            logical_path: None,
            mime_type: None,
            sha256: None,
            byte_size: None,
            status: crate::agent_harness::model::ArtifactStatus::NeedsReview,
            provenance: json!({ "tool": "create_recipe_proposal" }),
            created_at: "2026-08-29T00:00:00Z".into(),
            updated_at: "2026-08-29T00:00:00Z".into(),
        };
        let proposal: AgentRecipeProposal = serde_json::from_value(json!({
            "id": "real-proposal-1",
            "conversationId": "conversation-1",
            "runId": "run-1",
            "status": "pending_review",
            "payloadVersion": 2,
            "payload": {
                "productName": "巧克力夹心",
                "recipeCode": "R001",
                "recipeKind": "formula",
                "mode": "attachment_import",
                "finishedMassGrams": "1000",
                "yieldAssumption": "provided",
                "items": [{
                    "kind": "material_need",
                    "id": "line-1",
                    "position": 0,
                    "amount": "1000",
                    "unit": "g",
                    "estimatedMinimum": null,
                    "estimatedMaximum": null,
                    "confidence": "high",
                    "materialName": "可可粉",
                    "purpose": "提供风味",
                    "desiredSpecification": "附件未注明",
                    "missingReason": "原料库没有完全一致的通用原料"
                }],
                "requirements": [],
                "assumptions": [],
                "warnings": [],
                "markdownNotes": ""
            },
            "evaluation": {},
            "sourceAttachmentIds": ["attachment-1"],
            "acceptedRecipeId": null,
            "createdAt": "2026-08-29T00:00:00Z",
            "updatedAt": "2026-08-29T00:00:00Z"
        }))
        .unwrap();
        let mut second = proposal.clone();
        second.id = "real-proposal-2".into();
        second.payload.product_name = "香草夹心".into();
        let mut third = proposal.clone();
        third.id = "real-proposal-3".into();
        third.payload.product_name = "可可基底".into();
        let mut artifacts = vec![
            artifact("first"),
            artifact("second"),
            artifact("third"),
            artifact("ghost"),
        ];

        reconcile_legacy_recipe_artifact_refs(&mut artifacts, &[proposal, second, third]);

        assert_eq!(
            artifacts[0].domain_ref.as_deref(),
            Some("recipe_proposal:real-proposal-1")
        );
        assert_eq!(artifacts[0].title, "配方提案 · 巧克力夹心");
        assert_eq!(
            artifacts[1].domain_ref.as_deref(),
            Some("recipe_proposal:real-proposal-2")
        );
        assert_eq!(artifacts[1].title, "配方提案 · 香草夹心");
        assert_eq!(
            artifacts[2].domain_ref.as_deref(),
            Some("recipe_proposal:real-proposal-3")
        );
        assert_eq!(artifacts[2].title, "配方提案 · 可可基底");
        assert_eq!(
            artifacts[3].status,
            crate::agent_harness::model::ArtifactStatus::Stale
        );
        assert_eq!(artifacts[3].title, "未生成有效配方提案");
        assert!(artifacts[3].domain_ref.is_none());
    }

    #[test]
    fn model_settings_bridge_rejects_unapproved_namespaces_and_literal_secrets() {
        let namespace_error = validate_settings_call(
            "settings.mutate",
            json!({
                "ns": "permissions",
                "ops": [{ "op": "set", "path": ["mode"], "value": "unrestricted" }],
                "expectedRevision": "1",
            }),
        )
        .unwrap_err();
        assert_eq!(namespace_error.code, "invalid_input");

        let secret_error = validate_settings_call(
            "settings.mutate",
            json!({
                "ns": "llm-pi-ai",
                "ops": [{
                    "op": "set",
                    "path": ["providers", "custom"],
                    "value": { "apiKey": "must-not-enter-settings" },
                }],
                "expectedRevision": "1",
            }),
        )
        .unwrap_err();
        assert_eq!(secret_error.message, "密钥只能通过只写凭据接口保存");
    }

    #[test]
    fn connection_test_allows_a_transient_key_but_rejects_extra_fields() {
        let payload = json!({
            "settingsNs": "llm-pi-ai",
            "provider": "company-gateway",
            "baseURL": "https://gateway.example.com/v1",
            "api": "openai-completions",
            "apiKey": "sk-transient-test",
        });
        assert_eq!(
            validate_settings_call("llm.discoverModels", payload.clone()).unwrap(),
            payload,
        );

        let error = validate_settings_call(
            "llm.discoverModels",
            json!({ "provider": "custom", "writeFile": "/tmp/no" }),
        )
        .unwrap_err();
        assert_eq!(error.message, "模型请求包含不允许的字段");
    }

    #[test]
    fn settings_reads_are_always_redacted() {
        assert_eq!(
            validate_settings_call("settings.describe", json!({ "redactSecrets": false })).unwrap(),
            json!({}),
        );
    }

    #[test]
    fn model_directory_is_normalized_for_the_foodlab_ui() {
        let mut directory = json!({
            "groups": [{ "id": "deepseek", "name": "DeepSeek", "models": [] }],
            "failures": [{ "id": "custom", "name": "Custom", "message": "bad" }],
        });
        normalize_model_directory(&mut directory);
        assert_eq!(directory["groups"][0]["provider"], "deepseek");
        assert_eq!(directory["groups"][0]["displayName"], "DeepSeek");
        assert_eq!(directory["failures"][0]["provider"], "custom");
    }

    #[test]
    fn image_capability_catalog_distinguishes_deepseek_kimi_and_unknown_custom_models() {
        assert_eq!(
            bundled_image_capability("deepseek-official", "deepseek-v4-flash"),
            Some(ModelImageCapability::Unsupported)
        );
        assert_eq!(
            bundled_image_capability("moonshot", "kimi-k2.6"),
            Some(ModelImageCapability::Supported)
        );
        assert_eq!(
            bundled_image_capability("company-gateway", "my-private-model"),
            None
        );

        let mut directory = json!({
            "groups": [
                { "provider": "deepseek-official", "models": [{ "id": "deepseek-v4-pro" }] },
                { "provider": "moonshot", "models": [{ "id": "kimi-k2.6" }] },
                { "provider": "custom", "models": [{ "id": "private-model" }] }
            ]
        });
        annotate_model_capabilities(&mut directory, &ModelCapabilityContext::default());
        assert_eq!(
            directory["groups"][0]["models"][0]["capabilityStatus"],
            "known"
        );
        assert_eq!(
            directory["groups"][0]["models"][0]["inputModalities"],
            json!(["text"])
        );
        assert_eq!(
            directory["groups"][1]["models"][0]["inputModalities"],
            json!(["text", "image"])
        );
        assert_eq!(
            directory["groups"][2]["models"][0]["capabilityStatus"],
            "unknown"
        );
    }

    #[test]
    fn probed_capability_cache_is_isolated_by_provider_base_url_and_model() {
        assert_ne!(
            model_capability_key("custom", "https://one.example/v1", "model-a"),
            model_capability_key("custom", "https://two.example/v1", "model-a")
        );
        assert_ne!(
            model_capability_key("custom", "https://one.example/v1", "model-a"),
            model_capability_key("custom", "https://one.example/v1", "model-b")
        );
    }

    #[test]
    fn only_explicit_image_rejection_can_downgrade_an_unknown_model() {
        assert!(is_model_image_unsupported_message(
            "MODEL_DOES_NOT_SUPPORT_IMAGES: image input is unsupported"
        ));
        assert!(!is_model_image_unsupported_message("401 invalid api key"));
        assert!(!is_model_image_unsupported_message(
            "network connection timed out"
        ));
        assert!(!is_model_image_unsupported_message(
            "attachment file is corrupt"
        ));
        assert_eq!(
            prompt_failure_code("图片文件超过当前模型允许的大小，请压缩后重试"),
            "attachment_too_large"
        );
        assert_eq!(
            prompt_failure_code("当前模型尚未配置密钥"),
            "provider_auth_failed"
        );
        assert_eq!(
            prompt_failure_code("Agent 服务响应超时，请检查网络后重试"),
            "provider_network_unavailable"
        );
    }

    #[test]
    fn active_openai_without_a_profile_or_key_is_not_a_usable_candidate() {
        let providers = json!({
            "providers": [{
                "provider": "openai",
                "active": true,
                "settingsNs": "llm-pi-ai",
                "settingsPath": ["providers", "openai"]
            }]
        });
        let missing_profile = json!({
            "namespaces": [{ "ns": "llm-pi-ai", "value": { "providers": {} } }]
        });
        assert!(provider_credential_candidates(&providers, &missing_profile).is_empty());

        let missing_key_reference = json!({
            "namespaces": [{
                "ns": "llm-pi-ai",
                "value": { "providers": { "openai": { "baseURL": "https://api.openai.com/v1" } } }
            }]
        });
        assert!(provider_credential_candidates(&providers, &missing_key_reference).is_empty());

        let configured_profile = json!({
            "namespaces": [{
                "ns": "llm-pi-ai",
                "value": { "providers": { "openai": { "apiKeyEnv": "OPENAI_API_KEY" } } }
            }]
        });
        assert_eq!(
            provider_credential_candidates(&providers, &configured_profile),
            vec![("openai".into(), "OPENAI_API_KEY".into())],
        );
    }
}
