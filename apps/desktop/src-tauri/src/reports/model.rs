use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchReportInput {
    pub document: Value,
    pub svg: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchReport {
    pub id: String,
    pub recipe_version_id: String,
    pub nutrition_label_version_id: String,
    pub document: Value,
    pub svg: String,
    pub created_at: String,
}
