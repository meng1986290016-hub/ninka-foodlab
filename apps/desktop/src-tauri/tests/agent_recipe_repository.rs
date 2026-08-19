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
        model::{RecipeSchemeStatus, RecipeVersionInput},
        repository::RecipeRepository,
    },
};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SweetnessParityFixture {
    ingredient_mass_grams: String,
    other_mass_grams: String,
    relative_factor: String,
    expected_total_sucrose_equivalent_grams: String,
    expected_per100g_sucrose_equivalent: String,
}

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
    let (payload, evaluation) =
        normalize_and_evaluate(&ingredients, proposal_payload(&variant)).unwrap();
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

    fs::remove_file(path).unwrap();
}

#[test]
fn rust_agent_sweetness_matches_shared_deterministic_fixture() {
    let fixture: SweetnessParityFixture = serde_json::from_str(include_str!(
        "../../../../test-fixtures/sweetness-parity.json"
    ))
    .unwrap();
    let path = temporary_database("sweetness-parity");
    let variant = seed_ingredient(&path);
    Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO ingredient_nutrient_values
             (ingredient_variant_id, nutrient_definition_id, value)
             VALUES (?1, 'theoretical_sweetness', ?2)",
            rusqlite::params![variant.id, fixture.relative_factor],
        )
        .unwrap();
    let ingredients = IngredientRepository::open(&path).unwrap();
    let refreshed = ingredients.get_variant(&variant.id).unwrap();
    let mut payload = proposal_payload(&refreshed);
    if let AgentRecipeProposalItem::Ingredient { amount, .. } = &mut payload.items[0] {
        *amount = fixture.ingredient_mass_grams;
    }
    if let AgentRecipeProposalItem::MaterialNeed { amount, .. } = &mut payload.items[1] {
        *amount = fixture.other_mass_grams;
    }

    let (_, evaluation) = normalize_and_evaluate(&ingredients, payload).unwrap();
    assert_eq!(
        evaluation["calculation"]["sweetness"]["totalSucroseEquivalentGrams"],
        fixture.expected_total_sucrose_equivalent_grams
    );
    assert_eq!(
        evaluation["calculation"]["sweetness"]["per100gSucroseEquivalent"],
        fixture.expected_per100g_sucrose_equivalent
    );
    assert_eq!(evaluation["calculation"]["sweetness"]["status"], "complete");

    drop(ingredients);
    fs::remove_file(path).unwrap();
}
