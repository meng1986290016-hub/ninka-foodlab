use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Read,
    path::{Component, Path, PathBuf},
};

use chrono::DateTime;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::{
    archive::{BackupSource, create_offline_backup, extract_verified_backup},
    model::{BackupDataCounts, BackupPreflight, BackupRestoreResult},
};

const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 1;

pub struct RestoreTarget<'a> {
    pub database_path: &'a Path,
    pub attachment_root: &'a Path,
    pub safety_backup_directory: &'a Path,
    pub application_version: &'a str,
    pub restored_at: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RestoreCheckpoint {
    CurrentDataMoved,
    RestoredDataInstalled,
}

pub fn preflight_offline_backup(path: &Path) -> Result<BackupPreflight, RepositoryError> {
    let work = unique_work_directory("preflight")?;
    let result = (|| {
        let extracted = work.join("extracted");
        let manifest = extract_verified_backup(path, &extracted)?;
        let database_path = extracted.join(&manifest.database.path);
        let preflight = inspect_database(&database_path, &manifest)?;
        migrate_staged_database(&database_path, &manifest.created_at)?;
        let attachments = extracted.join("attachments");
        fs::create_dir_all(&attachments).map_err(RepositoryError::io)?;
        validate_database_and_attachments(&database_path, &attachments)?;
        Ok(preflight)
    })();
    let _ = fs::remove_dir_all(work);
    result
}

pub fn restore_offline_backup(
    backup_path: &Path,
    target: RestoreTarget<'_>,
) -> Result<BackupRestoreResult, RepositoryError> {
    restore_offline_backup_with_hook(backup_path, target, |_| Ok(()))
}

#[doc(hidden)]
pub fn restore_offline_backup_with_hook(
    backup_path: &Path,
    target: RestoreTarget<'_>,
    hook: impl Fn(RestoreCheckpoint) -> std::io::Result<()>,
) -> Result<BackupRestoreResult, RepositoryError> {
    validate_restore_target(backup_path, &target)?;
    let operation_id = Uuid::new_v4();
    let parent = target
        .database_path
        .parent()
        .ok_or_else(|| invalid_input("恢复目标位置无效"))?;
    let staging = parent.join(format!(".foodrd-restore-staging-{operation_id}"));
    let rollback = parent.join(format!(".foodrd-restore-rollback-{operation_id}"));
    fs::create_dir(&staging).map_err(RepositoryError::io)?;
    let result = (|| {
        let extracted = staging.join("extracted");
        let manifest = extract_verified_backup(backup_path, &extracted)?;
        let staged_database = extracted.join(&manifest.database.path);
        let preflight = inspect_database(&staged_database, &manifest)?;
        migrate_staged_database(&staged_database, target.restored_at)?;
        let staged_attachments = extracted.join("attachments");
        fs::create_dir_all(&staged_attachments).map_err(RepositoryError::io)?;
        validate_database_and_attachments(&staged_database, &staged_attachments)?;

        fs::create_dir_all(target.safety_backup_directory).map_err(RepositoryError::io)?;
        let safety_backup_file_name = format!("before-restore-{operation_id}.foodrd-backup");
        let safety_backup_path = target
            .safety_backup_directory
            .join(&safety_backup_file_name);
        create_offline_backup(
            BackupSource {
                database_path: target.database_path,
                attachment_root: target.attachment_root,
                application_version: target.application_version,
                created_at: target.restored_at,
            },
            &safety_backup_path,
        )?;

        fs::create_dir(&rollback).map_err(RepositoryError::io)?;
        let mut swap = RestoreSwap::new(target.database_path, target.attachment_root, &rollback);
        if let Err(error) = swap.install(&staged_database, &staged_attachments, &hook) {
            if swap.rollback().is_err() {
                return Err(domain(
                    "restore_rollback_failed",
                    "恢复失败，且自动回滚未能完成；请保留安全副本并停止继续操作",
                ));
            }
            return Err(error);
        }
        if let Err(error) =
            validate_database_and_attachments(target.database_path, target.attachment_root)
        {
            if swap.rollback().is_err() {
                return Err(domain(
                    "restore_rollback_failed",
                    "恢复校验失败，且自动回滚未能完成；请保留安全副本并停止继续操作",
                ));
            }
            return Err(error);
        }
        swap.commit();
        Ok(BackupRestoreResult {
            preflight,
            safety_backup_file_name,
            restored_schema_version: migrations::LATEST_SCHEMA_VERSION,
        })
    })();
    let _ = fs::remove_dir_all(&staging);
    result
}

