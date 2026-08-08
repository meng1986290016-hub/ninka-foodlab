use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::recipes::model::{Recipe, RecipeKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRecipeProposalMode {
    GoalDesign,
    LabelReverse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRecipeProposalStatus {
    PendingReview,
    Accepted,
    Discarded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRecipeConfidence {
    High,
    Medium,
    Low,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeRequirement {
    pub nutrient_definition_id: Option<String>,
    pub name: String,
    pub unit: String,
    pub minimum: Option<String>,
    pub maximum: Option<String>,
    pub origin: String,
    pub rationale: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AgentRecipeProposalItem {
    Ingredient {
        id: String,
        position: i64,
        amount: String,
        unit: String,
        estimated_minimum: Option<String>,
        estimated_maximum: Option<String>,
        confidence: AgentRecipeConfidence,
        ingredient_variant_id: String,
        ingredient_updated_at: String,
        material_name: String,
        supplier_name: String,
        model_or_specification: String,
        selection_reason: String,
    },
    MaterialNeed {
        id: String,
        position: i64,
        amount: String,
        unit: String,
        estimated_minimum: Option<String>,
        estimated_maximum: Option<String>,
        confidence: AgentRecipeConfidence,
        material_name: String,
        purpose: String,
        desired_specification: String,
        missing_reason: String,
    },
}

impl AgentRecipeProposalItem {
    pub fn id(&self) -> &str {
        match self {
            Self::Ingredient { id, .. } | Self::MaterialNeed { id, .. } => id,
        }
    }

    pub fn amount(&self) -> &str {
        match self {
            Self::Ingredient { amount, .. } | Self::MaterialNeed { amount, .. } => amount,
        }
    }

    pub fn unit(&self) -> &str {
        match self {
            Self::Ingredient { unit, .. } | Self::MaterialNeed { unit, .. } => unit,
        }
    }

    pub fn position(&self) -> i64 {
        match self {
            Self::Ingredient { position, .. } | Self::MaterialNeed { position, .. } => *position,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeProposalPayload {
    pub product_name: String,
    pub recipe_kind: RecipeKind,
    pub mode: AgentRecipeProposalMode,
    pub planned_input_grams: String,
    pub finished_mass_grams: Option<String>,
    pub yield_assumption: String,
    pub items: Vec<AgentRecipeProposalItem>,
    #[serde(default)]
    pub requirements: Vec<AgentRecipeRequirement>,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub markdown_notes: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeProposal {
    pub id: String,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub status: AgentRecipeProposalStatus,
    pub payload_version: i64,
    pub payload: AgentRecipeProposalPayload,
    pub evaluation: Value,
    pub source_attachment_ids: Vec<String>,
    pub accepted_recipe_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AgentRecipeProposalDestination {
    NewProduct,
    Alternative {
        source_version_id: String,
        scheme_name: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeProposalAcceptInput {
    pub proposal_id: String,
    pub destination: AgentRecipeProposalDestination,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialNeedStatus {
    Open,
    Resolved,
    Dismissed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialNeed {
    pub id: String,
    pub proposal_id: Option<String>,
    pub recipe_id: Option<String>,
    pub material_name: String,
    pub purpose: String,
    pub desired_specification: String,
    pub missing_reason: String,
    pub suggested_amount: String,
    pub suggested_unit: String,
    pub status: MaterialNeedStatus,
    pub resolved_ingredient_variant_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedAgentRecipeProposal {
    pub recipe: Recipe,
    pub material_needs: Vec<MaterialNeed>,
}
