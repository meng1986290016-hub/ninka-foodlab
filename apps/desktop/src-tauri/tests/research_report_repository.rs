use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

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
    reports::{model::ResearchReportInput, repository::ResearchReportRepository},
};
use rusqlite::Connection;
use serde_json::{Value, json};

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
    assert_eq!(version, 7);
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
