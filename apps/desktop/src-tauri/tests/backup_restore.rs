use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use food_rd_desktop::{
    backup::{
        archive::{BackupSource, create_offline_backup, inspect_offline_backup},
        model::{
            BACKUP_APPLICATION_ID, BACKUP_FORMAT_VERSION, BackupFileEntry, BackupManifest,
            BackupTotals,
        },
        restore::{
            RestoreCheckpoint, RestoreTarget, preflight_offline_backup, restore_offline_backup,
            restore_offline_backup_with_hook,
        },
    },
    database::{self, migrations},
    ingredients::repository::IngredientRepository,
};
use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

const NOW: &str = "2026-07-31T14:00:00+08:00";

#[test]
fn preflight_and_restore_replace_real_files_after_creating_a_safety_backup() {
    let fixture = RestoreFixture::new("success");
    let backup_source = fixture.root.join("backup-source");
    let source = seed_current_database(&backup_source, "备份数据");
    let backup_path = fixture.root.join("selected.foodrd-backup");
    create_offline_backup(source.backup_source(), &backup_path).unwrap();

    let preflight = preflight_offline_backup(&backup_path).unwrap();
    assert_eq!(preflight.source_schema_version, 16);
    assert_eq!(preflight.target_schema_version, 16);
    assert!(!preflight.requires_migration);
    assert_eq!(preflight.attachment_count, 1);
    assert!(preflight.attachment_bytes > 0);
    assert_eq!(preflight.counts.material_groups, 1);
    assert_eq!(preflight.data_record_count, 1);

    let result = restore_offline_backup(&backup_path, fixture.target()).unwrap();

    assert_eq!(result.preflight, preflight);
    assert_eq!(result.restored_schema_version, 16);
    assert!(
        result
            .safety_backup_file_name
            .starts_with("before-restore-")
    );
    let safety = fixture
        .safety_backup_directory
        .join(&result.safety_backup_file_name);
    assert_eq!(inspect_offline_backup(&safety).unwrap().schema_version, 16);
    assert_database_has_only_material(&fixture.database_path, "备份数据原料");
    assert!(
        fixture
            .attachment_root
            .join(&source.attachment_relative_path)
            .is_file()
    );
    assert!(
        !fixture
            .attachment_root
            .join(&fixture.live.attachment_relative_path)
            .exists()
    );

    let reopened = IngredientRepository::open(&fixture.database_path).unwrap();
    assert_eq!(
        reopened.list_material_groups("").unwrap()[0].name,
        "备份数据原料"
    );
    assert_safety_backup_contains(&safety, "当前数据原料");
}

