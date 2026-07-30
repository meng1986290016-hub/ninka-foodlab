use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecipeKind {
    Formula,
    SemiFinished,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeInput {
    pub name: String,
    pub code: Option<String>,
    pub tags: Vec<String>,
    pub kind: RecipeKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub tags: Vec<String>,
    pub kind: RecipeKind,
    pub current_draft_id: Option<String>,
    pub latest_version_number: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeDraftInput {
    pub recipe_id: String,
    pub based_on_version_id: Option<String>,
    pub source: String,
    pub payload_version: i64,
    pub payload: Value,
    pub calculation: Option<Value>,
    pub calculation_issues: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeDraft {
    pub id: String,
    pub recipe_id: String,
    pub based_on_version_id: Option<String>,
    pub source: String,
    pub payload_version: i64,
    pub payload: Value,
    pub calculation: Option<Value>,
    pub calculation_issues: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeVersionInput {
    pub recipe_id: String,
    pub source_draft_id: String,
    pub based_on_version_id: Option<String>,
    pub snapshot_schema_version: i64,
    pub snapshot: Value,
    pub dependency_version_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeVersion {
    pub id: String,
    pub recipe_id: String,
    pub version_number: i64,
    pub source_draft_id: String,
    pub based_on_version_id: Option<String>,
    pub snapshot_schema_version: i64,
    pub snapshot: Value,
    pub dependency_version_ids: Vec<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeVersionReference {
    pub id: String,
    pub recipe_id: String,
    pub recipe_name: String,
    pub version_number: i64,
    pub output_mass_grams: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    pub recipe: Recipe,
    pub draft_updated_at: Option<String>,
    pub latest_version: Option<RecipeVersionReference>,
    pub referenced_by_count: i64,
}
