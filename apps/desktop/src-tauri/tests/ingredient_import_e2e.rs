use std::{fs, path::PathBuf};

use food_rd_desktop::ingest::{
    coordinator::IngredientIngestCoordinator,
    model::{
        ImportFileReference, ImportFileReferenceKind, IngredientImportJobRequest,
        IngredientImportSourceKind,
    },
};
use rusqlite::Connection;
use uuid::Uuid;

const HEADER: &str = "通用原料名称,分类,供应商名称,型号/规格,当前含税价,价格单位,营养基准,蛋白质(g),脂肪(g),含有过敏原,可能含有过敏原,数据来源,研发备注";

struct AcceptanceFixture {
    attachment_root: PathBuf,
    database_path: PathBuf,
    root: PathBuf,
}

impl AcceptanceFixture {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("food-rd-ingredient-import-e2e-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self {
            attachment_root: root.join("attachments"),
            database_path: root.join("food-rd.sqlite3"),
            root,
        }
    }

    fn coordinator(&self) -> IngredientIngestCoordinator {
        IngredientIngestCoordinator::open(&self.database_path, &self.attachment_root).unwrap()
    }

    fn write_csv(&self, name: &str, body: &str) -> PathBuf {
        let path = self.root.join(name);
        fs::write(&path, body).unwrap();
        path
    }

    fn spreadsheet_request(&self, paths: &[PathBuf]) -> IngredientImportJobRequest {
        IngredientImportJobRequest {
            files: paths
                .iter()
                .map(|path| ImportFileReference {
                    kind: ImportFileReferenceKind::NativePath,
                    value: path.to_string_lossy().to_string(),
                    media_type: Some("text/csv".into()),
                })
                .collect(),
            source_kind: IngredientImportSourceKind::Spreadsheet,
        }
    }

    fn source_file_count(&self) -> usize {
        let Ok(directories) = fs::read_dir(&self.attachment_root) else {
            return 0;
        };
        directories
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .map(|directory| {
                fs::read_dir(directory.path())
                    .unwrap()
                    .filter_map(Result::ok)
                    .filter(|entry| entry.path().is_file())
                    .count()
            })
            .sum()
    }
}

impl Drop for AcceptanceFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn eight_files_and_three_rows_commit_only_reviewed_records() {
    let fixture = AcceptanceFixture::new();
    let mut paths = vec![
        fixture.write_csv(
            "supplier-a.csv",
            &format!(
                "{HEADER}\n脱脂乳粉,乳制品,供应商A,A-100,31.50,kg,每100g,,0,乳及乳制品,大豆,规格书A,低脂\n"
            ),
        ),
        fixture.write_csv(
            "supplier-b.csv",
            &format!(
                "{HEADER}\n脱脂乳粉,乳制品,供应商B,B-200,32.20,kg,每100g,34.0,0.8,乳及乳制品,,规格书B,溶解快\n"
            ),
        ),
        fixture.write_csv(
            "supplier-c.csv",
            &format!(
                "{HEADER}\n脱脂乳粉,乳制品,供应商C,C-300,33.00,kg,每100g,35.0,0.6,乳及乳制品,,规格书C,备选\n"
            ),
        ),
    ];
    for index in 4..=8 {
        paths.push(fixture.write_csv(
            &format!("empty-{index}.csv"),
            &format!("{HEADER},空列{index}\n"),
        ));
    }

    let mut coordinator = fixture.coordinator();
    let job = coordinator
        .create_job(fixture.spreadsheet_request(&paths))
        .unwrap();
    let drafts = coordinator.list_drafts(&job.id).unwrap();
    assert_eq!(job.progress_current, 8);
    assert_eq!(drafts.len(), 3);

    coordinator.discard_draft(&drafts[2].id).unwrap();
    let result = coordinator.commit_job(&job.id).unwrap();

    assert_eq!(result.variants.len(), 2);
    let groups = coordinator.ingredients().list_material_groups("").unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].name, "脱脂乳粉");
    let mut suppliers = groups[0]
        .variants
        .iter()
        .map(|variant| variant.supplier_name.as_str())
        .collect::<Vec<_>>();
    suppliers.sort_unstable();
    assert_eq!(suppliers, ["供应商A", "供应商B"]);

    let supplier_a = groups[0]
        .variants
        .iter()
        .find(|variant| variant.supplier_name == "供应商A")
        .unwrap();
    let protein = supplier_a
        .nutrition
        .values
        .iter()
        .find(|value| value.nutrient_definition_id == "protein")
        .unwrap();
    let fat = supplier_a
        .nutrition
        .values
        .iter()
        .find(|value| value.nutrient_definition_id == "fat")
        .unwrap();
    assert_eq!(protein.value, None);
    assert_eq!(fat.value.as_deref(), Some("0"));
}

#[test]
fn restart_preserves_drafts_and_cleanup_removes_only_abandoned_sources() {
    let fixture = AcceptanceFixture::new();
    let kept = fixture.write_csv(
        "kept.csv",
        &format!(
            "{HEADER}\n脱脂乳粉,乳制品,供应商A,A-100,31.50,kg,每100g,34.0,0.8,乳及乳制品,,规格书A,正式资料\n"
        ),
    );
    let abandoned = fixture.write_csv(
        "abandoned.csv",
        &format!("{HEADER}\n燕麦粉,谷物,供应商X,X-1,12.00,kg,每100g,13.0,7.0,,,规格书X,暂不采用\n"),
    );

    let (kept_job_id, abandoned_job_id) = {
        let mut coordinator = fixture.coordinator();
        let kept_job = coordinator
            .create_job(fixture.spreadsheet_request(&[kept]))
            .unwrap();
        coordinator.commit_job(&kept_job.id).unwrap();

        let abandoned_job = coordinator
            .create_job(fixture.spreadsheet_request(&[abandoned]))
            .unwrap();
        assert_eq!(coordinator.list_drafts(&abandoned_job.id).unwrap().len(), 1);
        assert_eq!(fixture.source_file_count(), 2);
        (kept_job.id, abandoned_job.id)
    };

    let mut reopened = fixture.coordinator();
    assert_eq!(reopened.list_drafts(&kept_job_id).unwrap().len(), 1);
    let abandoned_drafts = reopened.list_drafts(&abandoned_job_id).unwrap();
    assert_eq!(abandoned_drafts.len(), 1);
    assert_eq!(
        abandoned_drafts[0].attachments[0].original_name,
        "abandoned.csv"
    );

    reopened.discard_draft(&abandoned_drafts[0].id).unwrap();
    reopened.cancel_job(&abandoned_job_id).unwrap();
    assert_eq!(reopened.cleanup_orphan_attachments().unwrap(), 1);
    assert_eq!(fixture.source_file_count(), 1);
    assert!(
        reopened.list_drafts(&abandoned_job_id).unwrap()[0]
            .attachments
            .is_empty()
    );

    let connection = Connection::open(&fixture.database_path).unwrap();
    let source_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM source_attachments", [], |row| {
            row.get(0)
        })
        .unwrap();
    let formal_link_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM ingredient_variant_attachments",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(source_count, 1);
    assert_eq!(formal_link_count, 1);
}
