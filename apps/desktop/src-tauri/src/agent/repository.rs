use std::{path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::model::{
    AgentConversation, AgentMessage, AgentMessageInput, AgentMessageRole, AgentMessageStatus,
    AgentPreferences, AgentProviderConfig, AgentProviderConfigInput, AgentProviderKind, AgentRun,
    AgentRunInput, AgentToolCall, AgentToolCallStatus,
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct AgentRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl AgentRepository {
    pub fn open(path: &Path) -> Result<Self, RepositoryError> {
        Self::from_connection(
            database::open(path)?,
            Arc::new(|| Utc::now().to_rfc3339()),
            Arc::new(|| Uuid::new_v4().to_string()),
            true,
        )
    }

    pub fn open_for_runtime(path: &Path) -> Result<Self, RepositoryError> {
        Self::from_connection(
            database::open(path)?,
            Arc::new(|| Utc::now().to_rfc3339()),
            Arc::new(|| Uuid::new_v4().to_string()),
            false,
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
            true,
        )
    }

    fn from_connection(
        mut connection: Connection,
        clock: Clock,
        create_id: IdGenerator,
        recover_interrupted: bool,
    ) -> Result<Self, RepositoryError> {
        migrations::apply(&mut connection, &clock())?;
        let repository = Self {
            connection,
            clock,
            create_id,
        };
        if recover_interrupted {
            repository.recover_interrupted()?;
        }
        Ok(repository)
    }

    pub fn get_preferences(&self) -> Result<AgentPreferences, RepositoryError> {
        let enabled = self
            .setting("agent.enabled")?
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        let vision_provider_config_id = self
            .setting("agent.visionProviderConfigId")?
            .and_then(|value| value.as_str().map(str::to_owned));
        Ok(AgentPreferences {
            enabled,
            vision_provider_config_id,
        })
    }

    pub fn save_preferences(
        &mut self,
        preferences: AgentPreferences,
    ) -> Result<AgentPreferences, RepositoryError> {
        let transaction = self.connection.transaction()?;
        let timestamp = (self.clock)();
        upsert_setting(
            &transaction,
            "agent.enabled",
            &Value::Bool(preferences.enabled),
            &timestamp,
        )?;
        upsert_setting(
            &transaction,
            "agent.visionProviderConfigId",
            &preferences
                .vision_provider_config_id
                .as_ref()
                .map_or(Value::Null, |id| Value::String(id.clone())),
            &timestamp,
        )?;
        transaction.commit()?;
        Ok(preferences)
    }

    pub fn list_providers(&self) -> Result<Vec<AgentProviderConfig>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, display_name, protocol, endpoint, model, context_window,
                    reasoning_effort, timeout_seconds, executable_path, enabled,
                    secret_ref, capabilities_json, updated_at
             FROM agent_provider_configs
             ORDER BY rowid",
        )?;
        statement
            .query_map([], map_provider)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_provider(&self, id: &str) -> Result<AgentProviderConfig, RepositoryError> {
        self.connection
            .query_row(
                "SELECT id, kind, display_name, protocol, endpoint, model, context_window,
                        reasoning_effort, timeout_seconds, executable_path, enabled,
                        secret_ref, capabilities_json, updated_at
                 FROM agent_provider_configs WHERE id = ?1",
                [id],
                map_provider,
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该模型配置"))
    }

    pub fn save_provider(
        &mut self,
        input: AgentProviderConfigInput,
    ) -> Result<AgentProviderConfig, RepositoryError> {
        let timestamp = (self.clock)();
        let capabilities_json = serde_json::to_string(&input.capabilities)?;
        let kind = enum_string(input.kind)?;
        let protocol = enum_string(input.protocol)?;
        let reasoning_effort = enum_string(input.reasoning_effort)?;
        let transaction = self.connection.transaction()?;
        if input.enabled {
            transaction.execute(
                "UPDATE agent_provider_configs
                 SET enabled = 0, updated_at = ?1
                 WHERE enabled = 1 AND id <> ?2",
                params![timestamp, input.id],
            )?;
        }
        transaction.execute(
            "INSERT INTO agent_provider_configs (
               id, kind, display_name, protocol, endpoint, model, context_window,
               reasoning_effort, timeout_seconds, executable_path, enabled, secret_ref,
               capabilities_json, config_json, created_at, updated_at
             ) VALUES (
               ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, '{}', ?13, ?13
             )
             ON CONFLICT(id) DO UPDATE SET
               kind = excluded.kind,
               display_name = excluded.display_name,
               protocol = excluded.protocol,
               endpoint = excluded.endpoint,
               model = excluded.model,
               context_window = excluded.context_window,
               reasoning_effort = excluded.reasoning_effort,
               timeout_seconds = excluded.timeout_seconds,
               executable_path = excluded.executable_path,
               enabled = excluded.enabled,
               capabilities_json = excluded.capabilities_json,
               updated_at = excluded.updated_at",
            params![
                input.id,
                kind,
                input.display_name.trim(),
                protocol,
                input.endpoint.trim(),
                input.model.trim(),
                input.context_window as i64,
                reasoning_effort,
                input.timeout_seconds as i64,
                input.executable_path,
                input.enabled,
                capabilities_json,
                timestamp,
            ],
        )?;
        transaction.commit()?;
        self.get_provider(&input.id)
    }

    pub fn set_provider_secret_ref(
        &mut self,
        provider_id: &str,
        secret_ref: Option<&str>,
    ) -> Result<(), RepositoryError> {
        let updated = self.connection.execute(
            "UPDATE agent_provider_configs
             SET secret_ref = ?1, updated_at = ?2
             WHERE id = ?3",
            params![secret_ref, (self.clock)(), provider_id],
        )?;
        if updated == 0 {
            return Err(not_found("找不到该模型配置"));
        }
        Ok(())
    }

    pub fn provider_secret_ref(
        &self,
        provider_id: &str,
    ) -> Result<Option<String>, RepositoryError> {
        self.connection
            .query_row(
                "SELECT secret_ref FROM agent_provider_configs WHERE id = ?1",
                [provider_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该模型配置"))
    }

    pub fn provider_config_json(&self, provider_id: &str) -> Result<Value, RepositoryError> {
        let json = self
            .connection
            .query_row(
                "SELECT config_json FROM agent_provider_configs WHERE id = ?1",
                [provider_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该模型配置"))?;
        serde_json::from_str(&json).map_err(Into::into)
    }

    pub fn set_provider_config_json(
        &mut self,
        provider_id: &str,
        config: &Value,
    ) -> Result<(), RepositoryError> {
        let config_json = serde_json::to_string(config)?;
        let updated = self.connection.execute(
            "UPDATE agent_provider_configs
             SET config_json = ?1, updated_at = ?2
             WHERE id = ?3",
            params![config_json, (self.clock)(), provider_id],
        )?;
        if updated == 0 {
            return Err(not_found("找不到该模型配置"));
        }
        Ok(())
    }

    pub fn list_conversations(&self) -> Result<Vec<AgentConversation>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, created_at, updated_at
             FROM agent_conversations
             ORDER BY updated_at DESC, created_at DESC",
        )?;
        statement
            .query_map([], map_conversation)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn create_conversation(
        &mut self,
        title: &str,
    ) -> Result<AgentConversation, RepositoryError> {
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let title = if title.trim().is_empty() {
            "新对话"
        } else {
            title.trim()
        };
        self.connection.execute(
            "INSERT INTO agent_conversations (id, title, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)",
            params![id, title, timestamp],
        )?;
        self.get_conversation(&id)
    }

    pub fn delete_conversation(&mut self, id: &str) -> Result<(), RepositoryError> {
        self.connection
            .execute("DELETE FROM agent_conversations WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn append_message(
        &mut self,
        input: AgentMessageInput,
    ) -> Result<AgentMessage, RepositoryError> {
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let role = enum_string(input.role)?;
        let status = enum_string(input.status)?;
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO agent_messages (
               id, conversation_id, run_id, role, content, status, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.conversation_id,
                input.run_id,
                role,
                input.content,
                status,
                timestamp,
            ],
        )?;
        for attachment_id in input.attachment_ids {
            transaction.execute(
                "INSERT INTO agent_message_attachments (message_id, attachment_id)
                 VALUES (?1, ?2)",
                params![id, attachment_id],
            )?;
        }
        transaction.execute(
            "UPDATE agent_conversations SET updated_at = ?1 WHERE id = ?2",
            params![timestamp, input.conversation_id],
        )?;
        transaction.commit()?;
        self.get_message(&id)
    }

    pub fn list_messages(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<AgentMessage>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, conversation_id, run_id, role, content, status, created_at
             FROM agent_messages
             WHERE conversation_id = ?1
             ORDER BY created_at, rowid",
        )?;
        let rows = statement
            .query_map([conversation_id], map_message_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|row| self.hydrate_message(row))
            .collect()
    }

    pub fn create_run(&mut self, input: AgentRunInput) -> Result<AgentRun, RepositoryError> {
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let status = enum_string(input.status)?;
        self.connection.execute(
            "INSERT INTO agent_runs (
               id, conversation_id, provider_config_id, import_job_id, status,
               error_code, error_summary, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6, ?6)",
            params![
                id,
                input.conversation_id,
                input.provider_config_id,
                input.import_job_id,
                status,
                timestamp,
            ],
        )?;
        self.get_run(&id)
    }

    pub fn get_run(&self, id: &str) -> Result<AgentRun, RepositoryError> {
        self.connection
            .query_row(
                "SELECT id, conversation_id, provider_config_id, import_job_id,
                        status, error_code, error_summary, created_at, updated_at
                 FROM agent_runs WHERE id = ?1",
                [id],
                map_run,
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该 Agent 任务"))
    }

    pub fn start_tool_call(
        &mut self,
        run_id: &str,
        provider_kind: AgentProviderKind,
        model: &str,
        tool_name: &str,
    ) -> Result<AgentToolCall, RepositoryError> {
        self.get_run(run_id)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_tool_calls (
               id, run_id, provider_kind, model, tool_name, status,
               error_summary, started_at, completed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'started', NULL, ?6, NULL)",
            params![
                id,
                run_id,
                enum_string(provider_kind)?,
                model.trim(),
                tool_name,
                timestamp,
            ],
        )?;
        self.get_tool_call(&id)
    }

    pub fn finish_tool_call(
        &mut self,
        id: &str,
        status: AgentToolCallStatus,
        error_summary: Option<&str>,
    ) -> Result<AgentToolCall, RepositoryError> {
        if status == AgentToolCallStatus::Started {
            return Err(RepositoryError::Domain {
                code: "invalid_input",
                message: "工具调用结束状态无效".into(),
                field: None,
            });
        }
        let error_summary = error_summary
            .map(|message| message.chars().take(240).collect::<String>())
            .filter(|message| !message.trim().is_empty());
        let updated = self.connection.execute(
            "UPDATE agent_tool_calls
             SET status = ?1, error_summary = ?2, completed_at = ?3
             WHERE id = ?4 AND status = 'started'",
            params![enum_string(status)?, error_summary, (self.clock)(), id,],
        )?;
        if updated == 0 {
            return Err(not_found("找不到进行中的工具调用"));
        }
        self.get_tool_call(id)
    }

    pub fn list_tool_calls(&self, run_id: &str) -> Result<Vec<AgentToolCall>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, run_id, provider_kind, model, tool_name, status,
                    error_summary, started_at, completed_at
             FROM agent_tool_calls WHERE run_id = ?1 ORDER BY started_at, rowid",
        )?;
        statement
            .query_map([run_id], map_tool_call)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    fn get_conversation(&self, id: &str) -> Result<AgentConversation, RepositoryError> {
        self.connection
            .query_row(
                "SELECT id, title, created_at, updated_at
                 FROM agent_conversations WHERE id = ?1",
                [id],
                map_conversation,
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该对话"))
    }

    fn get_message(&self, id: &str) -> Result<AgentMessage, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, conversation_id, run_id, role, content, status, created_at
                 FROM agent_messages WHERE id = ?1",
                [id],
                map_message_row,
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该消息"))?;
        self.hydrate_message(row)
    }

    fn get_tool_call(&self, id: &str) -> Result<AgentToolCall, RepositoryError> {
        self.connection
            .query_row(
                "SELECT id, run_id, provider_kind, model, tool_name, status,
                        error_summary, started_at, completed_at
                 FROM agent_tool_calls WHERE id = ?1",
                [id],
                map_tool_call,
            )
            .optional()?
            .ok_or_else(|| not_found("找不到该工具调用"))
    }

    fn hydrate_message(&self, row: MessageRow) -> Result<AgentMessage, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT attachment_id FROM agent_message_attachments
             WHERE message_id = ?1 ORDER BY rowid",
        )?;
        let attachment_ids = statement
            .query_map([&row.id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(AgentMessage {
            id: row.id,
            conversation_id: row.conversation_id,
            run_id: row.run_id,
            role: row.role,
            content: row.content,
            attachment_ids,
            status: row.status,
            created_at: row.created_at,
        })
    }

    fn setting(&self, key: &str) -> Result<Option<Value>, RepositoryError> {
        let value = self
            .connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = ?1",
                [key],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }

    fn recover_interrupted(&self) -> Result<(), RepositoryError> {
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE agent_runs
             SET status = 'failed',
                 error_code = 'application_restarted',
                 error_summary = '应用上次在处理任务时退出，请重新运行',
                 updated_at = ?1
             WHERE status = 'running'",
            [&timestamp],
        )?;
        self.connection.execute(
            "UPDATE agent_messages
             SET status = 'failed'
             WHERE role = 'assistant' AND status = 'streaming'",
            [],
        )?;
        Ok(())
    }
}

