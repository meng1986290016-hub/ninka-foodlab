use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{database, ingredients::repository::RepositoryError};

use super::model::{LegacyResetCount, LegacyResetPreview, LegacyResetResult};

const CONFIRMATION_PHRASE: &str = "永久重置旧 Agent 测试数据";

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct LegacyAgentReset {
    connection: Connection,
    attachment_root: PathBuf,
    clock: Clock,
    create_id: IdGenerator,
}

impl LegacyAgentReset {
    pub fn open(database_path: &Path, attachment_root: PathBuf) -> Result<Self, RepositoryError> {
        Ok(Self {
            connection: database::open(database_path)?,
            attachment_root,
            clock: Arc::new(|| Utc::now().to_rfc3339()),
            create_id: Arc::new(|| Uuid::new_v4().to_string()),
        })
    }

    #[cfg(test)]
    fn in_memory<C, I>(
        attachment_root: PathBuf,
        clock: C,
        create_id: I,
    ) -> Result<Self, RepositoryError>
    where
        C: Fn() -> String + Send + Sync + 'static,
        I: Fn() -> String + Send + Sync + 'static,
    {
        let mut connection = database::open_in_memory()?;
        crate::database::migrations::apply(&mut connection, "2026-08-20T00:00:00Z")?;
        Ok(Self {
            connection,
            attachment_root,
            clock: Arc::new(clock),
            create_id: Arc::new(create_id),
        })
    }

