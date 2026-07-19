use std::{fs, path::PathBuf};

use food_rd_desktop::{
    ingest::{
        coordinator::IngredientIngestCoordinator,
        model::{
            ImportFileReference, ImportFileReferenceKind, IngredientImportJobRequest,
            IngredientImportJobStatus, IngredientImportSourceKind,
        },
    },
    ingredients::repository::IngredientRepository,
};
use rusqlite::{Connection, params};
use uuid::Uuid;

struct FileFixture {
    attachment_root: PathBuf,
    database_path: PathBuf,
    root: PathBuf,
    source_path: PathBuf,
}

impl FileFixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-ingest-repo-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("ingredients.csv");
        fs::write(
            &source_path,
            "通用原料名称,供应商名称,营养基准,蛋白质(g)\n脱脂乳粉,供应商A,每100g,34.0\n脱脂乳粉,供应商B,每100g,35.0\n",
        )
        .unwrap();
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

    fn request(&self, source_kind: IngredientImportSourceKind) -> IngredientImportJobRequest {
        IngredientImportJobRequest {
            files: vec![ImportFileReference {
                kind: ImportFileReferenceKind::NativePath,
                value: self.source_path.to_string_lossy().to_string(),
                media_type: Some("text/csv".into()),
            }],
            source_kind,
        }
    }
}

impl Drop for FileFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn spreadsheet_job_moves_to_drafts_ready_and_survives_reopen() {
    let fixture = FileFixture::new();
    let mut coordinator = fixture.coordinator();

    let job = coordinator
        .create_job(fixture.request(IngredientImportSourceKind::Spreadsheet))
        .unwrap();

    assert_eq!(job.status, IngredientImportJobStatus::DraftsReady);
    assert_eq!(coordinator.list_drafts(&job.id).unwrap().len(), 2);
    drop(coordinator);

    let reopened = fixture.coordinator();
    assert_eq!(
        reopened.get_job(&job.id).unwrap().status,
        IngredientImportJobStatus::DraftsReady
    );
    assert_eq!(reopened.list_drafts(&job.id).unwrap().len(), 2);
}

#[test]
fn retry_reuses_staged_attachments_and_does_not_duplicate_source_names() {
    let fixture = FileFixture::new();
    let mut coordinator = fixture.coordinator();
    let job = coordinator
        .create_job(fixture.request(IngredientImportSourceKind::Spreadsheet))
        .unwrap();

    coordinator.cancel_job(&job.id).unwrap();
    let retried = coordinator.retry_job(&job.id).unwrap();

    assert_eq!(retried.status, IngredientImportJobStatus::DraftsReady);
    let drafts = coordinator.list_drafts(&job.id).unwrap();
    assert_eq!(drafts.len(), 2);
    assert_eq!(
        drafts[0].review.source.matches("ingredients.csv").count(),
        1
    );
    let connection = Connection::open(&fixture.database_path).unwrap();
    let attachment_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM source_attachments", [], |row| {
            row.get(0)
        })
        .unwrap();
    let extraction_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM attachment_extractions", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(attachment_count, 1);
    assert_eq!(extraction_count, 1);
}

#[test]
fn agent_jobs_stop_at_recognizing_until_the_agent_runtime_takes_over() {
    let fixture = FileFixture::new();
    let mut coordinator = fixture.coordinator();

    let job = coordinator
        .create_job(fixture.request(IngredientImportSourceKind::Agent))
        .unwrap();

    assert_eq!(job.status, IngredientImportJobStatus::Recognizing);
    assert!(coordinator.list_drafts(&job.id).unwrap().is_empty());
}

#[test]
fn reopening_marks_interrupted_jobs_as_safely_retryable_failures() {
    let fixture = FileFixture::new();
    drop(IngredientRepository::open(&fixture.database_path).unwrap());
    let connection = Connection::open(&fixture.database_path).unwrap();
    connection
        .execute(
            "INSERT INTO ingredient_import_jobs (
               id, source_kind, status, progress_current, progress_total,
               created_at, updated_at
             ) VALUES (?1, 'spreadsheet', 'extracting', 0, 1, ?2, ?2)",
            params!["interrupted-job", "2026-07-19T00:00:00Z"],
        )
        .unwrap();
    drop(connection);

    let coordinator = fixture.coordinator();
    let recovered = coordinator.get_job("interrupted-job").unwrap();

    assert_eq!(recovered.status, IngredientImportJobStatus::Failed);
    assert_eq!(
        recovered.error_summary.as_deref(),
        Some("应用上次在处理中退出，可安全重试")
    );
}