fn upsert_setting(
    connection: &Connection,
    key: &str,
    value: &Value,
    updated_at: &str,
) -> Result<(), RepositoryError> {
    connection.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        params![key, serde_json::to_string(value)?, updated_at],
    )?;
    Ok(())
}

fn enum_string<T: Serialize>(value: T) -> Result<String, RepositoryError> {
    let value = serde_json::to_value(value)?;
    value.as_str().map(str::to_owned).ok_or_else(|| {
        RepositoryError::Serialization(serde_json::Error::io(std::io::Error::other(
            "枚举序列化结果不是字符串",
        )))
    })
}

fn parse_enum<T: DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_value(Value::String(value)).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

fn parse_json<T: DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

fn map_provider(row: &Row<'_>) -> rusqlite::Result<AgentProviderConfig> {
    Ok(AgentProviderConfig {
        id: row.get(0)?,
        kind: parse_enum(row.get(1)?)?,
        display_name: row.get(2)?,
        protocol: parse_enum(row.get(3)?)?,
        endpoint: row.get(4)?,
        model: row.get(5)?,
        context_window: row.get::<_, i64>(6)? as u64,
        reasoning_effort: parse_enum(row.get(7)?)?,
        timeout_seconds: row.get::<_, i64>(8)? as u64,
        executable_path: row.get(9)?,
        enabled: row.get(10)?,
        has_secret: row.get::<_, Option<String>>(11)?.is_some(),
        capabilities: parse_json(row.get(12)?)?,
        updated_at: row.get(13)?,
    })
}

