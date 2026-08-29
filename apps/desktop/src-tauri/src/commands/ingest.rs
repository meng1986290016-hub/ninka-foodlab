use std::path::Path;

use tauri::State;

use crate::{
    ingest::model::{
        IngredientExchangeFormat, IngredientImportCommitResult, IngredientImportDraft,
        IngredientImportJob, IngredientImportJobRequest, ReviewedIngredientImportDraft,
    },
    ingredients::model::IngredientVariant,
};

use super::{AppState, CommandError};

fn with_coordinator<T>(
    state: &State<'_, AppState>,
    action: impl FnOnce(
        &mut crate::ingest::coordinator::IngredientIngestCoordinator,
    ) -> Result<T, crate::ingest::IngestError>,
) -> Result<T, CommandError> {
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    let coordinator = coordinator
        .as_mut()
        .ok_or_else(CommandError::state_unavailable)?;
    action(coordinator).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_ingredient_import_job(
    request: IngredientImportJobRequest,
    state: State<'_, AppState>,
) -> Result<IngredientImportJob, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.create_job(request))
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_ingredient_import_job(
    id: String,
    state: State<'_, AppState>,
) -> Result<IngredientImportJob, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.get_job(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_ingredient_import_drafts(
    job_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<IngredientImportDraft>, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.list_drafts(&job_id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_ingredient_import_draft(
    id: String,
    state: State<'_, AppState>,
) -> Result<IngredientImportDraft, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.get_draft(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_ingredient_import_draft(
    id: String,
    review: ReviewedIngredientImportDraft,
    state: State<'_, AppState>,
) -> Result<IngredientImportDraft, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.update_draft(&id, review))
}

#[tauri::command(rename_all = "camelCase")]
pub fn discard_ingredient_import_draft(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_coordinator(&state, |coordinator| coordinator.discard_draft(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn cancel_ingredient_import_job(
    id: String,
    state: State<'_, AppState>,
) -> Result<IngredientImportJob, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.cancel_job(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn retry_ingredient_import_job(
    id: String,
    state: State<'_, AppState>,
) -> Result<IngredientImportJob, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.retry_job(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn commit_ingredient_import_job(
    id: String,
    state: State<'_, AppState>,
) -> Result<IngredientImportCommitResult, CommandError> {
    with_coordinator(&state, |coordinator| coordinator.commit_job(&id))
}

#[tauri::command(rename_all = "camelCase")]
pub fn commit_reviewed_ingredient_import_draft(
    id: String,
    review: ReviewedIngredientImportDraft,
    state: State<'_, AppState>,
) -> Result<IngredientVariant, CommandError> {
    with_coordinator(&state, |coordinator| {
        coordinator.commit_reviewed_draft(&id, review)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_ingredient_template(
    format: IngredientExchangeFormat,
    destination_path: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_coordinator(&state, |coordinator| {
        coordinator.export_template(Path::new(&destination_path), format)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_ingredient_library(
    format: IngredientExchangeFormat,
    destination_path: String,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    with_coordinator(&state, |coordinator| {
        coordinator.export_library(Path::new(&destination_path), format)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn cleanup_orphan_attachments(state: State<'_, AppState>) -> Result<usize, CommandError> {
    with_coordinator(&state, |coordinator| {
        coordinator.cleanup_orphan_attachments()
    })
}
