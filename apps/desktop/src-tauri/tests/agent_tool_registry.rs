use std::{collections::BTreeSet, fs, path::PathBuf};

use food_rd_desktop::{
    agent::{
        model::{AgentProviderKind, AgentRunInput, AgentRunStatus, AgentToolCallStatus},
        repository::AgentRepository,
        tools::{AgentToolContext, AgentToolRegistry},
    },
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{
            ImportFileReference, ImportFileReferenceKind, IngredientImportDraftStatus,
            IngredientImportJobRequest, IngredientImportSourceKind,
        },
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
fn registry_exposes_only_approved_phase_three_tools() {
    let fixture = Fixture::new();
    let registry = AgentToolRegistry::new(fixture.coordinator());
    let names = registry
        .definitions()
        .into_iter()
        .map(|tool| tool.name)
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
            "merge_ingredient_import_drafts",
            "split_ingredient_import_draft",
            "discard_ingredient_import_draft",
            "validate_ingredient_import_draft",
            "request_open_ingredient_review",
        ]
    );
    assert!(!names.contains(&"save_ingredient_variant".to_string()));
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
    ] {
        let error = registry
            .execute(&context("job-1", []), name, json!({}))
            .unwrap_err();
        assert_eq!(error.code(), "tool_denied");
    }
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
fn merge_and_split_are_atomic_draft_only_operations() {
    let fixture = Fixture::new();
    let mut coordinator = fixture.coordinator();
    let (job_id, attachment_id) = fixture.agent_job(&mut coordinator);
    let mut registry = AgentToolRegistry::new(coordinator);
    let scoped_context = context(&job_id, [attachment_id.clone()]);
    let mut draft_ids = Vec::new();
    for supplier in ["供应商 A", "供应商 B"] {
        let mut draft_review = review();
        draft_review["supplierName"] = json!(supplier);
        let created = registry
            .execute(
                &scoped_context,
                "create_ingredient_import_draft",
                json!({
                    "review": draft_review,
                    "attachmentIds": [attachment_id]
                }),
            )
            .unwrap();
        draft_ids.push(created["draft"]["id"].as_str().unwrap().to_string());
    }
    let merged = registry
        .execute(
            &scoped_context,
            "merge_ingredient_import_drafts",
            json!({ "draftIds": draft_ids, "review": review() }),
        )
        .unwrap();
    let merged_id = merged["draft"]["id"].as_str().unwrap().to_string();
    for draft_id in merged["discardedDraftIds"].as_array().unwrap() {
        assert_eq!(
            registry
                .coordinator()
                .get_draft(draft_id.as_str().unwrap())
                .unwrap()
                .status,
            IngredientImportDraftStatus::Discarded
        );
    }

    let split = registry
        .execute(
            &scoped_context,
            "split_ingredient_import_draft",
            json!({
                "draftId": merged_id,
                "reviews": [review(), review()]
            }),
        )
        .unwrap();

    assert_eq!(split["drafts"].as_array().unwrap().len(), 2);
    assert_eq!(
        registry.coordinator().get_draft(&merged_id).unwrap().status,
        IngredientImportDraftStatus::Discarded
    );
    assert!(
        registry
            .coordinator()
            .ingredients()
            .list_material_groups("")
            .unwrap()
            .is_empty()
    );
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