fn map_conversation(row: &Row<'_>) -> rusqlite::Result<AgentConversation> {
    Ok(AgentConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

struct MessageRow {
    id: String,
    conversation_id: String,
    run_id: Option<String>,
    role: AgentMessageRole,
    content: String,
    status: AgentMessageStatus,
    created_at: String,
}

fn map_message_row(row: &Row<'_>) -> rusqlite::Result<MessageRow> {
    Ok(MessageRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        run_id: row.get(2)?,
        role: parse_enum(row.get(3)?)?,
        content: row.get(4)?,
        status: parse_enum(row.get(5)?)?,
        created_at: row.get(6)?,
    })
}

fn map_run(row: &Row<'_>) -> rusqlite::Result<AgentRun> {
    Ok(AgentRun {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        provider_config_id: row.get(2)?,
        import_job_id: row.get(3)?,
        status: parse_enum(row.get(4)?)?,
        error_code: row.get(5)?,
        error_summary: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_tool_call(row: &Row<'_>) -> rusqlite::Result<AgentToolCall> {
    Ok(AgentToolCall {
        id: row.get(0)?,
        run_id: row.get(1)?,
        provider_kind: parse_enum(row.get(2)?)?,
        model: row.get(3)?,
        tool_name: row.get(4)?,
        status: parse_enum(row.get(5)?)?,
        error_summary: row.get(6)?,
        started_at: row.get(7)?,
        completed_at: row.get(8)?,
    })
}

fn not_found(message: &str) -> RepositoryError {
    RepositoryError::Domain {
        code: "not_found",
        message: message.into(),
        field: None,
    }
}
