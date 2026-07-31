use serde::{Deserialize, Serialize};

pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const BACKUP_APPLICATION_ID: &str = "food-rd-studio";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub path: String,
    pub byte_size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupTotals {
    pub attachment_count: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub application_id: String,
    pub application_version: String,
    pub created_at: String,
    pub schema_version: i64,
    pub database: BackupFileEntry,
    pub attachments: Vec<BackupFileEntry>,
    pub totals: BackupTotals,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupDataCounts {
    pub material_groups: u64,
    pub ingredient_variants: u64,
    pub recipes: u64,
    pub recipe_versions: u64,
    pub nutrition_labels: u64,
    pub nutrition_label_versions: u64,
    pub research_reports: u64,
    pub agent_conversations: u64,
}

impl BackupDataCounts {
    pub fn total(&self) -> u64 {
        self.material_groups
            + self.ingredient_variants
            + self.recipes
            + self.recipe_versions
            + self.nutrition_labels
            + self.nutrition_label_versions
            + self.research_reports
            + self.agent_conversations
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreflight {
    pub created_at: String,
    pub application_version: String,
    pub source_schema_version: i64,
    pub target_schema_version: i64,
    pub requires_migration: bool,
    pub database_bytes: u64,
    pub attachment_count: u64,
    pub attachment_bytes: u64,
    pub total_bytes: u64,
    pub data_record_count: u64,
    pub counts: BackupDataCounts,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreResult {
    pub preflight: BackupPreflight,
    pub safety_backup_file_name: String,
    pub restored_schema_version: i64,
}
