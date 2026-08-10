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
fn fresh_database_applies_latest_schema_version_twelve() {
    let mut connection = database::open_in_memory().unwrap();

    migrations::apply(&mut connection, "2026-07-19T00:00:00Z").unwrap();

    assert_eq!(schema_version(&connection), 12);
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
        "ingredient_variant_sweetness",
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

    assert_eq!(schema_version(&connection), 12);
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
    assert!(table_exists(&connection, "ingredient_variant_sweetness"));
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
