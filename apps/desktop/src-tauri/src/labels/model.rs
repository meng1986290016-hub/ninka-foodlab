use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabelInput {
    pub recipe_id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabel {
    pub id: String,
    pub recipe_id: String,
    pub name: String,
    pub current_draft_id: Option<String>,
    pub latest_version_number: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabelDraftInput {
    pub label_id: String,
    pub recipe_version_id: String,
    pub rule_pack_id: String,
    pub payload_schema_version: i64,
    pub payload: Value,
    pub calculation: Option<Value>,
    pub issues: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabelDraft {
    pub id: String,
    pub label_id: String,
    pub recipe_version_id: String,
    pub rule_pack_id: String,
    pub payload_schema_version: i64,
    pub payload: Value,
    pub calculation: Option<Value>,
    pub issues: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabelVersionInput {
    pub label_id: String,
    pub source_draft_id: String,
    pub recipe_version_id: String,
    pub rule_pack_id: String,
    pub rule_pack_revision: String,
    pub snapshot_schema_version: i64,
    pub snapshot: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionLabelVersion {
    pub id: String,
    pub label_id: String,
    pub version_number: i64,
    pub source_draft_id: String,
    pub recipe_version_id: String,
    pub rule_pack_id: String,
    pub rule_pack_revision: String,
    pub snapshot_schema_version: i64,
    pub snapshot: Value,
    pub created_at: String,
}
