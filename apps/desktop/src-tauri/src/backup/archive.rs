use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path},
    time::Duration,
};

use chrono::DateTime;
use rusqlite::{Connection, backup::Backup};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::{
    database::migrations::LATEST_SCHEMA_VERSION, ingredients::repository::RepositoryError,
};

use super::model::{
    BACKUP_APPLICATION_ID, BACKUP_FORMAT_VERSION, BackupFileEntry, BackupManifest, BackupTotals,
};

const DATABASE_ARCHIVE_PATH: &str = "database.sqlite3";
const MANIFEST_ARCHIVE_PATH: &str = "manifest.json";
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 100_002;
const MAX_BACKUP_BYTES: u64 = 128 * 1024 * 1024 * 1024;

pub struct BackupSource<'a> {
    pub database_path: &'a Path,
    pub attachment_root: &'a Path,
    pub application_version: &'a str,
    pub created_at: &'a str,
}

pub fn create_offline_backup(
    source: BackupSource<'_>,
    destination: &Path,
) -> Result<BackupManifest, RepositoryError> {
    validate_create_request(&source, destination)?;
    let parent = destination
        .parent()
        .ok_or_else(|| invalid_input("备份保存位置无效"))?;
    let destination_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| invalid_input("备份文件名无效"))?;
    let operation_id = Uuid::new_v4();
    let staging = parent.join(format!(".foodrd-backup-staging-{operation_id}"));
    let temporary_archive = parent.join(format!(".{destination_name}.{operation_id}.tmp"));
    fs::create_dir(&staging).map_err(RepositoryError::io)?;

    let result = (|| {
        let snapshot_path = staging.join(DATABASE_ARCHIVE_PATH);
        create_database_snapshot(source.database_path, &snapshot_path)?;
        let snapshot = Connection::open(&snapshot_path)?;
        validate_database_snapshot(&snapshot)?;
        let schema_version = snapshot.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        if schema_version != LATEST_SCHEMA_VERSION {
            return Err(invalid_state("只能备份已升级到当前版本的数据库"));
        }

        let database = file_entry(&snapshot_path, DATABASE_ARCHIVE_PATH)?;
        let attachments = stage_attachments(&snapshot, source.attachment_root, &staging)?;
        let total_bytes = attachments
            .iter()
            .try_fold(database.byte_size, |total, entry| {
                total
                    .checked_add(entry.byte_size)
                    .ok_or_else(|| invalid_state("备份数据量超出支持范围"))
            })?;
        if total_bytes > MAX_BACKUP_BYTES {
            return Err(invalid_state("备份数据量超出支持范围"));
        }
        let manifest = BackupManifest {
            format_version: BACKUP_FORMAT_VERSION,
            application_id: BACKUP_APPLICATION_ID.into(),
            application_version: source.application_version.trim().into(),
            created_at: source.created_at.into(),
            schema_version,
            database,
            totals: BackupTotals {
                attachment_count: attachments.len() as u64,
                total_bytes,
            },
            attachments,
        };
        let manifest_path = staging.join(MANIFEST_ARCHIVE_PATH);
        let mut manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
        manifest_bytes.push(b'\n');
        write_synced(&manifest_path, &manifest_bytes)?;
        write_archive(&staging, &manifest, &temporary_archive)?;
        let verified = inspect_offline_backup(&temporary_archive)?;
        if verified != manifest {
            return Err(invalid_backup("备份写入后校验失败"));
        }
        replace_file(&temporary_archive, destination).map_err(RepositoryError::io)?;
        sync_parent(parent).map_err(RepositoryError::io)?;
        Ok(manifest)
    })();

    let _ = fs::remove_dir_all(&staging);
    if result.is_err() {
        let _ = fs::remove_file(&temporary_archive);
    }
    result
}

