use food_rd_desktop::database::{self, migrations};
use rusqlite::{Connection, params};

const INITIAL_MIGRATION: &str = include_str!("../migrations/0001_initial.sql");

fn schema_version(connection: &Connection) -> i64 {
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn table_exists(connection: &Connection, table: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
             )",
            [table],
            |row| row.get(0),
        )
        .unwrap()
}

#[test]
fn fresh_database_applies_latest_schema_version_fifteen() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-19T00:00:00Z").unwrap();

    assert_eq!(schema_version(&connection), 15);
    for table in [
        "source_attachments",
        "attachment_extractions",
        "ingredient_import_jobs",
        "ingredient_import_job_attachments",
        "ingredient_import_drafts",
        "import_draft_attachments",
        "import_draft_source_links",
        "ingredient_variant_attachments",
        "ingredient_variant_allergens",
        "agent_provider_configs",
        "agent_conversations",
        "agent_runs",
        "agent_messages",
        "agent_message_attachments",
        "agent_tool_calls",
        "recipes",
        "recipe_drafts",
        "recipe_versions",
        "recipe_version_dependencies",
        "nutrition_labels",
        "nutrition_label_drafts",
        "nutrition_label_versions",
    ] {
        assert!(table_exists(&connection, table), "missing table {table}");
    }
    assert!(!table_exists(&connection, "ingredient_variant_sweetness"));
}

