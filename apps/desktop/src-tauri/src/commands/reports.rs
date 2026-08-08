use tauri::State;

use crate::reports::{
    export::{self, ResearchReportExportRequest, SampleSheetExportRequest},
    model::{ResearchReport, ResearchReportInput},
    repository::ResearchReportRepository,
};

use super::{AppState, CommandError};

fn repository(state: &State<'_, AppState>) -> Result<ResearchReportRepository, CommandError> {
    ResearchReportRepository::open(&state.database_path).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_research_report(
    input: ResearchReportInput,
    state: State<'_, AppState>,
) -> Result<ResearchReport, CommandError> {
    repository(&state)?.create_report(input).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_research_reports(
    recipe_version_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ResearchReport>, CommandError> {
    repository(&state)?
        .list_reports(&recipe_version_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_research_report(
    id: String,
    state: State<'_, AppState>,
) -> Result<ResearchReport, CommandError> {
    repository(&state)?.get_report(&id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_research_report(
    request: ResearchReportExportRequest,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    let repository = repository(&state)?;
    let report = repository.get_report(&request.report_id)?;
    export::export_research_report(&report, request).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_sample_sheet(request: SampleSheetExportRequest) -> Result<(), CommandError> {
    export::export_sample_sheet(request).map_err(Into::into)
}
