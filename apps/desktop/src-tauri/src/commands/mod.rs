pub mod agent;
pub mod agent_harness;
pub mod agent_recipes;
pub mod app_info;
pub mod backup;
pub mod data_reset;
pub mod ingest;
pub mod ingredients;
pub mod labels;
pub mod recipes;
pub mod reports;
pub mod rnd_reference;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::Serialize;

use crate::{
    agent::{
        AgentError,
        runtime::AgentRuntimeControl,
        secrets::{KeyringSecretStore, SessionSecretStore},
    },
    agent_harness::{CodexAppServerHost, HarnessHost},
    ingest::{IngestError, coordinator::IngredientIngestCoordinator},
    ingredients::repository::RepositoryError,
};

pub const REGISTERED_COMMANDS: [&str; 139] = [
    "get_app_version",
    "check_for_updates",
    "open_release_page",
    "preview_data_reset",
    "execute_data_reset",
    "get_latest_data_reset_recovery",
    "restore_latest_data_reset_recovery",
    "restart_application",
    "list_categories",
    "create_category",
    "rename_category",
    "archive_category",
    "list_suppliers",
    "create_supplier",
    "update_supplier",
    "archive_supplier",
    "list_material_groups",
    "create_material_group",
    "update_material_group",
    "archive_material_group",
    "save_ingredient_variant",
    "copy_ingredient_variant",
    "archive_ingredient_variant",
    "list_nutrient_definitions",
    "create_nutrient_definition",
    "update_nutrient_definition",
    "archive_nutrient_definition",
    "compare_ingredient_variants",
    "get_setting",
    "set_setting",
    "get_draft",
    "save_draft",
    "clear_draft",
    "database_status",
    "create_ingredient_import_job",
    "get_ingredient_import_job",
    "get_ingredient_import_draft",
    "list_ingredient_import_drafts",
    "update_ingredient_import_draft",
    "discard_ingredient_import_draft",
    "cancel_ingredient_import_job",
    "retry_ingredient_import_job",
    "commit_ingredient_import_job",
    "commit_reviewed_ingredient_import_draft",
    "export_ingredient_template",
    "export_ingredient_library",
    "cleanup_orphan_attachments",
    "get_agent_preferences",
    "get_harness_health",
    "start_harness",
    "stop_harness",
    "agent_runtime_settings_call",
    "save_agent_provider_profile",
    "test_agent_provider_connection",
    "get_agent_model_directory",
    "select_agent_default_model",
    "read_third_party_licenses",
    "list_harness_tasks",
    "get_agent_conversation_view",
    "create_harness_task",
    "rename_harness_task",
    "archive_harness_task",
    "restore_harness_task",
    "select_harness_task_model",
    "create_harness_turn",
    "submit_agent_message",
    "edit_agent_queued_message",
    "delete_agent_queued_message",
    "stop_agent_conversation",
    "resume_agent_queue",
    "select_agent_branch",
    "edit_agent_turn",
    "bind_agent_recipe",
    "resolve_agent_recipe_references",
    "sync_harness_task",
    "cancel_harness_task",
    "list_harness_turns",
    "list_harness_events",
    "list_harness_artifacts",
    "preview_legacy_agent_reset",
    "execute_legacy_agent_reset",
    "save_agent_preferences",
    "list_agent_provider_configs",
    "save_agent_provider_config",
    "set_agent_provider_secret",
    "clear_agent_provider_secret",
    "list_agent_provider_models",
    "get_agent_custom_provider_subconfig",
    "test_agent_provider",
    "detect_cli_providers",
    "list_agent_conversations",
    "create_agent_conversation",
    "delete_agent_conversation",
    "list_agent_messages",
    "start_agent_run",
    "cancel_agent_run",
    "get_agent_run",
    "list_agent_import_drafts",
    "list_rnd_reference_cards",
    "create_personal_rnd_reference_card",
    "update_personal_rnd_reference_card",
    "archive_personal_rnd_reference_card",
    "list_agent_recipe_estimate_cards",
    "list_recipes",
    "get_recipe",
    "create_recipe",
    "create_recipe_alternative",
    "update_recipe",
    "update_recipe_scheme",
    "archive_recipe",
    "restore_recipe",
    "delete_draft_recipe",
    "permanently_delete_recipe",
    "delete_recipe_version",
    "get_recipe_draft",
    "save_recipe_draft",
    "append_recipe_draft_notes",
    "list_recipe_versions",
    "get_recipe_version",
    "create_recipe_version",
    "copy_recipe_version_to_draft",
    "compare_recipe_versions",
    "list_nutrition_labels",
    "get_nutrition_label",
    "create_nutrition_label",
    "get_nutrition_label_draft",
    "calculate_nutrition_label_preview",
    "save_nutrition_label_draft",
    "list_nutrition_label_versions",
    "get_nutrition_label_version",
    "publish_nutrition_label",
    "create_research_report",
    "list_research_reports",
    "get_research_report",
    "export_research_report",
    "export_sample_sheet",
    "create_data_backup",
    "inspect_data_backup",
    "restore_data_backup",
];