fn inspect_database(
    path: &Path,
    manifest: &super::model::BackupManifest,
) -> Result<BackupPreflight, RepositoryError> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| invalid_backup("备份数据库无法打开"))?;
    validate_sqlite_integrity(&connection)?;
    let schema_version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| invalid_backup("备份数据库缺少版本信息"))?;
    if schema_version != manifest.schema_version {
        return Err(invalid_backup("备份清单与数据库版本不一致"));
    }
    if !(MIN_SUPPORTED_SCHEMA_VERSION..=migrations::LATEST_SCHEMA_VERSION).contains(&schema_version)
    {
        return Err(domain(
            "unsupported_backup",
            "备份数据库版本不在当前应用支持的恢复范围内",
        ));
    }
    let counts = BackupDataCounts {
        material_groups: count_if_present(&connection, "material_groups")?,
        ingredient_variants: count_if_present(&connection, "ingredient_variants")?,
        recipes: count_if_present(&connection, "recipes")?,
        recipe_versions: count_if_present(&connection, "recipe_versions")?,
        nutrition_labels: count_if_present(&connection, "nutrition_labels")?,
        nutrition_label_versions: count_if_present(&connection, "nutrition_label_versions")?,
        research_reports: count_if_present(&connection, "research_reports")?,
        agent_conversations: count_if_present(&connection, "agent_conversations")?,
    };
    let attachment_bytes = manifest
        .totals
        .total_bytes
        .checked_sub(manifest.database.byte_size)
        .ok_or_else(|| invalid_backup("备份清单数据量无效"))?;
    Ok(BackupPreflight {
        created_at: manifest.created_at.clone(),
        application_version: manifest.application_version.clone(),
        source_schema_version: schema_version,
        target_schema_version: migrations::LATEST_SCHEMA_VERSION,
        requires_migration: schema_version < migrations::LATEST_SCHEMA_VERSION,
        database_bytes: manifest.database.byte_size,
        attachment_count: manifest.totals.attachment_count,
        attachment_bytes,
        total_bytes: manifest.totals.total_bytes,
        data_record_count: counts.total(),
        counts,
    })
}

fn count_if_present(connection: &Connection, table: &str) -> Result<u64, RepositoryError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|_| invalid_backup("备份数据库结构无法读取"))?
        .is_some();
    if !exists {
        return Ok(0);
    }
    let sql = format!("SELECT COUNT(*) FROM {table}");
    let value = connection
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(|_| invalid_backup("备份数据库统计无法读取"))?;
    u64::try_from(value).map_err(|_| invalid_backup("备份数据库统计无效"))
}

fn validate_sqlite_integrity(connection: &Connection) -> Result<(), RepositoryError> {
    let quick_check = connection
        .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map_err(|_| invalid_backup("备份数据库完整性检查失败"))?;
    if quick_check != "ok" {
        return Err(invalid_backup("备份数据库已损坏"));
    }
    let foreign_key_issue = connection
        .prepare("PRAGMA foreign_key_check")
        .and_then(|mut statement| statement.exists([]))
        .map_err(|_| invalid_backup("备份数据库关联检查失败"))?;
    if foreign_key_issue {
        return Err(invalid_backup("备份数据库存在无效关联"));
    }
    Ok(())
}

fn migrate_staged_database(path: &Path, migrated_at: &str) -> Result<(), RepositoryError> {
    let mut connection = database::open_for_maintenance(path)?;
    migrations::apply(&mut connection, migrated_at)?;
    validate_sqlite_integrity(&connection)?;
    let schema_version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    if schema_version != migrations::LATEST_SCHEMA_VERSION {
        return Err(invalid_state("备份数据库升级未完成"));
    }
    drop(connection);
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(RepositoryError::io)?
        .sync_all()
        .map_err(RepositoryError::io)
}

pub(crate) fn install_staged_data(
    staged_database: &Path,
    staged_attachments: &Path,
    database_path: &Path,
    attachment_root: &Path,
) -> Result<(), RepositoryError> {
    install_staged_data_with_hook(
        staged_database,
        staged_attachments,
        database_path,
        attachment_root,
        |_| Ok(()),
    )
}

