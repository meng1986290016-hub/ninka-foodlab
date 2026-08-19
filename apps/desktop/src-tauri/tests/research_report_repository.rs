use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use calamine::{Reader, open_workbook_auto};
use food_rd_desktop::{
    database::{self, migrations},
    labels::{
        model::{NutritionLabelDraftInput, NutritionLabelInput, NutritionLabelVersionInput},
        repository::NutritionLabelRepository,
    },
    recipes::{
        model::{RecipeDraftInput, RecipeInput, RecipeKind, RecipeVersionInput},
        repository::RecipeRepository,
    },
    reports::{
        export::{
            ResearchReportExportFormat, ResearchReportExportRequest, SampleSheetExportRequest,
            export_research_report, export_sample_sheet, research_report_document_hash,
        },
        model::ResearchReportInput,
        repository::ResearchReportRepository,
    },
};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use lopdf::{Document, Object, dictionary};
use rusqlite::Connection;
use rust_xlsxwriter::Workbook;
use serde_json::{Value, json};
use std::io::Cursor;

fn temporary_database(name: &str) -> std::path::PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "food-rd-{name}-{}-{suffix}.sqlite3",
        std::process::id()
    ))
}

fn seed_formal_sources(path: &std::path::Path, name: &str) -> (String, String) {
    let mut recipes = RecipeRepository::open(path).unwrap();
    let recipe = recipes
        .create_recipe(RecipeInput {
            name: name.into(),
            code: None,
            tags: Vec::new(),
            kind: RecipeKind::Formula,
        })
        .unwrap();
    let recipe_draft = recipes
        .save_draft(RecipeDraftInput {
            recipe_id: recipe.id.clone(),
            based_on_version_id: None,
            source: "manual".into(),
            payload_version: 1,
            payload: json!({
                "targetBatchGrams": "1000",
                "items": []
            }),
            calculation: Some(json!({
                "nutrients": [],
                "cost": { "batchTotal": "0" }
            })),
            calculation_issues: Vec::new(),
        })
        .unwrap();
    let recipe_version = recipes
        .create_version(RecipeVersionInput {
            recipe_id: recipe.id.clone(),
            source_draft_id: recipe_draft.id,
            based_on_version_id: None,
            snapshot_schema_version: 1,
            snapshot: json!({
                "recipe": {
                    "id": recipe.id,
                    "name": name,
                    "kind": "formula"
                },
                "targetBatchGrams": "1000"
            }),
            dependency_version_ids: Vec::new(),
        })
        .unwrap();
    drop(recipes);

    let mut labels = NutritionLabelRepository::open(path).unwrap();
    let label = labels
        .create_label(NutritionLabelInput {
            recipe_id: recipe.id,
            name: "营养成分表".into(),
        })
        .unwrap();
    let label_draft = labels
        .save_draft(NutritionLabelDraftInput {
            label_id: label.id.clone(),
            recipe_version_id: recipe_version.id.clone(),
            rule_pack_id: "gb-28050-2011".into(),
            payload_schema_version: 1,
            payload: json!({
                "basis": {
                    "kind": "per_100g",
                    "quantity": "100",
                    "unit": "g"
                },
                "sourceValues": []
            }),
            calculation: Some(json!({
                "publishable": true,
                "rows": []
            })),
            issues: Vec::new(),
        })
        .unwrap();
    let label_version = labels
        .create_version(NutritionLabelVersionInput {
            label_id: label.id,
            source_draft_id: label_draft.id,
            recipe_version_id: recipe_version.id.clone(),
            rule_pack_id: "gb-28050-2011".into(),
            rule_pack_revision: "2011.1".into(),
            snapshot_schema_version: 1,
            snapshot: json!({
                "basis": {
                    "kind": "per_100g",
                    "quantity": "100",
                    "unit": "g"
                },
                "rulePack": {
                    "id": "gb-28050-2011",
                    "revision": "2011.1"
                },
                "sourceValues": [],
                "rows": [],
                "issues": [],
                "publishable": true,
                "requiredNotice": null
            }),
        })
        .unwrap();
    (recipe_version.id, label_version.id)
}

