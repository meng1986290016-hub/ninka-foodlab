use std::{collections::BTreeSet, fs, path::PathBuf};

use food_rd_desktop::{
    agent::{
        model::AgentProviderKind,
        tools::{AgentToolContext, AgentToolRegistry},
    },
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{
            ImportFileReference, ImportFileReferenceKind, ImportIssueCode,
            IngredientImportJobRequest, IngredientImportSourceKind,
        },
    },
};
use serde_json::{Value, json};
use uuid::Uuid;

struct Fixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    source_paths: Vec<PathBuf>,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-agent-flow-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_paths = (0..8)
            .map(|index| {
                let path = root.join(format!("source-{index}.txt"));
                fs::write(&path, format!("原料资料 {index}")).unwrap();
                path
            })
            .collect();
        Self {
            database_path: root.join("food-rd.sqlite3"),
            attachment_root: root.join("attachments"),
            source_paths,
            root,
        }
    }

    fn registry_and_context(&self) -> (AgentToolRegistry, AgentToolContext) {
        let mut coordinator =
            IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap();
        let job = coordinator
            .create_job(IngredientImportJobRequest {
                files: self
                    .source_paths
                    .iter()
                    .map(|path| ImportFileReference {
                        kind: ImportFileReferenceKind::NativePath,
                        value: path.to_string_lossy().into_owned(),
                        media_type: Some("text/plain".into()),
                    })
                    .collect(),
                source_kind: IngredientImportSourceKind::Agent,
            })
            .unwrap();
        let attachment_ids = coordinator
            .list_job_attachments(&job.id)
            .unwrap()
            .into_iter()
            .map(|attachment| attachment.id)
            .collect::<BTreeSet<_>>();
        (
            AgentToolRegistry::new(coordinator),
            AgentToolContext {
                run_id: "run-flow".into(),
                import_job_id: job.id,
                allowed_attachment_ids: attachment_ids,
                provider_kind: AgentProviderKind::OpenAi,
                model: "fixture".into(),
            },
        )
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn review(material: &str, supplier: &str, model: &str, price: &str) -> Value {
    json!({
        "materialGroupId": null,
        "materialName": material,
        "categoryId": null,
        "categoryName": "乳制品",
        "supplierId": null,
        "supplierName": supplier,
        "modelOrSpecification": model,
        "currentPrice": price,
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

#[test]
fn eight_sources_group_into_three_supplier_drafts_without_formal_saves() {
    let fixture = Fixture::new();
    let (mut registry, context) = fixture.registry_and_context();
    let attachment_ids = context
        .allowed_attachment_ids
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    let groups = [
        ("脱脂乳粉", "供应商A", "SMP-A", "31.50"),
        ("脱脂乳粉", "供应商A", "SMP-A", "32.00"),
        ("脱脂乳粉", "供应商A", "SMP-A", "31.50"),
        ("脱脂乳粉", "供应商B", "SMP-B", "30.80"),
        ("脱脂乳粉", "供应商B", "SMP-B", "30.80"),
        ("脱脂乳粉", "供应商B", "SMP-B", "30.80"),
        ("乳清蛋白粉", "供应商C", "WPC-80", "58.00"),
        ("乳清蛋白粉", "供应商C", "WPC-80", "58.00"),
    ];

    for (index, (material, supplier, model, price)) in groups.iter().enumerate() {
        let attachment_id = &attachment_ids[index];
        registry
            .execute(
                &context,
                "create_ingredient_import_draft",
                json!({
                    "review": review(material, supplier, model, price),
                    "attachmentIds": [attachment_id],
                    "sourceLinks": [{
                        "fieldPath": "currentPrice",
                        "attachmentId": attachment_id,
                        "sourceLocator": format!("第 {} 份资料", index + 1)
                    }]
                }),
            )
            .unwrap();
    }

    let drafts = registry
        .coordinator()
        .list_drafts(&context.import_job_id)
        .unwrap();
    assert_eq!(drafts.len(), 3);
    assert_eq!(
        drafts
            .iter()
            .filter(|draft| draft.review.material_name == "脱脂乳粉")
            .count(),
        2
    );
    let supplier_a = drafts
        .iter()
        .find(|draft| draft.review.supplier_name == "供应商A")
        .unwrap();
    assert_eq!(supplier_a.attachments.len(), 3);
    assert_eq!(supplier_a.source_links.len(), 3);
    assert_eq!(supplier_a.review.current_price, None);
    assert!(supplier_a.issues.iter().any(|issue| {
        issue.code == ImportIssueCode::SourceConflict
            && issue.field_path.as_deref() == Some("currentPrice")
    }));
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
fn unassigned_sources_remain_on_the_review_job() {
    let fixture = Fixture::new();
    let (mut registry, context) = fixture.registry_and_context();
    let attachment_id = context.allowed_attachment_ids.iter().next().unwrap();
    registry
        .execute(
            &context,
            "create_ingredient_import_draft",
            json!({
                "review": review("脱脂乳粉", "供应商A", "SMP-A", "31.50"),
                "attachmentIds": [attachment_id],
                "sourceLinks": []
            }),
        )
        .unwrap();

    assert_eq!(
        registry
            .coordinator_mut()
            .cleanup_orphan_attachments()
            .unwrap(),
        0
    );
    assert_eq!(
        registry
            .coordinator()
            .list_job_attachments(&context.import_job_id)
            .unwrap()
            .len(),
        8
    );
}