pub fn inspect_offline_backup(path: &Path) -> Result<BackupManifest, RepositoryError> {
    let metadata = fs::symlink_metadata(path).map_err(RepositoryError::io)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(invalid_backup("备份文件无效"));
    }
    let file = File::open(path).map_err(RepositoryError::io)?;
    let mut archive = ZipArchive::new(file).map_err(zip_invalid)?;
    if archive.is_empty() || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(invalid_backup("备份包结构无效"));
    }
    let manifest_bytes = {
        let mut entry = archive
            .by_name(MANIFEST_ARCHIVE_PATH)
            .map_err(|_| invalid_backup("备份清单缺失"))?;
        if entry.size() == 0 || entry.size() > MAX_MANIFEST_BYTES {
            return Err(invalid_backup("备份清单无效"));
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut bytes).map_err(RepositoryError::io)?;
        bytes
    };
    let manifest: BackupManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| invalid_backup("备份清单无效"))?;
    let expected = validate_manifest(&manifest)?;
    let mut seen = HashSet::new();
    let mut verified_bytes = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(zip_invalid)?;
        let name = entry.name().to_string();
        validate_zip_entry(&entry, &name)?;
        if !seen.insert(name.clone()) {
            return Err(invalid_backup("备份包包含重复文件"));
        }
        if name == MANIFEST_ARCHIVE_PATH {
            continue;
        }
        let expected_entry = expected
            .get(&name)
            .ok_or_else(|| invalid_backup("备份包包含未登记文件"))?;
        if entry.size() != expected_entry.byte_size {
            return Err(invalid_backup("备份文件大小校验失败"));
        }
        verified_bytes = verified_bytes
            .checked_add(entry.size())
            .ok_or_else(|| invalid_backup("备份数据量无效"))?;
        if verified_bytes > MAX_BACKUP_BYTES {
            return Err(invalid_backup("备份数据量超出支持范围"));
        }
        let (sha256, bytes_read) = hash_reader(&mut entry)?;
        if bytes_read != expected_entry.byte_size || sha256 != expected_entry.sha256 {
            return Err(invalid_backup("备份文件校验和不一致"));
        }
    }
    if seen.len() != expected.len() + 1
        || !seen.contains(MANIFEST_ARCHIVE_PATH)
        || expected.keys().any(|name| !seen.contains(name))
        || verified_bytes != manifest.totals.total_bytes
    {
        return Err(invalid_backup("备份包文件不完整"));
    }
    Ok(manifest)
}

pub(crate) fn extract_verified_backup(
    path: &Path,
    destination: &Path,
) -> Result<BackupManifest, RepositoryError> {
    let manifest = inspect_offline_backup(path)?;
    fs::create_dir(destination).map_err(RepositoryError::io)?;
    let file = File::open(path).map_err(RepositoryError::io)?;
    let mut archive = ZipArchive::new(file).map_err(zip_invalid)?;
    let current_manifest = {
        let mut entry = archive
            .by_name(MANIFEST_ARCHIVE_PATH)
            .map_err(|_| invalid_backup("备份清单缺失"))?;
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut bytes).map_err(RepositoryError::io)?;
        serde_json::from_slice::<BackupManifest>(&bytes)
            .map_err(|_| invalid_backup("备份清单无效"))?
    };
    if current_manifest != manifest || archive.len() != manifest.attachments.len() + 2 {
        return Err(invalid_backup("备份文件在校验期间发生变化"));
    }
    for expected in std::iter::once(&manifest.database).chain(manifest.attachments.iter()) {
        let mut source = archive
            .by_name(&expected.path)
            .map_err(|_| invalid_backup("备份包文件不完整"))?;
        let output = destination.join(&expected.path);
        let parent = output
            .parent()
            .ok_or_else(|| invalid_backup("备份包路径无效"))?;
        fs::create_dir_all(parent).map_err(RepositoryError::io)?;
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&output)
            .map_err(RepositoryError::io)?;
        std::io::copy(&mut source, &mut file).map_err(RepositoryError::io)?;
        file.sync_all().map_err(RepositoryError::io)?;
        let actual = file_entry(&output, &expected.path)?;
        if actual != *expected {
            return Err(invalid_backup("备份文件校验和不一致"));
        }
    }
    Ok(manifest)
}

fn validate_create_request(
    source: &BackupSource<'_>,
    destination: &Path,
) -> Result<(), RepositoryError> {
    if source.application_version.trim().is_empty()
        || DateTime::parse_from_rfc3339(source.created_at).is_err()
    {
        return Err(invalid_input("备份版本或时间无效"));
    }
    let database = fs::symlink_metadata(source.database_path).map_err(RepositoryError::io)?;
    if database.file_type().is_symlink() || !database.is_file() {
        return Err(invalid_input("数据库文件无效"));
    }
    match fs::symlink_metadata(source.attachment_root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(invalid_input("附件存储目录无效"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(RepositoryError::io(error)),
    }
    let parent = destination.parent().filter(|value| value.is_dir());
    let valid_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            !value.starts_with('.')
                && !value.chars().any(char::is_control)
                && value.to_ascii_lowercase().ends_with(".foodrd-backup")
        });
    if parent.is_none() || !valid_name {
        return Err(invalid_input("备份保存位置无效"));
    }
    if let Ok(metadata) = fs::symlink_metadata(destination)
        && (metadata.file_type().is_symlink() || !metadata.is_file())
    {
        return Err(invalid_input("备份目标文件无效"));
    }
    Ok(())
}

