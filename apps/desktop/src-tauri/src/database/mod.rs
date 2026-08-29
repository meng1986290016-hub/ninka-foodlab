pub mod migrations;

use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use rusqlite::{Connection, OpenFlags};

use crate::ingredients::repository::RepositoryError;

pub fn open(path: &Path) -> Result<Connection, RepositoryError> {
    if maintenance_path()
        .lock()
        .map_err(|_| RepositoryError::domain("invalid_state", "数据维护状态不可用"))?
        .as_deref()
        == Some(path)
    {
        return Err(RepositoryError::domain(
            "invalid_state",
            "正在维护本机研发数据，请稍候",
        ));
    }
    open_for_maintenance(path)
}

pub(crate) fn open_for_maintenance(path: &Path) -> Result<Connection, RepositoryError> {
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

pub(crate) struct MaintenanceGuard {
    path: PathBuf,
}

pub(crate) fn begin_maintenance(path: &Path) -> Result<MaintenanceGuard, RepositoryError> {
    let mut active = maintenance_path()
        .lock()
        .map_err(|_| RepositoryError::domain("invalid_state", "数据维护状态不可用"))?;
    if active.is_some() {
        return Err(RepositoryError::domain(
            "invalid_state",
            "另一个数据维护操作正在进行",
        ));
    }
    let path = path.to_path_buf();
    *active = Some(path.clone());
    Ok(MaintenanceGuard { path })
}

impl Drop for MaintenanceGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = maintenance_path().lock()
            && active.as_ref() == Some(&self.path)
        {
            *active = None;
        }
    }
}

fn maintenance_path() -> &'static Mutex<Option<PathBuf>> {
    static ACTIVE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(None))
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
