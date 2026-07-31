use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use serde::Deserialize;
use serde_json::{Map, Value, json};
use tauri::State;

use crate::{
    ingredients::repository::{IngredientRepository, RepositoryError},
    recipes::{
        model::{
            Recipe, RecipeDraft, RecipeDraftInput, RecipeInput, RecipeSummary, RecipeVersion,
            RecipeVersionInput,
        },
        repository::{RecipeRepository, version_reference},
    },
};

use super::{AppState, CommandError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeVersionCommandInput {
    pub recipe_id: String,
    pub source_draft_id: String,
    pub based_on_version_id: Option<String>,
    pub snapshot: Value,
    pub dependency_version_ids: Vec<String>,
}

fn command_error(code: impl Into<String>, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

fn recipe_repository(state: &State<'_, AppState>) -> Result<RecipeRepository, CommandError> {
    RecipeRepository::open(&state.database_path).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_recipes(state: State<'_, AppState>) -> Result<Vec<RecipeSummary>, CommandError> {
    recipe_repository(&state)?
        .list_recipe_summaries()
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_recipe(id: String, state: State<'_, AppState>) -> Result<Recipe, CommandError> {
    recipe_repository(&state)?
        .get_recipe(&id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_recipe(
    input: RecipeInput,
    state: State<'_, AppState>,
) -> Result<Recipe, CommandError> {
    recipe_repository(&state)?
        .create_recipe(input)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_recipe(
    id: String,
    input: RecipeInput,
    state: State<'_, AppState>,
) -> Result<Recipe, CommandError> {
    recipe_repository(&state)?
        .update_recipe(&id, input)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_recipe(id: String, state: State<'_, AppState>) -> Result<(), CommandError> {
    recipe_repository(&state)?
        .archive_recipe(&id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_recipe_draft(
    recipe_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Value>, CommandError> {
    let draft = recipe_repository(&state)?.get_draft(&recipe_id)?;
    draft
        .map(|draft| materialize_draft(&state.database_path, draft))
        .transpose()
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_recipe_draft(input: Value, state: State<'_, AppState>) -> Result<Value, CommandError> {
    save_recipe_draft_at_path(&state.database_path, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_recipe_versions(
    recipe_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Value>, CommandError> {
    recipe_repository(&state)?
        .list_versions(&recipe_id)?
        .into_iter()
        .map(|version| version_to_value(&version))
        .collect()
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_recipe_version(id: String, state: State<'_, AppState>) -> Result<Value, CommandError> {
    let version = recipe_repository(&state)?.get_version(&id)?;
    version_to_value(&version)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_recipe_version(
    input: RecipeVersionCommandInput,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let snapshot_schema_version = input
        .snapshot
        .get("schemaVersion")
        .and_then(Value::as_i64)
        .ok_or_else(|| command_error("invalid_input", "配方版本快照无效"))?;
    let version = recipe_repository(&state)?.create_version(RecipeVersionInput {
        recipe_id: input.recipe_id,
        source_draft_id: input.source_draft_id,
        based_on_version_id: input.based_on_version_id,
        snapshot_schema_version,
        snapshot: input.snapshot,
        dependency_version_ids: input.dependency_version_ids,
    })?;
    version_to_value(&version)
}

#[tauri::command(rename_all = "camelCase")]
pub fn copy_recipe_version_to_draft(
    version_id: String,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let version = recipe_repository(&state)?.get_version(&version_id)?;
    let snapshot = version
        .snapshot
        .as_object()
        .ok_or_else(|| command_error("storage_failure", "配方版本快照无法读取"))?;
    let items = snapshot
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| command_error("storage_failure", "配方版本原料无法读取"))?
        .iter()
        .map(draft_item_from_snapshot)
        .collect::<Result<Vec<_>, _>>()?;
    let input = json!({
        "recipeId": version.recipe_id,
        "basedOnVersionId": version.id,
        "source": "manual",
        "targetBatchGrams": snapshot.get("targetBatchGrams").cloned().unwrap_or(Value::String("0".into())),
        "finishedMassGrams": snapshot.get("finishedMassGrams").cloned().unwrap_or(Value::Null),
        "servingMassGrams": snapshot.get("servingMassGrams").cloned().unwrap_or(Value::Null),
        "packageCount": snapshot.get("packageCount").cloned().unwrap_or(Value::Null),
        "items": items,
        "packagingCosts": snapshot.get("packagingCosts").cloned().unwrap_or_else(|| json!([])),
        "additionalCosts": snapshot.get("additionalCosts").cloned().unwrap_or_else(|| json!([])),
        "targets": snapshot.get("targets").cloned().unwrap_or_else(|| json!([])),
        "markdownNotes": snapshot.get("markdownNotes").cloned().unwrap_or(Value::String(String::new())),
        "calculation": snapshot.get("calculation").cloned().unwrap_or(Value::Null),
        "calculationIssues": [],
    });
    save_recipe_draft_at_path(&state.database_path, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn compare_recipe_versions(
    before_version_id: String,
    after_version_id: String,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let repository = recipe_repository(&state)?;
    let before = repository.get_version(&before_version_id)?;
    let after = repository.get_version(&after_version_id)?;
    if before.recipe_id != after.recipe_id {
        return Err(command_error(
            "invalid_input",
            "只能比较同一个配方的正式版本",
        ));
    }
    compare_versions(&before, &after)
}

fn draft_input_from_value(mut input: Value) -> Result<RecipeDraftInput, CommandError> {
    let object = input
        .as_object_mut()
        .ok_or_else(|| command_error("invalid_input", "配方草稿必须是结构化对象"))?;
    let recipe_id = string_field(object, "recipeId", "找不到草稿对应的配方")?;
    let based_on_version_id = optional_string_field(object, "basedOnVersionId")?;
    let source = string_field(object, "source", "草稿来源无效")?;
    let calculation = object
        .remove("calculation")
        .filter(|value| !value.is_null());
    let calculation_issues = object
        .remove("calculationIssues")
        .unwrap_or_else(|| json!([]))
        .as_array()
        .cloned()
        .ok_or_else(|| command_error("invalid_input", "草稿问题列表无效"))?;
    Ok(RecipeDraftInput {
        recipe_id,
        based_on_version_id,
        source,
        payload_version: 1,
        payload: input,
        calculation,
        calculation_issues,
    })
}

fn save_recipe_draft_at_path(path: &Path, input: Value) -> Result<Value, CommandError> {
    let repository_input = draft_input_from_value(input)?;
    let mut repository = RecipeRepository::open(path)?;
    let draft = repository.save_draft(repository_input)?;
    drop(repository);
    materialize_draft(path, draft)
}

fn materialize_draft(path: &Path, draft: RecipeDraft) -> Result<Value, CommandError> {
    let mut object = draft
        .payload
        .as_object()
        .cloned()
        .ok_or_else(|| command_error("storage_failure", "配方草稿无法读取"))?;
    object.insert("id".into(), Value::String(draft.id));
    object.insert("recipeId".into(), Value::String(draft.recipe_id));
    object.insert(
        "basedOnVersionId".into(),
        draft
            .based_on_version_id
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    object.insert("source".into(), Value::String(draft.source));
    object.insert(
        "calculation".into(),
        draft.calculation.unwrap_or(Value::Null),
    );
    object.insert(
        "calculationIssues".into(),
        Value::Array(draft.calculation_issues),
    );
    object.insert("createdAt".into(), Value::String(draft.created_at));
    object.insert("updatedAt".into(), Value::String(draft.updated_at));

    let items = object
        .remove("items")
        .unwrap_or_else(|| json!([]))
        .as_array()
        .cloned()
        .ok_or_else(|| command_error("storage_failure", "配方草稿原料无法读取"))?;
    let ingredient_repository = IngredientRepository::open(path)?;
    let recipe_repository = RecipeRepository::open(path)?;
    let items = items
        .into_iter()
        .map(|mut item| {
            let item_object = item
                .as_object_mut()
                .ok_or_else(|| command_error("storage_failure", "配方草稿原料无法读取"))?;
            match item_object.get("kind").and_then(Value::as_str) {
                Some("ingredient") => {
                    let variant_id = string_field(
                        item_object,
                        "ingredientVariantId",
                        "找不到配方中的供应商原料版本",
                    )?;
                    let variant = ingredient_repository.get_variant(&variant_id)?;
                    let material_name =
                        ingredient_repository.get_material_name_for_variant(&variant_id)?;
                    item_object.insert("materialName".into(), Value::String(material_name));
                    item_object.insert(
                        "ingredientVariant".into(),
                        serde_json::to_value(variant).map_err(RepositoryError::from)?,
                    );
                }
                Some("recipe_version") => {
                    let version_id =
                        string_field(item_object, "recipeVersionId", "找不到配方中的半成品版本")?;
                    let version = recipe_repository.get_version(&version_id)?;
                    item_object.insert(
                        "recipeVersion".into(),
                        serde_json::to_value(version_reference(&version))
                            .map_err(RepositoryError::from)?,
                    );
                }
                _ => {
                    return Err(command_error("storage_failure", "配方草稿原料类型无法读取"));
                }
            }
            Ok(item)
        })
        .collect::<Result<Vec<_>, CommandError>>()?;
    object.insert("items".into(), Value::Array(items));
    Ok(Value::Object(object))
}

fn draft_item_from_snapshot(item: &Value) -> Result<Value, CommandError> {
    let source = item
        .as_object()
        .ok_or_else(|| command_error("storage_failure", "配方版本原料无法读取"))?;
    let mut draft = Map::new();
    for field in [
        "id", "position", "kind", "amount", "unit", "locked", "autoFill",
    ] {
        draft.insert(
            field.into(),
            source
                .get(field)
                .cloned()
                .ok_or_else(|| command_error("storage_failure", "配方版本原料无法读取"))?,
        );
    }
    match source.get("kind").and_then(Value::as_str) {
        Some("ingredient") => {
            let id = source
                .get("ingredient")
                .and_then(Value::as_object)
                .and_then(|ingredient| ingredient.get("ingredientVariantId"))
                .cloned()
                .ok_or_else(|| command_error("storage_failure", "配方原料快照无法读取"))?;
            draft.insert("ingredientVariantId".into(), id);
        }
        Some("recipe_version") => {
            let id = source
                .get("recipeVersion")
                .and_then(Value::as_object)
                .and_then(|version| version.get("id"))
                .cloned()
                .ok_or_else(|| command_error("storage_failure", "半成品快照无法读取"))?;
            draft.insert("recipeVersionId".into(), id);
        }
        _ => {
            return Err(command_error("storage_failure", "配方版本原料类型无法读取"));
        }
    }
    Ok(Value::Object(draft))
}

fn version_to_value(version: &RecipeVersion) -> Result<Value, CommandError> {
    Ok(json!({
        "id": version.id,
        "recipeId": version.recipe_id,
        "versionNumber": version.version_number,
        "sourceDraftId": version.source_draft_id,
        "basedOnVersionId": version.based_on_version_id,
        "snapshot": version.snapshot,
        "createdAt": version.created_at,
    }))
}

fn compare_versions(before: &RecipeVersion, after: &RecipeVersion) -> Result<Value, CommandError> {
    let (before_item_order, before_items) = item_map(before)?;
    let (after_item_order, after_items) = item_map(after)?;
    let item_keys = ordered_keys_from_vectors(&before_item_order, &after_item_order);
    let mut item_changes = Vec::new();
    for key in item_keys {
        let before_item = before_items.get(&key);
        let after_item = after_items.get(&key);
        let label = after_item
            .or(before_item)
            .map(item_label)
            .unwrap_or_else(|| key.clone());
        match (before_item, after_item) {
            (Some(before_item), Some(after_item)) => {
                let before_reference = item_reference(before_item);
                let after_reference = item_reference(after_item);
                let before_label = item_label(before_item);
                let after_label = item_label(after_item);
                let before_mass = string_at(before_item, "/massGrams").unwrap_or("0");
                let after_mass = string_at(after_item, "/massGrams").unwrap_or("0");
                if before_reference != after_reference {
                    item_changes.push(json!({
                        "kind": "reference_changed",
                        "itemKey": key,
                        "label": label,
                        "beforeLabel": before_label,
                        "afterLabel": after_label,
                        "beforeAmountGrams": before_mass,
                        "afterAmountGrams": after_mass,
                    }));
                } else if before_mass != after_mass {
                    item_changes.push(json!({
                        "kind": "amount_changed",
                        "itemKey": key,
                        "label": label,
                        "beforeLabel": before_label,
                        "afterLabel": after_label,
                        "beforeAmountGrams": before_mass,
                        "afterAmountGrams": after_mass,
                    }));
                }
            }
            (Some(before_item), None) => item_changes.push(json!({
                "kind": "removed",
                "itemKey": key,
                "label": label,
                "beforeLabel": item_label(before_item),
                "afterLabel": null,
                "beforeAmountGrams": string_at(before_item, "/massGrams"),
                "afterAmountGrams": null,
            })),
            (None, Some(after_item)) => item_changes.push(json!({
                "kind": "added",
                "itemKey": key,
                "label": label,
                "beforeLabel": null,
                "afterLabel": item_label(after_item),
                "beforeAmountGrams": null,
                "afterAmountGrams": string_at(after_item, "/massGrams"),
            })),
            (None, None) => {}
        }
    }

    let nutrition_changes = comparison_rows(nutrient_cells(before), nutrient_cells(after));
    let cost_changes = comparison_rows(cost_cells(before), cost_cells(after));
    let target_changes = comparison_rows(target_cells(before), target_cells(after));
    let allergen_changes = comparison_rows(allergen_cells(before), allergen_cells(after));
    Ok(json!({
        "before": version_reference(before),
        "after": version_reference(after),
        "itemChanges": item_changes,
        "nutritionChanges": nutrition_changes,
        "costChanges": cost_changes,
        "targetChanges": target_changes,
        "allergenChanges": allergen_changes,
        "notesChanged": before.snapshot.get("markdownNotes") != after.snapshot.get("markdownNotes"),
    }))
}

#[derive(Clone)]
struct ComparisonCell {
    label: String,
    unit: Option<String>,
    value: Option<String>,
}

fn comparison_rows(
    before: (Vec<String>, HashMap<String, ComparisonCell>),
    after: (Vec<String>, HashMap<String, ComparisonCell>),
) -> Vec<Value> {
    let keys = ordered_keys_from_vectors(&before.0, &after.0);
    keys.into_iter()
        .filter_map(|key| {
            let before_cell = before.1.get(&key);
            let after_cell = after.1.get(&key);
            let before_value = before_cell.and_then(|cell| cell.value.clone());
            let after_value = after_cell.and_then(|cell| cell.value.clone());
            (before_value != after_value).then(|| {
                let cell = after_cell.or(before_cell);
                json!({
                    "key": key,
                    "label": cell.map(|value| value.label.clone()).unwrap_or_default(),
                    "unit": cell.and_then(|value| value.unit.clone()),
                    "before": before_value,
                    "after": after_value,
                })
            })
        })
        .collect()
}

fn nutrient_cells(version: &RecipeVersion) -> (Vec<String>, HashMap<String, ComparisonCell>) {
    let nutrients = version
        .snapshot
        .pointer("/calculation/nutrients")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut keys = Vec::new();
    let mut cells = HashMap::new();
    for nutrient in nutrients {
        let Some(key) = nutrient
            .get("nutrientDefinitionId")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        keys.push(key.clone());
        cells.insert(
            key,
            ComparisonCell {
                label: nutrient
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                unit: nutrient
                    .get("unit")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                value: nutrient
                    .get("status")
                    .and_then(Value::as_str)
                    .filter(|status| *status != "unknown")
                    .and_then(|_| nutrient.get("per100gKnownAmount").and_then(Value::as_str))
                    .map(str::to_string),
            },
        );
    }
    (keys, cells)
}

fn cost_cells(version: &RecipeVersion) -> (Vec<String>, HashMap<String, ComparisonCell>) {
    let definitions = [
        ("batchTotal", "整批成本"),
        ("perKg", "每千克成本"),
        ("per100g", "每100克成本"),
        ("perServing", "每份成本"),
        ("perPackage", "每包装成本"),
    ];
    let mut cells = HashMap::new();
    for (key, label) in definitions {
        cells.insert(
            key.to_string(),
            ComparisonCell {
                label: label.to_string(),
                unit: Some("CNY".into()),
                value: version
                    .snapshot
                    .pointer(&format!("/calculation/cost/{key}"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
            },
        );
    }
    (
        definitions
            .iter()
            .map(|(key, _)| (*key).to_string())
            .collect(),
        cells,
    )
}

fn target_cells(version: &RecipeVersion) -> (Vec<String>, HashMap<String, ComparisonCell>) {
    let targets = version
        .snapshot
        .get("targets")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let evaluations = version
        .snapshot
        .pointer("/calculation/targets")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut keys = Vec::new();
    let mut cells = HashMap::new();
    for target in targets {
        let Some(key) = target.get("id").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        let evaluation = evaluations.iter().find(|candidate| {
            candidate.get("targetId").and_then(Value::as_str) == Some(key.as_str())
        });
        let (label, unit) = target_metric_label_and_unit(&target);
        let observed = evaluation
            .and_then(|value| value.get("observed"))
            .and_then(Value::as_str)
            .map(format_observed_value)
            .unwrap_or_else(|| "未知".into());
        let status = evaluation
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str)
            .map(target_status_label)
            .unwrap_or("待计算");
        keys.push(key.clone());
        cells.insert(
            key,
            ComparisonCell {
                label,
                unit,
                value: Some(format!(
                    "{} · 实际 {} · {}",
                    target_range_label(&target),
                    observed,
                    status
                )),
            },
        );
    }
    (keys, cells)
}

fn format_observed_value(value: &str) -> String {
    let Ok(number) = value.parse::<f64>() else {
        return value.to_string();
    };
    if !number.is_finite() {
        return value.to_string();
    }
    let formatted = format!("{number:.4}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

fn target_metric_label_and_unit(target: &Value) -> (String, Option<String>) {
    let Some(metric) = target.get("metric") else {
        return ("未命名目标".into(), None);
    };
    match metric.get("kind").and_then(Value::as_str) {
        Some("nutrition_per_100g") => (
            format!(
                "{}（每 100g）",
                metric
                    .get("nutrientName")
                    .and_then(Value::as_str)
                    .unwrap_or("营养素")
            ),
            metric
                .get("unit")
                .and_then(Value::as_str)
                .map(str::to_string),
        ),
        Some("cost") => {
            let label = match metric.get("basis").and_then(Value::as_str) {
                Some("batch") => "整批成本",
                Some("per_kg") => "每千克成本",
                Some("per_100g") => "每 100g 成本",
                Some("per_serving") => "每份成本",
                Some("per_package") => "每包装成本",
                _ => "成本",
            };
            (label.into(), Some("CNY".into()))
        }
        _ => ("未命名目标".into(), None),
    }
}

fn target_range_label(target: &Value) -> String {
    let minimum = target.get("minimum").and_then(Value::as_str);
    let maximum = target.get("maximum").and_then(Value::as_str);
    let unit = match target.pointer("/metric/kind").and_then(Value::as_str) {
        Some("cost") => " 元".to_string(),
        _ => target
            .pointer("/metric/unit")
            .and_then(Value::as_str)
            .map(|value| format!(" {value}"))
            .unwrap_or_default(),
    };
    match (minimum, maximum) {
        (Some(minimum), Some(maximum)) => format!("{minimum}–{maximum}{unit}"),
        (Some(minimum), None) => format!("≥ {minimum}{unit}"),
        (None, Some(maximum)) => format!("≤ {maximum}{unit}"),
        (None, None) => "未设置范围".into(),
    }
}

fn target_status_label(status: &str) -> &'static str {
    match status {
        "met" => "已达到",
        "below" => "低于目标",
        "above" => "高于目标",
        _ => "待计算",
    }
}

fn allergen_cells(version: &RecipeVersion) -> (Vec<String>, HashMap<String, ComparisonCell>) {
    let mut cells = HashMap::new();
    for (key, label) in [("contains", "含有"), ("mayContain", "可能含有")] {
        let value = version
            .snapshot
            .pointer(&format!("/calculation/allergens/{key}"))
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("、")
            });
        cells.insert(
            key.to_string(),
            ComparisonCell {
                label: label.to_string(),
                unit: None,
                value,
            },
        );
    }
    (vec!["contains".into(), "mayContain".into()], cells)
}

fn item_map(
    version: &RecipeVersion,
) -> Result<(Vec<String>, HashMap<String, Value>), CommandError> {
    let items = version
        .snapshot
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| command_error("storage_failure", "配方版本原料无法读取"))?;
    let mut keys = Vec::new();
    let mut map = HashMap::new();
    for item in items {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| command_error("storage_failure", "配方版本原料无法读取"))?
            .to_string();
        keys.push(id.clone());
        map.insert(id, item.clone());
    }
    Ok((keys, map))
}

fn ordered_keys_from_vectors(before: &[String], after: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    before
        .iter()
        .chain(after.iter())
        .filter(|key| seen.insert((*key).clone()))
        .cloned()
        .collect()
}

fn item_reference(item: &Value) -> Option<String> {
    match item.get("kind").and_then(Value::as_str) {
        Some("ingredient") => {
            string_at(item, "/ingredient/ingredientVariantId").map(|id| format!("ingredient:{id}"))
        }
        Some("recipe_version") => {
            string_at(item, "/recipeVersion/id").map(|id| format!("recipe_version:{id}"))
        }
        _ => None,
    }
}

fn item_label(item: &Value) -> String {
    match item.get("kind").and_then(Value::as_str) {
        Some("ingredient") => [
            string_at(item, "/ingredient/materialName").unwrap_or("未命名原料"),
            string_at(item, "/ingredient/supplierName").unwrap_or("未指定供应商"),
            string_at(item, "/ingredient/modelOrSpecification").unwrap_or_default(),
        ]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" · "),
        Some("recipe_version") => format!(
            "{} V{}",
            string_at(item, "/recipeVersion/recipeName").unwrap_or("未命名配方"),
            item.pointer("/recipeVersion/versionNumber")
                .and_then(Value::as_i64)
                .unwrap_or(0),
        ),
        _ => "未知项目".into(),
    }
}

fn string_at<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn string_field(
    object: &Map<String, Value>,
    field: &str,
    message: &str,
) -> Result<String, CommandError> {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| command_error("invalid_input", message))
}

fn optional_string_field(
    object: &Map<String, Value>,
    field: &str,
) -> Result<Option<String>, CommandError> {
    match object.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(command_error("invalid_input", "配方来源版本无效")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(id: &str, number: i64, nutrient_status: &str) -> RecipeVersion {
        RecipeVersion {
            id: id.into(),
            recipe_id: "recipe-1".into(),
            version_number: number,
            source_draft_id: "draft-1".into(),
            based_on_version_id: None,
            snapshot_schema_version: 1,
            snapshot: json!({
                "schemaVersion": 1,
                "recipe": {
                    "id": "recipe-1",
                    "name": "测试配方",
                    "code": null,
                    "tags": [],
                    "kind": "formula"
                },
                "targetBatchGrams": "1000",
                "finishedMassGrams": null,
                "items": [],
                "markdownNotes": "",
                "calculation": {
                    "nutrients": [{
                        "nutrientDefinitionId": "protein",
                        "name": "蛋白质",
                        "unit": "g",
                        "per100gKnownAmount": "0",
                        "status": nutrient_status
                    }],
                    "cost": {
                        "batchTotal": "0",
                        "perKg": "0",
                        "per100g": "0",
                        "perServing": null,
                        "perPackage": null
                    },
                    "targets": [],
                    "allergens": {
                        "contains": [],
                        "mayContain": []
                    }
                }
            }),
            dependency_version_ids: Vec::new(),
            created_at: format!("2026-07-30T0{number}:00:00Z"),
        }
    }

    #[test]
    fn comparison_preserves_unknown_separately_from_confirmed_zero() {
        let compared = compare_versions(
            &version("version-1", 1, "unknown"),
            &version("version-2", 2, "complete"),
        )
        .unwrap();

        assert_eq!(
            compared["nutritionChanges"],
            json!([{
                "key": "protein",
                "label": "蛋白质",
                "unit": "g",
                "before": null,
                "after": "0"
            }])
        );
    }

    #[test]
    fn comparison_observed_values_use_readable_precision() {
        assert_eq!(format_observed_value("0.25347368421052631579"), "0.2535");
        assert_eq!(format_observed_value("3.80000000000000000000"), "3.8");
        assert_eq!(format_observed_value("未知"), "未知");
    }
}
