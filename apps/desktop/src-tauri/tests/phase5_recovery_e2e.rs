use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use calamine::{Reader, open_workbook_auto};
use food_rd_desktop::{
    backup::{
        archive::{BackupSource, create_offline_backup},
        restore::{RestoreTarget, preflight_offline_backup, restore_offline_backup},
    },
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
            ResearchReportExportFormat, ResearchReportExportRequest, export_research_report,
            research_report_document_hash,
        },
        model::ResearchReportInput,
        repository::ResearchReportRepository,
    },
};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use lopdf::{Document, Object, dictionary};
use rust_xlsxwriter::Workbook;
use serde_json::{Value, json};

const NOW: &str = "2026-07-31T16:00:00+08:00";

#[test]
fn formal_recipe_dual_labels_reports_backup_and_restore_form_one_recovery_loop() {
    let fixture = Fixture::new();
    let (recipe_id, recipe_version_id) = seed_formal_recipe(&fixture.database_path);
    let (label_id, label_versions) =
        publish_dual_standard_labels(&fixture.database_path, &recipe_id, &recipe_version_id);
    assert_eq!(label_versions.len(), 2);

    let report = save_report(
        &fixture.database_path,
        &recipe_version_id,
        &label_versions[1],
    );
    export_all_formats(&fixture.export_root, &report);

    create_offline_backup(
        BackupSource {
            database_path: &fixture.database_path,
            attachment_root: &fixture.attachment_root,
            application_version: "0.1.0-test",
            created_at: NOW,
        },
        &fixture.backup_path,
    )
    .unwrap();
    let preflight = preflight_offline_backup(&fixture.backup_path).unwrap();
    assert_eq!(preflight.counts.recipes, 1);
    assert_eq!(preflight.counts.recipe_versions, 1);
    assert_eq!(preflight.counts.nutrition_labels, 1);
    assert_eq!(preflight.counts.nutrition_label_versions, 2);
    assert_eq!(preflight.counts.research_reports, 1);

    replace_with_empty_database(&fixture.database_path);
    assert!(
        RecipeRepository::open(&fixture.database_path)
            .unwrap()
            .list_recipes()
            .unwrap()
            .is_empty()
    );

    let restored = restore_offline_backup(
        &fixture.backup_path,
        RestoreTarget {
            database_path: &fixture.database_path,
            attachment_root: &fixture.attachment_root,
            safety_backup_directory: &fixture.safety_backup_root,
            application_version: "0.1.0-test",
            restored_at: NOW,
        },
    )
    .unwrap();
    assert_eq!(restored.preflight, preflight);
    assert!(
        fixture
            .safety_backup_root
            .join(restored.safety_backup_file_name)
            .is_file()
    );

    let recipes = RecipeRepository::open(&fixture.database_path).unwrap();
    assert_eq!(
        recipes.get_recipe(&recipe_id).unwrap().name,
        "闭环验证发酵乳"
    );
    assert_eq!(recipes.list_versions(&recipe_id).unwrap().len(), 1);
    drop(recipes);

    let labels = NutritionLabelRepository::open(&fixture.database_path).unwrap();
    let restored_versions = labels.list_versions(&label_id).unwrap();
    assert_eq!(
        restored_versions
            .iter()
            .map(|version| version.rule_pack_id.as_str())
            .collect::<Vec<_>>(),
        ["gb-28050-2025", "gb-28050-2011"]
    );
    drop(labels);

    let reports = ResearchReportRepository::open(&fixture.database_path).unwrap();
    let restored_report = reports.get_report(&report.id).unwrap();
    assert_eq!(restored_report.document, report.document);
    assert_eq!(restored_report.svg, report.svg);
}

fn seed_formal_recipe(database_path: &Path) -> (String, String) {
    let mut recipes = RecipeRepository::open(database_path).unwrap();
    let recipe = recipes
        .create_recipe(RecipeInput {
            name: "闭环验证发酵乳".into(),
            code: None,
            tags: vec!["第五阶段验收".into()],
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
                "items": [],
                "note": "正式配方闭环验证"
            }),
            calculation: Some(json!({
                "nutrients": { "protein": "3.2", "fat": "3.0", "sodium": "55" },
                "cost": { "batchTotal": "12.50" }
            })),
            calculation_issues: Vec::new(),
        })
        .unwrap();
    let version = recipes
        .create_version(RecipeVersionInput {
            recipe_id: recipe.id.clone(),
            source_draft_id: draft.id,
            based_on_version_id: None,
            snapshot_schema_version: 1,
            snapshot: json!({
                "recipe": { "id": recipe.id, "name": recipe.name, "kind": "formula" },
                "targetBatchGrams": "1000",
                "calculation": { "cost": { "batchTotal": "12.50" } }
            }),
            dependency_version_ids: Vec::new(),
        })
        .unwrap();
    (recipe.id, version.id)
}

