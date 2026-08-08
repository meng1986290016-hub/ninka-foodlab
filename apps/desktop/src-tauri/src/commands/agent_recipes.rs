use serde_json::Value;
use tauri::State;

use crate::{
    agent_recipe::{
        calculator::normalize_and_evaluate,
        model::{
            AcceptedAgentRecipeProposal, AgentRecipeProposal, AgentRecipeProposalAcceptInput,
            AgentRecipeProposalPayload, MaterialNeed, MaterialNeedStatus,
        },
        repository::{AgentRecipeRepository, accepted_result},
    },
    ingredients::repository::IngredientRepository,
};

use super::{AppState, CommandError};

#[tauri::command(rename_all = "camelCase")]
pub fn list_agent_recipe_proposals(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentRecipeProposal>, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .list_proposals(&conversation_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_agent_recipe_proposal(
    id: String,
    state: State<'_, AppState>,
) -> Result<AgentRecipeProposal, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .get_proposal(&id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn evaluate_agent_recipe_proposal(
    input: AgentRecipeProposalPayload,
    state: State<'_, AppState>,
) -> Result<Value, CommandError> {
    let ingredients = IngredientRepository::open(&state.database_path)?;
    normalize_and_evaluate(&ingredients, input)
        .map(|(_, evaluation)| evaluation)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_agent_recipe_proposal(
    id: String,
    input: AgentRecipeProposalPayload,
    state: State<'_, AppState>,
) -> Result<AgentRecipeProposal, CommandError> {
    let ingredients = IngredientRepository::open(&state.database_path)?;
    let (payload, evaluation) = normalize_and_evaluate(&ingredients, input)?;
    AgentRecipeRepository::open(&state.database_path)?
        .update_proposal(&id, payload, evaluation)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn accept_agent_recipe_proposal(
    input: AgentRecipeProposalAcceptInput,
    state: State<'_, AppState>,
) -> Result<AcceptedAgentRecipeProposal, CommandError> {
    let mut repository = AgentRecipeRepository::open(&state.database_path)?;
    let (recipe_id, needs) = repository.accept_proposal(&input.proposal_id, input.destination)?;
    accepted_result(&state.database_path, &recipe_id, needs).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn discard_agent_recipe_proposal(
    id: String,
    state: State<'_, AppState>,
) -> Result<AgentRecipeProposal, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .discard_proposal(&id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_material_needs(
    status: Option<MaterialNeedStatus>,
    state: State<'_, AppState>,
) -> Result<Vec<MaterialNeed>, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .list_material_needs(status)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn resolve_material_need(
    id: String,
    ingredient_variant_id: String,
    state: State<'_, AppState>,
) -> Result<MaterialNeed, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .resolve_material_need(&id, &ingredient_variant_id)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn dismiss_material_need(
    id: String,
    state: State<'_, AppState>,
) -> Result<MaterialNeed, CommandError> {
    AgentRecipeRepository::open(&state.database_path)?
        .dismiss_material_need(&id)
        .map_err(Into::into)
}
