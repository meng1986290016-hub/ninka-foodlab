use std::{
    fs::{self, File},
    io::Read,
    path::{Component, Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use rusqlite::{Connection, OpenFlags, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tokio::time::sleep;
use uuid::Uuid;

use crate::{
    backup::{
        archive::{BackupSource, create_offline_backup},
        restore::{
            RestoreTarget, install_staged_data, preflight_offline_backup, restore_offline_backup,
        },
    },
    database::{self, migrations},
    ingest::coordinator::IngredientIngestCoordinator,
    ingredients::repository::{IngredientRepository, RepositoryError},
};

use super::{AppState, CommandError};

const CONFIRMATION_PHRASE: &str = "清空本机研发数据";
const NO_BACKUP_PHRASE: &str = "我确认不备份并清空本机研发数据";
const SNAPSHOT_VERSION: u32 = 1;

const HARNESS_RUNTIME_ITEMS: &[&str] = &[
    "sessions",
    "attachments",
    "capabilities",
    "storages/session_projcache.json",
];
const CODEX_RUNTIME_ITEMS: &[&str] = &[
    "state_5.sqlite",
    "state_5.sqlite-wal",
    "state_5.sqlite-shm",
    "logs_2.sqlite",
    "logs_2.sqlite-wal",
    "logs_2.sqlite-shm",
    "queue_1.sqlite",
    "goals_1.sqlite",
    "memories_1.sqlite",
    "empty-task",
    "tmp",
];

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResetCounts {
    material_groups: u64,
    ingredient_variants: u64,
    recipes: u64,
    nutrition_labels: u64,
    research_reports: u64,
    import_drafts: u64,
    agent_tasks: u64,
    agent_conversations: u64,
    attachments: u64,
    total_records: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetRecoveryInfo {
    id: String,
    created_at: String,
    directory_name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResetPreview {
    preview_id: String,
    confirmation_phrase: &'static str,
    no_backup_confirmation_phrase: &'static str,
    counts: DataResetCounts,
    latest_recovery: Option<ResetRecoveryInfo>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResetExecuteRequest {
    preview_id: String,
    confirmation_phrase: String,
    #[serde(default)]
    allow_without_backup: bool,
    no_backup_confirmation_phrase: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResetResult {
    recovery: Option<ResetRecoveryInfo>,
    cleared_records: u64,
    cleared_attachments: u64,
    restart_required: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataResetRestoreResult {
    recovery: ResetRecoveryInfo,
    safety_backup_file_name: String,
    restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResetSnapshotManifest {
    version: u32,
    id: String,
    created_at: String,
    application_version: String,
    data_backup_sha256: String,
    runtime_items: Vec<RuntimeSnapshotItem>,
    runtime_files: Vec<RuntimeFileEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSnapshotItem {
    area: String,
    relative_path: String,
    directory: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeFileEntry {
    area: String,
    relative_path: String,
    byte_size: u64,
    sha256: String,
}

#[derive(Debug)]
struct VerifiedRecovery {
    info: ResetRecoveryInfo,
    root: PathBuf,
    manifest: ResetSnapshotManifest,
}

#[derive(Debug)]
struct RuntimeMove {
    source: PathBuf,
    rollback: PathBuf,
}

#[tauri::command]
pub fn preview_data_reset(state: State<'_, AppState>) -> Result<DataResetPreview, CommandError> {
    preview_data_reset_inner(&state)
}

#[tauri::command]
pub async fn execute_data_reset(
    request: DataResetExecuteRequest,
    state: State<'_, AppState>,
) -> Result<DataResetResult, CommandError> {
    execute_data_reset_inner(request, &state).await
}

#[tauri::command]
pub fn get_latest_data_reset_recovery(
    state: State<'_, AppState>,
) -> Result<Option<ResetRecoveryInfo>, CommandError> {
    latest_verified_recovery(&recovery_root(&state)?)
        .map(|recovery| recovery.map(|value| value.info))
        .map_err(Into::into)
}

#[tauri::command]
pub async fn restore_latest_data_reset_recovery(
    confirmed: bool,
    state: State<'_, AppState>,
) -> Result<DataResetRestoreResult, CommandError> {
    restore_latest_data_reset_recovery_inner(confirmed, &state).await
}

#[tauri::command]
pub fn restart_application(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(250)).await;
        app.restart();
    });
}

fn preview_data_reset_inner(state: &AppState) -> Result<DataResetPreview, CommandError> {
    let (counts, fingerprint) = read_counts_and_fingerprint(&state.database_path)?;
    let preview_id = Uuid::new_v4().to_string();
    *state
        .data_reset_preview
        .lock()
        .map_err(|_| CommandError::state_unavailable())? = Some((preview_id.clone(), fingerprint));
    let latest_recovery = latest_verified_recovery(&recovery_root(state)?)
        .ok()
        .flatten()
        .map(|value| value.info);
    Ok(DataResetPreview {
        preview_id,
        confirmation_phrase: CONFIRMATION_PHRASE,
        no_backup_confirmation_phrase: NO_BACKUP_PHRASE,
        counts,
        latest_recovery,
    })
}

async fn execute_data_reset_inner(
    request: DataResetExecuteRequest,
    state: &AppState,
) -> Result<DataResetResult, CommandError> {
    if request.confirmation_phrase != CONFIRMATION_PHRASE {
        return Err(command_error(
            "confirmation_mismatch",
            format!("请输入完整短语“{CONFIRMATION_PHRASE}”"),
        ));
    }
    let expected_fingerprint = {
        let preview = state
            .data_reset_preview
            .lock()
            .map_err(|_| CommandError::state_unavailable())?;
        preview
            .as_ref()
            .filter(|(id, _)| id == &request.preview_id)
            .map(|(_, fingerprint)| fingerprint.clone())
            .ok_or_else(|| command_error("preview_stale", "清空预览已失效，请重新检查影响"))?
    };
    if request.allow_without_backup {
        if request.no_backup_confirmation_phrase.as_deref() != Some(NO_BACKUP_PHRASE) {
            return Err(command_error(
                "confirmation_mismatch",
                format!("请输入完整短语“{NO_BACKUP_PHRASE}”"),
            ));
        }
        let prior_failure = state
            .data_reset_backup_failure
            .lock()
            .map_err(|_| CommandError::state_unavailable())?;
        if prior_failure.as_deref() != Some(&request.preview_id) {
            return Err(command_error(
                "confirmation_required",
                "只有安全快照实际失败后，才能选择不备份继续",
            ));
        }
    }

    let maintenance = database::begin_maintenance(&state.database_path)?;
    if let Err(error) = stop_all_agents(state).await {
        drop(maintenance);
        return Err(error);
    }
    let mut coordinator_guard = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    let current = coordinator_guard
        .take()
        .ok_or_else(CommandError::state_unavailable)?;
    drop(current);
    if let Err(error) = drain_existing_connections(&state.database_path) {
        restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
        drop(maintenance);
        return Err(error.into());
    }
    let (counts, current_fingerprint) = match read_counts_and_fingerprint(&state.database_path) {
        Ok(value) => value,
        Err(error) => {
            restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
            drop(maintenance);
            return Err(error);
        }
    };
    if current_fingerprint != expected_fingerprint {
        restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
        drop(maintenance);
        return Err(command_error(
            "preview_stale",
            "预览后数据发生变化，请重新检查影响",
        ));
    }

    let recovery = if request.allow_without_backup {
        None
    } else {
        match create_reset_snapshot(state) {
            Ok(value) => Some(value),
            Err(error) => {
                *state
                    .data_reset_backup_failure
                    .lock()
                    .map_err(|_| CommandError::state_unavailable())? =
                    Some(request.preview_id.clone());
                restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
                drop(maintenance);
                return Err(command_error(
                    "safety_backup_failed",
                    format!("清空前安全快照失败，当前数据未改变：{}", error.message()),
                ));
            }
        }
    };

    let operation_id = Uuid::new_v4();
    let parent = data_parent(state)?;
    let runtime_rollback = parent.join(format!(".foodrd-reset-runtime-rollback-{operation_id}"));
    let runtime_moves = match move_runtime_state_to_rollback(state, &runtime_rollback) {
        Ok(value) => value,
        Err(error) => {
            restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
            drop(maintenance);
            return Err(error.into());
        }
    };
    let staging = parent.join(format!(".foodrd-reset-staging-{operation_id}"));
    let reset_result = (|| {
        fs::create_dir(&staging).map_err(RepositoryError::io)?;
        let staged_database = staging.join("database.sqlite3");
        let staged_attachments = staging.join("attachments");
        fs::create_dir(&staged_attachments).map_err(RepositoryError::io)?;
        create_fresh_database_preserving_settings(&state.database_path, &staged_database)?;
        install_staged_data(
            &staged_database,
            &staged_attachments,
            &state.database_path,
            &state.attachment_root,
        )
    })();
    let _ = fs::remove_dir_all(&staging);
    if let Err(error) = reset_result {
        let _ = rollback_runtime_moves(&runtime_moves);
        restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
        drop(maintenance);
        return Err(error.into());
    }
    if runtime_rollback.exists() {
        let _ = fs::remove_dir_all(&runtime_rollback);
    }
    // A successful atomic replacement must be reported as success even if the
    // in-process connection cannot be reopened: the caller immediately restarts
    // the app, which opens the new database from scratch.
    let _ = restart_coordinator_during_maintenance(&mut coordinator_guard, state);
    drop(coordinator_guard);
    drop(maintenance);
    *state
        .data_reset_preview
        .lock()
        .map_err(|_| CommandError::state_unavailable())? = None;
    *state
        .data_reset_backup_failure
        .lock()
        .map_err(|_| CommandError::state_unavailable())? = None;
    Ok(DataResetResult {
        recovery,
        cleared_records: counts.total_records,
        cleared_attachments: counts.attachments,
        restart_required: true,
    })
}

async fn restore_latest_data_reset_recovery_inner(
    confirmed: bool,
    state: &AppState,
) -> Result<DataResetRestoreResult, CommandError> {
    if !confirmed {
        return Err(command_error(
            "confirmation_required",
            "请先确认恢复最近一次清空前的数据",
        ));
    }
    let recovery = latest_verified_recovery(&recovery_root(state)?)?
        .ok_or_else(|| command_error("recovery_unavailable", "没有可恢复的清空前安全快照"))?;
    let maintenance = database::begin_maintenance(&state.database_path)?;
    if let Err(error) = stop_all_agents(state).await {
        drop(maintenance);
        return Err(error);
    }
    let mut coordinator_guard = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    let current = coordinator_guard
        .take()
        .ok_or_else(CommandError::state_unavailable)?;
    drop(current);
    if let Err(error) = drain_existing_connections(&state.database_path) {
        restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
        drop(maintenance);
        return Err(error.into());
    }

    let operation_id = Uuid::new_v4();
    let runtime_rollback =
        data_parent(state)?.join(format!(".foodrd-restore-runtime-rollback-{operation_id}"));
    let runtime_moves = match move_runtime_state_to_rollback(state, &runtime_rollback) {
        Ok(value) => value,
        Err(error) => {
            restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
            drop(maintenance);
            return Err(error.into());
        }
    };
    if let Err(error) = restore_runtime_snapshot(state, &recovery) {
        let _ = rollback_runtime_moves(&runtime_moves);
        restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
        drop(maintenance);
        return Err(error.into());
    }

    let restored_at = Utc::now().to_rfc3339();
    let result = restore_offline_backup(
        &recovery.root.join("data.foodrd-backup"),
        RestoreTarget {
            database_path: &state.database_path,
            attachment_root: &state.attachment_root,
            safety_backup_directory: &recovery_root(state)?,
            application_version: env!("CARGO_PKG_VERSION"),
            restored_at: &restored_at,
        },
    );
    let restored = match result {
        Ok(value) => value,
        Err(error) => {
            let _ = remove_active_runtime_state(state);
            let _ = rollback_runtime_moves(&runtime_moves);
            restart_coordinator_during_maintenance(&mut coordinator_guard, state)?;
            drop(maintenance);
            return Err(error.into());
        }
    };
    let _ = fs::remove_dir_all(&runtime_rollback);
    let _ = restart_coordinator_during_maintenance(&mut coordinator_guard, state);
    drop(coordinator_guard);
    drop(maintenance);
    Ok(DataResetRestoreResult {
        recovery: recovery.info,
        safety_backup_file_name: restored.safety_backup_file_name,
        restart_required: true,
    })
}

async fn stop_all_agents(state: &AppState) -> Result<(), CommandError> {
    let controls = state
        .active_agent_runs
        .lock()
        .map_err(|_| CommandError::state_unavailable())?
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for control in controls {
        control.cancel();
    }
    state
        .harness
        .stop()
        .await
        .map_err(|message| command_error("agent_stop_failed", message))?;
    state.codex.stop().await;
    for _ in 0..50 {
        if state
            .active_agent_runs
            .lock()
            .map_err(|_| CommandError::state_unavailable())?
            .is_empty()
        {
            return Ok(());
        }
        sleep(Duration::from_millis(100)).await;
    }
    Err(command_error(
        "agent_stop_failed",
        "正在运行的 Agent 任务未能安全停止，已取消数据操作",
    ))
}

fn drain_existing_connections(path: &Path) -> Result<(), RepositoryError> {
    let connection = database::open_for_maintenance(path)?;
    connection.execute_batch("BEGIN EXCLUSIVE; COMMIT; PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

fn restart_coordinator_during_maintenance(
    guard: &mut Option<IngredientIngestCoordinator>,
    state: &AppState,
) -> Result<(), CommandError> {
    let repository = IngredientRepository::open_for_maintenance(&state.database_path)?;
    *guard = Some(IngredientIngestCoordinator::from_repository(
        repository,
        &state.attachment_root,
    )?);
    Ok(())
}

fn read_counts_and_fingerprint(
    database_path: &Path,
) -> Result<(DataResetCounts, String), CommandError> {
    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(RepositoryError::from)?;
    let mut counts = DataResetCounts {
        material_groups: count_table(&connection, "material_groups")?,
        ingredient_variants: count_table(&connection, "ingredient_variants")?,
        recipes: count_table(&connection, "recipes")?,
        nutrition_labels: count_table(&connection, "nutrition_labels")?,
        research_reports: count_table(&connection, "research_reports")?,
        import_drafts: count_table(&connection, "ingredient_import_drafts")?,
        agent_tasks: count_table(&connection, "agent_v2_tasks")?
            + count_table(&connection, "agent_runs")?,
        agent_conversations: count_table(&connection, "agent_conversations")?,
        attachments: count_table(&connection, "source_attachments")?,
        total_records: 0,
    };
    let tables = connection
        .prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )
        .map_err(RepositoryError::from)?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(RepositoryError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(RepositoryError::from)?
        .into_iter()
        .filter(|table| {
            !matches!(
                table.as_str(),
                "schema_migrations"
                    | "nutrient_definitions"
                    | "app_settings"
                    | "agent_provider_configs"
            )
        })
        .collect::<Vec<_>>();
    let mut fingerprint_rows = Vec::with_capacity(tables.len());
    for table in tables {
        let count = count_table(&connection, &table)?;
        counts.total_records += count;
        fingerprint_rows.push((table.clone(), count, max_timestamp(&connection, &table)?));
    }
    let value =
        serde_json::to_vec(&(counts.clone(), fingerprint_rows)).map_err(RepositoryError::from)?;
    Ok((counts, hex::encode(Sha256::digest(value))))
}

fn count_table(connection: &Connection, table: &str) -> Result<u64, CommandError> {
    if !table_exists(connection, table)? {
        return Ok(0);
    }
    let sql = format!("SELECT COUNT(*) FROM {}", quote_identifier(table));
    let count = connection
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(RepositoryError::from)?;
    u64::try_from(count).map_err(|_| command_error("storage_failure", "数据统计无效"))
}

fn max_timestamp(connection: &Connection, table: &str) -> Result<String, CommandError> {
    if !table_exists(connection, table)? {
        return Ok(String::new());
    }
    let columns = connection
        .prepare(&format!("PRAGMA table_info({})", quote_identifier(table)))
        .map_err(RepositoryError::from)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(RepositoryError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(RepositoryError::from)?;
    let column = if columns.iter().any(|value| value == "updated_at") {
        "updated_at"
    } else if columns.iter().any(|value| value == "created_at") {
        "created_at"
    } else {
        return Ok(String::new());
    };
    let sql = format!(
        "SELECT COALESCE(MAX({}), '') FROM {}",
        quote_identifier(column),
        quote_identifier(table)
    );
    connection
        .query_row(&sql, [], |row| row.get(0))
        .map_err(RepositoryError::from)
        .map_err(Into::into)
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, CommandError> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(RepositoryError::from)
        .map_err(Into::into)
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn create_fresh_database_preserving_settings(
    old_database: &Path,
    staged_database: &Path,
) -> Result<(), RepositoryError> {
    let mut connection = database::open_for_maintenance(staged_database)?;
    migrations::apply(&mut connection, &Utc::now().to_rfc3339())?;
    let old_database = old_database
        .to_str()
        .ok_or_else(|| RepositoryError::domain("invalid_state", "数据库路径无效"))?;
    connection.execute("ATTACH DATABASE ?1 AS olddb", params![old_database])?;
    let result = connection.execute_batch(
        "BEGIN IMMEDIATE;
         DELETE FROM app_settings;
         INSERT INTO app_settings SELECT * FROM olddb.app_settings;
         DELETE FROM agent_provider_configs;
         INSERT INTO agent_provider_configs SELECT * FROM olddb.agent_provider_configs;
         COMMIT;",
    );
    if result.is_err() {
        let _ = connection.execute_batch("ROLLBACK;");
    }
    result?;
    connection.execute_batch("DETACH DATABASE olddb; PRAGMA wal_checkpoint(TRUNCATE);")?;
    drop(connection);
    File::open(staged_database)
        .map_err(RepositoryError::io)?
        .sync_all()
        .map_err(RepositoryError::io)
}

fn create_reset_snapshot(state: &AppState) -> Result<ResetRecoveryInfo, RepositoryError> {
    let recovery_root = recovery_root(state)?;
    fs::create_dir_all(&recovery_root).map_err(RepositoryError::io)?;
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let directory_name = format!("before-clear-{}-{id}", Utc::now().format("%Y%m%dT%H%M%SZ"));
    let staging = recovery_root.join(format!(".{directory_name}.staging"));
    let final_root = recovery_root.join(&directory_name);
    fs::create_dir(&staging).map_err(RepositoryError::io)?;
    let result = (|| {
        let backup_path = staging.join("data.foodrd-backup");
        create_offline_backup(
            BackupSource {
                database_path: &state.database_path,
                attachment_root: &state.attachment_root,
                application_version: env!("CARGO_PKG_VERSION"),
                created_at: &created_at,
            },
            &backup_path,
        )?;
        preflight_offline_backup(&backup_path)?;
        let mut runtime_items = Vec::new();
        let mut runtime_files = Vec::new();
        snapshot_runtime_area(
            "harness",
            state.harness.home(),
            HARNESS_RUNTIME_ITEMS,
            &staging.join("agent-state/harness"),
            &mut runtime_items,
            &mut runtime_files,
        )?;
        snapshot_runtime_area(
            "codex",
            state.codex.home(),
            CODEX_RUNTIME_ITEMS,
            &staging.join("agent-state/codex"),
            &mut runtime_items,
            &mut runtime_files,
        )?;
        let manifest = ResetSnapshotManifest {
            version: SNAPSHOT_VERSION,
            id: id.clone(),
            created_at: created_at.clone(),
            application_version: env!("CARGO_PKG_VERSION").into(),
            data_backup_sha256: sha256_file(&backup_path)?,
            runtime_items,
            runtime_files,
        };
        fs::write(
            staging.join("reset-manifest.json"),
            serde_json::to_vec_pretty(&manifest)?,
        )
        .map_err(RepositoryError::io)?;
        verify_recovery_directory(&staging)?;
        fs::rename(&staging, &final_root).map_err(RepositoryError::io)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result?;
    Ok(ResetRecoveryInfo {
        id,
        created_at,
        directory_name,
    })
}

fn snapshot_runtime_area(
    area: &str,
    source_root: &Path,
    allowed_items: &[&str],
    destination_root: &Path,
    items: &mut Vec<RuntimeSnapshotItem>,
    files: &mut Vec<RuntimeFileEntry>,
) -> Result<(), RepositoryError> {
    for relative in allowed_items {
        let source = source_root.join(relative);
        let Ok(metadata) = fs::symlink_metadata(&source) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            return Err(RepositoryError::domain(
                "invalid_state",
                "Agent 运行状态包含不安全的符号链接",
            ));
        }
        items.push(RuntimeSnapshotItem {
            area: area.into(),
            relative_path: (*relative).into(),
            directory: metadata.is_dir(),
        });
        copy_runtime_tree(
            area,
            &source,
            &destination_root.join(relative),
            Path::new(relative),
            files,
        )?;
    }
    Ok(())
}

fn copy_runtime_tree(
    area: &str,
    source: &Path,
    destination: &Path,
    relative: &Path,
    files: &mut Vec<RuntimeFileEntry>,
) -> Result<(), RepositoryError> {
    let metadata = fs::symlink_metadata(source).map_err(RepositoryError::io)?;
    if metadata.file_type().is_symlink() {
        return Err(RepositoryError::domain(
            "invalid_state",
            "Agent 运行状态包含不安全的符号链接",
        ));
    }
    if metadata.is_dir() {
        fs::create_dir_all(destination).map_err(RepositoryError::io)?;
        let mut entries = fs::read_dir(source)
            .map_err(RepositoryError::io)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(RepositoryError::io)?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            copy_runtime_tree(
                area,
                &entry.path(),
                &destination.join(entry.file_name()),
                &relative.join(entry.file_name()),
                files,
            )?;
        }
        return Ok(());
    }
    if !metadata.is_file() {
        return Err(RepositoryError::domain(
            "invalid_state",
            "Agent 运行状态包含不支持的文件类型",
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(RepositoryError::io)?;
    }
    fs::copy(source, destination).map_err(RepositoryError::io)?;
    files.push(RuntimeFileEntry {
        area: area.into(),
        relative_path: portable_path(relative)?,
        byte_size: metadata.len(),
        sha256: sha256_file(destination)?,
    });
    Ok(())
}

fn latest_verified_recovery(root: &Path) -> Result<Option<VerifiedRecovery>, RepositoryError> {
    if !root.exists() {
        return Ok(None);
    }
    let mut candidates = fs::read_dir(root)
        .map_err(RepositoryError::io)?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with("before-clear-") && !name.starts_with('.'))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|entry| entry.file_name());
    candidates.reverse();
    for entry in candidates {
        if let Ok(recovery) = verify_recovery_directory(&entry.path()) {
            return Ok(Some(recovery));
        }
    }
    Ok(None)
}

fn verify_recovery_directory(root: &Path) -> Result<VerifiedRecovery, RepositoryError> {
    let manifest: ResetSnapshotManifest = serde_json::from_slice(
        &fs::read(root.join("reset-manifest.json")).map_err(RepositoryError::io)?,
    )?;
    if manifest.version != SNAPSHOT_VERSION
        || manifest.id.trim().is_empty()
        || manifest.application_version.trim().is_empty()
    {
        return Err(RepositoryError::domain(
            "invalid_backup",
            "清空前安全快照清单无效",
        ));
    }
    let backup_path = root.join("data.foodrd-backup");
    if sha256_file(&backup_path)? != manifest.data_backup_sha256 {
        return Err(RepositoryError::domain(
            "invalid_backup",
            "清空前数据库快照校验失败",
        ));
    }
    preflight_offline_backup(&backup_path)?;
    for file in &manifest.runtime_files {
        validate_runtime_item(&file.area, &file.relative_path)?;
        let path = root
            .join("agent-state")
            .join(&file.area)
            .join(&file.relative_path);
        let metadata = fs::symlink_metadata(&path).map_err(RepositoryError::io)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() != file.byte_size
            || sha256_file(&path)? != file.sha256
        {
            return Err(RepositoryError::domain(
                "invalid_backup",
                "清空前 Agent 会话快照校验失败",
            ));
        }
    }
    let directory_name = root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| RepositoryError::domain("invalid_backup", "安全快照路径无效"))?
        .to_string();
    Ok(VerifiedRecovery {
        info: ResetRecoveryInfo {
            id: manifest.id.clone(),
            created_at: manifest.created_at.clone(),
            directory_name,
        },
        root: root.to_path_buf(),
        manifest,
    })
}

fn move_runtime_state_to_rollback(
    state: &AppState,
    rollback_root: &Path,
) -> Result<Vec<RuntimeMove>, RepositoryError> {
    let mut moves = Vec::new();
    let result = (|| {
        move_runtime_area(
            "harness",
            state.harness.home(),
            HARNESS_RUNTIME_ITEMS,
            rollback_root,
            &mut moves,
        )?;
        move_runtime_area(
            "codex",
            state.codex.home(),
            CODEX_RUNTIME_ITEMS,
            rollback_root,
            &mut moves,
        )
    })();
    if let Err(error) = result {
        let _ = rollback_runtime_moves(&moves);
        return Err(error);
    }
    Ok(moves)
}

fn move_runtime_area(
    area: &str,
    root: &Path,
    items: &[&str],
    rollback_root: &Path,
    moves: &mut Vec<RuntimeMove>,
) -> Result<(), RepositoryError> {
    for relative in items {
        let source = root.join(relative);
        if !source.exists() {
            continue;
        }
        let metadata = fs::symlink_metadata(&source).map_err(RepositoryError::io)?;
        if metadata.file_type().is_symlink() {
            return Err(RepositoryError::domain(
                "invalid_state",
                "Agent 运行状态包含不安全的符号链接",
            ));
        }
        let rollback = rollback_root.join(area).join(relative);
        if let Some(parent) = rollback.parent() {
            fs::create_dir_all(parent).map_err(RepositoryError::io)?;
        }
        fs::rename(&source, &rollback).map_err(RepositoryError::io)?;
        moves.push(RuntimeMove { source, rollback });
    }
    Ok(())
}

fn rollback_runtime_moves(moves: &[RuntimeMove]) -> Result<(), RepositoryError> {
    for item in moves.iter().rev() {
        if item.source.exists() {
            remove_path(&item.source)?;
        }
        if let Some(parent) = item.source.parent() {
            fs::create_dir_all(parent).map_err(RepositoryError::io)?;
        }
        fs::rename(&item.rollback, &item.source).map_err(RepositoryError::io)?;
    }
    Ok(())
}

fn restore_runtime_snapshot(
    state: &AppState,
    recovery: &VerifiedRecovery,
) -> Result<(), RepositoryError> {
    for item in &recovery.manifest.runtime_items {
        validate_runtime_item(&item.area, &item.relative_path)?;
        let root = match item.area.as_str() {
            "harness" => state.harness.home(),
            "codex" => state.codex.home(),
            _ => unreachable!(),
        };
        let source = recovery
            .root
            .join("agent-state")
            .join(&item.area)
            .join(&item.relative_path);
        let destination = root.join(&item.relative_path);
        let mut ignored = Vec::new();
        copy_runtime_tree(
            &item.area,
            &source,
            &destination,
            Path::new(&item.relative_path),
            &mut ignored,
        )?;
    }
    Ok(())
}

fn remove_active_runtime_state(state: &AppState) -> Result<(), RepositoryError> {
    for (root, items) in [
        (state.harness.home(), HARNESS_RUNTIME_ITEMS),
        (state.codex.home(), CODEX_RUNTIME_ITEMS),
    ] {
        for relative in items {
            let path = root.join(relative);
            if path.exists() {
                remove_path(&path)?;
            }
        }
    }
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), RepositoryError> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(RepositoryError::io)
    } else {
        fs::remove_file(path).map_err(RepositoryError::io)
    }
}

fn validate_runtime_item(area: &str, relative: &str) -> Result<(), RepositoryError> {
    let path = Path::new(relative);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(RepositoryError::domain(
            "invalid_backup",
            "Agent 会话快照路径无效",
        ));
    }
    let allowed = match area {
        "harness" => HARNESS_RUNTIME_ITEMS,
        "codex" => CODEX_RUNTIME_ITEMS,
        _ => {
            return Err(RepositoryError::domain(
                "invalid_backup",
                "Agent 会话快照区域无效",
            ));
        }
    };
    if allowed
        .iter()
        .any(|item| relative == *item || relative.starts_with(&format!("{item}/")))
    {
        Ok(())
    } else {
        Err(RepositoryError::domain(
            "invalid_backup",
            "Agent 会话快照路径无效",
        ))
    }
}

fn portable_path(path: &Path) -> Result<String, RepositoryError> {
    let parts = path
        .components()
        .map(|component| {
            component
                .as_os_str()
                .to_str()
                .map(str::to_string)
                .ok_or_else(|| RepositoryError::domain("invalid_state", "运行状态路径无效"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(parts.join("/"))
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

fn recovery_root(state: &AppState) -> Result<PathBuf, RepositoryError> {
    Ok(data_parent(state)?.join("recovery-backups"))
}

fn data_parent(state: &AppState) -> Result<&Path, RepositoryError> {
    state
        .database_path
        .parent()
        .ok_or_else(|| RepositoryError::domain("invalid_state", "应用数据目录不可用"))
}

fn command_error(code: impl Into<String>, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        field: None,
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn test_state(root: &Path) -> AppState {
        let database_path = root.join("food-rd.sqlite3");
        let attachments = root.join("attachments");
        let coordinator = IngredientIngestCoordinator::open(&database_path, &attachments).unwrap();
        AppState::new(coordinator, database_path, attachments)
    }

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "food-rd-data-reset-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[tokio::test]
    async fn reset_preserves_settings_and_can_restore_the_verified_snapshot() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let state = test_state(&root);
        {
            let mut coordinator = state.coordinator.lock().unwrap();
            let repository = coordinator.as_mut().unwrap().ingredients_mut();
            repository.create_category("待恢复分类").unwrap();
            repository
                .set_setting("appearance", &serde_json::json!({"theme":"dark"}))
                .unwrap();
        }
        let preview = preview_data_reset_inner(&state).unwrap();
        let result = execute_data_reset_inner(
            DataResetExecuteRequest {
                preview_id: preview.preview_id,
                confirmation_phrase: CONFIRMATION_PHRASE.into(),
                allow_without_backup: false,
                no_backup_confirmation_phrase: None,
            },
            &state,
        )
        .await
        .unwrap();
        assert!(result.recovery.is_some());
        let repository = IngredientRepository::open(&state.database_path).unwrap();
        assert!(repository.list_categories().unwrap().is_empty());
        assert_eq!(
            repository.get_setting("appearance").unwrap(),
            Some(serde_json::json!({"theme":"dark"}))
        );
        drop(repository);

        restore_latest_data_reset_recovery_inner(true, &state)
            .await
            .unwrap();
        let repository = IngredientRepository::open(&state.database_path).unwrap();
        assert_eq!(repository.list_categories().unwrap()[0].name, "待恢复分类");
        assert_eq!(
            repository.get_setting("appearance").unwrap(),
            Some(serde_json::json!({"theme":"dark"}))
        );
        drop(repository);
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }
}
