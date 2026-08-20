use std::time::{SystemTime, UNIX_EPOCH};

use food_rd_desktop::{
    recipes::{
        model::{RecipeDraftInput, RecipeInput, RecipeKind},
        repository::RecipeRepository,
    },
    rnd_reference::{
        model::{
            AgentRecipeEstimateCardDraft, AgentRecipeEstimateCardStatus,
            AgentRecipeEstimateConfidence, AgentRecipeEstimateConflict, AgentRecipeEstimateInput,
            PersonalReferenceCardInput, ReferenceCardSource, RndReferenceCardOrigin,
            RndReferenceCardStatus, RndReferenceEvidenceType,
        },
        repository::RndReferenceRepository,
    },
};
use rusqlite::Connection;
use rust_decimal::Decimal;
use serde_json::json;

fn temporary_database(name: &str) -> std::path::PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "food-rd-rnd-reference-{name}-{}-{suffix}.sqlite3",
        std::process::id()
    ))
}

fn personal_input(title: &str) -> PersonalReferenceCardInput {
    PersonalReferenceCardInput {
        title: title.into(),
        parameter_key: "relative_sweetness".into(),
        ingredient_names: vec!["测试糖".into()],
        specification: "供应商规格 T-01，纯度 99%".into(),
        applicability: "测试配方".into(),
        unit: "x_sucrose".into(),
        basis: "sucrose_1".into(),
        typical_value: "1.2".into(),
        minimum_value: "1.1".into(),
        maximum_value: "1.3".into(),
        source: ReferenceCardSource {
            title: "供应商规格书".into(),
            publisher: "测试供应商".into(),
            url: None,
            published_at: Some("2026-08-20".into()),
            locator: Some("第 2 页".into()),
            evidence_type: RndReferenceEvidenceType::SupplierDocument,
        },
    }
}

fn estimate_draft(recipe_id: &str, draft_updated_at: &str) -> AgentRecipeEstimateCardDraft {
    AgentRecipeEstimateCardDraft {
        recipe_id: recipe_id.into(),
        source_draft_updated_at: draft_updated_at.into(),
        source_draft_fingerprint: "draft-fingerprint-1".into(),
        status: AgentRecipeEstimateCardStatus::Ready,
        parameter_key: "relative_sweetness".into(),
        title: "当前配方甜度参考估算".into(),
        estimated_value: Some("10".into()),
        minimum_value: Some("9".into()),
        maximum_value: Some("11".into()),
        unit: "g_sucrose_equivalent_per_100g".into(),
        basis: "finished_product_100g".into(),
        confidence: AgentRecipeEstimateConfidence::Medium,
        formula_inputs: vec![AgentRecipeEstimateInput {
            label: "白砂糖".into(),
            amount: "100".into(),
            unit: "g".into(),
            reference_card_id: Some("sweetness-sucrose".into()),
        }],
        cited_reference_card_ids: vec!["sweetness-sucrose".into()],
        calculation_summary: "100 g 白砂糖按蔗糖相对甜度 1 折算".into(),
        assumptions: vec!["白砂糖按蔗糖纯品处理".into()],
        influencing_factors: vec!["温度与产品基质".into()],
        missing_inputs: Vec::new(),
        conflict: None,
    }
}

#[test]
fn builtin_cards_are_approved_unique_and_have_valid_ranges() {
    let path = temporary_database("builtin");
    let repository = RndReferenceRepository::open(&path).unwrap();
    let cards = repository.list_reference_cards("", false).unwrap();
    assert_eq!(cards.len(), 23);
    let mut ids = cards.iter().map(|card| card.id.clone()).collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), cards.len());
    for card in cards {
        assert_eq!(card.origin, RndReferenceCardOrigin::Builtin);
        assert_eq!(card.status, RndReferenceCardStatus::Approved);
        assert!(!card.source.title.trim().is_empty());
        assert!(!card.source.publisher.trim().is_empty());
        let typical = card.typical_value.parse::<Decimal>().unwrap();
        let minimum = card.minimum_value.parse::<Decimal>().unwrap();
        let maximum = card.maximum_value.parse::<Decimal>().unwrap();
        assert!(minimum <= typical && typical <= maximum);
    }
    let _ = std::fs::remove_file(path);
}

#[test]
fn personal_cards_can_be_confirmed_edited_searched_and_archived() {
    let path = temporary_database("personal");
    let mut repository = RndReferenceRepository::open(&path).unwrap();
    let created = repository
        .create_personal_card(personal_input("测试个人参考"))
        .unwrap();
    assert_eq!(created.origin, RndReferenceCardOrigin::Personal);
    assert_eq!(created.status, RndReferenceCardStatus::Approved);
    assert_eq!(
        repository
            .list_reference_cards("测试糖", false)
            .unwrap()
            .len(),
        1
    );

    let updated = repository
        .update_personal_card(&created.id, personal_input("测试个人参考 V2"))
        .unwrap();
    assert_eq!(updated.review_version, 2);
    let archived = repository.archive_personal_card(&created.id).unwrap();
    assert_eq!(archived.status, RndReferenceCardStatus::Archived);
    assert!(
        repository
            .list_reference_cards("测试糖", false)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        repository
            .list_reference_cards("测试糖", true)
            .unwrap()
            .len(),
        1
    );
    let _ = std::fs::remove_file(path);
}

