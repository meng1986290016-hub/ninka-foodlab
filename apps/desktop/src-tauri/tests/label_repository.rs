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
};
use rusqlite::Connection;
use serde_json::json;

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

fn seed_recipe_version(path: &std::path::Path, recipe_name: &str) -> (String, String) {
    let mut repository = RecipeRepository::open(path).unwrap();
    let recipe = repository
        .create_recipe(RecipeInput {
            name: recipe_name.into(),
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
            payload: json!({
                "targetBatchGrams": "1000",
                "items": []
            }),
            calculation: Some(json!({
                "nutrients": {
                    "protein": "3.2",
                    "sodium": null
                }
            })),
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
                "recipe": { "id": recipe.id, "name": recipe_name },
                "targetBatchGrams": "1000"
            }),
            dependency_version_ids: Vec::new(),
        })
        .unwrap();
    (recipe.id, version.id)
}

fn label_input(recipe_id: &str) -> NutritionLabelInput {
    NutritionLabelInput {
        recipe_id: recipe_id.into(),
        name: "营养成分表".into(),
    }
}

fn draft_input(label_id: &str, recipe_version_id: &str) -> NutritionLabelDraftInput {
    NutritionLabelDraftInput {
        label_id: label_id.into(),
        recipe_version_id: recipe_version_id.into(),
        rule_pack_id: "gb-28050-2011".into(),
        payload_schema_version: 1,
        payload: json!({
            "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
            "sourceValues": [
                {
                    "nutrientCode": "protein",
                    "value": "3.2",
                    "unit": "g",
                    "sourceKind": "recipe_estimate",
                    "sourceReference": recipe_version_id
                },
                {
                    "nutrientCode": "sodium",
                    "value": null,
                    "unit": "mg",
                    "sourceKind": "recipe_estimate",
                    "sourceReference": recipe_version_id
                }
            ]
        }),
        calculation: Some(json!({
            "publishable": false,
            "rows": [
                { "nutrientCode": "protein", "declaredValue": "3.2" },
                { "nutrientCode": "sodium", "declaredValue": null }
            ]
        })),
        issues: vec![json!({
            "code": "required_nutrient_unknown",
            "severity": "error",
            "nutrientCode": "sodium"
        })],
    }
}

fn version_input(
    label_id: &str,
    source_draft_id: &str,
    recipe_version_id: &str,
) -> NutritionLabelVersionInput {
    NutritionLabelVersionInput {
        label_id: label_id.into(),
        source_draft_id: source_draft_id.into(),
        recipe_version_id: recipe_version_id.into(),
        rule_pack_id: "gb-28050-2011".into(),
        rule_pack_revision: "2011.1".into(),
        snapshot_schema_version: 1,
        snapshot: json!({
            "schemaVersion": 1,
            "recipeVersionId": recipe_version_id,
            "basis": { "kind": "per_100g", "quantity": "100", "unit": "g" },
            "rulePack": {
                "id": "gb-28050-2011",
                "revision": "2011.1"
            },
            "sourceValues": [
                { "nutrientCode": "protein", "value": "0" },
                { "nutrientCode": "sodium", "value": null }
            ],
            "rows": [
                { "nutrientCode": "protein", "declaredValue": "0" },
                { "nutrientCode": "sodium", "declaredValue": null }
            ],
            "issues": [],
            "publishable": true,
            "requiredNotice": null
        }),
    }
}

#[test]
fn latest_migration_keeps_label_tables_and_immutability_triggers() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-31T00:00:00Z").unwrap();

    let version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(version, 11);
    for object in [
        "nutrition_labels",
        "nutrition_label_drafts",
        "nutrition_label_versions",
        "nutrition_label_versions_no_update",
        "nutrition_label_versions_no_delete",
    ] {
        let exists = connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM sqlite_master
                   WHERE name = ?1 AND type IN ('table', 'trigger')
                 )",
                [object],
                |row| row.get::<_, bool>(0),
            )
            .unwrap();
        assert!(exists, "missing schema object {object}");
    }
}

