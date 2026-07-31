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
