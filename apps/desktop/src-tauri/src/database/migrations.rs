use rusqlite::{Connection, OptionalExtension, params};

use crate::ingredients::repository::RepositoryError;

const INITIAL_VERSION: i64 = 1;
const INITIAL_MIGRATION: &str = include_str!("../../migrations/0001_initial.sql");

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
    if current >= INITIAL_VERSION {
        return Ok(());
    }

    let transaction = connection.transaction()?;
    transaction.execute_batch(INITIAL_MIGRATION)?;
    transaction.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
        params![INITIAL_VERSION, applied_at],
    )?;
    transaction.commit()?;
    Ok(())
}
