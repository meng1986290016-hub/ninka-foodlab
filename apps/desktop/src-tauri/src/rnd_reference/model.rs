use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RndReferenceCardOrigin {
    Builtin,
    Personal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RndReferenceCardStatus {
    Draft,
    Approved,
    Archived,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RndReferenceEvidenceType {
    RegulatoryAgency,
    PeerReviewedReview,
    SupplierDocument,
    PersonalExperience,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceCardSource {
    pub title: String,
    pub publisher: String,
    pub url: Option<String>,
    pub published_at: Option<String>,
    pub locator: Option<String>,
    pub evidence_type: RndReferenceEvidenceType,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RndReferenceCard {
    pub id: String,
    pub origin: RndReferenceCardOrigin,
    pub status: RndReferenceCardStatus,
    pub parameter_key: String,
    pub title: String,
    pub ingredient_names: Vec<String>,
    pub specification: String,
    pub applicability: String,
    pub unit: String,
    pub basis: String,
    pub typical_value: String,
    pub minimum_value: String,
    pub maximum_value: String,
    pub source: ReferenceCardSource,
    pub review_version: i64,
    pub reviewed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalReferenceCardInput {
    pub title: String,
    pub parameter_key: String,
    pub ingredient_names: Vec<String>,
    pub specification: String,
    pub applicability: String,
    pub unit: String,
    pub basis: String,
    pub typical_value: String,
    pub minimum_value: String,
    pub maximum_value: String,
    pub source: ReferenceCardSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRecipeEstimateCardStatus {
    Ready,
    NeedsInput,
    Stale,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRecipeEstimateConfidence {
    High,
    Medium,
    Low,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeEstimateInput {
    pub label: String,
    pub amount: String,
    pub unit: String,
    pub reference_card_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeEstimateConflict {
    pub selected_reference_card_id: String,
    pub alternative_reference_card_ids: Vec<String>,
    pub rationale: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeEstimateCardDraft {
    pub recipe_id: String,
    pub source_draft_updated_at: String,
    pub source_draft_fingerprint: String,
    pub status: AgentRecipeEstimateCardStatus,
    pub parameter_key: String,
    pub title: String,
    pub estimated_value: Option<String>,
    pub minimum_value: Option<String>,
    pub maximum_value: Option<String>,
    pub unit: String,
    pub basis: String,
    pub confidence: AgentRecipeEstimateConfidence,
    #[serde(default)]
    pub formula_inputs: Vec<AgentRecipeEstimateInput>,
    #[serde(default)]
    pub cited_reference_card_ids: Vec<String>,
    pub calculation_summary: String,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub influencing_factors: Vec<String>,
    #[serde(default)]
    pub missing_inputs: Vec<String>,
    pub conflict: Option<AgentRecipeEstimateConflict>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeEstimateCard {
    pub id: String,
    pub conversation_id: String,
    pub run_id: String,
    pub recipe_id: String,
    pub recipe_name: String,
    pub source_draft_updated_at: String,
    pub source_draft_fingerprint: String,
    pub status: AgentRecipeEstimateCardStatus,
    pub parameter_key: String,
    pub title: String,
    pub estimated_value: Option<String>,
    pub minimum_value: Option<String>,
    pub maximum_value: Option<String>,
    pub unit: String,
    pub basis: String,
    pub confidence: AgentRecipeEstimateConfidence,
    pub formula_inputs: Vec<AgentRecipeEstimateInput>,
    pub cited_reference_card_ids: Vec<String>,
    pub calculation_summary: String,
    pub assumptions: Vec<String>,
    pub influencing_factors: Vec<String>,
    pub missing_inputs: Vec<String>,
    pub conflict: Option<AgentRecipeEstimateConflict>,
    pub note_preview: String,
    pub created_at: String,
    pub updated_at: String,
}