fn report_input(id: &str, recipe_version_id: &str, label_version_id: &str) -> ResearchReportInput {
    ResearchReportInput {
        document: json!({
            "schemaVersion": 1,
            "id": id,
            "title": "食品研发报告",
            "generatedAt": "2026-07-31T08:00:00Z",
            "recipe": {
                "versionId": recipe_version_id
            },
            "nutrition": {
                "labelVersionId": label_version_id
            },
            "provenance": {
                "recipeVersionId": recipe_version_id,
                "nutritionLabelVersionId": label_version_id,
                "generatedBy": "food-rd-studio"
            }
        }),
        svg: format!("<svg xmlns=\"http://www.w3.org/2000/svg\"><text>{id}</text></svg>"),
    }
}

#[test]
fn migration_seven_creates_report_table_indexes_and_immutability_triggers() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-31T00:00:00Z").unwrap();

    let version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(version, 13);
    for object in [
        "research_reports",
        "research_reports_recipe_version_idx",
        "research_reports_source_guard",
        "research_reports_no_update",
        "research_reports_no_delete",
    ] {
        let exists = connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM sqlite_master
                   WHERE name = ?1 AND type IN ('table', 'index', 'trigger')
                 )",
                [object],
                |row| row.get::<_, bool>(0),
            )
            .unwrap();
        assert!(exists, "missing schema object {object}");
    }
}

#[test]
fn immutable_report_survives_reopen_with_exact_document_and_svg() {
    let path = temporary_database("report-reopen");
    let (recipe_version_id, label_version_id) = seed_formal_sources(&path, "原味发酵乳");
    let input = report_input("report-immutable-1", &recipe_version_id, &label_version_id);
    let saved;
    {
        let mut repository =
            ResearchReportRepository::open_in_memory_with(|| "2026-07-31T08:01:00Z".into())
                .unwrap();
        let error = repository.create_report(input.clone()).unwrap_err();
        assert_eq!(error.code(), "missing_reference");
    }
    {
        let mut repository = ResearchReportRepository::open(&path).unwrap();
        saved = repository.create_report(input.clone()).unwrap();
        assert_eq!(saved.id, "report-immutable-1");
        assert_eq!(saved.document, input.document);
        assert_eq!(saved.svg, input.svg);
        assert_eq!(
            repository
                .list_reports(&recipe_version_id)
                .unwrap()
                .as_slice(),
            std::slice::from_ref(&saved)
        );
    }
    {
        let repository = ResearchReportRepository::open(&path).unwrap();
        assert_eq!(repository.get_report("report-immutable-1").unwrap(), saved);
    }

    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .unwrap();
    assert!(
        connection
            .execute(
                "UPDATE research_reports
                 SET document_json = '{}' WHERE id = ?1",
                ["report-immutable-1"],
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "DELETE FROM research_reports WHERE id = ?1",
                ["report-immutable-1"],
            )
            .is_err()
    );
    drop(connection);
    fs::remove_file(path).unwrap();
}

#[test]
fn report_rejects_mismatched_sources_duplicate_ids_and_active_svg_content() {
    let path = temporary_database("report-validation");
    let (recipe_version_id, label_version_id) = seed_formal_sources(&path, "燕麦乳");
    let (_, other_label_version_id) = seed_formal_sources(&path, "椰乳");
    let mut repository = ResearchReportRepository::open(&path).unwrap();

    let mismatch = repository
        .create_report(report_input(
            "report-mismatch",
            &recipe_version_id,
            &other_label_version_id,
        ))
        .unwrap_err();
    assert_eq!(mismatch.code(), "missing_reference");

    let valid = report_input("report-unique", &recipe_version_id, &label_version_id);
    repository.create_report(valid.clone()).unwrap();
    let duplicate = repository.create_report(valid).unwrap_err();
    assert_eq!(duplicate.code(), "invalid_state");

    let mut unsafe_input = report_input("report-unsafe", &recipe_version_id, &label_version_id);
    unsafe_input.svg = "<svg><script>alert(1)</script></svg>".to_string();
    let unsafe_error = repository.create_report(unsafe_input).unwrap_err();
    assert_eq!(unsafe_error.code(), "invalid_input");

    let missing = repository.get_report("missing-report").unwrap_err();
    assert_eq!(missing.code(), "not_found");
    drop(repository);
    fs::remove_file(path).unwrap();
}

