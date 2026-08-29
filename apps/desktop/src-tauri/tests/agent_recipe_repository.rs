use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use food_rd_desktop::{
    agent_recipe::{
        calculator::normalize_and_evaluate,
        model::{
            AgentRecipeConfidence, AgentRecipeProposalDestination, AgentRecipeProposalItem,
            AgentRecipeProposalMode, AgentRecipeProposalPayload, AgentRecipeProposalStatus,
            MaterialNeedStatus,
        },
        repository::AgentRecipeRepository,
    },
    ingredients::{
        model::{
            IngredientVariantAllergens, IngredientVariantInput, MaterialGroupInput,
            VariantNutrition, VariantNutritionValue,
        },
        repository::IngredientRepository,
    },
    recipes::{
        model::{RecipeInput, RecipeSchemeStatus, RecipeVersionInput},
        repository::RecipeRepository,
    },
};
use rusqlite::Connection;
use serde_json::json;

fn temporary_database(name: &str) -> std::path::PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "food-rd-agent-recipe-{name}-{}-{suffix}.sqlite3",
        std::process::id()
    ))
}

fn seed_ingredient(
    path: &std::path::Path,
) -> food_rd_desktop::ingredients::model::IngredientVariant {
    let mut ingredients = IngredientRepository::open(path).unwrap();
    let category = ingredients.create_category("乳制品").unwrap();
    let supplier = ingredients.create_supplier("供应商 A", "").unwrap();
    let group = ingredients
        .create_material_group(MaterialGroupInput {
            name: "脱脂乳粉".into(),
            category_id: Some(category.id),
        })
        .unwrap();
    ingredients
        .save_variant(IngredientVariantInput {
            id: None,
            material_group_id: group.id,
            supplier_id: supplier.id,
            model_or_specification: "MP-01".into(),
            internal_code: None,
            current_price: Some("30".into()),
            price_unit: "kg".into(),
            density_g_per_ml: None,
            source: "供应商规格书".into(),
            research_notes: "Agent 测试原料".into(),
            nutrition: VariantNutrition {
                basis: "per_100g".into(),
                values: vec![VariantNutritionValue {
                    nutrient_definition_id: "protein".into(),
                    value: Some("35".into()),
                }],
            },
            allergens: IngredientVariantAllergens {
                contains: vec!["乳".into()],
                may_contain: Vec::new(),
            },
            duplicate_confirmed: false,
        })
        .unwrap()
}

fn proposal_payload(
    variant: &food_rd_desktop::ingredients::model::IngredientVariant,
) -> AgentRecipeProposalPayload {
    AgentRecipeProposalPayload {
        product_name: "低糖乳味冷冻甜品".into(),
        recipe_code: None,
        recipe_kind: food_rd_desktop::recipes::model::RecipeKind::Formula,
        mode: AgentRecipeProposalMode::GoalDesign,
        finished_mass_grams: None,
        yield_assumption: "assumed_100_percent".into(),
        items: vec![
            AgentRecipeProposalItem::Ingredient {
                id: "line-milk".into(),
                position: 0,
                amount: "900".into(),
                unit: "g".into(),
                estimated_minimum: None,
                estimated_maximum: None,
                confidence: AgentRecipeConfidence::High,
                ingredient_variant_id: variant.id.clone(),
                ingredient_updated_at: variant.updated_at.clone(),
                material_name: "脱脂乳粉".into(),
                supplier_name: variant.supplier_name.clone(),
                model_or_specification: variant.model_or_specification.clone(),
                selection_reason: "蛋白数据可用".into(),
            },
            AgentRecipeProposalItem::MaterialNeed {
                id: "line-stabilizer".into(),
                position: 1,
                amount: "5".into(),
                unit: "g".into(),
                estimated_minimum: Some("3".into()),
                estimated_maximum: Some("8".into()),
                confidence: AgentRecipeConfidence::Low,
                material_name: "乳化稳定剂".into(),
                purpose: "改善稳定性".into(),
                desired_specification: "冷冻饮品复配型号".into(),
                missing_reason: "原料库缺少具体供应商版本".into(),
            },
        ],
        requirements: Vec::new(),
        assumptions: vec!["暂按100%得率".into()],
        warnings: vec!["需要小试复核".into()],
        markdown_notes: "Agent 生成的研发提案".into(),
    }
}

