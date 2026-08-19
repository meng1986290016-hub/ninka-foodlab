use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NutrientDefinition {
    pub id: String,
    pub code: String,
    pub name: String,
    pub unit: String,
    pub built_in: bool,
    pub sort_order: i64,
    pub category: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantNutritionValue {
    pub nutrient_definition_id: String,
    pub value: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantNutrition {
    pub basis: String,
    pub values: Vec<VariantNutritionValue>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataCompleteness {
    pub percent: i64,
    pub missing_fields: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientVariantAllergens {
    pub contains: Vec<String>,
    pub may_contain: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientSourceAttachment {
    pub id: String,
    pub original_name: String,
    pub media_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientVariant {
    pub id: String,
    pub material_group_id: String,
    pub supplier_id: String,
    pub supplier_name: String,
    pub model_or_specification: String,
    pub internal_code: Option<String>,
    pub current_price: Option<String>,
    pub price_unit: String,
    pub density_g_per_ml: Option<String>,
    pub source: String,
    pub research_notes: String,
    pub nutrition: VariantNutrition,
    pub allergens: IngredientVariantAllergens,
    pub source_attachments: Vec<IngredientSourceAttachment>,
    pub completeness: DataCompleteness,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialGroup {
    pub id: String,
    pub name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub variants: Vec<IngredientVariant>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialGroupInput {
    pub name: String,
    pub category_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngredientVariantInput {
    #[serde(default)]
    pub id: Option<String>,
    pub material_group_id: String,
    pub supplier_id: String,
    #[serde(default)]
    pub model_or_specification: String,
    #[serde(default)]
    pub internal_code: Option<String>,
    #[serde(default)]
    pub current_price: Option<String>,
    pub price_unit: String,
    #[serde(default)]
    pub density_g_per_ml: Option<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub research_notes: String,
    pub nutrition: VariantNutrition,
    #[serde(default)]
    pub allergens: IngredientVariantAllergens,
    #[serde(default)]
    pub duplicate_confirmed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantComparisonRow {
    pub key: String,
    pub label: String,
    pub unit: Option<String>,
    pub values: BTreeMap<String, Option<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantComparison {
    pub material_group_id: String,
    pub variants: Vec<IngredientVariant>,
    pub rows: Vec<VariantComparisonRow>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRecord {
    pub kind: String,
    pub key: String,
    pub payload_version: i64,
    pub payload: Value,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    pub mode: String,
    pub schema_version: i64,
    pub healthy: bool,
}
