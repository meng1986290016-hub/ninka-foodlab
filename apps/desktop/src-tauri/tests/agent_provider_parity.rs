use std::{collections::BTreeSet, fs};

use food_rd_desktop::{
    agent::{
        model::AgentProviderKind,
        tools::{AgentToolContext, AgentToolRegistry},
    },
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{ImportFileReference, ImportFileReferenceKind},
    },
};
use serde_json::{Value, json};
use uuid::Uuid;

fn review(supplier: &str, model: &str) -> Value {
    json!({
        "materialGroupId": null,
        "materialName": "脱脂乳粉",
        "categoryId": null,
        "categoryName": "乳制品",
        "supplierId": null,
        "supplierName": supplier,
        "modelOrSpecification": model,
        "currentPrice": null,
        "priceUnit": "kg",
        "densityGPerMl": null,
        "nutritionBasis": "per_100g",
        "nutrients": [{
            "definitionId": "protein",
            "name": "蛋白质",
            "unit": "g",
            "value": "34"
        }],
        "containsAllergens": ["乳"],
        "mayContainAllergens": [],
        "source": "供应商资料",
        "researchNotes": "",
        "duplicateConfirmed": false
    })
}

fn run_provider(provider_kind: AgentProviderKind) -> (Vec<String>, Value, usize) {
    let root = std::env::temp_dir().join(format!("food-rd-parity-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let source_paths = ["供应商A-标签.txt", "供应商A-规格书.txt", "供应商B-标签.txt"]
        .into_iter()
        .map(|name| {
            let path = root.join(name);
            fs::write(&path, name).unwrap();
            path
        })
        .collect::<Vec<_>>();
    let database_path = root.join("food-rd.sqlite3");
    let attachment_root = root.join("attachments");
    let mut coordinator =
        IngredientIngestCoordinator::open(&database_path, &attachment_root).unwrap();
    let job = coordinator
        .create_agent_job(
            source_paths
                .iter()
                .map(|path| ImportFileReference {
                    kind: ImportFileReferenceKind::NativePath,
                    value: path.to_string_lossy().into_owned(),
                    media_type: Some("text/plain".into()),
                })
                .collect(),
        )
        .unwrap();
    let attachments = coordinator.list_job_attachments(&job.id).unwrap();
    let context = AgentToolContext {
        run_id: format!("run-{provider_kind:?}"),
        import_job_id: job.id.clone(),
        allowed_attachment_ids: attachments
            .iter()
            .map(|attachment| attachment.id.clone())
            .collect::<BTreeSet<_>>(),
        provider_kind,
        model: "acceptance-model".into(),
        active_recipe_id: None,
        active_recipe_name: None,
        active_draft_fingerprint: None,
    };
    let mut registry = AgentToolRegistry::new(coordinator);
    let tool_names = registry
        .definitions()
        .into_iter()
        .map(|tool| tool.name)
        .collect::<Vec<_>>();

    for (index, attachment) in attachments.iter().enumerate() {
        let (supplier, model) = if index < 2 {
            ("供应商A", "SMP-A")
        } else {
            ("供应商B", "SMP-B")
        };
        registry
            .execute(
                &context,
                "create_ingredient_import_draft",
                json!({
                    "review": review(supplier, model),
                    "attachmentIds": [attachment.id],
                    "sourceLinks": [{
                        "fieldPath": "nutrients.蛋白质.value",
                        "attachmentId": attachment.id,
                        "sourceLocator": "标签或规格书",
                        "confidence": "high"
                    }]
                }),
            )
            .unwrap();
    }

    let mut drafts = registry.coordinator().list_drafts(&job.id).unwrap();
    drafts.sort_by(|left, right| left.review.supplier_name.cmp(&right.review.supplier_name));
    let snapshot = Value::Array(
        drafts
            .iter()
            .map(|draft| {
                json!({
                    "materialName": draft.review.material_name,
                    "supplierName": draft.review.supplier_name,
                    "modelOrSpecification": draft.review.model_or_specification,
                    "protein": draft.review.nutrients[0].value,
                    "attachmentCount": draft.attachments.len(),
                    "sourceLinkCount": draft.source_links.len(),
                    "sourceConfidence": draft.source_links.first().and_then(|link| link.confidence),
                    "status": draft.status
                })
            })
            .collect(),
    );
    let formal_count = registry
        .coordinator()
        .ingredients()
        .list_material_groups("")
        .unwrap()
        .len();
    drop(registry);
    fs::remove_dir_all(root).unwrap();
    (tool_names, snapshot, formal_count)
}

#[test]
fn api_codex_and_claude_share_equal_drafts_and_permissions() {
    let providers = [
        AgentProviderKind::OpenAi,
        AgentProviderKind::CodexCli,
        AgentProviderKind::ClaudeCodeCli,
    ];
    let mut baseline_tools: Option<Vec<String>> = None;
    let mut baseline_drafts: Option<Value> = None;

    for provider in providers {
        let (tool_names, drafts, formal_count) = run_provider(provider);
        assert!(!tool_names.iter().any(|name| name.contains("save")));
        assert_eq!(formal_count, 0);
        if let Some(expected) = &baseline_tools {
            assert_eq!(&tool_names, expected);
        } else {
            baseline_tools = Some(tool_names);
        }
        if let Some(expected) = &baseline_drafts {
            assert_eq!(&drafts, expected);
        } else {
            baseline_drafts = Some(drafts);
        }
    }

    assert_eq!(
        baseline_drafts.unwrap(),
        json!([
            {
                "materialName": "脱脂乳粉",
                "supplierName": "供应商A",
                "modelOrSpecification": "SMP-A",
                "protein": "34",
                "attachmentCount": 2,
                "sourceLinkCount": 2,
                "sourceConfidence": "high",
                "status": "ready"
            },
            {
                "materialName": "脱脂乳粉",
                "supplierName": "供应商B",
                "modelOrSpecification": "SMP-B",
                "protein": "34",
                "attachmentCount": 1,
                "sourceLinkCount": 1,
                "sourceConfidence": "high",
                "status": "ready"
            }
        ])
    );
}
