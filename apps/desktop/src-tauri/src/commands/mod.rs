pub mod ingredients;

use std::sync::Mutex;

use serde::Serialize;

use crate::ingredients::repository::{IngredientRepository, RepositoryError};

pub const REGISTERED_COMMANDS: [&str; 24] = [
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
];

pub struct AppState {
    pub(crate) repository: Mutex<IngredientRepository>,
}

impl AppState {
    pub fn new(repository: IngredientRepository) -> Self {
        Self {
            repository: Mutex::new(repository),
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
