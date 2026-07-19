use tauri::State;

use crate::ingredients::model::{
    Category, DatabaseStatus, DraftRecord, IngredientVariant, IngredientVariantInput,
    MaterialGroup, MaterialGroupInput, NutrientDefinition, Supplier, VariantComparison,
};

use super::{AppState, CommandError};

fn with_repository<T>(
    state: &State<'_, AppState>,
    action: impl FnOnce(
        &crate::ingredients::repository::IngredientRepository,
    ) -> Result<T, crate::ingredients::repository::RepositoryError>,
) -> Result<T, CommandError> {
    let coordinator = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    action(coordinator.ingredients()).map_err(Into::into)
}

fn with_repository_mut<T>(
    state: &State<'_, AppState>,
    action: impl FnOnce(
        &mut crate::ingredients::repository::IngredientRepository,
    ) -> Result<T, crate::ingredients::repository::RepositoryError>,
) -> Result<T, CommandError> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    action(coordinator.ingredients_mut()).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, CommandError> {
    with_repository(&state, |repository| repository.list_categories())
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_category(name: String, state: State<'_, AppState>) -> Result<Category, CommandError> {
    with_repository_mut(&state, |repository| repository.create_category(&name))
}

#[tauri::command(rename_all = "camelCase")]
pub fn rename_category(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<Category, CommandError> {
    with_repository_mut(&state, |repository| repository.rename_category(&id, &name))
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_category(id: String, state: State<'_, AppState>) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.archive_category(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_suppliers(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Supplier>, CommandError> {
    with_repository(&state, |repository| {
        repository.list_suppliers(query.as_deref().unwrap_or_default())
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_supplier(
    name: String,
    notes: Option<String>,
    state: State<'_, AppState>,
) -> Result<Supplier, CommandError> {
    with_repository_mut(&state, |repository| {
        repository.create_supplier(&name, notes.as_deref().unwrap_or_default())
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_supplier(
    id: String,
    name: String,
    notes: String,
    state: State<'_, AppState>,
) -> Result<Supplier, CommandError> {
    with_repository_mut(&state, |repository| {
        repository.update_supplier(&id, &name, &notes)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_supplier(id: String, state: State<'_, AppState>) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.archive_supplier(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_material_groups(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MaterialGroup>, CommandError> {
    with_repository(&state, |repository| {
        repository.list_material_groups(query.as_deref().unwrap_or_default())
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_material_group(
    input: MaterialGroupInput,
    state: State<'_, AppState>,
) -> Result<MaterialGroup, CommandError> {
    with_repository_mut(&state, move |repository| {
        repository.create_material_group(input)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_material_group(
    id: String,
    input: MaterialGroupInput,
    state: State<'_, AppState>,
) -> Result<MaterialGroup, CommandError> {
    with_repository_mut(&state, move |repository| {
        repository.update_material_group(&id, input)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_material_group(id: String, state: State<'_, AppState>) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.archive_material_group(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_ingredient_variant(
    input: IngredientVariantInput,
    state: State<'_, AppState>,
) -> Result<IngredientVariant, CommandError> {
    with_repository_mut(&state, move |repository| repository.save_variant(input))
}

#[tauri::command(rename_all = "camelCase")]
pub fn copy_ingredient_variant(
    source_id: String,
    supplier_id: String,
    state: State<'_, AppState>,
) -> Result<IngredientVariant, CommandError> {
    with_repository_mut(&state, |repository| {
        repository.copy_variant(&source_id, &supplier_id)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_ingredient_variant(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.archive_variant(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_nutrient_definitions(
    state: State<'_, AppState>,
) -> Result<Vec<NutrientDefinition>, CommandError> {
    with_repository(&state, |repository| repository.list_nutrient_definitions())
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_nutrient_definition(
    name: String,
    unit: String,
    state: State<'_, AppState>,
) -> Result<NutrientDefinition, CommandError> {
    with_repository_mut(&state, |repository| {
        repository.create_nutrient_definition(&name, &unit)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn compare_ingredient_variants(
    material_group_id: String,
    variant_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<VariantComparison, CommandError> {
    with_repository(&state, |repository| {
        repository.compare_variants(&material_group_id, &variant_ids)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_setting(
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, CommandError> {
    with_repository(&state, |repository| repository.get_setting(&key))
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_setting(
    key: String,
    value: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.set_setting(&key, &value))
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_draft(
    kind: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<DraftRecord>, CommandError> {
    with_repository(&state, |repository| repository.get_draft(&kind, &key))
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_draft(
    kind: String,
    key: String,
    payload_version: i64,
    payload: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<DraftRecord, CommandError> {
    with_repository_mut(&state, |repository| {
        repository.save_draft(&kind, &key, payload_version, &payload)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_draft(
    kind: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_repository_mut(&state, |repository| repository.clear_draft(&kind, &key))
}

#[tauri::command(rename_all = "camelCase")]
pub fn database_status(state: State<'_, AppState>) -> Result<DatabaseStatus, CommandError> {
    with_repository(&state, |repository| repository.database_status())
}
