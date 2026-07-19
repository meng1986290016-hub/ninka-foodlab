pub mod migrations;

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::ingredients::repository::RepositoryError;

pub fn open(path: &Path) -> Result<Connection, RepositoryError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(RepositoryError::io)?;
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )?;
    configure(&connection)?;
    Ok(connection)
}

pub fn open_in_memory() -> Result<Connection, RepositoryError> {
    let connection = Connection::open_in_memory()?;
    configure(&connection)?;
    Ok(connection)
}

fn configure(connection: &Connection) -> Result<(), RepositoryError> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}
