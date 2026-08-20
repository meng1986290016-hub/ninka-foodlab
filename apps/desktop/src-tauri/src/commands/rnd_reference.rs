use tauri::State;

use crate::rnd_reference::{
    model::{AgentRecipeEstimateCard, PersonalReferenceCardInput, RndReferenceCard},
    repository::RndReferenceRepository,
};

use super::{AppState, CommandError};

#[tauri::command(rename_all = "camelCase")]
pub fn list_rnd_reference_cards(
    query: Option<String>,
    include_archived: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<RndReferenceCard>, CommandError> {
    RndReferenceRepository::open(&state.database_path)?
        .list_reference_cards(
            query.as_deref().unwrap_or_default(),
            include_archived.unwrap_or(false),
        )
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_personal_rnd_reference_card(
    input: PersonalReferenceCardInput,
    state: State<'_, AppState>,
) -> Result<RndReferenceCard, CommandError> {
    RndReferenceRepository::open(&state.database_path)?
        .create_personal_card(input)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_personal_rnd_reference_card(
    id: String,
    input: PersonalReferenceCardInput,
    state: State<'_, AppState>,
) -> Result<RndReferenceCard, CommandError> {
    RndReferenceRepository::open(&state.database_path)?
        .update_personal_card(&id, input)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_personal_rnd_reference_card(
    id: String,
    state: State<'_, AppState>,
) -> Result<RndReferenceCard, CommandError> {
    RndReferenceRepository::open(&state.database_path)?
        .archive_personal_card(&id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_agent_recipe_estimate_cards(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentRecipeEstimateCard>, CommandError> {
    RndReferenceRepository::open(&state.database_path)?
        .list_estimate_cards(&conversation_id)
        .map_err(Into::into)
}