#[doc(hidden)]
pub(crate) fn install_staged_data_with_hook(
    staged_database: &Path,
    staged_attachments: &Path,
    database_path: &Path,
    attachment_root: &Path,
    hook: impl Fn(RestoreCheckpoint) -> std::io::Result<()>,
) -> Result<(), RepositoryError> {
    validate_database_and_attachments(staged_database, staged_attachments)?;
    let parent = database_path
        .parent()
        .ok_or_else(|| invalid_state("数据替换目标位置无效"))?;
    if staged_database.parent().and_then(Path::parent) != Some(parent)
        || staged_attachments.parent().and_then(Path::parent) != Some(parent)
    {
        return Err(invalid_input("暂存数据必须位于应用数据目录"));
    }
    let rollback = parent.join(format!(".foodrd-reset-rollback-{}", Uuid::new_v4()));
    fs::create_dir(&rollback).map_err(RepositoryError::io)?;
    let mut swap = RestoreSwap::new(database_path, attachment_root, &rollback);
    if let Err(error) = swap.install(staged_database, staged_attachments, &hook) {
        if swap.rollback().is_err() {
            return Err(domain(
                "restore_rollback_failed",
                "数据替换失败，且自动回滚未能完成；请停止继续操作",
            ));
        }
        return Err(error);
    }
    if let Err(error) = validate_database_and_attachments(database_path, attachment_root) {
        if swap.rollback().is_err() {
            return Err(domain(
                "restore_rollback_failed",
                "数据替换校验失败，且自动回滚未能完成；请停止继续操作",
            ));
        }
        return Err(error);
    }
    swap.commit();
    Ok(())
}

fn validate_database_and_attachments(
    database_path: &Path,
    attachment_root: &Path,
) -> Result<(), RepositoryError> {
    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    validate_sqlite_integrity(&connection)?;
    let schema_version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    if schema_version != migrations::LATEST_SCHEMA_VERSION {
        return Err(invalid_state("恢复后的数据库版本无效"));
    }
    let mut statement = connection.prepare(
        "SELECT relative_path, byte_size, sha256 FROM source_attachments ORDER BY relative_path",
    )?;
    let attachments = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut expected_paths = HashSet::new();
    for attachment in attachments {
        let (relative_path, byte_size, sha256) = attachment?;
        validate_attachment_path(&relative_path)?;
        if !expected_paths.insert(relative_path.clone()) {
            return Err(invalid_state("恢复后的附件记录重复"));
        }
        let path = attachment_root.join(&relative_path);
        let metadata = fs::symlink_metadata(&path).map_err(RepositoryError::io)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() != u64::try_from(byte_size).unwrap_or(u64::MAX)
            || sha256_file(&path)? != sha256
        {
            return Err(invalid_state("恢复后的附件校验失败"));
        }
    }
    if list_attachment_files(attachment_root)? != expected_paths {
        return Err(invalid_state("恢复后的附件集合与数据库不一致"));
    }
    Ok(())
}

fn validate_attachment_path(value: &str) -> Result<(), RepositoryError> {
    let components = Path::new(value).components().collect::<Vec<_>>();
    if components.len() != 2
        || components
            .iter()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_state("恢复后的附件路径无效"));
    }
    Ok(())
}

fn list_attachment_files(root: &Path) -> Result<HashSet<String>, RepositoryError> {
    let mut files = HashSet::new();
    if !root.exists() {
        return Ok(files);
    }
    let root_metadata = fs::symlink_metadata(root).map_err(RepositoryError::io)?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(invalid_state("恢复后的附件目录无效"));
    }
    for directory in fs::read_dir(root).map_err(RepositoryError::io)? {
        let directory = directory.map_err(RepositoryError::io)?;
        let directory_metadata = directory.metadata().map_err(RepositoryError::io)?;
        if directory
            .file_type()
            .map_err(RepositoryError::io)?
            .is_symlink()
            || !directory_metadata.is_dir()
        {
            return Err(invalid_state("恢复后的附件目录包含未登记文件"));
        }
        let directory_name = directory
            .file_name()
            .to_str()
            .ok_or_else(|| invalid_state("恢复后的附件路径无效"))?
            .to_string();
        for entry in fs::read_dir(directory.path()).map_err(RepositoryError::io)? {
            let entry = entry.map_err(RepositoryError::io)?;
            if entry.file_type().map_err(RepositoryError::io)?.is_symlink()
                || !entry.metadata().map_err(RepositoryError::io)?.is_file()
            {
                return Err(invalid_state("恢复后的附件目录包含未登记文件"));
            }
            let file_name = entry
                .file_name()
                .to_str()
                .ok_or_else(|| invalid_state("恢复后的附件路径无效"))?
                .to_string();
            files.insert(format!("{directory_name}/{file_name}"));
        }
    }
    Ok(files)
}

fn validate_restore_target(
    backup_path: &Path,
    target: &RestoreTarget<'_>,
) -> Result<(), RepositoryError> {
    if target.application_version.trim().is_empty()
        || DateTime::parse_from_rfc3339(target.restored_at).is_err()
    {
        return Err(invalid_input("恢复版本或时间无效"));
    }
    let parent = target
        .database_path
        .parent()
        .ok_or_else(|| invalid_input("恢复目标位置无效"))?;
    if target.attachment_root.parent() != Some(parent)
        || backup_path.starts_with(target.attachment_root)
        || target
            .safety_backup_directory
            .starts_with(target.attachment_root)
    {
        return Err(invalid_input("恢复路径布局无效"));
    }
    Ok(())
}

