use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use food_rd_desktop::{
    commands::labels::{
        calculate_nutrition_label_preview_value, publish_nutrition_label_at_path,
        save_nutrition_label_draft_at_path,
    },
    labels::{model::NutritionLabelInput, repository::NutritionLabelRepository},
    recipes::{
        model::{RecipeDraftInput, RecipeInput, RecipeKind, RecipeVersionInput},
        repository::RecipeRepository,
    },
};
use rusqlite::{Connection, params};
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

fn seed_recipe_version(path: &std::path::Path) -> (String, String) {
    let mut repository = RecipeRepository::open(path).unwrap();
    let recipe = repository
        .create_recipe(RecipeInput {
            name: "低糖乳饮料".into(),
            code: None,
            tags: Vec::new(),
            kind: RecipeKind::Formula,
        })
        .unwrap();
    let draft = repository
        .save_draft(RecipeDraftInput {
            recipe_id: recipe.id.clone(),
            based_on_version_id: None,
            source: "manual".into(),
            payload_version: 1,
            payload: json!({ "targetBatchGrams": "1000", "items": [] }),
            calculation: None,
            calculation_issues: Vec::new(),
        })
        .unwrap();
    let version = repository
        .create_version(RecipeVersionInput {
            recipe_id: recipe.id.clone(),
            source_draft_id: draft.id,
            based_on_version_id: None,
            snapshot_schema_version: 1,
            snapshot: json!({
                "recipe": { "id": recipe.id, "name": recipe.name },
                "targetBatchGrams": "1000"
            }),
            dependency_version_ids: Vec::new(),
        })
        .unwrap();
    (recipe.id, version.id)
}

fn label_input(label_id: &str, recipe_version_id: &str) -> Value {
    json!({
        "labelId": label_id,
        "recipeVersionId": recipe_version_id,
        "rulePackId": "gb-28050-2011",
        "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
        "sourceValues": [
            {
                "nutrientCode": "protein",
                "value": "5.04",
                "unit": "g",
                "sourceKind": "recipe_estimate",
                "sourceReference": recipe_version_id,
                "observedAt": null,
                "completeness": "complete"
            },
            {
                "nutrientCode": "fat",
                "value": "3",
                "unit": "g",
                "sourceKind": "recipe_estimate",
                "sourceReference": recipe_version_id,
                "observedAt": null,
                "completeness": "complete"
            },
            {
                "nutrientCode": "carbohydrate",
                "value": "10",
                "unit": "g",
                "sourceKind": "recipe_estimate",
                "sourceReference": recipe_version_id,
                "observedAt": null,
                "completeness": "complete"
            },
            {
                "nutrientCode": "sodium",
                "value": "100.4",
                "unit": "mg",
                "sourceKind": "recipe_estimate",
                "sourceReference": recipe_version_id,
                "observedAt": null,
                "completeness": "complete"
            }
        ],
        "optionalNutrientCodes": [],
        "roundingMode": "half_up",
        "calculation": {
            "publishable": true,
            "rows": [{ "nutrientCode": "energy", "declaredValue": "999999" }]
        }
    })
}