fn create_database_snapshot(source: &Path, snapshot_path: &Path) -> Result<(), RepositoryError> {
    let source = Connection::open(source)?;
    let mut destination = Connection::open(snapshot_path)?;
    let backup = Backup::new(&source, &mut destination)?;
    backup.run_to_completion(64, Duration::from_millis(5), None)?;
    drop(backup);
    destination.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    drop(destination);
    File::open(snapshot_path)
        .map_err(RepositoryError::io)?
        .sync_all()
        .map_err(RepositoryError::io)?;
    Ok(())
}

fn validate_database_snapshot(connection: &Connection) -> Result<(), RepositoryError> {
    let status = connection.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))?;
    if status != "ok" {
        return Err(invalid_state("数据库快照完整性校验失败"));
    }
    Ok(())
}

fn stage_attachments(
    snapshot: &Connection,
    attachment_root: &Path,
    staging: &Path,
) -> Result<Vec<BackupFileEntry>, RepositoryError> {
    let mut statement = snapshot.prepare(
        "SELECT relative_path, byte_size, sha256 FROM source_attachments ORDER BY relative_path",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut attachments = Vec::new();
    for row in rows {
        let (relative_path, expected_size, expected_sha256) = row?;
        let expected_size =
            u64::try_from(expected_size).map_err(|_| invalid_state("附件校验信息无效"))?;
        validate_attachment_relative_path(&relative_path)?;
        if !is_sha256(&expected_sha256) {
            return Err(invalid_state("附件校验信息无效"));
        }
        let source = attachment_root.join(&relative_path);
        validate_regular_attachment(&source, attachment_root)?;
        let archive_path = format!("attachments/{relative_path}");
        let destination = staging.join(&archive_path);
        let parent = destination
            .parent()
            .ok_or_else(|| invalid_state("附件存储路径无效"))?;
        fs::create_dir_all(parent).map_err(RepositoryError::io)?;
        fs::copy(&source, &destination).map_err(RepositoryError::io)?;
        let entry = file_entry(&destination, &archive_path)?;
        if entry.byte_size != expected_size || entry.sha256 != expected_sha256 {
            return Err(invalid_state("附件内容与数据库记录不一致"));
        }
        attachments.push(entry);
    }
    Ok(attachments)
}

fn validate_regular_attachment(path: &Path, root: &Path) -> Result<(), RepositoryError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| invalid_state("附件存储路径无效"))?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current).map_err(RepositoryError::io)?;
        if metadata.file_type().is_symlink() {
            return Err(invalid_state("附件存储路径无效"));
        }
    }
    if !fs::symlink_metadata(path)
        .map_err(RepositoryError::io)?
        .is_file()
    {
        return Err(invalid_state("附件文件无效"));
    }
    Ok(())
}

fn validate_attachment_relative_path(value: &str) -> Result<(), RepositoryError> {
    let components = Path::new(value).components().collect::<Vec<_>>();
    if components.len() != 2
        || components
            .iter()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_state("附件存储路径无效"));
    }
    Ok(())
}

fn file_entry(path: &Path, archive_path: &str) -> Result<BackupFileEntry, RepositoryError> {
    let metadata = fs::metadata(path).map_err(RepositoryError::io)?;
    let file = File::open(path).map_err(RepositoryError::io)?;
    let (sha256, byte_size) = hash_reader(file)?;
    if byte_size != metadata.len() {
        return Err(invalid_state("备份源文件在读取期间发生变化"));
    }
    Ok(BackupFileEntry {
        path: archive_path.into(),
        byte_size,
        sha256,
    })
}