#[test]
fn acceptance_atomically_creates_an_agent_draft_and_material_need() {
    let path = temporary_database("accept");
    let variant = seed_ingredient(&path);
    let ingredients = IngredientRepository::open(&path).unwrap();
    let mut payload = proposal_payload(&variant);
    payload.recipe_code = Some("R002".into());
    let (payload, evaluation) = normalize_and_evaluate(&ingredients, payload).unwrap();
    drop(ingredients);

    let mut proposals = AgentRecipeRepository::open(&path).unwrap();
    let proposal = proposals
        .create_proposal(None, None, payload, evaluation, Vec::new())
        .unwrap();
    assert!(
        RecipeRepository::open(&path)
            .unwrap()
            .list_recipes()
            .unwrap()
            .is_empty()
    );

    let (recipe_id, needs) = proposals
        .accept_proposal(&proposal.id, AgentRecipeProposalDestination::NewProduct)
        .unwrap();
    assert_eq!(needs.len(), 1);
    assert_eq!(needs[0].status, MaterialNeedStatus::Open);
    assert_eq!(needs[0].material_name, "乳化稳定剂");

    let recipes = RecipeRepository::open(&path).unwrap();
    let recipe = recipes.get_recipe(&recipe_id).unwrap();
    let draft = recipes.get_draft(&recipe_id).unwrap().unwrap();
    assert_eq!(recipe.scheme_status, RecipeSchemeStatus::Current);
    assert_eq!(recipe.code.as_deref(), Some("R002"));
    assert_eq!(draft.source, "agent");
    assert_eq!(draft.payload["items"][1]["kind"], "material_need");
    assert!(
        draft.payload["markdownNotes"]
            .as_str()
            .unwrap()
            .contains("需要小试复核")
    );
    assert_eq!(
        proposals.get_proposal(&proposal.id).unwrap().status,
        AgentRecipeProposalStatus::Accepted
    );

    drop(recipes);
    let mut recipes = RecipeRepository::open(&path).unwrap();
    let formal_error = recipes
        .create_version(RecipeVersionInput {
            recipe_id: recipe_id.clone(),
            source_draft_id: draft.id,
            based_on_version_id: None,
            snapshot_schema_version: 1,
            snapshot: json!({ "recipe": { "id": recipe_id } }),
            dependency_version_ids: Vec::new(),
        })
        .unwrap_err();
    assert_eq!(formal_error.code(), "invalid_state");
    assert!(recipes.list_versions(&recipe.id).unwrap().is_empty());

    drop(recipes);
    drop(proposals);
    fs::remove_file(path).unwrap();
}

#[test]
fn changed_ingredient_data_marks_a_proposal_stale_without_partial_writes() {
    let path = temporary_database("stale");
    let variant = seed_ingredient(&path);
    let ingredients = IngredientRepository::open(&path).unwrap();
    let (payload, evaluation) =
        normalize_and_evaluate(&ingredients, proposal_payload(&variant)).unwrap();
    drop(ingredients);

    let mut proposals = AgentRecipeRepository::open(&path).unwrap();
    let proposal = proposals
        .create_proposal(None, None, payload, evaluation, Vec::new())
        .unwrap();
    Connection::open(&path)
        .unwrap()
        .execute(
            "UPDATE ingredient_variants SET updated_at = '2099-01-01T00:00:00Z' WHERE id = ?1",
            [&variant.id],
        )
        .unwrap();

    let error = proposals
        .accept_proposal(&proposal.id, AgentRecipeProposalDestination::NewProduct)
        .unwrap_err();
    assert_eq!(error.code(), "invalid_input");
    assert!(
        RecipeRepository::open(&path)
            .unwrap()
            .list_recipes()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        proposals.get_proposal(&proposal.id).unwrap().status,
        AgentRecipeProposalStatus::PendingReview
    );

    drop(proposals);
    fs::remove_file(path).unwrap();
}

#[test]
fn similar_material_name_cannot_silently_bind_to_a_different_identity() {
    let path = temporary_database("identity");
    let variant = seed_ingredient(&path);
    let ingredients = IngredientRepository::open(&path).unwrap();
    let mut payload = proposal_payload(&variant);
    if let AgentRecipeProposalItem::Ingredient { material_name, .. } = &mut payload.items[0] {
        *material_name = "低脂脱脂乳粉".into();
    }

    let error = normalize_and_evaluate(&ingredients, payload).unwrap_err();
    assert_eq!(error.code(), "invalid_input");
    assert!(error.message().contains("相似名称不能自动替换"));

    drop(ingredients);
    fs::remove_file(path).unwrap();
}