#[test]
fn a_failure_after_install_rolls_database_and_attachments_back_atomically() {
    let fixture = RestoreFixture::new("rollback");
    let backup_source = fixture.root.join("backup-source");
    let source = seed_current_database(&backup_source, "回滚目标");
    let backup_path = fixture.root.join("rollback-source.foodrd-backup");
    create_offline_backup(source.backup_source(), &backup_path).unwrap();

    let error = restore_offline_backup_with_hook(&backup_path, fixture.target(), |checkpoint| {
        if checkpoint == RestoreCheckpoint::RestoredDataInstalled {
            Err(std::io::Error::other("injected restore failure"))
        } else {
            Ok(())
        }
    })
    .unwrap_err();

    assert_eq!(error.code(), "storage_failure");
    assert_database_has_only_material(&fixture.database_path, "当前数据原料");
    assert!(
        fixture
            .attachment_root
            .join(&fixture.live.attachment_relative_path)
            .is_file()
    );
    assert!(
        !fixture
            .attachment_root
            .join(&source.attachment_relative_path)
            .exists()
    );
    let leaked = fs::read_dir(fixture.database_path.parent().unwrap())
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(".foodrd-restore-"))
        .collect::<Vec<_>>();
    assert!(
        leaked.is_empty(),
        "unexpected restore work files: {leaked:?}"
    );
    assert_eq!(
        fs::read_dir(&fixture.safety_backup_directory)
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn historical_schema_is_migrated_but_future_schema_is_rejected_without_mutation() {
    let fixture = RestoreFixture::new("migration");
    let historical_database = fixture.root.join("historical.sqlite3");
    create_schema_one_database(&historical_database, "历史原料");
    let historical_backup = fixture.root.join("historical.foodrd-backup");
    create_manual_backup(&historical_database, 1, &historical_backup);

    let preflight = preflight_offline_backup(&historical_backup).unwrap();
    assert_eq!(preflight.source_schema_version, 1);
    assert_eq!(preflight.target_schema_version, 16);
    assert!(preflight.requires_migration);
    let result = restore_offline_backup(&historical_backup, fixture.target()).unwrap();
    assert_eq!(result.restored_schema_version, 16);
    assert_database_has_only_material(&fixture.database_path, "历史原料");
    let connection = Connection::open(&fixture.database_path).unwrap();
    assert_eq!(
        connection
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        migrations::LATEST_SCHEMA_VERSION
    );
    drop(connection);

    let future_database = fixture.root.join("future.sqlite3");
    create_schema_one_database(&future_database, "未来原料");
    let future_schema_version = migrations::LATEST_SCHEMA_VERSION + 1;
    Connection::open(&future_database)
        .unwrap()
        .execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            rusqlite::params![future_schema_version, NOW],
        )
        .unwrap();
    let future_backup = fixture.root.join("future.foodrd-backup");
    create_manual_backup(&future_database, future_schema_version, &future_backup);
    let error = preflight_offline_backup(&future_backup).unwrap_err();
    assert_eq!(error.code(), "unsupported_backup");
    let error = restore_offline_backup(&future_backup, fixture.target()).unwrap_err();
    assert_eq!(error.code(), "unsupported_backup");
    assert_database_has_only_material(&fixture.database_path, "历史原料");
}

#[test]
fn matching_archive_hash_does_not_bypass_sqlite_integrity_checks() {
    let fixture = RestoreFixture::new("damaged-db");
    let damaged_database = fixture.root.join("damaged.sqlite3");
    fs::write(&damaged_database, b"this is not a sqlite database").unwrap();
    let backup = fixture.root.join("damaged.foodrd-backup");
    create_manual_backup(&damaged_database, 1, &backup);

    assert!(inspect_offline_backup(&backup).is_ok());
    let error = preflight_offline_backup(&backup).unwrap_err();
    assert_eq!(error.code(), "invalid_backup");
    assert_database_has_only_material(&fixture.database_path, "当前数据原料");
}

struct RestoreFixture {
    root: PathBuf,
    database_path: PathBuf,
    attachment_root: PathBuf,
    safety_backup_directory: PathBuf,
    live: SeededDatabase,
}

impl RestoreFixture {
    fn new(name: &str) -> Self {
        let root = unique_directory(name);
        let live_root = root.join("live");
        let live = seed_current_database(&live_root, "当前数据");
        let database_path = live.database_path.clone();
        let attachment_root = live.attachment_root.clone();
        let safety_backup_directory = live_root.join("recovery-backups");
        Self {
            root,
            database_path,
            attachment_root,
            safety_backup_directory,
            live,
        }
    }

    fn target(&self) -> RestoreTarget<'_> {
        RestoreTarget {
            database_path: &self.database_path,
            attachment_root: &self.attachment_root,
            safety_backup_directory: &self.safety_backup_directory,
            application_version: "0.1.0-test",
            restored_at: NOW,
        }
    }
}

impl Drop for RestoreFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

struct SeededDatabase {
    database_path: PathBuf,
    attachment_root: PathBuf,
    attachment_relative_path: String,
}

impl SeededDatabase {
    fn backup_source(&self) -> BackupSource<'_> {
        BackupSource {
            database_path: &self.database_path,
            attachment_root: &self.attachment_root,
            application_version: "0.1.0-test",
            created_at: NOW,
        }
    }
}

