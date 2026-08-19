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
        model::{
            RecipeDraftInput, RecipeInput, RecipeKind, RecipeSchemeInput, RecipeSchemeStatus,
            RecipeVersionInput,
        },
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
fn latest_migration_keeps_recipe_tables_and_immutability_triggers() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-30T00:00:00Z").unwrap();

    let version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(version, 13);
    for object in [
        "recipes",
        "recipe_drafts",
        "recipe_versions",
        "recipe_version_dependencies",
        "recipe_versions_no_update",
        "recipe_versions_no_delete",
        "recipe_deletion_authorizations",
        "recipe_version_sequences",
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
fn version_reference_uses_actual_input_when_finished_mass_is_missing() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("糖粉预混料", RecipeKind::SemiFinished))
        .unwrap();
    let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();
    let mut input = version_input(&recipe.id, &draft.id, Vec::new());
    input.snapshot["finishedMassGrams"] = json!(null);
    input.snapshot["targetBatchGrams"] = json!("1000");
    input.snapshot["calculation"]["inputMassGrams"] = json!("100000");
    repository.create_version(input).unwrap();

    let summary = repository
        .list_recipe_summaries()
        .unwrap()
        .into_iter()
        .find(|item| item.recipe.id == recipe.id)
        .unwrap();

    assert_eq!(summary.latest_version.unwrap().output_mass_grams, "100000");
}

#[test]
fn unreferenced_version_can_be_deleted_without_reusing_its_number() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("版本删除测试", RecipeKind::Formula))
        .unwrap();
    let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();
    let first = repository
        .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
        .unwrap();
    let mut copied_draft = draft_input(&recipe.id);
    copied_draft.based_on_version_id = Some(first.id.clone());
    repository.save_draft(copied_draft).unwrap();

    repository.delete_version(&first.id).unwrap();
    assert!(repository.list_versions(&recipe.id).unwrap().is_empty());
    assert_eq!(
        repository
            .get_draft(&recipe.id)
            .unwrap()
            .unwrap()
            .based_on_version_id,
        None
    );

    let next = repository
        .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
        .unwrap();
    assert_eq!(next.version_number, 2);
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
        vec![base_version.id.clone()]
    );

    let error = repository.archive_recipe(&base_recipe.id).unwrap_err();
    assert_eq!(error.code(), "reference_conflict");
    let delete_error = repository.delete_version(&base_version.id).unwrap_err();
    assert_eq!(delete_error.code(), "reference_conflict");
    repository.archive_recipe(&finished_recipe.id).unwrap();
    assert!(
        repository
            .get_recipe(&finished_recipe.id)
            .unwrap()
            .archived_at
            .is_some()
    );
}

#[test]
fn archived_recipe_requires_exact_name_before_permanent_deletion() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("永久删除测试", RecipeKind::Formula))
        .unwrap();
    let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();
    repository
        .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
        .unwrap();

    let active_error = repository
        .permanently_delete_recipe(&recipe.id, &recipe.name)
        .unwrap_err();
    assert_eq!(active_error.code(), "invalid_state");

    repository.archive_recipe(&recipe.id).unwrap();
    let confirmation_error = repository
        .permanently_delete_recipe(&recipe.id, "输入错误")
        .unwrap_err();
    assert_eq!(confirmation_error.code(), "confirmation_mismatch");

    repository
        .permanently_delete_recipe(&recipe.id, &recipe.name)
        .unwrap();
    assert_eq!(
        repository.get_recipe(&recipe.id).unwrap_err().code(),
        "not_found"
    );
}

#[test]
fn active_draft_recipe_can_be_deleted_without_archiving() {
    let mut repository = controlled_repository();
    let empty_recipe = repository
        .create_recipe(recipe_input("尚未开始配方", RecipeKind::Formula))
        .unwrap();
    repository.delete_draft_recipe(&empty_recipe.id).unwrap();
    assert_eq!(
        repository.get_recipe(&empty_recipe.id).unwrap_err().code(),
        "not_found"
    );

    let draft_recipe = repository
        .create_recipe(recipe_input("只有工作草稿", RecipeKind::Formula))
        .unwrap();
    repository
        .save_draft(draft_input(&draft_recipe.id))
        .unwrap();
    repository.delete_draft_recipe(&draft_recipe.id).unwrap();
    assert_eq!(
        repository.get_recipe(&draft_recipe.id).unwrap_err().code(),
        "not_found"
    );
    assert!(repository.get_draft(&draft_recipe.id).unwrap().is_none());
}

