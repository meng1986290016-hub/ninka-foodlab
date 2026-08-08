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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResearchReportExportFormat {
    Png,
    Pdf,
    Xlsx,
    Json,
}

impl ResearchReportExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Pdf => "pdf",
            Self::Xlsx => "xlsx",
            Self::Json => "json",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchReportExportRequest {
    pub report_id: String,
    pub format: ResearchReportExportFormat,
    pub destination_path: String,
    pub file_name: String,
    pub document_hash: String,
    pub bytes_base64: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleSheetExportRequest {
    pub destination_path: String,
    pub file_name: String,
    pub bytes_base64: String,
}
