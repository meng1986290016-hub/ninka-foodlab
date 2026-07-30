use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{
    AgentError,
    model::{
        AgentMessage, AgentMessageInput, AgentMessageRole, AgentMessageStatus, AgentProviderConfig,
        AgentProviderProtocol, AgentRun, AgentRunInput, AgentRunRequest, AgentRunStatus,
    },
    providers::{
        AgentEventSink, AgentProvider, ProviderAttachment, ProviderEvent, ProviderToolCall,
        ProviderTurnRequest, ProviderTurnResult,
    },
    repository::AgentRepository,
    tools::{AgentToolContext, AgentToolRegistry},
};
use crate::ingest::{IngestError, extractors::ExtractedDocument};

const MAX_AGENT_TURNS: usize = 12;

pub type AgentRuntimeEventSink = Arc<dyn Fn(AgentRuntimeEvent) + Send + Sync>;
pub type AgentProviderFactory = Arc<
    dyn Fn(&AgentProviderConfig, &AgentToolContext) -> Result<Arc<dyn AgentProvider>, AgentError>
        + Send
        + Sync,
>;

#[derive(Clone)]
pub struct AgentRuntimeControl {
    cancelled: Arc<AtomicBool>,
    provider: Arc<Mutex<Option<Arc<dyn AgentProvider>>>>,
}

impl AgentRuntimeControl {
    fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            provider: Arc::new(Mutex::new(None)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        if let Ok(provider) = self.provider.lock()
            && let Some(provider) = provider.as_ref()
        {
            provider.cancel();
        }
    }

    fn reset(&self) {
        self.cancelled.store(false, Ordering::Release);
    }

    fn cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    fn set_provider(&self, provider: Option<Arc<dyn AgentProvider>>) {
        if let Ok(mut active) = self.provider.lock() {
            *active = provider;
        }
    }

