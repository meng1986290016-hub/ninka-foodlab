pub mod agent;
pub mod ingest;
pub mod ingredients;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::Serialize;

use crate::{
    agent::{AgentError, runtime::AgentRuntimeControl},
    ingest::{IngestError, coordinator::IngredientIngestCoordinator},
    ingredients::repository::RepositoryError,
};

pub const REGISTERED_COMMANDS: [&str; 53] = [
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
    "compare_ingredient_variants",
    "get_setting",
    "set_setting",
    "get_draft",
    "save_draft",
    "clear_draft",
    "database_status",
    "create_ingredient_import_job",
    "get_ingredient_import_job",
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
    "save_agent_preferences",
    "list_agent_provider_configs",
    "save_agent_provider_config",
    "set_agent_provider_secret",
    "clear_agent_provider_secret",
    "list_agent_provider_models",
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
];

pub struct AppState {
    pub(crate) coordinator: Mutex<IngredientIngestCoordinator>,
    pub(crate) database_path: PathBuf,
    pub(crate) attachment_root: PathBuf,
    pub(crate) active_agent_runs: Arc<Mutex<HashMap<String, AgentRuntimeControl>>>,
}

impl AppState {
    pub fn new(
        coordinator: IngredientIngestCoordinator,
        database_path: PathBuf,
        attachment_root: PathBuf,
    ) -> Self {
        Self {
            coordinator: Mutex::new(coordinator),
            database_path,
            attachment_root,
            active_agent_runs: Arc::new(Mutex::new(HashMap::new())),
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
        let field = error
            .issues()
            .and_then(|issues| issues.first())
            .and_then(|issue| issue.field_path.clone());
        Self {
            code: error.code().to_string(),
            message: error.message().to_string(),
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