#[test]
fn report_keeps_json_null_and_zero_as_distinct_values() {
    let path = temporary_database("report-null-zero");
    let (recipe_version_id, label_version_id) = seed_formal_sources(&path, "低糖乳饮料");
    let mut input = report_input("report-null-zero", &recipe_version_id, &label_version_id);
    input.document["values"] = json!({
        "unknown": Value::Null,
        "measuredZero": "0"
    });
    let mut repository = ResearchReportRepository::open(&path).unwrap();

    let saved = repository.create_report(input).unwrap();

    assert!(saved.document["values"]["unknown"].is_null());
    assert_eq!(saved.document["values"]["measuredZero"], "0");
    drop(repository);
    fs::remove_file(path).unwrap();
}

#[test]
fn all_export_formats_are_atomically_written_and_readable() {
    let path = temporary_database("report-export-formats");
    let export_root = unique_export_directory("report-exports");
    fs::create_dir(&export_root).unwrap();
    let (recipe_version_id, label_version_id) = seed_formal_sources(&path, "报告导出酸奶");
    let mut repository = ResearchReportRepository::open(&path).unwrap();
    let report = repository
        .create_report(report_input(
            "report-export-all",
            &recipe_version_id,
            &label_version_id,
        ))
        .unwrap();
    let hash = research_report_document_hash(&report.document).unwrap();

    let json_bytes = serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "kind": "food-rd-research-report",
        "reportId": report.id,
        "generatedAt": report.document["generatedAt"],
        "rulePack": {
            "id": "gb-28050-2011",
            "revision": "2011.1",
            "standardCode": "GB 28050-2011"
        },
        "snapshotHash": hash,
        "document": report.document
    }))
    .unwrap();
    let json_path = export_root.join("报告.json");
    export_research_report(
        &report,
        export_request(
            &report.id,
            ResearchReportExportFormat::Json,
            &json_path,
            "报告.json",
            &hash,
            &json_bytes,
        ),
    )
    .unwrap();
    let parsed: Value = serde_json::from_slice(&fs::read(&json_path).unwrap()).unwrap();
    assert_eq!(parsed["snapshotHash"], hash);
    assert_eq!(parsed["document"], report.document);

    let png_bytes = png_fixture();
    let png_path = export_root.join("报告.png");
    export_research_report(
        &report,
        export_request(
            &report.id,
            ResearchReportExportFormat::Png,
            &png_path,
            "报告.png",
            &hash,
            &png_bytes,
        ),
    )
    .unwrap();
    assert_eq!(image::open(&png_path).unwrap().width(), 2);

    let pdf_bytes = pdf_fixture();
    let pdf_path = export_root.join("报告.pdf");
    export_research_report(
        &report,
        export_request(
            &report.id,
            ResearchReportExportFormat::Pdf,
            &pdf_path,
            "报告.pdf",
            &hash,
            &pdf_bytes,
        ),
    )
    .unwrap();
    assert_eq!(Document::load(&pdf_path).unwrap().get_pages().len(), 1);

    let xlsx_bytes = xlsx_fixture();
    let xlsx_path = export_root.join("报告.xlsx");
    export_research_report(
        &report,
        export_request(
            &report.id,
            ResearchReportExportFormat::Xlsx,
            &xlsx_path,
            "报告.xlsx",
            &hash,
            &xlsx_bytes,
        ),
    )
    .unwrap();
    let workbook = open_workbook_auto(&xlsx_path).unwrap();
    assert_eq!(
        workbook.sheet_names(),
        [
            "配方",
            "原料",
            "营养",
            "成本",
            "目标",
            "标签与来源",
            "研发备注"
        ]
    );

    drop(repository);
    fs::remove_dir_all(export_root).unwrap();
    fs::remove_file(path).unwrap();
}

