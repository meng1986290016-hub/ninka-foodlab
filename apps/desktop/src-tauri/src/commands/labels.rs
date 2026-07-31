use std::path::Path;

use chrono::Utc;
use serde_json::{Map, Value, json};
use tauri::State;

use crate::labels::{
    calculator,
    model::{
        NutritionLabel, NutritionLabelDraft, NutritionLabelDraftInput, NutritionLabelInput,
        NutritionLabelVersion, NutritionLabelVersionInput,
    },
    repository::NutritionLabelRepository,
};
use crate::recipes::repository::RecipeRepository;

use super::{AppState, CommandError};

fn command_error(code: impl Into<String>, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

fn repository(state: &State<'_, AppState>) -> Result<NutritionLabelRepository, CommandError> {
    NutritionLabelRepository::open(&state.database_path).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_nutrition_labels(
    recipe_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<NutritionLabel>, CommandError> {
    repository(&state)?
        .list_labels(&recipe_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_nutrition_label(
    id: String,
    state: State<'_, AppState>,
) -> Result<NutritionLabel, CommandError> {
    repository(&state)?.get_label(&id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_nutrition_label(
    input: NutritionLabelInput,
    state: State<'_, AppState>,
) -> Result<NutritionLabel, CommandError> {
    repository(&state)?.create_label(input).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_nutrition_label_draft(
    label_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Value>, CommandError> {
    repository(&state)?
        .get_draft(&label_id)?
        .map(materialize_draft)
        .transpose()
}

#[tauri::command(rename_all = "camelCase")]
pub fn calculate_nutrition_label_preview(
    input: Value,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    assert_input_references(&state.database_path, &input)?;
    calculate_nutrition_label_preview_value(input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_nutrition_label_draft(
    input: Value,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    save_nutrition_label_draft_at_path(&state.database_path, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_nutrition_label_versions(
    label_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<NutritionLabelVersion>, CommandError> {
    repository(&state)?
        .list_versions(&label_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_nutrition_label_version(
    id: String,
    state: State<'_, AppState>,
) -> Result<NutritionLabelVersion, CommandError> {
    repository(&state)?.get_version(&id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn publish_nutrition_label(
    label_id: String,
    state: State<'_, AppState>,
) -> Result<NutritionLabelVersion, CommandError> {
    publish_nutrition_label_at_path(&state.database_path, &label_id)
}

pub fn save_nutrition_label_draft_at_path(
    path: &Path,
    input: Value,
) -> Result<Value, CommandError> {
    let object = input
        .as_object()
        .ok_or_else(|| command_error("invalid_input", "营养标签草稿必须是结构化对象"))?;
    let label_id = string_field(object, "labelId", "找不到草稿对应的营养标签")?;
    let recipe_version_id = string_field(object, "recipeVersionId", "找不到草稿对应的配方版本")?;
    let rule_pack_id = string_field(object, "rulePackId", "营养标签规则包无效")?;
    let calculation = calculate_nutrition_label_preview_value(input.clone())?;
    let issues = calculation
        .get("issues")
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| command_error("storage_failure", "营养标签计算问题无法读取"))?;
    let mut payload = object.clone();
    payload.remove("labelId");
    payload.remove("recipeVersionId");
    payload.remove("calculation");
    let mut repository = NutritionLabelRepository::open(path)?;
    let draft = repository.save_draft(NutritionLabelDraftInput {
        label_id,
        recipe_version_id,
        rule_pack_id,
        payload_schema_version: 1,
        payload: Value::Object(payload),
        calculation: Some(calculation),
        issues,
    })?;
    materialize_draft(draft)
}

pub fn publish_nutrition_label_at_path(
    path: &Path,
    label_id: &str,
) -> Result<NutritionLabelVersion, CommandError> {
    let mut repository = NutritionLabelRepository::open(path)?;
    let label = repository.get_label(label_id)?;
    let draft = repository
        .get_draft(label_id)?
        .ok_or_else(|| command_error("missing_reference", "找不到正式标签对应的草稿"))?;
    let calculation = calculate_nutrition_label_preview_value(draft.payload.clone())?;
    if calculation.get("publishable").and_then(Value::as_bool) != Some(true) {
        return Err(command_error(
            "invalid_state",
            "营养标签仍有必填数据问题，不能发布正式版本",
        ));
    }
    let rule_pack = calculation
        .get("rulePack")
        .and_then(Value::as_object)
        .ok_or_else(|| command_error("storage_failure", "营养标签规则包无法读取"))?;
    let rule_pack_id = string_field(rule_pack, "id", "营养标签规则包无法读取")?;
    let rule_pack_revision = string_field(rule_pack, "revision", "营养标签规则包修订号无法读取")?;
    let source_values = draft
        .payload
        .get("sourceValues")
        .cloned()
        .ok_or_else(|| command_error("storage_failure", "营养标签来源值无法读取"))?;
    let timestamp = Utc::now().to_rfc3339();
    let snapshot = json!({
        "schemaVersion": 1,
        "id": "",
        "labelId": label.id,
        "labelVersionNumber": 0,
        "recipeId": label.recipe_id,
        "recipeVersionId": draft.recipe_version_id,
        "rulePack": calculation.get("rulePack").cloned().unwrap_or(Value::Null),
        "basis": calculation.get("basis").cloned().unwrap_or(Value::Null),
        "sourceValues": source_values,
        "rows": calculation.get("rows").cloned().unwrap_or_else(|| json!([])),
        "issues": calculation.get("issues").cloned().unwrap_or_else(|| json!([])),
        "publishable": true,
        "requiredNotice": calculation.get("requiredNotice").cloned().unwrap_or(Value::Null),
        "generatedAt": timestamp,
    });
    repository
        .create_version(NutritionLabelVersionInput {
            label_id: label.id,
            source_draft_id: draft.id,
            recipe_version_id: draft.recipe_version_id,
            rule_pack_id,
            rule_pack_revision,
            snapshot_schema_version: 1,
            snapshot,
        })
        .map_err(Into::into)
}

pub fn calculate_nutrition_label_preview_value(input: Value) -> Result<Value, CommandError> {
    calculator::calculate(&input).map_err(|message| command_error("invalid_input", message))
}

fn materialize_draft(draft: NutritionLabelDraft) -> Result<Value, CommandError> {
    let mut value = draft
        .payload
        .as_object()
        .cloned()
        .ok_or_else(|| command_error("storage_failure", "营养标签草稿无法读取"))?;
    value.insert("id".into(), Value::String(draft.id));
    value.insert("labelId".into(), Value::String(draft.label_id));
    value.insert(
        "recipeVersionId".into(),
        Value::String(draft.recipe_version_id),
    );
    value.insert("rulePackId".into(), Value::String(draft.rule_pack_id));
    value.insert(
        "calculation".into(),
        draft.calculation.unwrap_or(Value::Null),
    );
    value.insert("createdAt".into(), Value::String(draft.created_at));
    value.insert("updatedAt".into(), Value::String(draft.updated_at));
    Ok(Value::Object(value))
}

fn string_field(
    object: &Map<String, Value>,
    key: &str,
    message: &str,
) -> Result<String, CommandError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| command_error("invalid_input", message))
}

fn assert_input_references(path: &Path, input: &Value) -> Result<(), CommandError> {
    let object = input
        .as_object()
        .ok_or_else(|| command_error("invalid_input", "营养标签草稿必须是结构化对象"))?;
    let label_id = string_field(object, "labelId", "找不到草稿对应的营养标签")?;
    let recipe_version_id = string_field(object, "recipeVersionId", "找不到草稿对应的配方版本")?;
    let label = NutritionLabelRepository::open(path)?.get_label(&label_id)?;
    if label.archived_at.is_some() {
        return Err(command_error("archived", "已归档营养标签不能计算预览"));
    }
    let recipe_version = RecipeRepository::open(path)?.get_version(&recipe_version_id)?;
    if recipe_version.recipe_id != label.recipe_id {
        return Err(command_error("missing_reference", "找不到该配方的正式版本"));
    }
    Ok(())
}