fn write_archive(
    staging: &Path,
    manifest: &BackupManifest,
    destination: &Path,
) -> Result<(), RepositoryError> {
    let file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .map_err(RepositoryError::io)?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    let mut paths = Vec::with_capacity(manifest.attachments.len() + 2);
    paths.push(MANIFEST_ARCHIVE_PATH.to_string());
    paths.push(manifest.database.path.clone());
    paths.extend(manifest.attachments.iter().map(|entry| entry.path.clone()));
    for archive_path in paths {
        archive
            .start_file(&archive_path, options)
            .map_err(zip_storage)?;
        let mut source = File::open(staging.join(&archive_path)).map_err(RepositoryError::io)?;
        std::io::copy(&mut source, &mut archive).map_err(RepositoryError::io)?;
    }
    let file = archive.finish().map_err(zip_storage)?;
    file.sync_all().map_err(RepositoryError::io)
}

fn validate_manifest(
    manifest: &BackupManifest,
) -> Result<BTreeMap<String, BackupFileEntry>, RepositoryError> {
    if manifest.format_version != BACKUP_FORMAT_VERSION
        || manifest.application_id != BACKUP_APPLICATION_ID
        || manifest.application_version.trim().is_empty()
        || DateTime::parse_from_rfc3339(&manifest.created_at).is_err()
        || manifest.schema_version <= 0
        || manifest.database.path != DATABASE_ARCHIVE_PATH
        || manifest.database.byte_size == 0
        || !valid_checksum(&manifest.database)
        || manifest.totals.attachment_count != manifest.attachments.len() as u64
    {
        return Err(invalid_backup("备份清单无效"));
    }
    let mut expected = BTreeMap::new();
    expected.insert(manifest.database.path.clone(), manifest.database.clone());
    let mut computed_total = manifest.database.byte_size;
    for attachment in &manifest.attachments {
        let relative = attachment
            .path
            .strip_prefix("attachments/")
            .ok_or_else(|| invalid_backup("备份附件路径无效"))?;
        validate_attachment_relative_path(relative)
            .map_err(|_| invalid_backup("备份附件路径无效"))?;
        if !valid_checksum(attachment)
            || expected
                .insert(attachment.path.clone(), attachment.clone())
                .is_some()
        {
            return Err(invalid_backup("备份清单包含无效或重复文件"));
        }
        computed_total = computed_total
            .checked_add(attachment.byte_size)
            .ok_or_else(|| invalid_backup("备份数据量无效"))?;
    }
    if computed_total != manifest.totals.total_bytes || computed_total > MAX_BACKUP_BYTES {
        return Err(invalid_backup("备份清单数据量无效"));
    }
    Ok(expected)
}

fn valid_checksum(entry: &BackupFileEntry) -> bool {
    is_sha256(&entry.sha256)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_zip_entry<R: Read>(
    entry: &zip::read::ZipFile<'_, R>,
    name: &str,
) -> Result<(), RepositoryError> {
    if entry.is_dir()
        || entry.enclosed_name().is_none()
        || name.starts_with('/')
        || name.contains('\\')
        || entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
    {
        return Err(invalid_backup("备份包路径无效"));
    }
    Ok(())
}

fn hash_reader(mut reader: impl Read) -> Result<(String, u64), RepositoryError> {
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer).map_err(RepositoryError::io)?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(count as u64)
            .ok_or_else(|| invalid_state("备份数据量超出支持范围"))?;
        digest.update(&buffer[..count]);
    }
    Ok((hex::encode(digest.finalize()), total))
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), RepositoryError> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(RepositoryError::io)?;
    file.write_all(bytes).map_err(RepositoryError::io)?;
    file.sync_all().map_err(RepositoryError::io)
}

#[cfg(not(windows))]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(temporary, destination)
}

#[cfg(windows)]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn ReplaceFileW(
            replaced: *const u16,
            replacement: *const u16,
            backup: *const u16,
            flags: u32,
            exclude: *mut core::ffi::c_void,
            reserved: *mut core::ffi::c_void,
        ) -> i32;
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let destination_exists = destination.exists();
    let temporary = temporary
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        if destination_exists {
            ReplaceFileW(
                destination.as_ptr(),
                temporary.as_ptr(),
                ptr::null(),
                0x0000_0001,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        } else {
            MoveFileExW(temporary.as_ptr(), destination.as_ptr(), 0x0000_0008)
        }
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

fn zip_invalid(_error: zip::result::ZipError) -> RepositoryError {
    invalid_backup("备份包无法读取")
}

fn zip_storage(error: zip::result::ZipError) -> RepositoryError {
    RepositoryError::io(std::io::Error::other(error))
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