#[test]
fn failed_export_preserves_existing_target_and_removes_temporary_file() {
    let path = temporary_database("report-export-atomic-failure");
    let export_root = unique_export_directory("report-atomic");
    fs::create_dir(&export_root).unwrap();
    let (recipe_version_id, label_version_id) = seed_formal_sources(&path, "原子导出酸奶");
    let mut repository = ResearchReportRepository::open(&path).unwrap();
    let report = repository
        .create_report(report_input(
            "report-export-atomic",
            &recipe_version_id,
            &label_version_id,
        ))
        .unwrap();
    let destination = export_root.join("原报告.png");
    fs::write(&destination, b"existing-safe-file").unwrap();

    let error = export_research_report(
        &report,
        export_request(
            &report.id,
            ResearchReportExportFormat::Png,
            &destination,
            "原报告.png",
            "sha256:wrong",
            &png_fixture(),
        ),
    )
    .unwrap_err();

    assert_eq!(error.code(), "invalid_input");
    assert_eq!(fs::read(&destination).unwrap(), b"existing-safe-file");
    assert_eq!(fs::read_dir(&export_root).unwrap().count(), 1);
    drop(repository);
    fs::remove_dir_all(export_root).unwrap();
    fs::remove_file(path).unwrap();
}

#[test]
fn sample_sheet_export_accepts_a_safe_single_sheet_xlsx() {
    let export_root = unique_export_directory("sample-sheet-export");
    fs::create_dir(&export_root).unwrap();
    let destination = export_root.join("打样配料单.xlsx");
    let bytes = sample_sheet_xlsx_fixture();

    export_sample_sheet(SampleSheetExportRequest {
        destination_path: destination.to_string_lossy().into_owned(),
        file_name: "打样配料单.xlsx".into(),
        bytes_base64: STANDARD.encode(&bytes),
    })
    .unwrap();

    let workbook = open_workbook_auto(&destination).unwrap();
    assert_eq!(workbook.sheet_names(), ["打样配料单"]);
    fs::remove_dir_all(export_root).unwrap();
}

fn unique_export_directory(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "food-rd-{name}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}

fn export_request(
    report_id: &str,
    format: ResearchReportExportFormat,
    destination: &std::path::Path,
    file_name: &str,
    document_hash: &str,
    bytes: &[u8],
) -> ResearchReportExportRequest {
    ResearchReportExportRequest {
        report_id: report_id.into(),
        format,
        destination_path: destination.to_string_lossy().into_owned(),
        file_name: file_name.into(),
        document_hash: document_hash.into(),
        bytes_base64: STANDARD.encode(bytes),
    }
}

fn png_fixture() -> Vec<u8> {
    let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(2, 2, Rgb([255, 255, 255])));
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, ImageFormat::Png).unwrap();
    output.into_inner()
}

fn pdf_fixture() -> Vec<u8> {
    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let page_id = document.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
    });
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).unwrap();
    bytes
}

fn xlsx_fixture() -> Vec<u8> {
    let mut workbook = Workbook::new();
    for name in [
        "配方",
        "原料",
        "营养",
        "成本",
        "目标",
        "标签与来源",
        "研发备注",
    ] {
        let sheet = workbook.add_worksheet();
        sheet.set_name(name).unwrap();
        sheet.write_string(0, 0, "可回读").unwrap();
    }
    workbook.save_to_buffer().unwrap()
}

fn sample_sheet_xlsx_fixture() -> Vec<u8> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("打样配料单").unwrap();
    sheet.write_string(0, 0, "原料").unwrap();
    sheet.write_string(0, 1, "应添加量").unwrap();
    workbook.save_to_buffer().unwrap()
}
