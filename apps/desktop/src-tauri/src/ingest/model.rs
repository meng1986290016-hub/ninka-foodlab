use serde::{Deserialize, Serialize};

use crate::ingredients::model::IngredientVariant;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IngredientImportJobStatus {
    Pending,
    Extracting,
    Recognizing,
    Grouping,
    DraftsReady,
    PartiallyCompleted,
    Failed,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IngredientImportDraftStatus {
    NeedsReview,
    Ready,
    Imported,
    Discarded,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportIssueSeverity {
    Warning,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportIssueCode {
    MissingRequired,
    InvalidDecimal,
    InvalidUnit,
    InvalidBasis,
    DuplicateVariant,
    SourceConflict,
    UnsupportedFile,
    DamagedFile,
    PasswordProtected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIssue {
    pub code: ImportIssueCode,
    pub severity: ImportIssueSeverity,
    pub message: String,
    pub field_path: Option<String>,
    pub source_name: Option<String>,
    pub row: Option<u64>,
    pub column: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportFileReferenceKind {
    NativePath,
    BrowserDemo,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFileReference {
    pub kind: ImportFileReferenceKind,
    pub value: String,
    #[serde(default)]
    pub media_type: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAttachment {
    pub id: String,
    pub original_name: String,
    pub media_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSourceLink {
    pub field_path: String,
    pub attachment_id: String,
    pub source_locator: Option<String>,
    #[serde(default)]
    pub confidence: Option<ImportFieldConfidence>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportFieldConfidence {
    High,
    Medium,
    Low,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedNutrientValue {
    pub definition_id: Option<String>,
    pub name: String,
    pub unit: String,
    pub value: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewedIngredientImportDraft {
    pub material_group_id: Option<String>,
    pub material_name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: String,
    pub model_or_specification: String,
    pub current_price: Option<String>,
    pub price_unit: Option<String>,
    pub density_g_per_ml: Option<String>,
    pub nutrition_basis: Option<String>,
    pub nutrients: Vec<ImportedNutrientValue>,
    pub contains_allergens: Vec<String>,
    pub may_contain_allergens: Vec<String>,
    pub source: String,
    pub research_notes: String,
    #[serde(default)]
    pub duplicate_confirmed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientImportDraft {
    pub id: String,
    pub job_id: String,
    pub position: u64,
    pub status: IngredientImportDraftStatus,
    pub review: ReviewedIngredientImportDraft,
    pub issues: Vec<ImportIssue>,
    pub attachments: Vec<SourceAttachment>,
    pub source_links: Vec<DraftSourceLink>,
    pub imported_variant_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IngredientImportSourceKind {
    Spreadsheet,
    Documents,
    Agent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientImportJobRequest {
    pub files: Vec<ImportFileReference>,
    pub source_kind: IngredientImportSourceKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientImportJob {
    pub id: String,
    pub source_kind: IngredientImportSourceKind,
    pub status: IngredientImportJobStatus,
    pub progress_current: u64,
    pub progress_total: u64,
    pub error_summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientImportCommitResult {
    pub job_id: String,
    pub variants: Vec<IngredientVariant>,
    pub attachment_count: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IngredientExchangeFormat {
    Csv,
    Xlsx,
}