fn seed_current_database(root: &Path, prefix: &str) -> SeededDatabase {
    fs::create_dir_all(root).unwrap();
    let database_path = root.join("food-rd.sqlite3");
    let attachment_root = root.join("attachments");
    fs::create_dir_all(&attachment_root).unwrap();
    let mut connection = database::open(&database_path).unwrap();
    migrations::apply(&mut connection, NOW).unwrap();
    connection
        .execute(
            "INSERT INTO categories
             (id, name, sort_order, created_at, updated_at, archived_at)
             VALUES (?1, ?2, 100, ?3, ?3, NULL)",
            params![format!("{prefix}-category"), format!("{prefix}分类"), NOW],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO material_groups
             (id, name, category_id, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?4, NULL)",
            params![
                format!("{prefix}-material"),
                format!("{prefix}原料"),
                format!("{prefix}-category"),
                NOW
            ],
        )
        .unwrap();
    let attachment_bytes = format!("{prefix}供应商规格书").into_bytes();
    let sha256 = hex::encode(Sha256::digest(&attachment_bytes));
    let attachment_relative_path = format!("{}/{}.txt", &sha256[..2], sha256);
    let attachment_path = attachment_root.join(&attachment_relative_path);
    fs::create_dir_all(attachment_path.parent().unwrap()).unwrap();
    fs::write(&attachment_path, &attachment_bytes).unwrap();
    connection
        .execute(
            "INSERT INTO source_attachments
             (id, original_name, media_type, byte_size, sha256, relative_path, created_at)
             VALUES (?1, ?2, 'text/plain', ?3, ?4, ?5, ?6)",
            params![
                format!("{prefix}-attachment"),
                format!("{prefix}规格书.txt"),
                attachment_bytes.len() as i64,
                sha256,
                attachment_relative_path,
                NOW
            ],
        )
        .unwrap();
    drop(connection);
    SeededDatabase {
        database_path,
        attachment_root,
        attachment_relative_path,
    }
}

fn create_schema_one_database(path: &Path, material_name: &str) {
    let connection = Connection::open(path).unwrap();
    connection
        .execute_batch(include_str!("../migrations/0001_initial.sql"))
        .unwrap();
    connection
        .execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            [NOW],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO categories
             (id, name, sort_order, created_at, updated_at, archived_at)
             VALUES ('historical-category', '历史分类', 1, ?1, ?1, NULL)",
            [NOW],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO material_groups
             (id, name, category_id, created_at, updated_at, archived_at)
             VALUES ('historical-material', ?1, 'historical-category', ?2, ?2, NULL)",
            params![material_name, NOW],
        )
        .unwrap();
}

fn create_manual_backup(database: &Path, schema_version: i64, destination: &Path) {
    let bytes = fs::read(database).unwrap();
    let database_entry = BackupFileEntry {
        path: "database.sqlite3".into(),
        byte_size: bytes.len() as u64,
        sha256: hex::encode(Sha256::digest(&bytes)),
    };
    let manifest = BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        application_id: BACKUP_APPLICATION_ID.into(),
        application_version: "0.0.1-test".into(),
        created_at: NOW.into(),
        schema_version,
        database: database_entry.clone(),
        attachments: Vec::new(),
        totals: BackupTotals {
            attachment_count: 0,
            total_bytes: database_entry.byte_size,
        },
    };
    let output = File::create(destination).unwrap();
    let mut archive = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    archive.start_file("manifest.json", options).unwrap();
    archive
        .write_all(&serde_json::to_vec_pretty(&manifest).unwrap())
        .unwrap();
    archive.start_file("database.sqlite3", options).unwrap();
    archive.write_all(&bytes).unwrap();
    archive.finish().unwrap().sync_all().unwrap();
}

fn assert_database_has_only_material(path: &Path, expected: &str) {
    let connection = Connection::open(path).unwrap();
    let names = connection
        .prepare("SELECT name FROM material_groups ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(names, [expected]);
}

fn assert_safety_backup_contains(path: &Path, expected: &str) {
    let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
    let mut database = archive.by_name("database.sqlite3").unwrap();
    let extracted = path.with_extension("safety.sqlite3");
    let mut output = File::create(&extracted).unwrap();
    std::io::copy(&mut database, &mut output).unwrap();
    output.sync_all().unwrap();
    drop(database);
    drop(archive);
    assert_database_has_only_material(&extracted, expected);
    fs::remove_file(extracted).unwrap();
}

fn unique_directory(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "food-rd-restore-{name}-{}-{suffix}",
        std::process::id()
    ));
    fs::create_dir(&path).unwrap();
    path
}
