use std::{fs, path::PathBuf};

use food_rd_desktop::ingest::{
    coordinator::IngredientIngestCoordinator,
    model::{
        ImportFileReference, ImportFileReferenceKind, IngredientImportDraftStatus,
        IngredientImportJobRequest, IngredientImportSourceKind,
    },
};
use rusqlite::Connection;
use uuid::Uuid;

struct CoordinatorFixture {
    attachment_root: PathBuf,
    database_path: PathBuf,
    root: PathBuf,
    source_path: PathBuf,
}

impl CoordinatorFixture {
    fn new(csv: &str) -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-ingest-commit-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("supplier-data.csv");
        fs::write(&source_path, csv).unwrap();
        Self {
            attachment_root: root.join("attachments"),
            database_path: root.join("food-rd.sqlite3"),
            root,
            source_path,
        }
    }

    fn coordinator(&self) -> IngredientIngestCoordinator {
        IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap()
    }

    fn request(&self) -> IngredientImportJobRequest {
        IngredientImportJobRequest {
            files: vec![ImportFileReference {
                kind: ImportFileReferenceKind::NativePath,
                value: self.source_path.to_string_lossy().to_string(),
                media_type: Some("text/csv".into()),
            }],
            source_kind: IngredientImportSourceKind::Spreadsheet,
        }
    }
}

impl Drop for CoordinatorFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn whole_job_failure_rolls_back_categories_suppliers_variants_and_links() {
    let fixture = CoordinatorFixture::new(
        "通用原料名称,分类,供应商名称,营养基准,含有过敏原\n脱脂乳粉,乳制品,供应商A,每100g,乳及乳制品\n脱脂乳粉,乳制品,供应商B,每100g,乳及乳制品\n",
    );
    let mut coordinator = fixture.coordinator();
    let job = coordinator.create_job(fixture.request()).unwrap();
    let drafts = coordinator.list_drafts(&job.id).unwrap();
    let mut duplicate = drafts[1].review.clone();
    duplicate.supplier_name = "供应商A".into();
    coordinator.update_draft(&drafts[1].id, duplicate).unwrap();

    assert!(coordinator.commit_job(&job.id).is_err());
    assert!(
        coordinator
            .ingredients()
            .list_material_groups("")
            .unwrap()
            .is_empty()
    );
    assert!(
        coordinator
            .ingredients()
            .list_suppliers("")
            .unwrap()
            .is_empty()
    );
    let connection = Connection::open(&fixture.database_path).unwrap();
    for table in [
        "categories",
        "suppliers",
        "material_groups",
        "ingredient_variants",
        "ingredient_variant_attachments",
    ] {
        let count: i64 = connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "{table}");
    }
}

#[test]
fn reviewed_single_draft_links_attachments_allergens_and_marks_imported() {
    let fixture = CoordinatorFixture::new(
        "通用原料名称,分类,供应商名称,营养基准,蛋白质(g),含有过敏原,可能含有过敏原\n脱脂乳粉,乳制品,供应商A,每100g,34.0,乳及乳制品,大豆\n",
    );
    let mut coordinator = fixture.coordinator();
    let job = coordinator.create_job(fixture.request()).unwrap();
    let draft = coordinator.list_drafts(&job.id).unwrap().remove(0);

    let mut reviewed = draft.review.clone();
    reviewed.supplier_name = "人工复核供应商".into();
    let saved = coordinator
        .commit_reviewed_draft(&draft.id, reviewed)
        .unwrap();

    assert_eq!(saved.source_attachments.len(), 1);
    assert_eq!(
        saved.source_attachments[0].original_name,
        "supplier-data.csv"
    );
    assert_eq!(saved.allergens.contains, ["乳及乳制品"]);
    assert_eq!(saved.allergens.may_contain, ["大豆"]);
    let imported_draft = coordinator.get_draft(&draft.id).unwrap();
    assert_eq!(imported_draft.status, IngredientImportDraftStatus::Imported);
    assert_eq!(imported_draft.review.supplier_name, "人工复核供应商");
}