    fn provider(&self) -> Result<Arc<dyn AgentProvider>, AgentError> {
        self.provider
            .lock()
            .ok()
            .and_then(|provider| provider.clone())
            .ok_or_else(|| AgentError::provider_failure("Agent 模型运行状态不可用"))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentRuntimeEvent {
    #[serde(rename_all = "camelCase")]
    MessageDelta { run_id: String, text: String },
    #[serde(rename_all = "camelCase")]
    ToolStarted {
        run_id: String,
        call_id: String,
        tool_name: String,
    },
    #[serde(rename_all = "camelCase")]
    ToolCompleted {
        run_id: String,
        call_id: String,
        summary: String,
    },
    #[serde(rename_all = "camelCase")]
    DraftsChanged {
        run_id: String,
        import_job_id: String,
    },
    #[serde(rename_all = "camelCase")]
    RunCompleted { run_id: String },
    #[serde(rename_all = "camelCase")]
    RunFailed {
        run_id: String,
        code: String,
        message: String,
    },
}

pub struct AgentRuntime {
    repository: AgentRepository,
    tools: AgentToolRegistry,
    provider_factory: AgentProviderFactory,
    provider_config: AgentProviderConfig,
    events: AgentRuntimeEventSink,
    control: AgentRuntimeControl,
}

pub struct PreparedAgentRun {
    run: AgentRun,
    assistant: AgentMessage,
    attachment_ids: Vec<String>,
    attachments: Vec<ProviderAttachment>,
    context: AgentToolContext,
}

impl AgentRuntime {
    pub fn new(
        repository: AgentRepository,
        tools: AgentToolRegistry,
        provider: Arc<dyn AgentProvider>,
        provider_config: AgentProviderConfig,
        events: AgentRuntimeEventSink,
    ) -> Self {
        let provider_factory: AgentProviderFactory =
            Arc::new(move |_, _| Ok(Arc::clone(&provider)));
        Self::new_with_factory(repository, tools, provider_factory, provider_config, events)
    }

    pub fn new_with_factory(
        repository: AgentRepository,
        tools: AgentToolRegistry,
        provider_factory: AgentProviderFactory,
        provider_config: AgentProviderConfig,
        events: AgentRuntimeEventSink,
    ) -> Self {
        Self {
            repository,
            tools,
            provider_factory,
            provider_config,
            events,
            control: AgentRuntimeControl::new(),
        }
    }

    pub fn tools(&self) -> &AgentToolRegistry {
        &self.tools
    }

    pub fn control(&self) -> AgentRuntimeControl {
        self.control.clone()
    }

    pub async fn start(&mut self, request: AgentRunRequest) -> Result<AgentRun, AgentError> {
        let prepared = self.begin(request)?;
        self.execute(prepared).await
    }

    pub fn begin(&mut self, request: AgentRunRequest) -> Result<PreparedAgentRun, AgentError> {
        if !self.repository.get_preferences()?.enabled {
            return Err(AgentError::invalid_input("食品研发 Agent 已在设置中关闭"));
        }
        if request.retry_run_id.is_some() && request.continue_run_id.is_some() {
            return Err(AgentError::invalid_input(
                "不能同时重试和继续同一个 Agent 任务",
            ));
        }
        if request.retry_run_id.is_none()
            && request.continue_run_id.is_none()
            && request.content.trim().is_empty()
            && request.files.is_empty()
        {
            return Err(AgentError::invalid_input("请输入问题或选择原料资料"));
        }
        self.repository.get_conversation(&request.conversation_id)?;

        let reused_run_id = request
            .retry_run_id
            .as_deref()
            .or(request.continue_run_id.as_deref());
        let (job_id, attachments, attachment_ids, content) = if let Some(reused_run_id) =
            reused_run_id
        {
            if !request.files.is_empty() {
                return Err(AgentError::invalid_input(
                    "继续处理会复用原任务附件，请勿再次选择文件",
                ));
            }
            let previous = self.repository.get_run(reused_run_id)?;
            if previous.conversation_id != request.conversation_id {
                return Err(AgentError::invalid_input("只能在原对话中继续任务"));
            }
            if request.retry_run_id.is_some()
                && !matches!(
                    previous.status,
                    AgentRunStatus::Failed | AgentRunStatus::Cancelled
                )
            {
                return Err(AgentError::invalid_input("只有失败或已取消的任务可以重试"));
            }
            if request.continue_run_id.is_some() && previous.status != AgentRunStatus::Completed {
                return Err(AgentError::invalid_input(
                    "只有已完成的任务可以继续调整草稿",
                ));
            }
            let job_id = previous
                .import_job_id
                .ok_or_else(|| AgentError::invalid_input("原任务没有可复用的资料"))?;
            let previous_user = self
                .repository
                .list_messages(&request.conversation_id)?
                .into_iter()
                .find(|message| {
                    message.run_id.as_deref() == Some(reused_run_id)
                        && message.role == AgentMessageRole::User
                })
                .ok_or_else(|| AgentError::invalid_input("找不到原任务消息"))?;
            let attachment_ids = previous_user.attachment_ids;
            let mut attachments = self.prepare_attachments(&job_id)?;
            attachments.retain(|attachment| attachment_ids.contains(&attachment.id));
            if attachments.len() != attachment_ids.len() {
                return Err(AgentError::invalid_input("原任务附件不完整，无法安全重试"));
            }
            let content = if request.content.trim().is_empty() && request.retry_run_id.is_some() {
                previous_user.content
            } else {
                request.content.trim().into()
            };
            if content.is_empty() {
                return Err(AgentError::invalid_input("请说明需要继续处理的草稿操作"));
            }
            (job_id, attachments, attachment_ids, content)
        } else {
            let job = self
                .tools
                .coordinator_mut()
                .create_agent_job(request.files)
                .map_err(map_ingest_error)?;
            let attachments = self.prepare_attachments(&job.id)?;
            let attachment_ids = attachments
                .iter()
                .map(|attachment| attachment.id.clone())
                .collect::<Vec<_>>();
            (
                job.id,
                attachments,
                attachment_ids,
                request.content.trim().into(),
            )
        };

        let mut run = self.repository.create_run(AgentRunInput {
            conversation_id: request.conversation_id.clone(),
            provider_config_id: self.provider_config.id.clone(),
            import_job_id: Some(job_id.clone()),
            status: AgentRunStatus::Queued,
        })?;
        run = self
            .repository
            .update_run(&run.id, AgentRunStatus::Running, None, None)?;

        let setup = self.prepare_messages(
            &request.conversation_id,
            &run.id,
            &content,
            attachment_ids.clone(),
        );
        let assistant = match setup {
            Ok(assistant) => assistant,
            Err(error) => {
                self.fail_run(&run.id, None, &error);
                return Err(error);
            }
        };

        let context = AgentToolContext {
            run_id: run.id.clone(),
            import_job_id: job_id,
            allowed_attachment_ids: attachment_ids.iter().cloned().collect(),
            provider_kind: self.provider_config.kind,
            model: self.provider_config.model.clone(),
        };
        let provider = match (self.provider_factory)(&self.provider_config, &context) {
            Ok(provider) => provider,
            Err(error) => {
                self.fail_run(&run.id, Some(&assistant.id), &error);
                return Err(error);
            }
        };
        self.control.reset();
        self.control.set_provider(Some(provider));
        Ok(PreparedAgentRun {
            run,
            assistant,
            attachment_ids,
            attachments,
            context,
        })
    }

    pub fn prepared_run(prepared: &PreparedAgentRun) -> &AgentRun {
        &prepared.run
    }

    pub async fn execute(&mut self, prepared: PreparedAgentRun) -> Result<AgentRun, AgentError> {
        let PreparedAgentRun {
            mut run,
            assistant,
            attachment_ids,
            attachments,
            context,
        } = prepared;
        let result = self
            .run_turns(
                &run.conversation_id,
                &assistant,
                attachment_ids,
                attachments,
                &context,
            )
            .await;

        let completed = match result {
            Ok(final_text) => {
                if self.control.cancelled() {
                    let error = AgentError::cancelled("已取消本次 Agent 任务");
                    self.fail_run(&run.id, Some(&assistant.id), &error);
                    Err(error)
                } else {
                    let persisted = self.repository.update_message(
                        &assistant.id,
                        &final_text,
                        AgentMessageStatus::Complete,
                    );
                    match persisted.and_then(|_| {
                        self.repository
                            .update_run(&run.id, AgentRunStatus::Completed, None, None)
                    }) {
                        Ok(completed_run) => {
                            run = completed_run;
                            (self.events)(AgentRuntimeEvent::RunCompleted {
                                run_id: run.id.clone(),
                            });
                            Ok(run)
                        }
                        Err(error) => {
                            let error = AgentError::from(error);
                            self.fail_run(&run.id, Some(&assistant.id), &error);
                            Err(error)
                        }
                    }
                }
            }
            Err(error) => {
                self.fail_run(&run.id, Some(&assistant.id), &error);
                Err(error)
            }
        };
        self.control.set_provider(None);
        completed
    }

    fn prepare_messages(
        &mut self,
        conversation_id: &str,
        run_id: &str,
        content: &str,
        attachment_ids: Vec<String>,
    ) -> Result<AgentMessage, AgentError> {
        self.repository.append_message(AgentMessageInput {
            conversation_id: conversation_id.into(),
            run_id: Some(run_id.into()),
            role: AgentMessageRole::User,
            content: content.into(),
            attachment_ids,
            status: AgentMessageStatus::Complete,
        })?;
        self.repository
            .append_message(AgentMessageInput {
                conversation_id: conversation_id.into(),
                run_id: Some(run_id.into()),
                role: AgentMessageRole::Assistant,
                content: String::new(),
                attachment_ids: vec![],
                status: AgentMessageStatus::Streaming,
            })
            .map_err(Into::into)
    }

    async fn run_turns(
        &mut self,
        conversation_id: &str,
        assistant: &AgentMessage,
        attachment_ids: Vec<String>,
        attachments: Vec<ProviderAttachment>,
        context: &AgentToolContext,
    ) -> Result<String, AgentError> {
        for _ in 0..MAX_AGENT_TURNS {
            self.require_not_cancelled()?;
            let messages = self
                .repository
                .list_messages(conversation_id)?
                .into_iter()
                .filter(|message| message.id != assistant.id)
                .collect::<Vec<_>>();
            let turn = self
                .run_provider_turn(
                    ProviderTurnRequest {
                        messages,
                        attachment_ids: attachment_ids.clone(),
                        attachments: attachments.clone(),
                        tools: self.tools.definitions(),
                        output_schema: final_output_schema(self.provider_config.protocol),
                    },
                    &context.run_id,
                )
                .await?;
            let tool_calls = turn
                .events
                .iter()
                .filter_map(|event| match event {
                    ProviderEvent::ToolCall(call) => Some(call.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>();

            if is_cli_protocol(self.provider_config.protocol) {
                self.emit_cli_tool_observations(&context.run_id, &tool_calls);
                if let Some(final_text) = display_text(&turn, self.provider_config.protocol) {
                    (self.events)(AgentRuntimeEvent::MessageDelta {
                        run_id: context.run_id.clone(),
                        text: final_text.clone(),
                    });
                    return Ok(final_text);
                }
                return Err(AgentError::invalid_model_output(
                    "本机模型没有返回可显示的最终答复",
                ));
            }

            if tool_calls.is_empty() {
                if turn.final_text.trim().is_empty() {
                    return Err(AgentError::invalid_model_output(
                        "模型没有返回可显示的最终答复",
                    ));
                }
                return Ok(turn.final_text.trim().into());
            }

            for call in tool_calls {
                self.require_not_cancelled()?;
                self.execute_tool(conversation_id, context, call)?;
            }
        }
        Err(AgentError::provider_failure(
            "Agent 连续调用工具次数过多，请缩小任务范围后重试",
        ))
    }

    async fn run_provider_turn(
        &mut self,
        request: ProviderTurnRequest,
        run_id: &str,
    ) -> Result<ProviderTurnResult, AgentError> {
        let sink: AgentEventSink = Arc::new(|_| {});
        let mut retried = false;
        loop {
            self.require_not_cancelled()?;
            let provider = self.control.provider()?;
            match provider.run(request.clone(), Arc::clone(&sink)).await {
                Ok(result) if valid_turn_result(&result, self.provider_config.protocol) => {
                    self.require_not_cancelled()?;
                    if !is_cli_protocol(self.provider_config.protocol) {
                        for event in &result.events {
                            if let ProviderEvent::TextDelta(text) = event {
                                (self.events)(AgentRuntimeEvent::MessageDelta {
                                    run_id: run_id.into(),
                                    text: text.clone(),
                                });
                            }
                        }
                    }
                    return Ok(result);
                }
                Ok(_) if !retried => {
                    retried = true;
                }
                Ok(_) => {
                    return Err(AgentError::invalid_model_output(
                        "模型连续两次没有返回可处理的答复",
                    ));
                }
                Err(error) if error.code() == "invalid_model_output" && !retried => {
                    retried = true;
                }
                Err(error) => return Err(error),
            }
        }
    }

    fn execute_tool(
        &mut self,
        conversation_id: &str,
        context: &AgentToolContext,
        call: ProviderToolCall,
    ) -> Result<(), AgentError> {
        (self.events)(AgentRuntimeEvent::ToolStarted {
            run_id: context.run_id.clone(),
            call_id: call.id.clone(),
            tool_name: call.name.clone(),
        });
        let result = self.tools.execute(context, &call.name, call.arguments);
        let (content, summary) = match result {
            Ok(value) => (
                json!({
                    "ok": true,
                    "toolCallId": call.id,
                    "toolName": call.name,
                    "result": value
                })
                .to_string(),
                "已完成".to_string(),
            ),
            Err(error) => (
                json!({
                    "ok": false,
                    "toolCallId": call.id,
                    "toolName": call.name,
                    "error": {
                        "code": error.code(),
                        "message": error.message()
                    }
                })
                .to_string(),
                error.message().to_string(),
            ),
        };
        self.repository.append_message(AgentMessageInput {
            conversation_id: conversation_id.into(),
            run_id: Some(context.run_id.clone()),
            role: AgentMessageRole::Tool,
            content,
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
        })?;
        (self.events)(AgentRuntimeEvent::ToolCompleted {
            run_id: context.run_id.clone(),
            call_id: call.id,
            summary,
        });
        if mutates_drafts(&call.name) {
            (self.events)(AgentRuntimeEvent::DraftsChanged {
                run_id: context.run_id.clone(),
                import_job_id: context.import_job_id.clone(),
            });
        }
        Ok(())
    }

    fn emit_cli_tool_observations(&self, run_id: &str, calls: &[ProviderToolCall]) {
        for call in calls {
            (self.events)(AgentRuntimeEvent::ToolStarted {
                run_id: run_id.into(),
                call_id: call.id.clone(),
                tool_name: call.name.clone(),
            });
            (self.events)(AgentRuntimeEvent::ToolCompleted {
                run_id: run_id.into(),
                call_id: call.id.clone(),
                summary: "本机模型已通过任务工具执行".into(),
            });
            if mutates_drafts(&call.name) {
                (self.events)(AgentRuntimeEvent::DraftsChanged {
                    run_id: run_id.into(),
                    import_job_id: self
                        .repository
                        .get_run(run_id)
                        .ok()
                        .and_then(|run| run.import_job_id)
                        .unwrap_or_default(),
                });
            }
        }
    }

    fn prepare_attachments(&self, job_id: &str) -> Result<Vec<ProviderAttachment>, AgentError> {
        let stored = self
            .tools
            .coordinator()
            .list_job_attachments(job_id)
            .map_err(map_ingest_error)?;
        let ids = stored
            .iter()
            .map(|attachment| attachment.id.clone())
            .collect::<Vec<_>>();
        let documents = self
            .tools
            .coordinator()
            .read_job_extractions(job_id, &ids)
            .map_err(map_ingest_error)?;
        let documents = documents
            .into_iter()
            .map(|document| (document.attachment_id.clone(), document))
            .collect::<BTreeMap<_, _>>();

        stored
            .into_iter()
            .map(|attachment| {
                let document = documents.get(&attachment.id);
                let data_base64 = if attachment.media_type.starts_with("image/") {
                    Some(
                        BASE64.encode(
                            self.tools
                                .coordinator()
                                .read_attachment_bytes(&attachment)
                                .map_err(map_ingest_error)?,
                        ),
                    )
                } else {
                    None
                };
                Ok(ProviderAttachment {
                    id: attachment.id,
                    media_type: attachment.media_type,
                    data_base64,
                    extracted_text: document
                        .map(extracted_text)
                        .filter(|text| !text.trim().is_empty()),
                })
            })
            .collect()
    }

    fn fail_run(&mut self, run_id: &str, assistant_id: Option<&str>, error: &AgentError) {
        if let Some(assistant_id) = assistant_id {
            let _ = self.repository.update_message(
                assistant_id,
                error.message(),
                AgentMessageStatus::Failed,
            );
        }
        let status = if error.code() == "cancelled" {
            AgentRunStatus::Cancelled
        } else {
            AgentRunStatus::Failed
        };
        let _ =
            self.repository
                .update_run(run_id, status, Some(error.code()), Some(error.message()));
        (self.events)(AgentRuntimeEvent::RunFailed {
            run_id: run_id.into(),
            code: error.code().into(),
            message: error.message().into(),
        });
    }

    fn require_not_cancelled(&self) -> Result<(), AgentError> {
        if self.control.cancelled() {
            Err(AgentError::cancelled("已取消本次 Agent 任务"))
        } else {
            Ok(())
        }
    }
}

fn extracted_text(document: &ExtractedDocument) -> String {
    let mut sections = document
        .text_blocks
        .iter()
        .map(|block| block.text.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    sections.extend(document.tables.iter().filter_map(|table| {
        let rows = table
            .rows
            .iter()
            .map(|row| row.join("\t"))
            .collect::<Vec<_>>()
            .join("\n");
        (!rows.trim().is_empty()).then_some(rows)
    }));
    sections.join("\n\n")
}

fn is_cli_protocol(protocol: AgentProviderProtocol) -> bool {
    matches!(
        protocol,
        AgentProviderProtocol::CodexCli | AgentProviderProtocol::ClaudeCodeCli
    )
}

fn valid_turn_result(result: &ProviderTurnResult, protocol: AgentProviderProtocol) -> bool {
    if is_cli_protocol(protocol) {
        return display_text(result, protocol).is_some();
    }
    !result.final_text.trim().is_empty()
        || result
            .events
            .iter()
            .any(|event| matches!(event, ProviderEvent::ToolCall(_)))
}

fn final_output_schema(protocol: AgentProviderProtocol) -> serde_json::Value {
    if is_cli_protocol(protocol) {
        json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "给用户看的最终答复，不包含隐藏思考过程"
                }
            },
            "required": ["message"],
            "additionalProperties": false
        })
    } else {
        json!({})
    }
}

fn display_text(result: &ProviderTurnResult, protocol: AgentProviderProtocol) -> Option<String> {
    if is_cli_protocol(protocol) {
        if let Some(message) = result
            .structured_output
            .as_ref()
            .and_then(|value| value.get("message"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|message| !message.is_empty())
        {
            return Some(message.into());
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&result.final_text)
            && let Some(message) = value
                .get("message")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|message| !message.is_empty())
        {
            return Some(message.into());
        }
    }
    let text = result.final_text.trim();
    (!text.is_empty()).then(|| text.into())
}

fn mutates_drafts(name: &str) -> bool {
    matches!(
        name,
        "create_ingredient_import_draft"
            | "update_ingredient_import_draft"
            | "merge_ingredient_import_drafts"
            | "split_ingredient_import_draft"
            | "discard_ingredient_import_draft"
    )
}

fn map_ingest_error(error: IngestError) -> AgentError {
    match error.code() {
        "scope_violation" => AgentError::scope_violation(error.message()),
        "invalid_input" | "invalid_state" | "not_found" | "unsupported_file" => {
            AgentError::invalid_input(error.message())
        }
        _ => AgentError::provider_failure(error.message()),
    }
}