#[test]
fn draft_delete_rejects_archived_or_versioned_recipes() {
    let mut repository = controlled_repository();
    let versioned_recipe = repository
        .create_recipe(recipe_input("已有正式版本", RecipeKind::Formula))
        .unwrap();
    let draft = repository
        .save_draft(draft_input(&versioned_recipe.id))
        .unwrap();
    repository
        .create_version(version_input(&versioned_recipe.id, &draft.id, Vec::new()))
        .unwrap();
    assert_eq!(
        repository
            .delete_draft_recipe(&versioned_recipe.id)
            .unwrap_err()
            .code(),
        "invalid_state"
    );

    let archived_recipe = repository
        .create_recipe(recipe_input("已归档草稿", RecipeKind::Formula))
        .unwrap();
    repository
        .save_draft(draft_input(&archived_recipe.id))
        .unwrap();
    repository.archive_recipe(&archived_recipe.id).unwrap();
    assert_eq!(
        repository
            .delete_draft_recipe(&archived_recipe.id)
            .unwrap_err()
            .code(),
        "invalid_state"
    );
}

#[test]
fn archived_recipe_can_be_restored_without_changing_versions() {
    let mut repository = controlled_repository();
    let recipe = repository
        .create_recipe(recipe_input("恢复测试配方", RecipeKind::Formula))
        .unwrap();
    let draft = repository.save_draft(draft_input(&recipe.id)).unwrap();
    let version = repository
        .create_version(version_input(&recipe.id, &draft.id, Vec::new()))
        .unwrap();

    repository.archive_recipe(&recipe.id).unwrap();
    assert!(
        repository
            .get_recipe(&recipe.id)
            .unwrap()
            .archived_at
            .is_some()
    );
    repository.restore_recipe(&recipe.id).unwrap();

    let restored = repository.get_recipe(&recipe.id).unwrap();
    assert!(restored.archived_at.is_none());
    assert!(restored.updated_at > recipe.updated_at);
    assert_eq!(
        repository.list_versions(&recipe.id).unwrap()[0].id,
        version.id
    );
}

#[test]
fn alternative_recipes_are_named_independent_schemes_of_the_same_product() {
    let mut repository = controlled_repository();
    let primary = repository
        .create_recipe(recipe_input("巧克力冰淇淋", RecipeKind::Formula))
        .unwrap();

    let alternative = repository
        .create_alternative_recipe(
            &primary.id,
            "供应商 B 可可粉版本",
            RecipeSchemeStatus::Researching,
        )
        .unwrap();

    assert_eq!(alternative.product_id, primary.id);
    assert_eq!(alternative.name, primary.name);
    assert_eq!(alternative.scheme_name, "供应商 B 可可粉版本");
    assert_eq!(alternative.scheme_status, RecipeSchemeStatus::Researching);
    assert_ne!(alternative.id, primary.id);

    repository
        .update_recipe_scheme(
            &alternative.id,
            RecipeSchemeInput {
                scheme_name: alternative.scheme_name.clone(),
                scheme_status: RecipeSchemeStatus::Current,
            },
        )
        .unwrap();

    assert_eq!(
        repository
            .get_recipe(&alternative.id)
            .unwrap()
            .scheme_status,
        RecipeSchemeStatus::Current
    );
    assert_eq!(
        repository.get_recipe(&primary.id).unwrap().scheme_status,
        RecipeSchemeStatus::Approved
    );

    let duplicate = repository
        .create_alternative_recipe(
            &primary.id,
            " 供应商 B 可可粉版本 ",
            RecipeSchemeStatus::Researching,
        )
        .unwrap_err();
    assert_eq!(duplicate.code(), "duplicate_name");
}

#[test]
fn direct_and_indirect_recipe_cycles_are_rejected() {
    let mut repository = controlled_repository();
    let base_recipe = repository
        .create_recipe(recipe_input("基础糖浆", RecipeKind::SemiFinished))
        .unwrap();
    let base_draft = repository.save_draft(draft_input(&base_recipe.id)).unwrap();
    let base_v1 = repository
        .create_version(version_input(&base_recipe.id, &base_draft.id, Vec::new()))
        .unwrap();

    let direct = repository
        .create_version(version_input(
            &base_recipe.id,
            &base_draft.id,
            vec![base_v1.id.clone()],
        ))
        .unwrap_err();
    assert_eq!(direct.code(), "recipe_cycle");

    let filling_recipe = repository
        .create_recipe(recipe_input("复合夹心", RecipeKind::SemiFinished))
        .unwrap();
    let filling_draft = repository
        .save_draft(draft_input(&filling_recipe.id))
        .unwrap();
    let filling_v1 = repository
        .create_version(version_input(
            &filling_recipe.id,
            &filling_draft.id,
            vec![base_v1.id],
        ))
        .unwrap();

    let indirect = repository
        .create_version(version_input(
            &base_recipe.id,
            &base_draft.id,
            vec![filling_v1.id],
        ))
        .unwrap_err();
    assert_eq!(indirect.code(), "recipe_cycle");
    assert_eq!(repository.list_versions(&base_recipe.id).unwrap().len(), 1);
}