pub struct AppState {
    pub(crate) coordinator: Mutex<Option<IngredientIngestCoordinator>>,
    pub(crate) database_path: PathBuf,
    pub(crate) attachment_root: PathBuf,
    pub(crate) active_agent_runs: Arc<Mutex<HashMap<String, AgentRuntimeControl>>>,
    pub(crate) provider_secrets: SessionSecretStore<KeyringSecretStore>,
    pub(crate) harness: HarnessHost,
    pub(crate) codex: Arc<CodexAppServerHost>,
    pub(crate) data_reset_preview: Mutex<Option<(String, String)>>,
    pub(crate) data_reset_backup_failure: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(
        coordinator: IngredientIngestCoordinator,
        database_path: PathBuf,
        attachment_root: PathBuf,
    ) -> Self {
        Self::new_with_agent_runtime(
            coordinator,
            database_path,
            attachment_root,
            PathBuf::from("__foodlab_agent_runtime_unavailable__"),
            PathBuf::from("__foodlab_agent_node_unavailable__"),
        )
    }

    pub fn new_with_agent_runtime(
        coordinator: IngredientIngestCoordinator,
        database_path: PathBuf,
        attachment_root: PathBuf,
        agent_runtime_root: PathBuf,
        agent_node_binary: PathBuf,
    ) -> Self {
        let harness_home = database_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("foodlab-agent");
        let codex_home = database_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("foodlab-chatgpt");
        Self {
            coordinator: Mutex::new(Some(coordinator)),
            database_path,
            attachment_root,
            active_agent_runs: Arc::new(Mutex::new(HashMap::new())),
            provider_secrets: SessionSecretStore::new(KeyringSecretStore),
            harness: HarnessHost::new(
                harness_home,
                agent_runtime_root.clone(),
                agent_node_binary.clone(),
            ),
            codex: Arc::new(CodexAppServerHost::new(
                codex_home,
                agent_runtime_root,
                agent_node_binary,
            )),
            data_reset_preview: Mutex::new(None),
            data_reset_backup_failure: Mutex::new(None),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
    pub field: Option<String>,
}

impl CommandError {
    pub(crate) fn state_unavailable() -> Self {
        Self {
            code: "storage_failure".into(),
            message: "数据库状态暂不可用".into(),
            field: None,
        }
    }
}

impl From<RepositoryError> for CommandError {
    fn from(error: RepositoryError) -> Self {
        Self {
            code: error.code().to_string(),
            message: error.message().to_string(),
            field: error.field().map(str::to_string),
        }
    }
}

impl From<IngestError> for CommandError {
    fn from(error: IngestError) -> Self {
        let first_issue = error
            .issues()
            .and_then(|issues| issues.iter().find(|issue| !issue.message.trim().is_empty()));
        let field = first_issue.and_then(|issue| issue.field_path.clone());
        let message = first_issue
            .map(|issue| format!("{}：{}", error.message(), issue.message))
            .unwrap_or_else(|| error.message().to_string());
        Self {
            code: error.code().to_string(),
            message,
            field,
        }
    }
}

impl From<AgentError> for CommandError {
    fn from(error: AgentError) -> Self {
        Self {
            code: error.code().to_string(),
            message: error.message().to_string(),
            field: None,
        }
    }
}