#[test]
fn native_save_and_publish_recalculate_instead_of_trusting_client_or_stored_results() {
    let path = temporary_database("label-command-recalculate");
    let (recipe_id, recipe_version_id) = seed_recipe_version(&path);
    let label = NutritionLabelRepository::open(&path)
        .unwrap()
        .create_label(NutritionLabelInput {
            recipe_id,
            name: "营养成分表".into(),
        })
        .unwrap();

    let saved =
        save_nutrition_label_draft_at_path(&path, label_input(&label.id, &recipe_version_id))
            .unwrap();
    assert_eq!(
        saved.pointer("/calculation/rows/0/declaredValue"),
        Some(&json!("367"))
    );
    assert_ne!(
        saved.pointer("/calculation/rows/0/declaredValue"),
        Some(&json!("999999"))
    );

    let connection = Connection::open(&path).unwrap();
    connection
        .execute(
            "UPDATE nutrition_label_drafts
             SET calculation_json = '{\"publishable\":true,\"rows\":[{\"declaredValue\":\"888888\"}]}'
             WHERE label_id = ?1",
            [&label.id],
        )
        .unwrap();
    drop(connection);

    let published = publish_nutrition_label_at_path(&path, &label.id).unwrap();
    assert_eq!(published.version_number, 1);
    assert_eq!(published.snapshot["id"], published.id);
    assert_eq!(published.snapshot["labelVersionNumber"], 1);
    assert_eq!(published.snapshot["rows"][0]["declaredValue"], json!("367"));
    assert_eq!(published.snapshot["rulePack"]["revision"], "2011.1");

    fs::remove_file(path).unwrap();
}

#[test]
fn native_publish_blocks_missing_required_values_without_consuming_version_one() {
    let path = temporary_database("label-command-publish-guard");
    let (recipe_id, recipe_version_id) = seed_recipe_version(&path);
    let mut repository = NutritionLabelRepository::open(&path).unwrap();
    let label = repository
        .create_label(NutritionLabelInput {
            recipe_id,
            name: "营养成分表".into(),
        })
        .unwrap();
    drop(repository);
    let mut incomplete = label_input(&label.id, &recipe_version_id);
    incomplete["sourceValues"][3]["value"] = Value::Null;
    save_nutrition_label_draft_at_path(&path, incomplete).unwrap();

    let error = publish_nutrition_label_at_path(&path, &label.id).unwrap_err();
    assert_eq!(error.code, "invalid_state");
    assert!(
        NutritionLabelRepository::open(&path)
            .unwrap()
            .list_versions(&label.id)
            .unwrap()
            .is_empty()
    );

    save_nutrition_label_draft_at_path(&path, label_input(&label.id, &recipe_version_id)).unwrap();
    let published = publish_nutrition_label_at_path(&path, &label.id).unwrap();
    assert_eq!(published.version_number, 1);

    let connection = Connection::open(&path).unwrap();
    let snapshot_json: String = connection
        .query_row(
            "SELECT snapshot_json FROM nutrition_label_versions WHERE id = ?1",
            params![published.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(snapshot_json.contains("\"labelVersionNumber\":1"));
    fs::remove_file(path).unwrap();
}

#[test]
fn native_calculator_matches_the_2025_rule_order_notice_and_fiber_energy() {
    let calculation = calculate_nutrition_label_preview_value(json!({
        "rulePackId": "gb-28050-2025",
        "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
        "sourceValues": [
            { "nutrientCode": "protein", "value": "5", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "fat", "value": "3", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "saturated_fat", "value": "1.2", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "carbohydrate", "value": "10", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "sugars", "value": "4", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "dietary_fiber", "value": "2", "unit": "g", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" },
            { "nutrientCode": "sodium", "value": "100", "unit": "mg", "sourceKind": "lab_result", "sourceReference": "lab-1", "observedAt": null, "completeness": "complete" }
        ],
        "optionalNutrientCodes": ["dietary_fiber"],
        "roundingMode": "half_up"
    }))
    .unwrap();

    assert_eq!(calculation["publishable"], true);
    assert_eq!(
        calculation["requiredNotice"],
        "儿童青少年应避免过量摄入盐油糖"
    );
    assert_eq!(
        calculation["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["nutrientCode"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec![
            "energy",
            "protein",
            "fat",
            "saturated_fat",
            "carbohydrate",
            "sugars",
            "sodium",
            "dietary_fiber",
        ]
    );
    assert_eq!(calculation["rows"][0]["rawValue"], "382");
    assert_eq!(calculation["rows"][0]["declaredValue"], "382");
    assert!(calculation["rows"][5]["nrvPercent"].is_null());
}
