use rusqlite::{Connection, OptionalExtension, params};

use crate::ingredients::repository::RepositoryError;

pub const LATEST_SCHEMA_VERSION: i64 = 14;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/0001_initial.sql")),
    (
        2,
        include_str!("../../migrations/0002_ingredient_import.sql"),
    ),
    (3, include_str!("../../migrations/0003_food_rd_agent.sql")),
    (
        4,
        include_str!("../../migrations/0004_china_provider_compatibility.sql"),
    ),
    (
        5,
        include_str!("../../migrations/0005_recipe_workspace.sql"),
    ),
    (
        6,
        include_str!("../../migrations/0006_nutrition_labels.sql"),
    ),
    (
        7,
        include_str!("../../migrations/0007_research_reports.sql"),
    ),
    (
        8,
        include_str!("../../migrations/0008_recipe_alternatives.sql"),
    ),
    (
        9,
        include_str!("../../migrations/0009_agent_recipe_proposals.sql"),
    ),
    (
        10,
        include_str!("../../migrations/0010_recipe_deletion.sql"),
    ),
    (
        11,
        include_str!("../../migrations/0011_import_source_confidence.sql"),
    ),
    (
        12,
        include_str!("../../migrations/0012_custom_components_and_sweetness.sql"),
    ),
    (
        13,
        include_str!("../../migrations/0013_sweetness_research_template.sql"),
    ),
    (
        14,
        include_str!("../../migrations/0014_remove_theoretical_sweetness.sql"),
    ),
];

pub fn apply(connection: &mut Connection, applied_at: &str) -> Result<(), RepositoryError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY,
           applied_at TEXT NOT NULL
         );",
    )?;
    let current = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get::<_, Option<i64>>(0)
        })
        .optional()?
        .flatten()
        .unwrap_or(0);
    for (version, migration) in MIGRATIONS {
        if *version <= current {
            continue;
        }

        let transaction = connection.transaction()?;
        transaction.execute_batch(migration)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            params![version, applied_at],
        )?;
        transaction.commit()?;
    }

    Ok(())
}
