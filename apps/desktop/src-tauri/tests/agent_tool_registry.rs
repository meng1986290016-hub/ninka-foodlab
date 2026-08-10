use std::{collections::BTreeSet, fs, path::PathBuf};

use food_rd_desktop::{
    agent::{
        model::{AgentProviderKind, AgentRunInput, AgentRunStatus, AgentToolCallStatus},
        repository::AgentRepository,
        tools::{AgentToolContext, AgentToolRegistry},
    },
    agent_recipe::repository::AgentRecipeRepository,
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{
            ImportFileReference, ImportFileReferenceKind, IngredientImportJobRequest,
            IngredientImportSourceKind,
        },
    },
    ingredients::{
        model::{
            IngredientVariantAllergens, IngredientVariantInput, MaterialGroupInput,
            VariantNutrition, VariantNutritionValue,
        },
        repository::IngredientRepository,
    },
    recipes::{
        model::{RecipeDraftInput, RecipeInput, RecipeKind},
        repository::RecipeRepository,
    },
};
use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

struct Fixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    source_path: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-agent-tools-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("milk-powder.txt");
        fs::write(&source_path, "脱脂乳粉\n蛋白质 34.0 g\n供应商 A").unwrap();
        Self {
            database_path: root.join("food-rd.sqlite3"),
            attachment_root: root.join("attachments"),
            source_path,
            root,
        }
    }

    fn coordinator(&self) -> IngredientIngestCoordinator {
        IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap()
    }

    fn agent_job(&self, coordinator: &mut IngredientIngestCoordinator) -> (String, String) {
        let job = coordinator
            .create_job(IngredientImportJobRequest {
                files: vec![ImportFileReference {
                    kind: ImportFileReferenceKind::NativePath,
                    value: self.source_path.to_string_lossy().into_owned(),
                    media_type: Some("text/plain".into()),
                }],
                source_kind: IngredientImportSourceKind::Agent,
            })
            .unwrap();
        let connection = Connection::open(&self.database_path).unwrap();
        let attachment_id = connection
            .query_row(
                "SELECT attachment_id FROM ingredient_import_job_attachments WHERE job_id = ?1",
                [&job.id],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        (job.id, attachment_id)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn context(job_id: &str, attachment_ids: impl IntoIterator<Item = String>) -> AgentToolContext {
    AgentToolContext {
        run_id: "run-1".into(),
        import_job_id: job_id.into(),
        allowed_attachment_ids: attachment_ids.into_iter().collect::<BTreeSet<_>>(),
        provider_kind: AgentProviderKind::CodexCli,
        model: "test-model".into(),
        active_recipe_id: None,
        active_recipe_name: None,
    }
}

fn review() -> serde_json::Value {
    json!({
        "materialGroupId": null,
        "materialName": "脱脂乳粉",
        "categoryId": null,
        "categoryName": "乳制品",
        "supplierId": null,
        "supplierName": "供应商 A",
        "modelOrSpecification": "低热型",
        "currentPrice": "31.50",
        "priceUnit": "kg",
        "densityGPerMl": null,
        "nutritionBasis": "每100g",
        "nutrients": [{
            "definitionId": "protein",
            "name": "蛋白质",
            "unit": "g",
            "value": "34.0"
        }],
        "containsAllergens": ["乳及乳制品"],
        "mayContainAllergens": [],
        "source": "供应商标签",
        "researchNotes": "",
        "duplicateConfirmed": false
    })
}

#[test]
fn registry_exposes_only_approved_review_scoped_tools() {
    let fixture = Fixture::new();
    let registry = AgentToolRegistry::new(fixture.coordinator());
    let definitions = registry.definitions();
    let names = definitions
        .iter()
        .map(|tool| tool.name.clone())
        .collect::<Vec<_>>();

    assert_eq!(
        names,
        vec![
            "search_material_groups",
            "search_supplier_variants",
            "search_suppliers",
            "search_categories",
            "list_nutrient_definitions",
            "read_task_attachments",
            "create_ingredient_import_draft",
            "update_ingredient_import_draft",
            "discard_ingredient_import_draft",
            "validate_ingredient_import_draft",
            "request_open_ingredient_review",
            "evaluate_recipe_proposal",
            "create_recipe_proposal",
            "update_recipe_proposal",
            "request_open_recipe_proposal_review",
            "diagnose_recipe",
            "review_recipe_development",
            "compare_supplier_variant",
        ]
    );
    assert!(!names.contains(&"save_ingredient_variant".to_string()));
    assert!(!names.contains(&"accept_recipe_proposal".to_string()));
    assert!(!names.contains(&"create_recipe_version".to_string()));

    let attachment_reader = definitions
        .iter()
        .find(|tool| tool.name == "read_task_attachments")
        .unwrap();
    assert_eq!(
        attachment_reader.input_schema["properties"]["attachmentIds"]["type"],
        json!(["array", "null"])
    );
    assert_eq!(
        attachment_reader.input_schema["required"],
        json!(["attachmentIds"])
    );
}

#[test]
fn formal_writes_and_unrelated_reads_are_denied() {
    let fixture = Fixture::new();
    let mut registry = AgentToolRegistry::new(fixture.coordinator());
    for name in [
        "save_ingredient_variant",
        "archive_ingredient_variant",
        "set_setting",
        "read_recipe",
        "read_local_file",
        "merge_ingredient_import_drafts",
        "split_ingredient_import_draft",
    ] {
        let error = registry
            .execute(&context("job-1", []), name, json!({}))
            .unwrap_err();
        assert_eq!(error.code(), "tool_denied");
    }
}

#[test]
fn recipe_diagnosis_and_supplier_comparison_are_deterministic_read_only_tools() {
    let fixture = Fixture::new();
    let mut ingredients = IngredientRepository::open(&fixture.database_path).unwrap();
    let supplier_a = ingredients.create_supplier("供应商 A", "").unwrap();
    let supplier_b = ingredients.create_supplier("供应商 B", "").unwrap();
    let group = ingredients
        .create_material_group(MaterialGroupInput {
            name: "脱脂乳粉".into(),
            category_id: None,
        })
        .unwrap();
    let save_variant = |ingredients: &mut IngredientRepository,
                        supplier_id: String,
                        model: &str,
                        price: &str,
                        protein: &str| {
        ingredients
            .save_variant(IngredientVariantInput {
                id: None,
                material_group_id: group.id.clone(),
                supplier_id,
                model_or_specification: model.into(),
                internal_code: None,
                current_price: Some(price.into()),
                price_unit: "kg".into(),
                density_g_per_ml: None,
                source: "供应商规格书".into(),
                research_notes: "".into(),
                nutrition: VariantNutrition {
                    basis: "per_100g".into(),
                    values: vec![VariantNutritionValue {
                        nutrient_definition_id: "protein".into(),
                        value: Some(protein.into()),
                    }],
                },
                allergens: IngredientVariantAllergens {
                    contains: vec!["乳".into()],
                    may_contain: Vec::new(),
                },
                duplicate_confirmed: false,
            })
            .unwrap()
    };
    let source_variant = save_variant(&mut ingredients, supplier_a.id, "SMP-A", "31.5", "34");
    let candidate_variant = save_variant(&mut ingredients, supplier_b.id, "SMP-B", "25", "30");
    drop(ingredients);

    let mut recipes = RecipeRepository::open(&fixture.database_path).unwrap();
    let recipe = recipes
        .create_recipe(RecipeInput {
            name: "高蛋白冰淇淋".into(),
            code: None,
            tags: Vec::new(),
            kind: RecipeKind::Formula,
        })
        .unwrap();
    recipes
        .save_draft(RecipeDraftInput {
            recipe_id: recipe.id.clone(),
            based_on_version_id: None,
            source: "manual".into(),
            payload_version: 1,
            payload: json!({
                "targetBatchGrams": "100",
                "finishedMassGrams": null,
                "markdownNotes": "本轮降低甜度，口感偏硬。",
                "items": [{
                    "id": "line-milk",
                    "position": 0,
                    "kind": "ingredient",
                    "ingredientVariantId": source_variant.id.clone(),
                    "amount": "100",
                    "unit": "g",
                    "locked": false,
                    "autoFill": false
                }]
            }),
            calculation: Some(json!({
                "inputMassGrams": "100",
                "basisMassGrams": "100",
                "yieldPercent": null,
                "nutrients": [{
                    "nutrientDefinitionId": "protein",
                    "name": "蛋白质",
                    "unit": "g",
                    "per100gKnownAmount": "34",
                    "status": "complete"
                }],
                "cost": {
                    "batchTotal": "3.15",
                    "status": "complete",
                    "breakdown": [{
                        "id": "line-milk", "name": "脱脂乳粉 · 供应商 A",
                        "category": "ingredient", "amount": "3.15"
                    }]
                },
                "completeness": { "percent": 100, "missingFields": [] }
            })),
            calculation_issues: Vec::new(),
        })
        .unwrap();
    drop(recipes);

    let mut audit = AgentRepository::open(&fixture.database_path).unwrap();
    let conversation = audit.create_conversation("配方诊断").unwrap();
    let run = audit
        .create_run(AgentRunInput {
            conversation_id: conversation.id,
            provider_config_id: "codex_cli".into(),
            import_job_id: None,
            status: AgentRunStatus::Running,
        })
        .unwrap();
    let coordinator = fixture.coordinator();
    let proposals = AgentRecipeRepository::open(&fixture.database_path).unwrap();
    let mut registry = AgentToolRegistry::with_audit_and_recipes(coordinator, audit, proposals);
    let scoped_context = AgentToolContext {
        run_id: run.id,
        import_job_id: String::new(),
        allowed_attachment_ids: BTreeSet::new(),
        provider_kind: AgentProviderKind::CodexCli,
        model: "test-model".into(),
        active_recipe_id: Some(recipe.id.clone()),
        active_recipe_name: Some(recipe.name.clone()),
    };

    let diagnosis = registry
        .execute(
            &scoped_context,
            "diagnose_recipe",
            json!({ "recipeId": recipe.id.clone() }),
        )
        .unwrap();
    assert_eq!(diagnosis["status"], "attention");
    assert_eq!(diagnosis["readOnly"], true);

    let retrospective = registry
        .execute(
            &scoped_context,
            "review_recipe_development",
            json!({ "recipeId": recipe.id.clone() }),
        )
        .unwrap();
    assert_eq!(
        retrospective["researchNotes"]["current"],
        "本轮降低甜度，口感偏硬。"
    );
    assert_eq!(retrospective["readOnly"], true);
    assert_eq!(retrospective["deterministicFacts"], true);
    assert!(
        retrospective["nextStepHints"]
            .as_array()
            .unwrap()
            .iter()
            .any(|value| value.as_str().unwrap().contains("出成重量"))
    );

    let comparison = registry
        .execute(
            &scoped_context,
            "compare_supplier_variant",
            json!({
                "recipeId": recipe.id.clone(),
                "itemId": "line-milk",
                "candidateVariantId": candidate_variant.id.clone()
            }),
        )
        .unwrap();
    assert_eq!(comparison["impact"]["estimatedBatchCostAfter"], "2.5");
    assert_eq!(
        comparison["impact"]["nutrientChangesPer100g"][0]["difference"],
        "-4"
    );
    assert_eq!(comparison["readOnly"], true);
    assert_eq!(comparison["requiresHumanConfirmationToApply"], true);
    assert_eq!(
        RecipeRepository::open(&fixture.database_path)
            .unwrap()
            .get_draft(&recipe.id)
            .unwrap()
            .unwrap()
            .payload["items"][0]["ingredientVariantId"],
        source_variant.id
    );
}

#[test]
fn draft_tools_are_scoped_to_the_current_job_and_never_formally_save() {
    let fixture = Fixture::new();
    let mut coordinator = fixture.coordinator();
    let (job_id, attachment_id) = fixture.agent_job(&mut coordinator);
    let mut registry = AgentToolRegistry::new(coordinator);

    let created = registry
        .execute(
            &context(&job_id, [attachment_id.clone()]),
            "create_ingredient_import_draft",
            json!({
                "review": review(),
                "attachmentIds": [attachment_id]
            }),
        )
        .unwrap();
    let draft_id = created["draft"]["id"].as_str().unwrap();
    let wrong_context = context("another-job", []);
    let error = registry
        .execute(
            &wrong_context,
            "update_ingredient_import_draft",
            json!({ "draftId": draft_id, "review": review() }),
        )
        .unwrap_err();

    assert_eq!(error.code(), "scope_violation");
    assert!(
        registry
            .coordinator()
            .ingredients()
            .list_material_groups("")
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        registry.coordinator().list_drafts(&job_id).unwrap().len(),
        1
    );
}

#[test]
fn attachment_reads_reject_ids_outside_the_current_task() {
    let fixture = Fixture::new();
    let mut coordinator = fixture.coordinator();
    let (job_id, attachment_id) = fixture.agent_job(&mut coordinator);
    let mut registry = AgentToolRegistry::new(coordinator);

    let error = registry
        .execute(
            &context(&job_id, []),
            "read_task_attachments",
            json!({ "attachmentIds": [attachment_id] }),
        )
        .unwrap_err();

    assert_eq!(error.code(), "scope_violation");
}

#[test]
fn attachment_reads_default_to_all_attachments_in_the_current_task() {
    let fixture = Fixture::new();
    let mut coordinator = fixture.coordinator();
    let (job_id, attachment_id) = fixture.agent_job(&mut coordinator);
    let mut registry = AgentToolRegistry::new(coordinator);

    let result = registry
        .execute(
            &context(&job_id, [attachment_id.clone()]),
            "read_task_attachments",
            json!({}),
        )
        .unwrap();

    assert_eq!(result["items"].as_array().unwrap().len(), 1);
    assert_eq!(result["items"][0]["attachmentId"], attachment_id);
}

#[test]
fn audited_calls_store_only_metadata_status_and_sanitized_error() {
    let fixture = Fixture::new();
    let mut coordinator = fixture.coordinator();
    let (job_id, _) = fixture.agent_job(&mut coordinator);
    let mut audit = AgentRepository::open(&fixture.database_path).unwrap();
    let conversation = audit.create_conversation("审计测试").unwrap();
    let run = audit
        .create_run(AgentRunInput {
            conversation_id: conversation.id,
            provider_config_id: "codex_cli".into(),
            import_job_id: Some(job_id.clone()),
            status: AgentRunStatus::Running,
        })
        .unwrap();
    let audited_reader = AgentRepository::open(&fixture.database_path).unwrap();
    let mut registry = AgentToolRegistry::with_audit(coordinator, audit);
    let scoped_context = AgentToolContext {
        run_id: run.id.clone(),
        ..context(&job_id, [])
    };

    registry
        .execute(
            &scoped_context,
            "search_categories",
            json!({ "query": "DO_NOT_PERSIST_RAW_ARGUMENT" }),
        )
        .unwrap();
    registry
        .execute(
            &scoped_context,
            "save_ingredient_variant",
            json!({ "secret": "DO_NOT_PERSIST_RAW_RESULT" }),
        )
        .unwrap_err();

    let calls = audited_reader.list_tool_calls(&run.id).unwrap();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].status, AgentToolCallStatus::Completed);
    assert_eq!(calls[1].status, AgentToolCallStatus::Denied);
    assert_eq!(calls[1].tool_name, "save_ingredient_variant");
    let bytes = fs::read(&fixture.database_path).unwrap();
    let database_text = String::from_utf8_lossy(&bytes);
    assert!(!database_text.contains("DO_NOT_PERSIST_RAW_ARGUMENT"));
    assert!(!database_text.contains("DO_NOT_PERSIST_RAW_RESULT"));
}