#[test]
fn draft_updates_in_place_and_survives_reopen_with_its_source_recipe_version() {
    let path = temporary_database("label-draft-reopen");
    let (recipe_id, recipe_version_id) = seed_recipe_version(&path, "低糖乳饮料");
    let (label_id, draft_id);
    {
        let mut repository = NutritionLabelRepository::open(&path).unwrap();
        let label = repository.create_label(label_input(&recipe_id)).unwrap();
        label_id = label.id.clone();
        let first = repository
            .save_draft(draft_input(&label.id, &recipe_version_id))
            .unwrap();
        draft_id = first.id.clone();

        let mut changed = draft_input(&label.id, &recipe_version_id);
        changed.rule_pack_id = "gb-28050-2025".into();
        changed.payload["basis"]["kind"] = json!("per_serving");
        let saved = repository.save_draft(changed).unwrap();
        assert_eq!(saved.id, draft_id);
        assert_eq!(saved.created_at, first.created_at);
    }
    {
        let repository = NutritionLabelRepository::open(&path).unwrap();
        let draft = repository.get_draft(&label_id).unwrap().unwrap();
        assert_eq!(draft.id, draft_id);
        assert_eq!(draft.recipe_version_id, recipe_version_id);
        assert_eq!(draft.rule_pack_id, "gb-28050-2025");
        assert_eq!(draft.payload["basis"]["kind"], "per_serving");
        assert_eq!(
            repository.get_label(&label_id).unwrap().current_draft_id,
            Some(draft_id)
        );
    }
    fs::remove_file(path).unwrap();
}

#[test]
fn draft_rejects_a_recipe_version_from_another_recipe() {
    let path = temporary_database("label-recipe-version-mismatch");
    let (recipe_id, _) = seed_recipe_version(&path, "乳饮料 A");
    let (_, other_recipe_version_id) = seed_recipe_version(&path, "乳饮料 B");
    let mut repository = NutritionLabelRepository::open(&path).unwrap();
    let label = repository.create_label(label_input(&recipe_id)).unwrap();

    let error = repository
        .save_draft(draft_input(&label.id, &other_recipe_version_id))
        .unwrap_err();

    assert_eq!(error.code(), "missing_reference");
    assert!(repository.get_draft(&label.id).unwrap().is_none());
    drop(repository);
    fs::remove_file(path).unwrap();
}

#[test]
fn formal_version_is_atomic_and_preserves_unknown_separately_from_zero() {
    let path = temporary_database("label-version-atomic");
    let (recipe_id, recipe_version_id) = seed_recipe_version(&path, "原味酸奶");
    let mut repository = NutritionLabelRepository::open(&path).unwrap();
    let label = repository.create_label(label_input(&recipe_id)).unwrap();
    let draft = repository
        .save_draft(draft_input(&label.id, &recipe_version_id))
        .unwrap();

    let failed = repository
        .create_version(version_input(
            &label.id,
            "missing-draft",
            &recipe_version_id,
        ))
        .unwrap_err();
    assert_eq!(failed.code(), "missing_reference");
    assert!(repository.list_versions(&label.id).unwrap().is_empty());

    let saved = repository
        .create_version(version_input(&label.id, &draft.id, &recipe_version_id))
        .unwrap();
    assert_eq!(saved.version_number, 1);
    assert_eq!(saved.rule_pack_revision, "2011.1");
    assert_eq!(saved.snapshot["sourceValues"][0]["value"], "0");
    assert!(saved.snapshot["sourceValues"][1]["value"].is_null());
    drop(repository);
    fs::remove_file(path).unwrap();
}

#[test]
fn formal_versions_are_immutable_even_through_direct_sql_and_survive_reopen() {
    let path = temporary_database("immutable-label-version");
    let (recipe_id, recipe_version_id) = seed_recipe_version(&path, "燕麦乳");
    let (label_id, version_id);
    {
        let mut repository = NutritionLabelRepository::open(&path).unwrap();
        let label = repository.create_label(label_input(&recipe_id)).unwrap();
        label_id = label.id;
        let draft = repository
            .save_draft(draft_input(&label_id, &recipe_version_id))
            .unwrap();
        version_id = repository
            .create_version(version_input(&label_id, &draft.id, &recipe_version_id))
            .unwrap()
            .id;
    }

    {
        let repository = NutritionLabelRepository::open(&path).unwrap();
        let version = repository.get_version(&version_id).unwrap();
        assert_eq!(version.label_id, label_id);
        assert_eq!(version.recipe_version_id, recipe_version_id);
        assert_eq!(version.snapshot["rulePack"]["revision"], "2011.1");
    }

    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .unwrap();
    assert!(
        connection
            .execute(
                "UPDATE nutrition_label_versions
                 SET snapshot_json = '{}' WHERE id = ?1",
                [&version_id],
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "DELETE FROM nutrition_label_versions WHERE id = ?1",
                [&version_id],
            )
            .is_err()
    );
    drop(connection);
    fs::remove_file(path).unwrap();
}