#[test]
fn existing_version_one_database_upgrades_without_losing_ingredients() {
    let mut connection = database::open_in_memory().unwrap();
    connection.execute_batch(INITIAL_MIGRATION).unwrap();
    connection
        .execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            ["2026-07-18T00:00:00Z"],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO nutrient_definitions
             (id, code, name, unit, built_in, sort_order)
             VALUES ('custom-lactose', 'custom:lactose', '乳糖', 'g', 0, 9)",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO suppliers (id, name, created_at, updated_at)
             VALUES ('supplier-1', '供应商 A', ?1, ?1)",
            ["2026-07-18T00:00:00Z"],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO material_groups (id, name, created_at, updated_at)
             VALUES ('group-1', '脱脂乳粉', ?1, ?1)",
            ["2026-07-18T00:00:00Z"],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO ingredient_variants (
               id, material_group_id, supplier_id, price_unit,
               nutrition_basis, created_at, updated_at
             ) VALUES ('variant-1', 'group-1', 'supplier-1', 'kg',
                       'per_100g', ?1, ?1)",
            params!["2026-07-18T00:00:00Z"],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO ingredient_nutrient_values
             (ingredient_variant_id, nutrient_definition_id, value)
             VALUES ('variant-1', 'custom-lactose', NULL)",
            [],
        )
        .unwrap();

    migrations::apply(&mut connection, "2026-07-19T00:00:00Z").unwrap();

    assert_eq!(schema_version(&connection), 15);
    let saved_name: String = connection
        .query_row(
            "SELECT material_groups.name
             FROM ingredient_variants
             JOIN material_groups ON material_groups.id = ingredient_variants.material_group_id
             WHERE ingredient_variants.id = 'variant-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(saved_name, "脱脂乳粉");
    assert!(table_exists(&connection, "ingredient_import_jobs"));
    assert!(table_exists(&connection, "agent_provider_configs"));
    assert!(table_exists(&connection, "recipe_versions"));
    assert!(table_exists(&connection, "nutrition_label_versions"));
    assert!(!table_exists(&connection, "ingredient_variant_sweetness"));
    let migrated_category: String = connection
        .query_row(
            "SELECT category FROM nutrient_definitions WHERE id = 'custom-lactose'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let association_is_null: bool = connection
        .query_row(
            "SELECT value IS NULL FROM ingredient_nutrient_values
             WHERE ingredient_variant_id = 'variant-1'
               AND nutrient_definition_id = 'custom-lactose'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(migrated_category, "nutrition");
    assert!(association_is_null);
    let confidence_column_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('import_draft_source_links') WHERE name = 'confidence'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(confidence_column_count, 1);
}

#[test]
fn removal_migration_deletes_theoretical_sweetness_data_and_cached_results() {
    let connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            r#"CREATE TABLE nutrient_definitions (
               id TEXT PRIMARY KEY,
               code TEXT NOT NULL UNIQUE,
               name TEXT NOT NULL COLLATE NOCASE UNIQUE,
               unit TEXT NOT NULL,
               built_in INTEGER NOT NULL,
               sort_order INTEGER NOT NULL,
               category TEXT NOT NULL DEFAULT 'nutrition',
               archived_at TEXT
             );
             CREATE TABLE ingredient_nutrient_values (
               ingredient_variant_id TEXT NOT NULL,
               nutrient_definition_id TEXT NOT NULL,
               value TEXT,
               PRIMARY KEY (ingredient_variant_id, nutrient_definition_id)
             );
             CREATE TABLE recipe_drafts (
               id TEXT PRIMARY KEY,
               calculation_json TEXT
             );
             CREATE TABLE recipe_versions (
               id TEXT PRIMARY KEY,
               snapshot_json TEXT NOT NULL
             );
             CREATE TRIGGER recipe_versions_no_update
             BEFORE UPDATE ON recipe_versions
             BEGIN
               SELECT RAISE(ABORT, 'recipe versions are immutable');
             END;
             CREATE TABLE agent_recipe_proposals (
               id TEXT PRIMARY KEY,
               evaluation_json TEXT NOT NULL
             );
             INSERT INTO nutrient_definitions
               (id, code, name, unit, built_in, sort_order, category)
             VALUES
               ('theoretical_sweetness', 'theoretical_sweetness', '理论甜度（蔗糖=1）', '倍', 1, 1000, 'research'),
               ('polyphenol', 'custom:polyphenol', '总多酚', 'mg', 0, 1001, 'research');
             INSERT INTO ingredient_nutrient_values
               (ingredient_variant_id, nutrient_definition_id, value)
             VALUES
               ('variant-1', 'theoretical_sweetness', '1.2'),
               ('variant-1', 'polyphenol', '20');
             INSERT INTO recipe_drafts (id, calculation_json)
             VALUES ('draft-1', '{"sweetness":{"status":"complete"},"cost":{"batchTotal":"10"}}');
             INSERT INTO recipe_versions (id, snapshot_json)
             VALUES ('version-1', '{"calculation":{"sweetness":{"status":"complete"},"cost":{"batchTotal":"10"}}}');
             INSERT INTO agent_recipe_proposals (id, evaluation_json)
             VALUES ('proposal-1', '{"calculation":{"sweetness":{"status":"complete"},"cost":{"batchTotal":"10"}}}');"#,
        )
        .unwrap();

    connection
        .execute_batch(include_str!(
            "../migrations/0014_remove_theoretical_sweetness.sql"
        ))
        .unwrap();

    let definition_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM nutrient_definitions WHERE id = 'theoretical_sweetness'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let value_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM ingredient_nutrient_values WHERE nutrient_definition_id = 'theoretical_sweetness'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(definition_count, 0);
    assert_eq!(value_count, 0);
    let preserved_custom_value: String = connection
        .query_row(
            "SELECT value FROM ingredient_nutrient_values WHERE nutrient_definition_id = 'polyphenol'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(preserved_custom_value, "20");
    for (table, column, path) in [
        ("recipe_drafts", "calculation_json", "$.sweetness"),
        (
            "recipe_versions",
            "snapshot_json",
            "$.calculation.sweetness",
        ),
        (
            "agent_recipe_proposals",
            "evaluation_json",
            "$.calculation.sweetness",
        ),
    ] {
        let remaining: i64 = connection
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {table} WHERE json_type({column}, '{path}') IS NOT NULL"
                ),
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }
}

