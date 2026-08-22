use std::{path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::model::{
    AgentDeliveryMode, AgentEngine, AgentModelRoute, AgentQueuedMessage, AgentQueuedMessageState,
    AgentRecipeReference, AgentTask, AgentTaskEvent, AgentTurn, ArtifactManifest, ArtifactStatus,
    FoodLabContentBlock, HarnessTaskListScope, TaskContract, TaskOutcome,
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct HarnessRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl HarnessRepository {
    pub fn open(path: &Path) -> Result<Self, RepositoryError> {
        Self::from_connection(
            database::open(path)?,
            Arc::new(|| Utc::now().to_rfc3339()),
            Arc::new(|| Uuid::new_v4().to_string()),
        )
    }

    pub fn open_in_memory_with<C, I>(clock: C, create_id: I) -> Result<Self, RepositoryError>
    where
        C: Fn() -> String + Send + Sync + 'static,
        I: Fn() -> String + Send + Sync + 'static,
    {
        Self::from_connection(
            database::open_in_memory()?,
            Arc::new(clock),
            Arc::new(create_id),
        )
    }

    fn from_connection(
        mut connection: Connection,
        clock: Clock,
        create_id: IdGenerator,
    ) -> Result<Self, RepositoryError> {
        migrations::apply(&mut connection, &clock())?;
        Ok(Self {
            connection,
            clock,
            create_id,
        })
    }

    pub fn create_task(
        &mut self,
        title: &str,
        contract: &TaskContract,
        active_recipe_id: Option<&str>,
        active_draft_fingerprint: Option<&str>,
    ) -> Result<AgentTask, RepositoryError> {
        let id = (self.create_id)();
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_v2_tasks (
               id, harness_session_id, title, workflow, status, task_contract_json,
               active_recipe_id, active_draft_fingerprint, last_event_seq,
               error_code, error_summary, created_at, updated_at
             ) VALUES (?1, NULL, ?2, ?3, 'running', ?4, ?5, ?6, -1, NULL, NULL, ?7, ?7)",
            params![
                id,
                normalized_title(title),
                contract.workflow,
                serde_json::to_string(contract)?,
                active_recipe_id,
                active_draft_fingerprint,
                now,
            ],
        )?;
        self.get_task(&id)
    }

    pub fn default_route(&self) -> Result<Option<AgentModelRoute>, RepositoryError> {
        self.connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'agent_v2_default_route'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|value| serde_json::from_str(&value).map_err(RepositoryError::from))
            .transpose()
    }

    pub fn save_default_route(&mut self, route: &AgentModelRoute) -> Result<(), RepositoryError> {
        self.connection.execute(
            "INSERT INTO app_settings (key, value_json, updated_at)
             VALUES ('agent_v2_default_route', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
            params![serde_json::to_string(route)?, (self.clock)()],
        )?;
        Ok(())
    }

    pub fn list_tasks(
        &self,
        scope: HarnessTaskListScope,
    ) -> Result<Vec<AgentTask>, RepositoryError> {
        let archived_filter = match scope {
            HarnessTaskListScope::Active => "archived_at IS NULL",
            HarnessTaskListScope::Archived => "archived_at IS NOT NULL",
        };
        let archived_order = match scope {
            HarnessTaskListScope::Active => "updated_at DESC, rowid DESC",
            HarnessTaskListScope::Archived => "archived_at DESC, rowid DESC",
        };
        let mut statement = self.connection.prepare(&format!(
            "SELECT id, harness_session_id, title, workflow, status, task_contract_json,
                    active_recipe_id, active_recipe_name, active_draft_fingerprint,
                    last_event_seq, error_code, error_summary,
                    active_engine, active_provider, active_model, active_reasoning_effort,
                    active_leaf_turn_id, queue_paused, archived_at, created_at, updated_at
             FROM agent_v2_tasks WHERE {archived_filter}
             ORDER BY {archived_order}"
        ))?;
        statement
            .query_map([], map_task_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(task_from_row)
            .collect()
    }

    pub fn get_task(&self, id: &str) -> Result<AgentTask, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, harness_session_id, title, workflow, status, task_contract_json,
                        active_recipe_id, active_recipe_name, active_draft_fingerprint,
                        last_event_seq, error_code, error_summary,
                        active_engine, active_provider, active_model, active_reasoning_effort,
                        active_leaf_turn_id, queue_paused, archived_at, created_at, updated_at
                 FROM agent_v2_tasks WHERE id = ?1",
                [id],
                map_task_row,
            )
            .optional()?
            .ok_or_else(|| RepositoryError::domain("not_found", "Agent 任务不存在"))?;
        task_from_row(row)
    }

    pub fn bind_harness_session(
        &mut self,
        task_id: &str,
        harness_session_id: &str,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        let now = (self.clock)();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "UPDATE agent_v2_tasks SET harness_session_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![harness_session_id, now, task_id],
        )?;
        transaction.execute(
            "INSERT INTO agent_runtime_sessions (
               conversation_id, engine, route_key, external_session_id,
               last_synced_turn_id, created_at, updated_at
             ) VALUES (?1, 'foodlab_runtime', 'default', ?2, NULL, ?3, ?3)
             ON CONFLICT(conversation_id, engine, route_key) DO UPDATE SET
               external_session_id = excluded.external_session_id,
               updated_at = excluded.updated_at",
            params![task_id, harness_session_id, now],
        )?;
        transaction.execute(
            "INSERT INTO agent_runtime_branch_sessions (
               conversation_id, branch_id, engine, external_session_id,
               last_synced_turn_id, created_at, updated_at
             ) VALUES (?1, 'root', 'foodlab_runtime', ?2, NULL, ?3, ?3)
             ON CONFLICT(conversation_id, branch_id, engine) DO UPDATE SET
               external_session_id = excluded.external_session_id,
               updated_at = excluded.updated_at",
            params![task_id, harness_session_id, now],
        )?;
        transaction.commit()?;
        self.get_task(task_id)
    }

    pub fn update_task_recipe_context(
        &mut self,
        task_id: &str,
        active_recipe_id: Option<&str>,
        active_recipe_name: Option<&str>,
        active_draft_fingerprint: Option<&str>,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks SET
               active_recipe_id = ?1,
               active_recipe_name = ?2,
               active_draft_fingerprint = ?3,
               updated_at = ?4
             WHERE id = ?5",
            params![
                active_recipe_id,
                active_recipe_name,
                active_draft_fingerprint,
                (self.clock)(),
                task_id
            ],
        )?;
        self.get_task(task_id)
    }

    pub fn clear_task_recipe_context(
        &mut self,
        task_id: &str,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks
             SET active_recipe_id = NULL, active_recipe_name = NULL,
                 active_draft_fingerprint = NULL, updated_at = ?1
             WHERE id = ?2",
            params![(self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    pub fn rename_task(
        &mut self,
        task_id: &str,
        title: &str,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![normalized_title(title), (self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    pub fn archive_task_and_interrupt_running(
        &mut self,
        task_id: &str,
    ) -> Result<AgentTask, RepositoryError> {
        let task = self.get_task(task_id)?;
        if task.archived_at.is_some() {
            return Ok(task);
        }
        let now = (self.clock)();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "UPDATE agent_v2_turns
             SET status = 'interrupted', updated_at = ?1
             WHERE task_id = ?2 AND status = 'running'",
            params![now, task_id],
        )?;
        transaction.execute(
            "UPDATE agent_v2_tasks
             SET status = CASE WHEN status = 'running' THEN 'interrupted' ELSE status END,
                 queue_paused = 1, archived_at = ?1, updated_at = ?1
             WHERE id = ?2",
            params![now, task_id],
        )?;
        transaction.commit()?;
        self.get_task(task_id)
    }

    pub fn interrupt_running_task(&mut self, task_id: &str) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        let now = (self.clock)();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "UPDATE agent_v2_turns
             SET status = 'interrupted', updated_at = ?1
             WHERE task_id = ?2 AND status = 'running'",
            params![now, task_id],
        )?;
        transaction.execute(
            "UPDATE agent_v2_tasks
             SET status = CASE WHEN status = 'running' THEN 'interrupted' ELSE status END,
                 queue_paused = 1, updated_at = ?1
             WHERE id = ?2",
            params![now, task_id],
        )?;
        transaction.commit()?;
        self.get_task(task_id)
    }

    pub fn restore_task(&mut self, task_id: &str) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks
             SET archived_at = NULL, queue_paused = 1, updated_at = ?1
             WHERE id = ?2",
            params![(self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    pub fn set_task_route(
        &mut self,
        task_id: &str,
        route: &AgentModelRoute,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks
             SET active_engine = ?1, active_provider = ?2, active_model = ?3,
                 active_reasoning_effort = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                route.engine.as_str(),
                route.provider,
                route.model,
                route.reasoning_effort,
                (self.clock)(),
                task_id,
            ],
        )?;
        self.get_task(task_id)
    }

    pub fn bind_runtime_session(
        &mut self,
        conversation_id: &str,
        route: &AgentModelRoute,
        external_session_id: &str,
        last_synced_turn_id: Option<&str>,
    ) -> Result<(), RepositoryError> {
        self.get_task(conversation_id)?;
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_runtime_sessions (
               conversation_id, engine, route_key, external_session_id,
               last_synced_turn_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(conversation_id, engine, route_key) DO UPDATE SET
               external_session_id = excluded.external_session_id,
               last_synced_turn_id = excluded.last_synced_turn_id,
               updated_at = excluded.updated_at",
            params![
                conversation_id,
                route.engine.as_str(),
                route_key(route),
                external_session_id,
                last_synced_turn_id,
                now,
            ],
        )?;
        Ok(())
    }

    pub fn runtime_session(
        &self,
        conversation_id: &str,
        route: &AgentModelRoute,
    ) -> Result<Option<(String, Option<String>)>, RepositoryError> {
        self.get_task(conversation_id)?;
        self.connection
            .query_row(
                "SELECT external_session_id, last_synced_turn_id
                 FROM agent_runtime_sessions
                 WHERE conversation_id = ?1 AND engine = ?2 AND route_key = ?3",
                params![conversation_id, route.engine.as_str(), route_key(route)],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn bind_branch_runtime_session(
        &mut self,
        conversation_id: &str,
        branch_id: &str,
        engine: AgentEngine,
        external_session_id: &str,
        last_synced_turn_id: Option<&str>,
    ) -> Result<(), RepositoryError> {
        self.get_task(conversation_id)?;
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_runtime_branch_sessions (
               conversation_id, branch_id, engine, external_session_id,
               last_synced_turn_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(conversation_id, branch_id, engine) DO UPDATE SET
               external_session_id = excluded.external_session_id,
               last_synced_turn_id = excluded.last_synced_turn_id,
               updated_at = excluded.updated_at",
            params![
                conversation_id,
                branch_id,
                engine.as_str(),
                external_session_id,
                last_synced_turn_id,
                now,
            ],
        )?;
        Ok(())
    }

    pub fn branch_runtime_session(
        &self,
        conversation_id: &str,
        branch_id: &str,
        engine: AgentEngine,
    ) -> Result<Option<(String, Option<String>)>, RepositoryError> {
        self.get_task(conversation_id)?;
        self.connection
            .query_row(
                "SELECT external_session_id, last_synced_turn_id
                 FROM agent_runtime_branch_sessions
                 WHERE conversation_id = ?1 AND branch_id = ?2 AND engine = ?3",
                params![conversation_id, branch_id, engine.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn bind_legacy_bridge(
        &mut self,
        task_id: &str,
        run_id: &str,
        import_job_id: &str,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks
             SET legacy_run_id = ?1, legacy_import_job_id = ?2, updated_at = ?3
             WHERE id = ?4",
            params![run_id, import_job_id, (self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    pub fn legacy_bridge(&self, task_id: &str) -> Result<(String, String), RepositoryError> {
        self.get_task(task_id)?;
        let (run_id, job_id) = self.connection.query_row(
            "SELECT legacy_run_id, legacy_import_job_id FROM agent_v2_tasks WHERE id = ?1",
            [task_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )?;
        match (run_id, job_id) {
            (Some(run_id), Some(job_id)) => Ok((run_id, job_id)),
            _ => Err(RepositoryError::domain(
                "invalid_state",
                "FoodLab 任务工具兼容层尚未就绪",
            )),
        }
    }

    pub fn legacy_attachment_ids(&self, task_id: &str) -> Result<Vec<String>, RepositoryError> {
        let (_, job_id) = self.legacy_bridge(task_id)?;
        let mut statement = self.connection.prepare(
            "SELECT attachment_id FROM ingredient_import_job_attachments
             WHERE job_id = ?1 ORDER BY position, attachment_id",
        )?;
        Ok(statement
            .query_map([job_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?)
    }

    pub fn legacy_tool_statuses(
        &self,
        task_id: &str,
    ) -> Result<Vec<(String, String)>, RepositoryError> {
        self.get_task(task_id)?;
        let run_id = self.connection.query_row(
            "SELECT legacy_run_id FROM agent_v2_tasks WHERE id = ?1",
            [task_id],
            |row| row.get::<_, Option<String>>(0),
        )?;
        let Some(run_id) = run_id else {
            return Ok(Vec::new());
        };
        let mut statement = self.connection.prepare(
            "SELECT tool_name, status FROM agent_tool_calls
             WHERE run_id = ?1 ORDER BY started_at, rowid",
        )?;
        Ok(statement
            .query_map([run_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?)
    }

    pub fn update_task_outcome(
        &mut self,
        task_id: &str,
        status: TaskOutcome,
        error_code: Option<&str>,
        error_summary: Option<&str>,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks
             SET status = ?1, error_code = ?2, error_summary = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                status.as_str(),
                error_code,
                error_summary,
                (self.clock)(),
                task_id,
            ],
        )?;
        self.get_task(task_id)
    }

    pub fn create_turn(
        &mut self,
        task_id: &str,
        parent_turn_id: Option<&str>,
        user_content: &str,
    ) -> Result<AgentTurn, RepositoryError> {
        let task = self.get_task(task_id)?;
        if let Some(parent) = parent_turn_id {
            let belongs = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_v2_turns WHERE id = ?1 AND task_id = ?2)",
                params![parent, task_id],
                |row| row.get::<_, bool>(0),
            )?;
            if !belongs {
                return Err(RepositoryError::domain(
                    "invalid_input",
                    "继续的 Turn 不属于当前任务",
                ));
            }
        }
        let branch_id = parent_turn_id
            .map(|parent| self.get_turn(parent).map(|turn| turn.branch_id))
            .transpose()?
            .unwrap_or_else(|| "root".into());
        self.create_turn_with_snapshot(
            task_id,
            parent_turn_id,
            user_content,
            &task.active_route,
            &branch_id,
            task.active_recipe_id.as_deref(),
            task.active_recipe_name.as_deref(),
            task.active_draft_fingerprint.as_deref(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_turn_with_snapshot(
        &mut self,
        task_id: &str,
        parent_turn_id: Option<&str>,
        user_content: &str,
        route: &AgentModelRoute,
        branch_id: &str,
        recipe_id: Option<&str>,
        recipe_name: Option<&str>,
        draft_fingerprint: Option<&str>,
    ) -> Result<AgentTurn, RepositoryError> {
        self.get_task(task_id)?;
        if user_content.trim().is_empty() {
            return Err(RepositoryError::domain("invalid_input", "消息内容不能为空"));
        }
        if let Some(parent) = parent_turn_id {
            let belongs = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_v2_turns WHERE id = ?1 AND task_id = ?2)",
                params![parent, task_id],
                |row| row.get::<_, bool>(0),
            )?;
            if !belongs {
                return Err(RepositoryError::domain(
                    "invalid_input",
                    "继续的 Turn 不属于当前任务",
                ));
            }
        }
        let id = (self.create_id)();
        let now = (self.clock)();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO agent_v2_turns (
               id, task_id, harness_turn_id, parent_turn_id, status, user_content,
               content_blocks_json, engine, provider, model, reasoning_effort,
               branch_id, recipe_id, recipe_name, draft_fingerprint, created_at, updated_at
             ) VALUES (?1, ?2, NULL, ?3, 'running', ?4, '[]', ?5, ?6, ?7, ?8,
                       ?9, ?10, ?11, ?12, ?13, ?13)",
            params![
                id,
                task_id,
                parent_turn_id,
                user_content.trim(),
                route.engine.as_str(),
                route.provider,
                route.model,
                route.reasoning_effort,
                branch_id,
                recipe_id,
                recipe_name,
                draft_fingerprint,
                now,
            ],
        )?;
        transaction.execute(
            "UPDATE agent_v2_tasks
             SET active_leaf_turn_id = ?1, active_engine = ?2, active_provider = ?3,
                 active_model = ?4, active_reasoning_effort = ?5, updated_at = ?6
             WHERE id = ?7",
            params![
                id,
                route.engine.as_str(),
                route.provider,
                route.model,
                route.reasoning_effort,
                now,
                task_id,
            ],
        )?;
        transaction.commit()?;
        self.get_turn(&id)
    }

    pub fn get_turn(&self, id: &str) -> Result<AgentTurn, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, task_id, harness_turn_id, parent_turn_id, status, user_content,
                        content_blocks_json, engine, provider, model, reasoning_effort,
                        branch_id, recipe_id, recipe_name, draft_fingerprint,
                        created_at, updated_at
                 FROM agent_v2_turns WHERE id = ?1",
                [id],
                map_turn_row,
            )
            .optional()?
            .ok_or_else(|| RepositoryError::domain("not_found", "Agent Turn 不存在"))?;
        turn_from_row(row)
    }

    pub fn bind_harness_turn(
        &mut self,
        turn_id: &str,
        harness_turn_id: &str,
    ) -> Result<AgentTurn, RepositoryError> {
        self.get_turn(turn_id)?;
        self.connection.execute(
            "UPDATE agent_v2_turns SET harness_turn_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![harness_turn_id, (self.clock)(), turn_id],
        )?;
        self.get_turn(turn_id)
    }

    pub fn find_turn_by_harness_id(
        &self,
        task_id: &str,
        harness_turn_id: &str,
    ) -> Result<Option<AgentTurn>, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, task_id, harness_turn_id, parent_turn_id, status, user_content,
                        content_blocks_json, engine, provider, model, reasoning_effort,
                        branch_id, recipe_id, recipe_name, draft_fingerprint,
                        created_at, updated_at
                 FROM agent_v2_turns WHERE task_id = ?1 AND harness_turn_id = ?2",
                params![task_id, harness_turn_id],
                map_turn_row,
            )
            .optional()?;
        row.map(turn_from_row).transpose()
    }

    pub fn is_latest_turn(&self, task_id: &str, turn_id: &str) -> Result<bool, RepositoryError> {
        let latest = self
            .connection
            .query_row(
                "SELECT id FROM agent_v2_turns WHERE task_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1",
                [task_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(latest.as_deref() == Some(turn_id))
    }

    pub fn list_turns(&self, task_id: &str) -> Result<Vec<AgentTurn>, RepositoryError> {
        self.get_task(task_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, task_id, harness_turn_id, parent_turn_id, status, user_content,
                    content_blocks_json, engine, provider, model, reasoning_effort,
                    branch_id, recipe_id, recipe_name, draft_fingerprint,
                    created_at, updated_at
             FROM agent_v2_turns WHERE task_id = ?1 ORDER BY created_at, rowid",
        )?;
        statement
            .query_map([task_id], map_turn_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(turn_from_row)
            .collect()
    }

    pub fn list_active_turns(&self, task_id: &str) -> Result<Vec<AgentTurn>, RepositoryError> {
        let task = self.get_task(task_id)?;
        let all = self.list_turns(task_id)?;
        let Some(mut cursor) = task
            .active_leaf_turn_id
            .or_else(|| all.last().map(|turn| turn.id.clone()))
        else {
            return Ok(Vec::new());
        };
        let by_id = all
            .into_iter()
            .map(|turn| (turn.id.clone(), turn))
            .collect::<std::collections::HashMap<_, _>>();
        let mut lineage = Vec::new();
        while let Some(turn) = by_id.get(&cursor) {
            lineage.push(turn.clone());
            let Some(parent) = turn.parent_turn_id.as_ref() else {
                break;
            };
            cursor = parent.clone();
        }
        lineage.reverse();
        Ok(lineage)
    }

    pub fn select_visible_leaf(
        &mut self,
        task_id: &str,
        turn_id: &str,
    ) -> Result<AgentTask, RepositoryError> {
        let turn = self.get_turn(turn_id)?;
        if turn.task_id != task_id {
            return Err(RepositoryError::domain(
                "invalid_input",
                "选择的回答分支不属于当前会话",
            ));
        }
        self.connection.execute(
            "UPDATE agent_v2_tasks SET active_leaf_turn_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![turn_id, (self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    pub fn set_queue_paused(
        &mut self,
        task_id: &str,
        paused: bool,
    ) -> Result<AgentTask, RepositoryError> {
        self.get_task(task_id)?;
        self.connection.execute(
            "UPDATE agent_v2_tasks SET queue_paused = ?1, updated_at = ?2 WHERE id = ?3",
            params![paused, (self.clock)(), task_id],
        )?;
        self.get_task(task_id)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn enqueue_message(
        &mut self,
        task_id: &str,
        parent_turn_id: Option<&str>,
        branch_id: &str,
        content: &str,
        references: &[AgentRecipeReference],
        mode: AgentDeliveryMode,
        state: AgentQueuedMessageState,
        route: &AgentModelRoute,
        recipe_id: Option<&str>,
        recipe_name: Option<&str>,
        draft_fingerprint: Option<&str>,
    ) -> Result<AgentQueuedMessage, RepositoryError> {
        self.get_task(task_id)?;
        if content.trim().is_empty() {
            return Err(RepositoryError::domain("invalid_input", "消息内容不能为空"));
        }
        let id = (self.create_id)();
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_v2_queued_messages (
               id, conversation_id, parent_turn_id, branch_id, content, references_json,
               delivery_mode, state, engine, provider, model, reasoning_effort,
               recipe_id, recipe_name, draft_fingerprint, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                       ?13, ?14, ?15, ?16, ?16)",
            params![
                id,
                task_id,
                parent_turn_id,
                branch_id,
                content.trim(),
                serde_json::to_string(references)?,
                mode.as_str(),
                state.as_str(),
                route.engine.as_str(),
                route.provider,
                route.model,
                route.reasoning_effort,
                recipe_id,
                recipe_name,
                draft_fingerprint,
                now,
            ],
        )?;
        self.get_queued_message(&id)
    }

    pub fn get_queued_message(&self, id: &str) -> Result<AgentQueuedMessage, RepositoryError> {
        self.connection
            .query_row(
                "SELECT id, conversation_id, content, references_json, delivery_mode, state,
                        engine, provider, model, reasoning_effort, recipe_id, recipe_name,
                        draft_fingerprint, branch_id, created_at, updated_at
                 FROM agent_v2_queued_messages WHERE id = ?1",
                [id],
                map_queued_message_row,
            )
            .optional()?
            .map(queued_message_from_row)
            .transpose()?
            .ok_or_else(|| RepositoryError::domain("not_found", "排队消息不存在"))
    }

    pub fn list_queued_messages(
        &self,
        task_id: &str,
    ) -> Result<Vec<AgentQueuedMessage>, RepositoryError> {
        self.get_task(task_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, conversation_id, content, references_json, delivery_mode, state,
                    engine, provider, model, reasoning_effort, recipe_id, recipe_name,
                    draft_fingerprint, branch_id, created_at, updated_at
             FROM agent_v2_queued_messages
             WHERE conversation_id = ?1 ORDER BY created_at, rowid",
        )?;
        statement
            .query_map([task_id], map_queued_message_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(queued_message_from_row)
            .collect()
    }

    pub fn update_queued_message(
        &mut self,
        id: &str,
        content: &str,
        references: &[AgentRecipeReference],
    ) -> Result<AgentQueuedMessage, RepositoryError> {
        let message = self.get_queued_message(id)?;
        if message.state != AgentQueuedMessageState::Queued {
            return Err(RepositoryError::domain(
                "invalid_state",
                "正在插话的消息不能编辑",
            ));
        }
        if content.trim().is_empty() {
            return Err(RepositoryError::domain("invalid_input", "消息内容不能为空"));
        }
        self.connection.execute(
            "UPDATE agent_v2_queued_messages
             SET content = ?1, references_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                content.trim(),
                serde_json::to_string(references)?,
                (self.clock)(),
                id,
            ],
        )?;
        self.get_queued_message(id)
    }

    pub fn delete_queued_message(&mut self, id: &str) -> Result<(), RepositoryError> {
        let message = self.get_queued_message(id)?;
        if message.state != AgentQueuedMessageState::Queued {
            return Err(RepositoryError::domain(
                "invalid_state",
                "正在插话的消息不能删除",
            ));
        }
        self.connection
            .execute("DELETE FROM agent_v2_queued_messages WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn delete_queued_message_any(&mut self, id: &str) -> Result<(), RepositoryError> {
        self.get_queued_message(id)?;
        self.connection
            .execute("DELETE FROM agent_v2_queued_messages WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn clear_steering_messages(&mut self, task_id: &str) -> Result<(), RepositoryError> {
        self.connection.execute(
            "DELETE FROM agent_v2_queued_messages WHERE conversation_id = ?1 AND state = 'steering'",
            [task_id],
        )?;
        Ok(())
    }

    pub fn settle_turn(
        &mut self,
        turn_id: &str,
        status: TaskOutcome,
        blocks: &[FoodLabContentBlock],
    ) -> Result<AgentTurn, RepositoryError> {
        self.get_turn(turn_id)?;
        self.connection.execute(
            "UPDATE agent_v2_turns
             SET status = ?1, content_blocks_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                status.as_str(),
                serde_json::to_string(blocks)?,
                (self.clock)(),
                turn_id,
            ],
        )?;
        self.get_turn(turn_id)
    }

    pub fn append_event(
        &mut self,
        task_id: &str,
        seq: i64,
        event_type: &str,
        turn_id: Option<&str>,
        step_id: Option<&str>,
        call_id: Option<&str>,
        payload: &Value,
    ) -> Result<AgentTaskEvent, RepositoryError> {
        let task = self.get_task(task_id)?;
        if seq <= task.last_event_seq {
            return Err(RepositoryError::domain(
                "invalid_state",
                format!(
                    "Agent 任务记录序号已处理：当前 {}，收到 {seq}",
                    task.last_event_seq
                ),
            ));
        }
        if let Some(turn_id) = turn_id {
            let turn = self.get_turn(turn_id)?;
            if turn.task_id != task_id {
                return Err(RepositoryError::domain(
                    "invalid_input",
                    "Agent 任务记录不属于当前任务",
                ));
            }
        }
        let now = (self.clock)();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO agent_v2_events (
               task_id, seq, event_type, turn_id, step_id, call_id, payload_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                task_id,
                seq,
                event_type,
                turn_id,
                step_id,
                call_id,
                serde_json::to_string(payload)?,
                now,
            ],
        )?;
        transaction.execute(
            "UPDATE agent_v2_tasks SET last_event_seq = ?1, updated_at = ?2 WHERE id = ?3",
            params![seq, now, task_id],
        )?;
        transaction.commit()?;
        self.list_events(task_id, seq - 1)?
            .into_iter()
            .next()
            .ok_or_else(|| RepositoryError::domain("storage_failure", "Agent 任务记录未能持久化"))
    }

    pub fn advance_event_cursor(
        &mut self,
        task_id: &str,
        seq: i64,
    ) -> Result<AgentTask, RepositoryError> {
        let task = self.get_task(task_id)?;
        if seq > task.last_event_seq {
            self.connection.execute(
                "UPDATE agent_v2_tasks SET last_event_seq = ?1, updated_at = ?2 WHERE id = ?3",
                params![seq, (self.clock)(), task_id],
            )?;
        }
        self.get_task(task_id)
    }

    pub fn list_events(
        &self,
        task_id: &str,
        after_seq: i64,
    ) -> Result<Vec<AgentTaskEvent>, RepositoryError> {
        self.get_task(task_id)?;
        let mut statement = self.connection.prepare(
            "SELECT task_id, seq, event_type, turn_id, step_id, call_id, payload_json, created_at
             FROM agent_v2_events WHERE task_id = ?1 AND seq > ?2 ORDER BY seq",
        )?;
        statement
            .query_map(params![task_id, after_seq], map_event_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(event_from_row)
            .collect()
    }

    pub fn create_artifact(
        &mut self,
        task_id: &str,
        turn_id: &str,
        tool_call_id: Option<&str>,
        kind: &str,
        title: &str,
        domain_ref: Option<&str>,
        status: ArtifactStatus,
        provenance: &Value,
    ) -> Result<ArtifactManifest, RepositoryError> {
        let turn = self.get_turn(turn_id)?;
        if turn.task_id != task_id {
            return Err(RepositoryError::domain(
                "invalid_input",
                "Artifact 的 Turn 不属于当前任务",
            ));
        }
        let id = (self.create_id)();
        let now = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_artifact_manifests (
               id, task_id, turn_id, tool_call_id, kind, title, domain_ref,
               logical_path, mime_type, sha256, byte_size, status, provenance_json,
               created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL, NULL, ?8, ?9, ?10, ?10)",
            params![
                id,
                task_id,
                turn_id,
                tool_call_id,
                kind,
                title.trim(),
                domain_ref,
                status.as_str(),
                serde_json::to_string(provenance)?,
                now,
            ],
        )?;
        self.get_artifact(&id)
    }

    pub fn get_artifact(&self, id: &str) -> Result<ArtifactManifest, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, task_id, turn_id, tool_call_id, kind, title, domain_ref,
                        logical_path, mime_type, sha256, byte_size, status,
                        provenance_json, created_at, updated_at
                 FROM agent_artifact_manifests WHERE id = ?1",
                [id],
                map_artifact_row,
            )
            .optional()?
            .ok_or_else(|| RepositoryError::domain("not_found", "Agent Artifact 不存在"))?;
        artifact_from_row(row)
    }

    pub fn find_artifact_by_domain_ref(
        &self,
        domain_ref: &str,
    ) -> Result<Option<ArtifactManifest>, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, task_id, turn_id, tool_call_id, kind, title, domain_ref,
                        logical_path, mime_type, sha256, byte_size, status,
                        provenance_json, created_at, updated_at
                 FROM agent_artifact_manifests WHERE domain_ref = ?1",
                [domain_ref],
                map_artifact_row,
            )
            .optional()?;
        row.map(artifact_from_row).transpose()
    }

    pub fn list_artifacts(&self, task_id: &str) -> Result<Vec<ArtifactManifest>, RepositoryError> {
        self.get_task(task_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, task_id, turn_id, tool_call_id, kind, title, domain_ref,
                    logical_path, mime_type, sha256, byte_size, status,
                    provenance_json, created_at, updated_at
             FROM agent_artifact_manifests WHERE task_id = ?1 ORDER BY created_at, rowid",
        )?;
        statement
            .query_map([task_id], map_artifact_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(artifact_from_row)
            .collect()
    }
}

fn normalized_title(value: &str) -> &str {
    let value = value.trim();
    if value.is_empty() {
        "新研发任务"
    } else {
        value
    }
}

struct TaskRow {
    id: String,
    harness_session_id: Option<String>,
    title: String,
    workflow: String,
    status: String,
    task_contract_json: String,
    active_recipe_id: Option<String>,
    active_recipe_name: Option<String>,
    active_draft_fingerprint: Option<String>,
    last_event_seq: i64,
    error_code: Option<String>,
    error_summary: Option<String>,
    active_engine: String,
    active_provider: String,
    active_model: String,
    active_reasoning_effort: Option<String>,
    active_leaf_turn_id: Option<String>,
    queue_paused: bool,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

fn map_task_row(row: &Row<'_>) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        id: row.get(0)?,
        harness_session_id: row.get(1)?,
        title: row.get(2)?,
        workflow: row.get(3)?,
        status: row.get(4)?,
        task_contract_json: row.get(5)?,
        active_recipe_id: row.get(6)?,
        active_recipe_name: row.get(7)?,
        active_draft_fingerprint: row.get(8)?,
        last_event_seq: row.get(9)?,
        error_code: row.get(10)?,
        error_summary: row.get(11)?,
        active_engine: row.get(12)?,
        active_provider: row.get(13)?,
        active_model: row.get(14)?,
        active_reasoning_effort: row.get(15)?,
        active_leaf_turn_id: row.get(16)?,
        queue_paused: row.get(17)?,
        archived_at: row.get(18)?,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
    })
}

fn task_from_row(row: TaskRow) -> Result<AgentTask, RepositoryError> {
    Ok(AgentTask {
        id: row.id,
        harness_session_id: row.harness_session_id,
        title: row.title,
        workflow: row.workflow,
        status: TaskOutcome::parse(&row.status)
            .ok_or_else(|| RepositoryError::domain("storage_failure", "Agent 任务状态无效"))?,
        task_contract: serde_json::from_str(&row.task_contract_json)?,
        active_recipe_id: row.active_recipe_id,
        active_recipe_name: row.active_recipe_name,
        active_draft_fingerprint: row.active_draft_fingerprint,
        last_event_seq: row.last_event_seq,
        error_code: row.error_code,
        error_summary: row.error_summary,
        active_route: AgentModelRoute {
            engine: AgentEngine::parse(&row.active_engine).ok_or_else(|| {
                RepositoryError::domain("storage_failure", "Agent 运行时类型无效")
            })?,
            provider: row.active_provider,
            model: row.active_model,
            reasoning_effort: row.active_reasoning_effort,
        },
        active_leaf_turn_id: row.active_leaf_turn_id,
        queue_paused: row.queue_paused,
        archived_at: row.archived_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

struct TurnRow {
    id: String,
    task_id: String,
    harness_turn_id: Option<String>,
    parent_turn_id: Option<String>,
    status: String,
    user_content: String,
    content_blocks_json: String,
    engine: String,
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
    branch_id: String,
    recipe_id: Option<String>,
    recipe_name: Option<String>,
    draft_fingerprint: Option<String>,
    created_at: String,
    updated_at: String,
}

fn map_turn_row(row: &Row<'_>) -> rusqlite::Result<TurnRow> {
    Ok(TurnRow {
        id: row.get(0)?,
        task_id: row.get(1)?,
        harness_turn_id: row.get(2)?,
        parent_turn_id: row.get(3)?,
        status: row.get(4)?,
        user_content: row.get(5)?,
        content_blocks_json: row.get(6)?,
        engine: row.get(7)?,
        provider: row.get(8)?,
        model: row.get(9)?,
        reasoning_effort: row.get(10)?,
        branch_id: row.get(11)?,
        recipe_id: row.get(12)?,
        recipe_name: row.get(13)?,
        draft_fingerprint: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

fn turn_from_row(row: TurnRow) -> Result<AgentTurn, RepositoryError> {
    Ok(AgentTurn {
        id: row.id,
        task_id: row.task_id,
        harness_turn_id: row.harness_turn_id,
        parent_turn_id: row.parent_turn_id,
        branch_id: row.branch_id,
        status: TaskOutcome::parse(&row.status)
            .ok_or_else(|| RepositoryError::domain("storage_failure", "Agent Turn 状态无效"))?,
        user_content: row.user_content,
        content_blocks: serde_json::from_str(&row.content_blocks_json)?,
        route: AgentModelRoute {
            engine: AgentEngine::parse(&row.engine).ok_or_else(|| {
                RepositoryError::domain("storage_failure", "Agent Turn 运行时类型无效")
            })?,
            provider: row.provider,
            model: row.model,
            reasoning_effort: row.reasoning_effort,
        },
        recipe_id: row.recipe_id,
        recipe_name: row.recipe_name,
        draft_fingerprint: row.draft_fingerprint,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

struct QueuedMessageRow {
    id: String,
    conversation_id: String,
    content: String,
    references_json: String,
    delivery_mode: String,
    state: String,
    engine: String,
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
    recipe_id: Option<String>,
    recipe_name: Option<String>,
    draft_fingerprint: Option<String>,
    branch_id: String,
    created_at: String,
    updated_at: String,
}

fn map_queued_message_row(row: &Row<'_>) -> rusqlite::Result<QueuedMessageRow> {
    Ok(QueuedMessageRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        content: row.get(2)?,
        references_json: row.get(3)?,
        delivery_mode: row.get(4)?,
        state: row.get(5)?,
        engine: row.get(6)?,
        provider: row.get(7)?,
        model: row.get(8)?,
        reasoning_effort: row.get(9)?,
        recipe_id: row.get(10)?,
        recipe_name: row.get(11)?,
        draft_fingerprint: row.get(12)?,
        branch_id: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn queued_message_from_row(row: QueuedMessageRow) -> Result<AgentQueuedMessage, RepositoryError> {
    Ok(AgentQueuedMessage {
        id: row.id,
        conversation_id: row.conversation_id,
        content: row.content,
        references: serde_json::from_str(&row.references_json)?,
        mode: AgentDeliveryMode::parse(&row.delivery_mode)
            .ok_or_else(|| RepositoryError::domain("storage_failure", "排队消息的发送模式无效"))?,
        state: AgentQueuedMessageState::parse(&row.state)
            .ok_or_else(|| RepositoryError::domain("storage_failure", "排队消息的状态无效"))?,
        route: AgentModelRoute {
            engine: AgentEngine::parse(&row.engine).ok_or_else(|| {
                RepositoryError::domain("storage_failure", "排队消息的运行时无效")
            })?,
            provider: row.provider,
            model: row.model,
            reasoning_effort: row.reasoning_effort,
        },
        recipe_id: row.recipe_id,
        recipe_name: row.recipe_name,
        draft_fingerprint: row.draft_fingerprint,
        branch_id: row.branch_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn route_key(route: &AgentModelRoute) -> String {
    let _ = route;
    "default".into()
}

struct EventRow {
    task_id: String,
    seq: i64,
    event_type: String,
    turn_id: Option<String>,
    step_id: Option<String>,
    call_id: Option<String>,
    payload_json: String,
    created_at: String,
}

fn map_event_row(row: &Row<'_>) -> rusqlite::Result<EventRow> {
    Ok(EventRow {
        task_id: row.get(0)?,
        seq: row.get(1)?,
        event_type: row.get(2)?,
        turn_id: row.get(3)?,
        step_id: row.get(4)?,
        call_id: row.get(5)?,
        payload_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn event_from_row(row: EventRow) -> Result<AgentTaskEvent, RepositoryError> {
    Ok(AgentTaskEvent {
        task_id: row.task_id,
        seq: row.seq,
        event_type: row.event_type,
        turn_id: row.turn_id,
        step_id: row.step_id,
        call_id: row.call_id,
        payload: serde_json::from_str(&row.payload_json)?,
        created_at: row.created_at,
    })
}

struct ArtifactRow {
    id: String,
    task_id: String,
    turn_id: String,
    tool_call_id: Option<String>,
    kind: String,
    title: String,
    domain_ref: Option<String>,
    logical_path: Option<String>,
    mime_type: Option<String>,
    sha256: Option<String>,
    byte_size: Option<i64>,
    status: String,
    provenance_json: String,
    created_at: String,
    updated_at: String,
}

fn map_artifact_row(row: &Row<'_>) -> rusqlite::Result<ArtifactRow> {
    Ok(ArtifactRow {
        id: row.get(0)?,
        task_id: row.get(1)?,
        turn_id: row.get(2)?,
        tool_call_id: row.get(3)?,
        kind: row.get(4)?,
        title: row.get(5)?,
        domain_ref: row.get(6)?,
        logical_path: row.get(7)?,
        mime_type: row.get(8)?,
        sha256: row.get(9)?,
        byte_size: row.get(10)?,
        status: row.get(11)?,
        provenance_json: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn artifact_from_row(row: ArtifactRow) -> Result<ArtifactManifest, RepositoryError> {
    Ok(ArtifactManifest {
        id: row.id,
        task_id: row.task_id,
        turn_id: row.turn_id,
        tool_call_id: row.tool_call_id,
        kind: row.kind,
        title: row.title,
        domain_ref: row.domain_ref,
        logical_path: row.logical_path,
        mime_type: row.mime_type,
        sha256: row.sha256,
        byte_size: row.byte_size.map(|value| value.max(0) as u64),
        status: ArtifactStatus::parse(&row.status)
            .ok_or_else(|| RepositoryError::domain("storage_failure", "Artifact 状态无效"))?,
        provenance: serde_json::from_str(&row.provenance_json)?,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_harness::contract::{Workflow, contract_for};
    use serde_json::json;

    fn repository() -> HarnessRepository {
        let ids = std::sync::Mutex::new((0_u64..).map(|id| format!("id-{id}")));
        HarnessRepository::open_in_memory_with(
            || "2026-08-20T00:00:00Z".into(),
            move || ids.lock().unwrap().next().unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn archiving_interrupts_stale_running_turns_and_restore_keeps_history_paused() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "卡住的会话",
                &contract_for(Workflow::LocalKnowledge),
                None,
                None,
            )
            .unwrap();
        let first = repository.create_turn(&task.id, None, "第一轮").unwrap();
        let second = repository
            .create_turn(&task.id, Some(&first.id), "第二轮")
            .unwrap();
        let third = repository
            .create_turn(&task.id, Some(&second.id), "第三轮")
            .unwrap();
        repository
            .create_artifact(
                &task.id,
                &third.id,
                None,
                "research_report",
                "已产生内容",
                None,
                ArtifactStatus::NeedsReview,
                &json!({"source": "test"}),
            )
            .unwrap();

        let archived = repository
            .archive_task_and_interrupt_running(&task.id)
            .unwrap();
        assert_eq!(archived.status, TaskOutcome::Interrupted);
        assert!(archived.queue_paused);
        assert!(archived.archived_at.is_some());
        let archived_turns = repository.list_turns(&task.id).unwrap();
        assert_eq!(archived_turns.len(), 3);
        assert!(
            archived_turns
                .iter()
                .all(|turn| turn.status == TaskOutcome::Interrupted)
        );
        assert!(
            repository
                .list_tasks(HarnessTaskListScope::Active)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            repository
                .list_tasks(HarnessTaskListScope::Archived)
                .unwrap()
                .len(),
            1
        );

        let restored = repository.restore_task(&task.id).unwrap();
        assert_eq!(restored.status, TaskOutcome::Interrupted);
        assert!(restored.queue_paused);
        assert!(restored.archived_at.is_none());
        assert_eq!(repository.list_artifacts(&task.id).unwrap().len(), 1);
        assert_eq!(
            repository
                .list_tasks(HarnessTaskListScope::Active)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn archiving_a_completed_task_preserves_its_terminal_status() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "已完成会话",
                &contract_for(Workflow::LocalKnowledge),
                None,
                None,
            )
            .unwrap();
        repository
            .update_task_outcome(&task.id, TaskOutcome::Completed, None, None)
            .unwrap();

        let archived = repository
            .archive_task_and_interrupt_running(&task.id)
            .unwrap();

        assert_eq!(archived.status, TaskOutcome::Completed);
        assert!(archived.archived_at.is_some());
    }

    #[test]
    fn skipped_event_sequence_is_allowed_but_stale_sequence_is_rejected() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "甜度估算",
                &contract_for(Workflow::RecipeEstimate),
                None,
                None,
            )
            .unwrap();
        let turn = repository
            .create_turn(&task.id, None, "估算当前值")
            .unwrap();
        repository
            .append_event(
                &task.id,
                0,
                "turn/start",
                Some(&turn.id),
                None,
                None,
                &json!({}),
            )
            .unwrap();
        repository
            .append_event(
                &task.id,
                2,
                "turn/end",
                Some(&turn.id),
                None,
                None,
                &json!({}),
            )
            .unwrap();
        let error = repository
            .append_event(
                &task.id,
                1,
                "assistant/chunk",
                Some(&turn.id),
                None,
                None,
                &json!({}),
            )
            .unwrap_err();
        assert_eq!(error.code(), "invalid_state");
    }

    #[test]
    fn artifacts_remain_grouped_by_task_and_turn() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "配方提案",
                &contract_for(Workflow::RecipeProposal),
                None,
                None,
            )
            .unwrap();
        let turn = repository
            .create_turn(&task.id, None, "创建一张提案")
            .unwrap();
        repository
            .create_artifact(
                &task.id,
                &turn.id,
                Some("call-1"),
                "recipe_proposal",
                "低糖版配方",
                Some("recipe-proposal:p-1"),
                ArtifactStatus::NeedsReview,
                &json!({"source": "tool"}),
            )
            .unwrap();
        let artifacts = repository.list_artifacts(&task.id).unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].turn_id, turn.id);
    }

    #[test]
    fn queued_messages_capture_route_and_recipe_snapshot_and_survive_pause() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "继续优化",
                &contract_for(Workflow::RecipeProposal),
                None,
                None,
            )
            .unwrap();
        let route = AgentModelRoute {
            engine: AgentEngine::FoodlabRuntime,
            provider: "kimi".into(),
            model: "kimi-k2.5".into(),
            reasoning_effort: None,
        };
        repository.set_task_route(&task.id, &route).unwrap();
        let turn = repository.create_turn(&task.id, None, "先分析").unwrap();
        let queued = repository
            .enqueue_message(
                &task.id,
                Some(&turn.id),
                &turn.branch_id,
                "再比较成本",
                &[AgentRecipeReference {
                    recipe_id: "recipe-1".into(),
                    recipe_name: "低糖软糖".into(),
                }],
                AgentDeliveryMode::Queue,
                AgentQueuedMessageState::Queued,
                &route,
                Some("recipe-1"),
                Some("低糖软糖"),
                Some("sha256:draft"),
            )
            .unwrap();
        repository.set_queue_paused(&task.id, true).unwrap();

        let restored = repository.list_queued_messages(&task.id).unwrap();
        assert_eq!(restored, vec![queued]);
        assert!(repository.get_task(&task.id).unwrap().queue_paused);
        assert_eq!(restored[0].route.model, "kimi-k2.5");
        assert_eq!(restored[0].recipe_name.as_deref(), Some("低糖软糖"));
    }

    #[test]
    fn selecting_a_branch_projects_only_its_parent_lineage() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "分支对话",
                &contract_for(Workflow::LocalKnowledge),
                None,
                None,
            )
            .unwrap();
        let root = repository.create_turn(&task.id, None, "第一轮").unwrap();
        let original = repository
            .create_turn(&task.id, Some(&root.id), "原问题")
            .unwrap();
        let route = original.route.clone();
        let edited = repository
            .create_turn_with_snapshot(
                &task.id,
                Some(&root.id),
                "修改后的问题",
                &route,
                "branch-edited",
                None,
                None,
                None,
            )
            .unwrap();

        assert_eq!(
            repository
                .list_active_turns(&task.id)
                .unwrap()
                .iter()
                .map(|turn| turn.id.as_str())
                .collect::<Vec<_>>(),
            vec![root.id.as_str(), edited.id.as_str()],
        );
        repository
            .select_visible_leaf(&task.id, &original.id)
            .unwrap();
        assert_eq!(
            repository
                .list_active_turns(&task.id)
                .unwrap()
                .iter()
                .map(|turn| turn.id.as_str())
                .collect::<Vec<_>>(),
            vec![root.id.as_str(), original.id.as_str()],
        );
    }
}
