use rusqlite::{Connection, OptionalExtension, params};

use crate::ingredients::repository::RepositoryError;

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