fn publish_dual_standard_labels(
    database_path: &Path,
    recipe_id: &str,
    recipe_version_id: &str,
) -> (String, Vec<String>) {
    let mut labels = NutritionLabelRepository::open(database_path).unwrap();
    let label = labels
        .create_label(NutritionLabelInput {
            recipe_id: recipe_id.into(),
            name: "营养成分表".into(),
        })
        .unwrap();
    let mut version_ids = Vec::new();
    for (rule_pack_id, revision, required_notice) in [
        ("gb-28050-2011", "2011.1", Value::Null),
        (
            "gb-28050-2025",
            "2025.1",
            Value::String("成年人每日推荐摄入量参考值".into()),
        ),
    ] {
        let draft = labels
            .save_draft(NutritionLabelDraftInput {
                label_id: label.id.clone(),
                recipe_version_id: recipe_version_id.into(),
                rule_pack_id: rule_pack_id.into(),
                payload_schema_version: 1,
                payload: json!({
                    "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
                    "sourceValues": [
                        { "nutrientCode": "protein", "value": "3.2", "unit": "g", "sourceKind": "recipe_estimate" },
                        { "nutrientCode": "sodium", "value": "55", "unit": "mg", "sourceKind": "recipe_estimate" }
                    ]
                }),
                calculation: Some(json!({ "publishable": true, "rows": [] })),
                issues: Vec::new(),
            })
            .unwrap();
        let version = labels
            .create_version(NutritionLabelVersionInput {
                label_id: label.id.clone(),
                source_draft_id: draft.id,
                recipe_version_id: recipe_version_id.into(),
                rule_pack_id: rule_pack_id.into(),
                rule_pack_revision: revision.into(),
                snapshot_schema_version: 1,
                snapshot: json!({
                    "schemaVersion": 1,
                    "recipeVersionId": recipe_version_id,
                    "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
                    "rulePack": { "id": rule_pack_id, "revision": revision },
                    "sourceValues": [],
                    "rows": [],
                    "issues": [],
                    "publishable": true,
                    "requiredNotice": required_notice
                }),
            })
            .unwrap();
        version_ids.push(version.id);
    }
    (label.id, version_ids)
}

fn save_report(
    database_path: &Path,
    recipe_version_id: &str,
    label_version_id: &str,
) -> food_rd_desktop::reports::model::ResearchReport {
    let mut reports = ResearchReportRepository::open(database_path).unwrap();
    reports
        .create_report(ResearchReportInput {
            document: json!({
                "schemaVersion": 1,
                "id": "phase5-recovery-report",
                "title": "闭环验证研发报告",
                "generatedAt": NOW,
                "recipe": { "versionId": recipe_version_id },
                "nutrition": { "labelVersionId": label_version_id },
                "provenance": {
                    "recipeVersionId": recipe_version_id,
                    "nutritionLabelVersionId": label_version_id,
                    "generatedBy": "food-rd-studio"
                }
            }),
            svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>闭环验证研发报告</text></svg>"
                .into(),
        })
        .unwrap()
}

fn export_all_formats(
    export_root: &Path,
    report: &food_rd_desktop::reports::model::ResearchReport,
) {
    let hash = research_report_document_hash(&report.document).unwrap();
    let json_bytes = serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "kind": "food-rd-research-report",
        "reportId": report.id,
        "generatedAt": report.document["generatedAt"],
        "rulePack": {
            "id": "gb-28050-2025",
            "revision": "2025.1",
            "standardCode": "GB 28050-2025"
        },
        "snapshotHash": hash,
        "document": report.document
    }))
    .unwrap();
    let exports = [
        (
            ResearchReportExportFormat::Json,
            "闭环报告.json",
            json_bytes,
        ),
        (
            ResearchReportExportFormat::Png,
            "闭环报告.png",
            png_fixture(),
        ),
        (
            ResearchReportExportFormat::Pdf,
            "闭环报告.pdf",
            pdf_fixture(),
        ),
        (
            ResearchReportExportFormat::Xlsx,
            "闭环报告.xlsx",
            xlsx_fixture(),
        ),
    ];
    for (format, file_name, bytes) in exports {
        let destination = export_root.join(file_name);
        export_research_report(
            report,
            ResearchReportExportRequest {
                report_id: report.id.clone(),
                format,
                destination_path: destination.to_string_lossy().into_owned(),
                file_name: file_name.into(),
                document_hash: hash.clone(),
                bytes_base64: STANDARD.encode(bytes),
            },
        )
        .unwrap();
        assert!(destination.is_file());
    }
    assert_eq!(
        image::open(export_root.join("闭环报告.png"))
            .unwrap()
            .width(),
        2
    );
    assert_eq!(
        Document::load(export_root.join("闭环报告.pdf"))
            .unwrap()
            .get_pages()
            .len(),
        1
    );
    assert_eq!(
        open_workbook_auto(export_root.join("闭环报告.xlsx"))
            .unwrap()
            .sheet_names()
            .len(),
        7
    );
    let json: Value =
        serde_json::from_slice(&fs::read(export_root.join("闭环报告.json")).unwrap()).unwrap();
    assert_eq!(json["snapshotHash"], hash);
}

fn replace_with_empty_database(path: &Path) {
    fs::remove_file(path).unwrap();
    let mut connection = database::open(path).unwrap();
    migrations::apply(&mut connection, NOW).unwrap();
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
        sheet.write_string(0, 0, "闭环可回读").unwrap();
    }
    workbook.save_to_buffer().unwrap()
}

struct Fixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    export_root: PathBuf,
    safety_backup_root: PathBuf,
    backup_path: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "food-rd-phase5-e2e-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let database_path = root.join("food-rd.sqlite3");
        let attachment_root = root.join("attachments");
        let export_root = root.join("exports");
        fs::create_dir_all(&attachment_root).unwrap();
        fs::create_dir_all(&export_root).unwrap();
        Self {
            backup_path: root.join("phase5.foodrd-backup"),
            safety_backup_root: root.join("recovery-backups"),
            root,
            database_path,
            attachment_root,
            export_root,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
