use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use food_rd_desktop::{
    backup::archive::{BackupSource, create_offline_backup, inspect_offline_backup},
    database::{self, migrations},
};
use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

#[test]
fn backup_contains_one_consistent_database_manifest_and_only_registered_attachments() {
    let fixture = BackupFixture::new("complete");
    let destination = fixture.root.join("研发数据.foodrd-backup");

    let manifest = create_offline_backup(fixture.source(), &destination).unwrap();
    let inspected = inspect_offline_backup(&destination).unwrap();

    assert_eq!(inspected, manifest);
    assert_eq!(manifest.format_version, 1);
    assert_eq!(manifest.application_id, "food-rd-studio");
    assert_eq!(manifest.application_version, "0.1.0-test");
    assert_eq!(manifest.schema_version, migrations::LATEST_SCHEMA_VERSION);
    assert_eq!(manifest.attachments.len(), 1);
    assert_eq!(manifest.totals.attachment_count, 1);

    let file = File::open(&destination).unwrap();
    let mut archive = ZipArchive::new(file).unwrap();
    let names = (0..archive.len())
        .map(|index| archive.by_index(index).unwrap().name().to_string())
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        [
            "manifest.json".to_string(),
            "database.sqlite3".to_string(),
            format!("attachments/{}", fixture.attachment_relative_path),
        ]
    );
    assert!(names.iter().all(|name| !name.contains("secret")));
    assert!(names.iter().all(|name| !name.contains("partial")));
    assert!(names.iter().all(|name| !name.contains("cache")));

    let extracted_database = fixture.root.join("extracted.sqlite3");
    let mut database_entry = archive.by_name("database.sqlite3").unwrap();
    let mut database_bytes = Vec::new();
    database_entry.read_to_end(&mut database_bytes).unwrap();
    fs::write(&extracted_database, database_bytes).unwrap();
    let connection = Connection::open(&extracted_database).unwrap();
    assert_eq!(
        connection
            .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM source_attachments", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
        1
    );
}

#[test]
fn inspection_rejects_a_tampered_attachment_and_an_unlisted_secret_file() {
    let fixture = BackupFixture::new("tampered");
    let valid = fixture.root.join("valid.foodrd-backup");
    create_offline_backup(fixture.source(), &valid).unwrap();

    let tampered = fixture.root.join("tampered.foodrd-backup");
    rewrite_archive(&valid, &tampered, |name, bytes| {
        if name.starts_with("attachments/") {
            bytes[0] ^= 0xff;
        }
    });
    let error = inspect_offline_backup(&tampered).unwrap_err();
    assert_eq!(error.code(), "invalid_backup");

    let extra = fixture.root.join("extra.foodrd-backup");
    rewrite_archive_with_extra(&valid, &extra, "cache/api-key.txt", b"sk-not-allowed");
    let error = inspect_offline_backup(&extra).unwrap_err();
    assert_eq!(error.code(), "invalid_backup");
}

#[test]
fn failed_backup_preserves_the_existing_target_and_cleans_staging_files() {
    let fixture = BackupFixture::new("atomic-failure");
    let destination = fixture.root.join("existing.foodrd-backup");
    fs::write(&destination, b"existing verified backup").unwrap();
    fs::remove_file(
        fixture
            .attachment_root
            .join(&fixture.attachment_relative_path),
    )
    .unwrap();

    let error = create_offline_backup(fixture.source(), &destination).unwrap_err();

    assert_eq!(error.code(), "storage_failure");
    assert_eq!(fs::read(&destination).unwrap(), b"existing verified backup");
    let leaked = fs::read_dir(&fixture.root)
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(".foodrd-backup-staging-") || name.ends_with(".tmp"))
        .collect::<Vec<_>>();
    assert!(leaked.is_empty(), "unexpected staging files: {leaked:?}");
}

struct BackupFixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    attachment_relative_path: String,
}