#[test]
fn research_metric_removal_migration_purges_values_and_snapshot_fields() {
    let connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            r#"CREATE TABLE nutrient_definitions (
               id TEXT PRIMARY KEY,
               code TEXT NOT NULL UNIQUE,
               name TEXT NOT NULL COLLATE NOCASE UNIQUE,
               unit TEXT NOT NULL,
               built_in INTEGER NOT NULL,
               sort_order INTEGER NOT NULL,
               category TEXT NOT NULL DEFAULT 'nutrition',
               archived_at TEXT
             );
             CREATE TABLE ingredient_nutrient_values (
               ingredient_variant_id TEXT NOT NULL,
               nutrient_definition_id TEXT NOT NULL,
               value TEXT,
               PRIMARY KEY (ingredient_variant_id, nutrient_definition_id)
             );
             CREATE TABLE recipe_drafts (
               id TEXT PRIMARY KEY,
               calculation_json TEXT
             );
             CREATE TABLE recipe_versions (
               id TEXT PRIMARY KEY,
               snapshot_json TEXT NOT NULL
             );
             CREATE TRIGGER recipe_versions_no_update
             BEFORE UPDATE ON recipe_versions
             BEGIN
               SELECT RAISE(ABORT, 'recipe versions are immutable');
             END;
             CREATE TABLE agent_recipe_proposals (
               id TEXT PRIMARY KEY,
               payload_json TEXT NOT NULL,
               evaluation_json TEXT NOT NULL
             );
             INSERT INTO nutrient_definitions
               (id, code, name, unit, built_in, sort_order, category)
             VALUES
               ('lactose', 'custom:lactose', '乳糖', 'g', 0, 10, 'nutrition'),
               ('polyphenol', 'custom:polyphenol', '总多酚', 'mg', 0, 11, 'research');
             INSERT INTO ingredient_nutrient_values
               (ingredient_variant_id, nutrient_definition_id, value)
             VALUES
               ('variant-1', 'lactose', '2'),
               ('variant-1', 'polyphenol', '20');
             INSERT INTO recipe_drafts (id, calculation_json)
             VALUES (
               'draft-1',
               '{"nutrients":[{"nutrientDefinitionId":"lactose","category":"nutrition"},{"nutrientDefinitionId":"polyphenol","category":"research"}]}'
             );
             INSERT INTO recipe_versions (id, snapshot_json)
             VALUES (
               'version-1',
               '{"calculation":{"nutrients":[{"nutrientDefinitionId":"lactose","category":"nutrition"},{"nutrientDefinitionId":"polyphenol","category":"research"}]},"items":[{"kind":"ingredient","ingredient":{"nutrientsPer100g":{"lactose":"2","polyphenol":"20"},"nutrientUnits":{"lactose":"g","polyphenol":"mg"}}}]}'
             );
             INSERT INTO agent_recipe_proposals (id, payload_json, evaluation_json)
             VALUES (
               'proposal-1',
               '{"requirements":[{"nutrientDefinitionId":"lactose","name":"乳糖"},{"nutrientDefinitionId":"polyphenol","name":"总多酚"}]}',
               '{"calculation":{"nutrients":[{"nutrientDefinitionId":"lactose","category":"nutrition"},{"nutrientDefinitionId":"polyphenol","category":"research"}]},"requirementStatuses":[{"name":"乳糖","status":"met"},{"name":"总多酚","status":"met"}]}'
             );"#,
        )
        .unwrap();

    connection
        .execute_batch(include_str!(
            "../migrations/0015_remove_research_metrics.sql"
        ))
        .unwrap();

    let definition_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM nutrient_definitions WHERE category = 'research'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let value_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM ingredient_nutrient_values WHERE nutrient_definition_id = 'polyphenol'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(definition_count, 0);
    assert_eq!(value_count, 0);

    let proposal_json: (String, String) = connection
        .query_row(
            "SELECT payload_json, evaluation_json FROM agent_recipe_proposals WHERE id = 'proposal-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT json_array_length(?1, '$.requirements')",
                [&proposal_json.0],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT json_extract(?1, '$.requirements[0].nutrientDefinitionId')",
                [&proposal_json.0],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
        "lactose"
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT json_array_length(?1, '$.requirementStatuses')",
                [&proposal_json.1],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        1
    );

    for (table, column, path) in [
        ("recipe_drafts", "calculation_json", "$.nutrients"),
        (
            "recipe_versions",
            "snapshot_json",
            "$.calculation.nutrients",
        ),
        (
            "agent_recipe_proposals",
            "evaluation_json",
            "$.calculation.nutrients",
        ),
    ] {
        let retired_count: i64 = connection
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {table}, json_each({column}, '{path}')
                     WHERE json_extract(value, '$.nutrientDefinitionId') = 'polyphenol'"
                ),
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(retired_count, 0);
    }

    let snapshot: String = connection
        .query_row(
            "SELECT snapshot_json FROM recipe_versions WHERE id = 'version-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT json_extract(?1, '$.items[0].ingredient.nutrientsPer100g.lactose')",
                [&snapshot],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
        "2"
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT json_type(?1, '$.items[0].ingredient.nutrientsPer100g.polyphenol') IS NULL",
                [&snapshot],
                |row| row.get::<_, bool>(0),
            )
            .unwrap(),
        true
    );
    assert!(
        connection
            .execute(
                "UPDATE recipe_versions SET snapshot_json = snapshot_json WHERE id = 'version-1'",
                [],
            )
            .is_err()
    );
}