#[test]
fn mixed_units_keep_original_amounts_and_use_actual_input_total() {
    let path = temporary_database("mixed-units");
    let variant = seed_ingredient(&path);
    let ingredients = IngredientRepository::open(&path).unwrap();
    let mut payload = proposal_payload(&variant);
    if let AgentRecipeProposalItem::Ingredient { amount, unit, .. } = &mut payload.items[0] {
        *amount = "0.5".into();
        *unit = "kg".into();
    }
    if let AgentRecipeProposalItem::MaterialNeed { amount, unit, .. } = &mut payload.items[1] {
        *amount = "250".into();
        *unit = "g".into();
    }
    payload.finished_mass_grams = Some("700".into());
    payload.yield_assumption = "provided".into();
    payload
        .warnings
        .push("附件声明总量为 800 g，与原料明细 750 g 不一致；未自动缩放".into());

    let (normalized, evaluation) = normalize_and_evaluate(&ingredients, payload).unwrap();
    assert_eq!(normalized.items[0].amount(), "0.5");
    assert_eq!(normalized.items[0].unit(), "kg");
    assert_eq!(normalized.items[1].amount(), "250");
    assert_eq!(normalized.items[1].unit(), "g");
    assert_eq!(evaluation["calculation"]["inputMassGrams"], "750");
    assert_eq!(evaluation["calculation"]["basisMassGrams"], "700");
    assert!(normalized.warnings[1].contains("未自动缩放"));

    drop(ingredients);
    fs::remove_file(path).unwrap();
}

#[test]
fn duplicate_imported_recipe_code_keeps_the_proposal_pending() {
    let path = temporary_database("duplicate-code");
    let variant = seed_ingredient(&path);
    RecipeRepository::open(&path)
        .unwrap()
        .create_recipe(RecipeInput {
            name: "现有配方".into(),
            code: Some("R001".into()),
            tags: Vec::new(),
            kind: food_rd_desktop::recipes::model::RecipeKind::Formula,
        })
        .unwrap();
    let ingredients = IngredientRepository::open(&path).unwrap();
    let mut payload = proposal_payload(&variant);
    payload.recipe_code = Some(" R001 ".into());
    payload.mode = AgentRecipeProposalMode::AttachmentImport;
    let (payload, evaluation) = normalize_and_evaluate(&ingredients, payload).unwrap();
    assert_eq!(payload.recipe_code.as_deref(), Some("R001"));
    drop(ingredients);

    let mut proposals = AgentRecipeRepository::open(&path).unwrap();
    let proposal = proposals
        .create_proposal(None, None, payload, evaluation, vec!["attachment-1".into()])
        .unwrap();
    assert_eq!(proposal.payload_version, 2);
    let error = proposals
        .accept_proposal(&proposal.id, AgentRecipeProposalDestination::NewProduct)
        .unwrap_err();
    assert_eq!(error.code(), "duplicate_code");
    assert_eq!(
        proposals.get_proposal(&proposal.id).unwrap().status,
        AgentRecipeProposalStatus::PendingReview
    );
    assert_eq!(
        RecipeRepository::open(&path)
            .unwrap()
            .list_recipes()
            .unwrap()
            .len(),
        1
    );

    let ingredients = IngredientRepository::open(&path).unwrap();
    let mut corrected_payload = proposals.get_proposal(&proposal.id).unwrap().payload;
    corrected_payload.recipe_code = Some("R002".into());
    let (corrected_payload, corrected_evaluation) =
        normalize_and_evaluate(&ingredients, corrected_payload).unwrap();
    drop(ingredients);
    proposals
        .update_proposal(&proposal.id, corrected_payload, corrected_evaluation)
        .unwrap();
    let (accepted_recipe_id, _) = proposals
        .accept_proposal(&proposal.id, AgentRecipeProposalDestination::NewProduct)
        .unwrap();
    assert_eq!(
        RecipeRepository::open(&path)
            .unwrap()
            .get_recipe(&accepted_recipe_id)
            .unwrap()
            .code
            .as_deref(),
        Some("R002")
    );

    drop(proposals);
    fs::remove_file(path).unwrap();
}

#[test]
fn version_one_proposal_without_recipe_code_remains_readable() {
    let path = temporary_database("payload-v1");
    let variant = seed_ingredient(&path);
    let mut payload_json = serde_json::to_value(proposal_payload(&variant)).unwrap();
    payload_json.as_object_mut().unwrap().remove("recipeCode");
    Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO agent_recipe_proposals (
               id, conversation_id, run_id, status, payload_version, payload_json,
               evaluation_json, source_attachment_ids_json, accepted_recipe_id,
               created_at, updated_at
             ) VALUES ('legacy-proposal', NULL, NULL, 'pending_review', 1, ?1, '{}', '[]', NULL, ?2, ?2)",
            [
                serde_json::to_string(&payload_json).unwrap(),
                "2026-08-29T00:00:00Z".into(),
            ],
        )
        .unwrap();

    let proposal = AgentRecipeRepository::open(&path)
        .unwrap()
        .get_proposal("legacy-proposal")
        .unwrap();
    assert_eq!(proposal.payload_version, 1);
    assert_eq!(proposal.payload.recipe_code, None);

    fs::remove_file(path).unwrap();
}