impl BackupFixture {
    fn new(name: &str) -> Self {
        let root = unique_directory(name);
        let database_path = root.join("food-rd.sqlite3");
        let attachment_root = root.join("attachments");
        fs::create_dir_all(&attachment_root).unwrap();
        let mut connection = database::open(&database_path).unwrap();
        migrations::apply(&mut connection, "2026-07-31T10:00:00+08:00").unwrap();
        connection
            .execute(
                "INSERT INTO categories
                 (id, name, sort_order, created_at, updated_at, archived_at)
                 VALUES ('backup-category', '备份测试分类', 99, ?1, ?1, NULL)",
                ["2026-07-31T10:00:00+08:00"],
            )
            .unwrap();
        let attachment_bytes = b"supplier specification for backup";
        let attachment_sha256 = hex::encode(Sha256::digest(attachment_bytes));
        let attachment_relative_path =
            format!("{}/{}.txt", &attachment_sha256[..2], attachment_sha256);
        let attachment_path = attachment_root.join(&attachment_relative_path);
        fs::create_dir_all(attachment_path.parent().unwrap()).unwrap();
        fs::write(&attachment_path, attachment_bytes).unwrap();
        connection
            .execute(
                "INSERT INTO source_attachments
                 (id, original_name, media_type, byte_size, sha256, relative_path, created_at)
                 VALUES ('backup-attachment', '供应商规格书.txt', 'text/plain', ?1, ?2, ?3, ?4)",
                params![
                    attachment_bytes.len() as i64,
                    attachment_sha256,
                    attachment_relative_path,
                    "2026-07-31T10:01:00+08:00"
                ],
            )
            .unwrap();
        drop(connection);

        fs::write(root.join("api-key.secret"), b"sk-must-never-enter-backup").unwrap();
        fs::create_dir_all(attachment_root.join("cache")).unwrap();
        fs::write(attachment_root.join("cache/model-response.tmp"), b"cache").unwrap();
        fs::write(
            attachment_path.parent().unwrap().join("unfinished.partial"),
            b"temporary",
        )
        .unwrap();

        Self {
            root,
            database_path,
            attachment_root,
            attachment_relative_path,
        }
    }

    fn source(&self) -> BackupSource<'_> {
        BackupSource {
            database_path: &self.database_path,
            attachment_root: &self.attachment_root,
            application_version: "0.1.0-test",
            created_at: "2026-07-31T10:30:00+08:00",
        }
    }
}

impl Drop for BackupFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn rewrite_archive(
    source: &Path,
    destination: &Path,
    mut transform: impl FnMut(&str, &mut Vec<u8>),
) {
    let mut input = ZipArchive::new(File::open(source).unwrap()).unwrap();
    let output = File::create(destination).unwrap();
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    for index in 0..input.len() {
        let mut entry = input.by_index(index).unwrap();
        let name = entry.name().to_string();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        transform(&name, &mut bytes);
        writer.start_file(name, options).unwrap();
        writer.write_all(&bytes).unwrap();
    }
    writer.finish().unwrap().sync_all().unwrap();
}

fn rewrite_archive_with_extra(source: &Path, destination: &Path, name: &str, bytes: &[u8]) {
    rewrite_archive(source, destination, |_, _| {});
    let temporary = destination.with_extension("foodrd-backup.tmp");
    let mut input = ZipArchive::new(File::open(destination).unwrap()).unwrap();
    let output = File::create(&temporary).unwrap();
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    for index in 0..input.len() {
        let mut entry = input.by_index(index).unwrap();
        let entry_name = entry.name().to_string();
        let mut entry_bytes = Vec::new();
        entry.read_to_end(&mut entry_bytes).unwrap();
        writer.start_file(entry_name, options).unwrap();
        writer.write_all(&entry_bytes).unwrap();
    }
    writer.start_file(name, options).unwrap();
    writer.write_all(bytes).unwrap();
    writer.finish().unwrap().sync_all().unwrap();
    drop(input);
    fs::rename(temporary, destination).unwrap();
}

fn unique_directory(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "food-rd-backup-{name}-{}-{suffix}",
        std::process::id()
    ));
    fs::create_dir(&path).unwrap();
    path
}
