use std::{path::Path, sync::MutexGuard};

use chrono::Utc;
use tauri::State;

use crate::{
    backup::{
        archive::{BackupSource, create_offline_backup},
        model::{BackupManifest, BackupPreflight, BackupRestoreResult},
        restore::{RestoreTarget, preflight_offline_backup, restore_offline_backup},
    },
    ingest::coordinator::IngredientIngestCoordinator,
    ingredients::repository::RepositoryError,
};

use super::{AppState, CommandError};

#[tauri::command(rename_all = "camelCase")]
pub fn create_data_backup(
    destination_path: String,
    state: State<'_, AppState>,
) -> Result<BackupManifest, CommandError> {
    create_offline_backup(
        BackupSource {
            database_path: &state.database_path,
            attachment_root: &state.attachment_root,
            application_version: env!("CARGO_PKG_VERSION"),
            created_at: &Utc::now().to_rfc3339(),
        },
        Path::new(&destination_path),
    )
    .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn inspect_data_backup(
    source_path: String,
    _state: State<'_, AppState>,
) -> Result<BackupPreflight, CommandError> {
    preflight_offline_backup(Path::new(&source_path)).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn restore_data_backup(
    source_path: String,
    confirmed: bool,
    state: State<'_, AppState>,
) -> Result<BackupRestoreResult, CommandError> {
    restore_data_backup_inner(&source_path, confirmed, &state)
}

fn restore_data_backup_inner(
    source_path: &str,
    confirmed: bool,
    state: &AppState,
) -> Result<BackupRestoreResult, CommandError> {
    if !confirmed {
        return Err(domain("confirmation_required", "请先确认将用所选备份替换当前数据").into());
    }
    if !state
        .active_agent_runs
        .lock()
        .map_err(|_| CommandError::state_unavailable())?
        .is_empty()
    {
        return Err(domain("invalid_state", "请先停止正在运行的 Agent 任务再恢复数据").into());
    }
    let mut coordinator = state
        .coordinator
        .lock()
        .map_err(|_| CommandError::state_unavailable())?;
    let current = coordinator
        .take()
        .ok_or_else(CommandError::state_unavailable)?;
    drop(current);
    let restored_at = Utc::now().to_rfc3339();
    let safety_backup_directory = state
        .database_path
        .parent()
        .ok_or_else(CommandError::state_unavailable)?
        .join("recovery-backups");
    let result = restore_offline_backup(
        Path::new(source_path),
        RestoreTarget {
            database_path: &state.database_path,
            attachment_root: &state.attachment_root,
            safety_backup_directory: &safety_backup_directory,
            application_version: env!("CARGO_PKG_VERSION"),
            restored_at: &restored_at,
        },
    );
    let restart = restart_coordinator(&mut coordinator, state);
    match (result, restart) {
        (Ok(restored), Ok(())) => Ok(restored),
        (Ok(_), Err(_)) => Err(domain(
            "restore_completed_restart_required",
            "数据已恢复，但数据连接重新打开失败；请重新启动应用后核对数据",
        )
        .into()),
        (Err(error), Ok(())) => Err(error.into()),
        (Err(_), Err(error)) => Err(error),
    }
}

fn restart_coordinator(
    coordinator: &mut MutexGuard<'_, Option<IngredientIngestCoordinator>>,
    state: &AppState,
) -> Result<(), CommandError> {
    let reopened = IngredientIngestCoordinator::open(&state.database_path, &state.attachment_root)?;
    **coordinator = Some(reopened);
    Ok(())
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        backup::archive::{BackupSource, create_offline_backup},
        ingest::coordinator::IngredientIngestCoordinator,
        ingredients::repository::IngredientRepository,
    };

    use super::*;

    #[test]
    fn restore_requires_confirmation_and_reopens_the_shared_data_connection() {
        let root = std::env::temp_dir().join(format!(
            "food-rd-command-restore-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source_database = root.join("source.sqlite3");
        let source_attachments = root.join("source-attachments");
        let live_database = root.join("live.sqlite3");
        let live_attachments = root.join("live-attachments");
        let backup_path = root.join("selected.foodrd-backup");
        fs::create_dir_all(&source_attachments).unwrap();
        fs::create_dir_all(&live_attachments).unwrap();

        let mut source = IngredientRepository::open(&source_database).unwrap();
        source.create_category("备份中的分类").unwrap();
        drop(source);
        create_offline_backup(
            BackupSource {
                database_path: &source_database,
                attachment_root: &source_attachments,
                application_version: "0.1.0-test",
                created_at: "2026-07-31T16:30:00+08:00",
            },
            &backup_path,
        )
        .unwrap();

        let coordinator =
            IngredientIngestCoordinator::open(&live_database, &live_attachments).unwrap();
        let state = AppState::new(coordinator, live_database, live_attachments);
        state
            .coordinator
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .ingredients_mut()
            .create_category("恢复前分类")
            .unwrap();

        let error =
            restore_data_backup_inner(backup_path.to_str().unwrap(), false, &state).unwrap_err();
        assert_eq!(error.code, "confirmation_required");
        assert_eq!(
            state
                .coordinator
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .ingredients()
                .list_categories()
                .unwrap()[0]
                .name,
            "恢复前分类"
        );

        restore_data_backup_inner(backup_path.to_str().unwrap(), true, &state).unwrap();
        let categories = state
            .coordinator
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .ingredients()
            .list_categories()
            .unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].name, "备份中的分类");

        drop(state);
        fs::remove_dir_all(root).unwrap();
    }
}
