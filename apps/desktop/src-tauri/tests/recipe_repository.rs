use std::{
    fs,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use food_rd_desktop::{
    database::{self, migrations},
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

fn recipe_input(name: &str, kind: RecipeKind) -> RecipeInput {
    RecipeInput {
        name: name.into(),
        code: None,
        tags: Vec::new(),
        kind,
    }
}

fn draft_input(recipe_id: &str) -> RecipeDraftInput {
    RecipeDraftInput {
        recipe_id: recipe_id.into(),
        based_on_version_id: None,
        source: "manual".into(),
        payload_version: 1,
        payload: json!({
            "targetBatchGrams": "1000",
            "items": [],
            "markdownNotes": ""
        }),
        calculation: Some(json!({
            "basis": "input_mass",
            "inputMassGrams": "1000"
        })),
        calculation_issues: Vec::new(),
    }
}

fn version_input(
    recipe_id: &str,
    source_draft_id: &str,
    dependency_version_ids: Vec<String>,
) -> RecipeVersionInput {
    RecipeVersionInput {
        recipe_id: recipe_id.into(),
        source_draft_id: source_draft_id.into(),
        based_on_version_id: None,
        snapshot_schema_version: 1,
        snapshot: json!({
            "recipe": { "id": recipe_id },
            "targetBatchGrams": "1000",
            "calculation": {
                "nutrients": {
                    "protein": "0",
                    "sodium": null
                }
            }
        }),
        dependency_version_ids,
    }
}

fn controlled_repository() -> RecipeRepository {
    let clock_sequence = Arc::new(AtomicUsize::new(0));
    let id_sequence = Arc::new(AtomicUsize::new(0));
    let clock = {
        let sequence = Arc::clone(&clock_sequence);
        move || {
            let tick = sequence.fetch_add(1, Ordering::SeqCst);
            format!("2026-07-30T12:{tick:02}:00Z")
        }
    };
    let create_id = {
        let sequence = Arc::clone(&id_sequence);
        move || format!("recipe-test-id-{}", sequence.fetch_add(1, Ordering::SeqCst))
    };
    RecipeRepository::open_in_memory_with(clock, create_id).unwrap()
}

#[test]
fn migration_five_creates_recipe_tables_and_immutability_triggers() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-30T00:00:00Z").unwrap();

    let version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(version, 5);
    for object in [
        "recipes",
        "recipe_drafts",
        "recipe_versions",
        "recipe_version_dependencies",
        "recipe_versions_no_update",
        "recipe_versions_no_delete",
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
fn draft_updates_in_place_and_survives_reopen() {
    let path = temporary_database("recipe-draft-reopen");
    let (recipe_id, draft_id);
    {
        let mut repository = RecipeRepository::open(&path).unwrap();
        let recipe = repository
            .create_recipe(recipe_input("低糖乳饮料", RecipeKind::Formula))
            .unwrap();
        recipe_id = recipe.id.clone();
        let first = repository.save_draft(draft_input(&recipe.id)).unwrap();
        draft_id = first.id.clone();

        let mut changed = draft_input(&recipe.id);
        changed.payload["markdownNotes"] = json!("第二次小试");
        let saved = repository.save_draft(changed).unwrap();
        assert_eq!(saved.id, draft_id);
    }
    {
        let repository = RecipeRepository::open(&path).unwrap();
        let draft = repository.get_draft(&recipe_id).unwrap().unwrap();
        assert_eq!(draft.id, draft_id);
        assert_eq!(draft.payload["markdownNotes"], "第二次小试");
        assert_eq!(
            repository.get_recipe(&recipe_id).unwrap().current_draft_id,
            Some(draft_id)
        );
    }
    fs::remove_file(path).unwrap();
}

#[test]
fn recipe_metadata_remains_editable_without_requiring_code_or_tags() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("乳饮料小试", RecipeKind::Formula))
        .unwrap();
    let updated = repository
        .update_recipe(
            &recipe.id,
            RecipeInput {
                name: "低糖乳饮料小试".into(),
                code: Some("  ".into()),
                tags: vec!["常温".into(), " 常温 ".into(), "低糖".into()],
                kind: RecipeKind::Formula,
            },
        )
        .unwrap();

    assert_eq!(updated.name, "低糖乳饮料小试");
    assert_eq!(updated.code, None);
    assert_eq!(updated.tags, vec!["常温", "低糖"]);
}

#[test]
fn version_save_is_atomic_and_does_not_consume_a_number_on_failure() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("草莓果酱", RecipeKind::SemiFinished))
        .unwrap();
    let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();

    let failed = repository
        .create_version(version_input(
            &recipe.id,
            &draft.id,
            vec!["missing-version".into()],
        ))
        .unwrap_err();
    assert_eq!(failed.code(), "missing_reference");
    assert!(repository.list_versions(&recipe.id).unwrap().is_empty());

    let saved = repository
        .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
        .unwrap();
    assert_eq!(saved.version_number, 1);
    assert_eq!(saved.snapshot["calculation"]["nutrients"]["protein"], "0");
    assert!(saved.snapshot["calculation"]["nutrients"]["sodium"].is_null());
}

#[test]
fn formal_version_rows_are_immutable_even_through_direct_sql() {
    let path = temporary_database("immutable-recipe-version");
    let version_id;
    {
        let mut repository = RecipeRepository::open(&path).unwrap();
        let recipe = repository
            .create_recipe(recipe_input("稳定乳化基底", RecipeKind::SemiFinished))
            .unwrap();
        let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();
        version_id = repository
            .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
            .unwrap()
            .id;
    }

    let connection = Connection::open(&path).unwrap();
    assert!(
        connection
            .execute(
                "UPDATE recipe_versions SET snapshot_json = '{}' WHERE id = ?1",
                [&version_id],
            )
            .is_err()
    );
    assert!(
        connection
            .execute("DELETE FROM recipe_versions WHERE id = ?1", [&version_id])
            .is_err()
    );
    fs::remove_file(path).unwrap();
}

#[test]
fn explicit_version_dependencies_protect_referenced_recipes_from_archiving() {
    let mut repository = controlled_repository();
    let base_recipe = repository
        .create_recipe(recipe_input("果酱半成品", RecipeKind::SemiFinished))
        .unwrap();
    let base_draft = repository.save_draft(draft_input(&base_recipe.id)).unwrap();
    let base_version = repository
        .create_version(version_input(&base_recipe.id, &base_draft.id, Vec::new()))
        .unwrap();

    let finished_recipe = repository
        .create_recipe(recipe_input("草莓酸奶", RecipeKind::Formula))
        .unwrap();
    let finished_draft = repository
        .save_draft(draft_input(&finished_recipe.id))
        .unwrap();
    let finished_version = repository
        .create_version(version_input(
            &finished_recipe.id,
            &finished_draft.id,
            vec![base_version.id.clone()],
        ))
        .unwrap();
    assert_eq!(
        finished_version.dependency_version_ids,
        vec![base_version.id]
    );

    let error = repository.archive_recipe(&base_recipe.id).unwrap_err();
    assert_eq!(error.code(), "reference_conflict");
    repository.archive_recipe(&finished_recipe.id).unwrap();
    assert!(
        repository
            .get_recipe(&finished_recipe.id)
            .unwrap()
            .archived_at
            .is_some()
    );
}