#[test]
fn estimate_cards_validate_sources_ranges_and_become_stale_with_the_draft() {
    let path = temporary_database("estimate");
    let (recipe_id, draft_updated_at) = {
        let mut recipes = RecipeRepository::open(&path).unwrap();
        let recipe = recipes
            .create_recipe(RecipeInput {
                name: "测试饮料".into(),
                code: None,
                tags: Vec::new(),
                kind: RecipeKind::Formula,
            })
            .unwrap();
        let draft = recipes
            .save_draft(RecipeDraftInput {
                recipe_id: recipe.id.clone(),
                based_on_version_id: None,
                source: "manual".into(),
                payload_version: 1,
                payload: json!({
                    "targetBatchGrams": "1000",
                    "finishedMassGrams": "1000",
                    "items": [],
                    "markdownNotes": ""
                }),
                calculation: Some(json!({"inputMassGrams": "1000"})),
                calculation_issues: Vec::new(),
            })
            .unwrap();
        (recipe.id, draft.updated_at)
    };
    Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO agent_conversations (id, title, created_at, updated_at)
             VALUES ('conversation-1', '估算测试', '2026-08-20T12:00:00Z', '2026-08-20T12:00:00Z')",
            [],
        )
        .unwrap();

    let mut repository = RndReferenceRepository::open(&path).unwrap();
    let created = repository
        .create_estimate_card(
            "conversation-1",
            "run-1",
            "测试饮料",
            estimate_draft(&recipe_id, &draft_updated_at),
        )
        .unwrap();
    assert_eq!(created.status, AgentRecipeEstimateCardStatus::Ready);
    assert!(created.note_preview.contains("当前估计：10"));
    assert!(created.note_preview.contains("蔗糖相对甜度基准"));

    let mut outside_range = estimate_draft(&recipe_id, &draft_updated_at);
    outside_range.estimated_value = Some("12".into());
    assert!(
        repository
            .create_estimate_card("conversation-1", "run-2", "测试饮料", outside_range,)
            .is_err()
    );
    let mut no_source = estimate_draft(&recipe_id, &draft_updated_at);
    no_source.cited_reference_card_ids.clear();
    no_source.formula_inputs[0].reference_card_id = None;
    assert!(
        repository
            .create_estimate_card("conversation-1", "run-3", "测试饮料", no_source)
            .is_err()
    );
    let alternative = repository
        .create_personal_card(personal_input("蔗糖供应商参考范围"))
        .unwrap();
    let mut with_conflict = estimate_draft(&recipe_id, &draft_updated_at);
    with_conflict.conflict = Some(AgentRecipeEstimateConflict {
        selected_reference_card_id: "sweetness-sucrose".into(),
        alternative_reference_card_ids: vec![alternative.id.clone()],
        rationale: "当前原料名称匹配内置蔗糖卡，供应商范围仅作为其他范围展示，不平均".into(),
    });
    let conflict_card = repository
        .create_estimate_card("conversation-1", "run-4", "测试饮料", with_conflict)
        .unwrap();
    assert_eq!(conflict_card.estimated_value.as_deref(), Some("10"));
    let mut invalid_conflict = estimate_draft(&recipe_id, &draft_updated_at);
    invalid_conflict.conflict = Some(AgentRecipeEstimateConflict {
        selected_reference_card_id: "sweetness-sucrose".into(),
        alternative_reference_card_ids: vec!["missing-card".into()],
        rationale: "测试无效来源".into(),
    });
    assert!(
        repository
            .create_estimate_card("conversation-1", "run-5", "测试饮料", invalid_conflict,)
            .is_err()
    );

    drop(repository);
    Connection::open(&path)
        .unwrap()
        .execute(
            "UPDATE recipe_drafts SET updated_at = '2026-08-20T13:00:00Z' WHERE recipe_id = ?1",
            [&recipe_id],
        )
        .unwrap();
    let mut repository = RndReferenceRepository::open(&path).unwrap();
    let cards = repository.list_estimate_cards("conversation-1").unwrap();
    assert!(
        cards
            .iter()
            .all(|card| card.status == AgentRecipeEstimateCardStatus::Stale)
    );
    let _ = std::fs::remove_file(path);
}

#[test]
fn needs_input_cards_never_contain_a_center_value() {
    let path = temporary_database("needs-input");
    let (recipe_id, draft_updated_at) = {
        let mut recipes = RecipeRepository::open(&path).unwrap();
        let recipe = recipes
            .create_recipe(RecipeInput {
                name: "测试糖浆".into(),
                code: None,
                tags: Vec::new(),
                kind: RecipeKind::Formula,
            })
            .unwrap();
        let draft = recipes
            .save_draft(RecipeDraftInput {
                recipe_id: recipe.id.clone(),
                based_on_version_id: None,
                source: "manual".into(),
                payload_version: 1,
                payload: json!({"items": [], "markdownNotes": ""}),
                calculation: None,
                calculation_issues: Vec::new(),
            })
            .unwrap();
        (recipe.id, draft.updated_at)
    };
    Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO agent_conversations (id, title, created_at, updated_at)
             VALUES ('conversation-2', '缺少信息测试', '2026-08-20T12:00:00Z', '2026-08-20T12:00:00Z')",
            [],
        )
        .unwrap();
    let mut repository = RndReferenceRepository::open(&path).unwrap();
    let mut needs_input = estimate_draft(&recipe_id, &draft_updated_at);
    needs_input.status = AgentRecipeEstimateCardStatus::NeedsInput;
    needs_input.estimated_value = None;
    needs_input.minimum_value = None;
    needs_input.maximum_value = None;
    needs_input.cited_reference_card_ids.clear();
    needs_input.formula_inputs.clear();
    needs_input.calculation_summary = "关键浓度缺失".into();
    needs_input.missing_inputs = vec!["糖浆固形物含量".into()];
    let created = repository
        .create_estimate_card("conversation-2", "run-1", "测试糖浆", needs_input)
        .unwrap();
    assert_eq!(created.status, AgentRecipeEstimateCardStatus::NeedsInput);
    assert!(created.estimated_value.is_none());
    assert!(created.note_preview.is_empty());
    let _ = std::fs::remove_file(path);
}