    pub fn preview(&mut self) -> Result<LegacyResetPreview, RepositoryError> {
        let preview_id = (self.create_id)();
        let preview = self.build_preview(preview_id.clone())?;
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_legacy_reset_audits (
               id, preview_json, confirmation_token_hash, status, error_summary, created_at, completed_at
             ) VALUES (?1, ?2, ?3, 'previewed', NULL, ?4, NULL)",
            params![
                preview_id,
                serde_json::to_string(&preview)?,
                confirmation_hash(&preview.preview_id),
                now,
            ],
        )?;
        Ok(preview)
    }

    pub fn execute(
        &mut self,
        preview_id: &str,
        confirmation_phrase: &str,
    ) -> Result<LegacyResetResult, RepositoryError> {
        if confirmation_phrase != CONFIRMATION_PHRASE {
            return Err(RepositoryError::domain(
                "confirmation_required",
                "确认短语不匹配，未删除任何数据",
            ));
        }
        let stored: Option<(String, String, String)> = self
            .connection
            .query_row(
                "SELECT preview_json, confirmation_token_hash, status
             FROM agent_legacy_reset_audits WHERE id = ?1",
                [preview_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((preview_json, token_hash, status)) = stored else {
            return Err(RepositoryError::domain("not_found", "重置预检记录不存在"));
        };
        if status != "previewed" || token_hash != confirmation_hash(preview_id) {
            return Err(RepositoryError::domain("invalid_state", "重置预检已失效"));
        }
        let stored_preview: LegacyResetPreview = serde_json::from_str(&preview_json)?;
        let current_preview = self.build_preview(preview_id.to_string())?;
        if comparable_preview(&stored_preview) != comparable_preview(&current_preview) {
            return Err(RepositoryError::domain(
                "preview_stale",
                "旧 Agent 数据已在预检后发生变化，请重新预检",
            ));
        }
        if !current_preview.conflicts.is_empty() {
            return Err(RepositoryError::domain(
                "delete_conflict",
                "发现无法证明属于旧 Agent 的引用，已中止清理",
            ));
        }

        let provider_accounts = current_preview.keychain_accounts.clone();
        let file_paths = current_preview.file_paths.clone();
        let transaction = self.connection.transaction()?;
        let agent_recipe_ids = query_strings(
            &transaction,
            "SELECT DISTINCT accepted_recipe_id FROM agent_recipe_proposals
             WHERE accepted_recipe_id IS NOT NULL",
        )?;
        let imported_variant_ids = query_strings(
            &transaction,
            "SELECT DISTINCT draft.imported_variant_id
             FROM ingredient_import_drafts draft
             JOIN ingredient_import_jobs job ON job.id = draft.job_id
             WHERE job.source_kind = 'agent' AND draft.imported_variant_id IS NOT NULL",
        )?;
        let attachment_ids = query_strings(
            &transaction,
            "SELECT DISTINCT attachment_id FROM ingredient_import_job_attachments attachment
             JOIN ingredient_import_jobs job ON job.id = attachment.job_id
             WHERE job.source_kind = 'agent'",
        )?;

        let mut deleted_records = 0_u64;
        deleted_records += transaction.execute(
            "DELETE FROM material_needs WHERE proposal_id IN (SELECT id FROM agent_recipe_proposals)",
            [],
        )? as u64;
        deleted_records += transaction.execute("DELETE FROM agent_recipe_proposals", [])? as u64;

        for recipe_id in &agent_recipe_ids {
            deleted_records += transaction.execute(
                "DELETE FROM nutrition_labels WHERE recipe_id = ?1",
                [recipe_id],
            )? as u64;
            deleted_records += transaction.execute(
                "DELETE FROM recipe_drafts WHERE recipe_id = ?1 AND source = 'agent'",
                [recipe_id],
            )? as u64;
            deleted_records +=
                transaction.execute("DELETE FROM recipes WHERE id = ?1", [recipe_id])? as u64;
        }
        for variant_id in &imported_variant_ids {
            deleted_records += transaction.execute(
                "DELETE FROM ingredient_variants WHERE id = ?1",
                [variant_id],
            )? as u64;
        }
        deleted_records += transaction.execute(
            "DELETE FROM ingredient_import_jobs WHERE source_kind = 'agent'",
            [],
        )? as u64;
        deleted_records += transaction.execute("DELETE FROM agent_conversations", [])? as u64;
        deleted_records += transaction.execute("DELETE FROM agent_provider_configs", [])? as u64;

        for attachment_id in &attachment_ids {
            deleted_records += transaction.execute(
                "DELETE FROM source_attachments
                 WHERE id = ?1
                   AND NOT EXISTS (SELECT 1 FROM ingredient_import_job_attachments WHERE attachment_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM import_draft_attachments WHERE attachment_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM import_draft_source_links WHERE attachment_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM ingredient_variant_attachments WHERE attachment_id = ?1)",
                [attachment_id],
            )? as u64;
        }
        transaction.execute(
            "UPDATE agent_legacy_reset_audits
             SET status = 'completed', completed_at = ?1 WHERE id = ?2",
            params![(self.clock)(), preview_id],
        )?;
        transaction.commit()?;

        let mut deleted_files = 0_u64;
        let mut cleanup_failures = Vec::new();
        for path in file_paths {
            let absolute = PathBuf::from(&path);
            if !absolute.starts_with(&self.attachment_root) {
                cleanup_failures.push(format!("跳过非附件目录文件：{path}"));
                continue;
            }
            match fs::remove_file(&absolute) {
                Ok(()) => deleted_files += 1,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => cleanup_failures.push(format!("{path}：{error}")),
            }
        }

        Ok(LegacyResetResult {
            preview_id: preview_id.into(),
            deleted_records,
            deleted_files,
            // The command layer clears these after the database transaction.
            cleared_keychain_accounts: provider_accounts.len() as u64,
            cleanup_failures,
        })
    }

    pub fn stored_preview(&self, preview_id: &str) -> Result<LegacyResetPreview, RepositoryError> {
        let json = self
            .connection
            .query_row(
                "SELECT preview_json FROM agent_legacy_reset_audits WHERE id = ?1",
                [preview_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| RepositoryError::domain("not_found", "重置预检记录不存在"))?;
        Ok(serde_json::from_str(&json)?)
    }

    fn build_preview(&self, preview_id: String) -> Result<LegacyResetPreview, RepositoryError> {
        let counts = [
            ("provider_configs", "SELECT COUNT(*) FROM agent_provider_configs"),
            ("conversations", "SELECT COUNT(*) FROM agent_conversations"),
            ("runs", "SELECT COUNT(*) FROM agent_runs"),
            ("messages", "SELECT COUNT(*) FROM agent_messages"),
            ("tool_calls", "SELECT COUNT(*) FROM agent_tool_calls"),
            ("ingredient_import_jobs", "SELECT COUNT(*) FROM ingredient_import_jobs WHERE source_kind = 'agent'"),
            ("ingredient_import_drafts", "SELECT COUNT(*) FROM ingredient_import_drafts WHERE job_id IN (SELECT id FROM ingredient_import_jobs WHERE source_kind = 'agent')"),
            ("recipe_proposals", "SELECT COUNT(*) FROM agent_recipe_proposals"),
            ("estimate_cards", "SELECT COUNT(*) FROM agent_recipe_estimate_cards"),
            ("material_needs", "SELECT COUNT(*) FROM material_needs WHERE proposal_id IN (SELECT id FROM agent_recipe_proposals)"),
        ].into_iter().map(|(kind, sql)| {
            Ok(LegacyResetCount { kind: kind.into(), count: count(&self.connection, sql)? })
        }).collect::<Result<Vec<_>, RepositoryError>>()?;

        let keychain_accounts = query_strings(
            &self.connection,
            "SELECT id FROM agent_provider_configs ORDER BY id",
        )?
        .into_iter()
        .map(|id| format!("agent/{id}"))
        .collect();
        let relative_paths = query_strings(
            &self.connection,
            "SELECT DISTINCT source.relative_path
             FROM source_attachments source
             JOIN ingredient_import_job_attachments link ON link.attachment_id = source.id
             JOIN ingredient_import_jobs job ON job.id = link.job_id
             WHERE job.source_kind = 'agent'
               AND NOT EXISTS (
                 SELECT 1 FROM ingredient_import_job_attachments other
                 JOIN ingredient_import_jobs other_job ON other_job.id = other.job_id
                 WHERE other.attachment_id = source.id AND other_job.source_kind <> 'agent'
               )
             ORDER BY source.relative_path",
        )?;
        let file_paths = relative_paths
            .into_iter()
            .map(|path| {
                self.attachment_root
                    .join(path)
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        let agent_recipe_ids = query_strings(
            &self.connection,
            "SELECT DISTINCT accepted_recipe_id FROM agent_recipe_proposals
             WHERE accepted_recipe_id IS NOT NULL",
        )?;
        let imported_variant_ids = query_strings(
            &self.connection,
            "SELECT DISTINCT draft.imported_variant_id
             FROM ingredient_import_drafts draft
             JOIN ingredient_import_jobs job ON job.id = draft.job_id
             WHERE job.source_kind = 'agent' AND draft.imported_variant_id IS NOT NULL",
        )?;
        let mut conflicts = BTreeSet::new();
        conflicts.insert(
            "Ninka Agent 私有工具仍使用旧 Agent 审计行作为过渡兼容层；完成新运行时验收并移除兼容层前禁止永久清理".to_string(),
        );
        for recipe_id in agent_recipe_ids {
            let source: Option<String> = self
                .connection
                .query_row(
                    "SELECT source FROM recipe_drafts WHERE recipe_id = ?1",
                    [&recipe_id],
                    |row| row.get(0),
                )
                .optional()?;
            if source.as_deref() != Some("agent") {
                conflicts.insert(format!("已采纳配方 {recipe_id} 不是可证明的 Agent 草稿"));
            }
            if count_with_id(
                &self.connection,
                "SELECT COUNT(*) FROM recipe_versions WHERE recipe_id = ?1",
                &recipe_id,
            )? > 0
            {
                conflicts.insert(format!("已采纳配方 {recipe_id} 已有不可变版本"));
            }
            if count_with_id(
                &self.connection,
                "SELECT COUNT(*) FROM material_needs WHERE recipe_id = ?1 AND proposal_id IS NULL",
                &recipe_id,
            )? > 0
            {
                conflicts.insert(format!("已采纳配方 {recipe_id} 被无法归属的材料需求引用"));
            }
        }
        for variant_id in imported_variant_ids {
            let references = count_with_id(
                &self.connection,
                "SELECT COUNT(DISTINCT recipe.id)
                 FROM recipe_drafts draft
                 JOIN recipes recipe ON recipe.id = draft.recipe_id
                 JOIN json_tree(draft.payload_json) node ON node.value = ?1",
                &variant_id,
            )?;
            if references > 0 {
                conflicts.insert(format!("Agent 导入原料 {variant_id} 已被配方草稿引用"));
            }
        }

        Ok(LegacyResetPreview {
            preview_id,
            counts,
            file_paths,
            keychain_accounts,
            can_execute: conflicts.is_empty(),
            conflicts: conflicts.into_iter().collect(),
            confirmation_phrase: CONFIRMATION_PHRASE.into(),
        })
    }
}

fn count(connection: &Connection, sql: &str) -> Result<u64, RepositoryError> {
    Ok(connection
        .query_row(sql, [], |row| row.get::<_, i64>(0))?
        .max(0) as u64)
}

fn count_with_id(connection: &Connection, sql: &str, id: &str) -> Result<u64, RepositoryError> {
    Ok(connection
        .query_row(sql, [id], |row| row.get::<_, i64>(0))?
        .max(0) as u64)
}

fn query_strings(connection: &Connection, sql: &str) -> Result<Vec<String>, RepositoryError> {
    let mut statement = connection.prepare(sql)?;
    Ok(statement
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?)
}

fn confirmation_hash(preview_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(preview_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(CONFIRMATION_PHRASE.as_bytes());
    hex::encode(hasher.finalize())
}

fn comparable_preview(preview: &LegacyResetPreview) -> String {
    serde_json::to_string(&(
        &preview.counts,
        &preview.file_paths,
        &preview.keychain_accounts,
        &preview.conflicts,
        preview.can_execute,
    ))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_requires_a_second_exact_confirmation() {
        let mut reset = LegacyAgentReset::in_memory(
            PathBuf::from("/tmp/foodlab-reset-test"),
            || "2026-08-20T00:00:00Z".into(),
            || "preview-1".into(),
        )
        .unwrap();
        let preview = reset.preview().unwrap();
        assert!(!preview.can_execute);
        assert!(
            preview
                .conflicts
                .iter()
                .any(|value| value.contains("兼容层"))
        );
        let error = reset.execute(&preview.preview_id, "确认").unwrap_err();
        assert_eq!(error.code(), "confirmation_required");
    }
}