struct RestoreSwap<'a> {
    database_path: &'a Path,
    attachment_root: &'a Path,
    rollback: &'a Path,
    old_database_moved: bool,
    old_attachments_moved: bool,
    new_database_installed: bool,
    new_attachments_installed: bool,
    sidecars: Vec<(PathBuf, PathBuf)>,
}

impl<'a> RestoreSwap<'a> {
    fn new(database_path: &'a Path, attachment_root: &'a Path, rollback: &'a Path) -> Self {
        Self {
            database_path,
            attachment_root,
            rollback,
            old_database_moved: false,
            old_attachments_moved: false,
            new_database_installed: false,
            new_attachments_installed: false,
            sidecars: Vec::new(),
        }
    }

    fn install(
        &mut self,
        staged_database: &Path,
        staged_attachments: &Path,
        hook: &impl Fn(RestoreCheckpoint) -> std::io::Result<()>,
    ) -> Result<(), RepositoryError> {
        fs::rename(self.database_path, self.rollback.join("database.sqlite3"))
            .map_err(RepositoryError::io)?;
        self.old_database_moved = true;
        for suffix in ["-wal", "-shm", "-journal"] {
            let mut source = self.database_path.as_os_str().to_os_string();
            source.push(suffix);
            let source = PathBuf::from(source);
            if source.exists() {
                let destination = self.rollback.join(format!("database.sqlite3{suffix}"));
                fs::rename(&source, &destination).map_err(RepositoryError::io)?;
                self.sidecars.push((source, destination));
            }
        }
        if self.attachment_root.exists() {
            fs::rename(self.attachment_root, self.rollback.join("attachments"))
                .map_err(RepositoryError::io)?;
            self.old_attachments_moved = true;
        }
        hook(RestoreCheckpoint::CurrentDataMoved).map_err(RepositoryError::io)?;
        fs::rename(staged_database, self.database_path).map_err(RepositoryError::io)?;
        self.new_database_installed = true;
        fs::rename(staged_attachments, self.attachment_root).map_err(RepositoryError::io)?;
        self.new_attachments_installed = true;
        hook(RestoreCheckpoint::RestoredDataInstalled).map_err(RepositoryError::io)?;
        sync_parent(
            self.database_path
                .parent()
                .ok_or_else(|| invalid_state("恢复目标位置无效"))?,
        )?;
        Ok(())
    }

    fn rollback(&mut self) -> Result<(), RepositoryError> {
        if self.new_attachments_installed && self.attachment_root.exists() {
            fs::remove_dir_all(self.attachment_root).map_err(RepositoryError::io)?;
            self.new_attachments_installed = false;
        }
        if self.old_attachments_moved {
            fs::rename(self.rollback.join("attachments"), self.attachment_root)
                .map_err(RepositoryError::io)?;
            self.old_attachments_moved = false;
        }
        if self.new_database_installed && self.database_path.exists() {
            fs::remove_file(self.database_path).map_err(RepositoryError::io)?;
            self.new_database_installed = false;
        }
        if self.old_database_moved {
            fs::rename(self.rollback.join("database.sqlite3"), self.database_path)
                .map_err(RepositoryError::io)?;
            self.old_database_moved = false;
        }
        for (source, destination) in self.sidecars.drain(..) {
            fs::rename(destination, source).map_err(RepositoryError::io)?;
        }
        if self.rollback.exists() {
            fs::remove_dir_all(self.rollback).map_err(RepositoryError::io)?;
        }
        Ok(())
    }

    fn commit(mut self) {
        self.old_database_moved = false;
        self.old_attachments_moved = false;
        self.sidecars.clear();
        let _ = fs::remove_dir_all(self.rollback);
    }
}

fn sha256_file(path: &Path) -> Result<String, RepositoryError> {
    let mut file = File::open(path).map_err(RepositoryError::io)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(RepositoryError::io)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(hex::encode(digest.finalize()))
}

fn unique_work_directory(kind: &str) -> Result<PathBuf, RepositoryError> {
    let path = std::env::temp_dir().join(format!("food-rd-{kind}-{}", Uuid::new_v4()));
    fs::create_dir(&path).map_err(RepositoryError::io)?;
    Ok(path)
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> Result<(), RepositoryError> {
    File::open(parent)
        .map_err(RepositoryError::io)?
        .sync_all()
        .map_err(RepositoryError::io)
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> Result<(), RepositoryError> {
    Ok(())
}

fn invalid_input(message: impl Into<String>) -> RepositoryError {
    domain("invalid_input", message)
}

fn invalid_state(message: impl Into<String>) -> RepositoryError {
    domain("invalid_state", message)
}

fn invalid_backup(message: impl Into<String>) -> RepositoryError {
    domain("invalid_backup", message)
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}
