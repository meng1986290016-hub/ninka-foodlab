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
        AgentToolCallStatus,
    },
    providers::{
        AgentEventSink, AgentProvider, ProviderAttachment, ProviderEvent, ProviderToolCall,
        ProviderToolResult, ProviderToolRound, ProviderTurnRequest, ProviderTurnResult,
    },
    repository::AgentRepository,
    tools::{AgentToolContext, AgentToolRegistry},
};
use crate::ingest::{
    IngestError, extractors::ExtractedDocument, model::IngredientImportDraftStatus,
};

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
    RecipeProposalsChanged { run_id: String },
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
    task_plan: AgentTaskPlan,
}

struct AgentTaskPlan {
    tool_definitions: Vec<super::providers::AgentToolDefinition>,
    requires_tool: bool,
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
        let recipe_context = request.recipe_context.clone();

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
            active_recipe_id: recipe_context
                .as_ref()
                .map(|context| context.recipe_id.clone()),
            active_recipe_name: recipe_context
                .as_ref()
                .map(|context| context.recipe_name.clone()),
        };
        let task_kind = classify_task(
            &content,
            !attachment_ids.is_empty(),
            recipe_context.is_some(),
        );
        let tool_definitions = self
            .tools
            .definitions_for(task_kind.tool_names(!attachment_ids.is_empty()));
        let task_plan = AgentTaskPlan {
            tool_definitions,
            requires_tool: task_kind != AgentTaskKind::Conversation,
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
            task_plan,
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
            task_plan,
        } = prepared;
        let result = self
            .run_turns(
                &run.conversation_id,
                &assistant,
                attachment_ids,
                attachments,
                &context,
                task_plan,
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
                match self.complete_cli_draft_outcome(&run, &assistant, &context, &error) {
                    Ok(Some(completed_run)) => {
                        run = completed_run;
                        Ok(run)
                    }
                    Ok(None) => {
                        self.fail_run(&run.id, Some(&assistant.id), &error);
                        Err(error)
                    }
                    Err(recovery_error) => {
                        self.fail_run(&run.id, Some(&assistant.id), &recovery_error);
                        Err(recovery_error)
                    }
                }
            }
        };
        self.control.set_provider(None);
        completed
    }

    fn complete_cli_draft_outcome(
        &mut self,
        run: &AgentRun,
        assistant: &AgentMessage,
        context: &AgentToolContext,
        error: &AgentError,
    ) -> Result<Option<AgentRun>, AgentError> {
        if !is_cli_protocol(self.provider_config.protocol)
            || !matches!(
                error.code(),
                "provider_timeout" | "provider_failure" | "invalid_model_output"
            )
        {
            return Ok(None);
        }
        let completed_draft_write = self
            .repository
            .list_tool_calls(&run.id)?
            .iter()
            .any(|call| {
                call.status == AgentToolCallStatus::Completed
                    && matches!(
                        call.tool_name.as_str(),
                        "create_ingredient_import_draft" | "update_ingredient_import_draft"
                    )
            });
        if !completed_draft_write {
            return Ok(None);
        }
        let drafts = self
            .tools
            .coordinator()
            .list_drafts(&context.import_job_id)
            .map_err(map_ingest_error)?;
        let reviewable_count = drafts
            .iter()
            .filter(|draft| {
                !matches!(
                    draft.status,
                    IngredientImportDraftStatus::Imported | IngredientImportDraftStatus::Discarded
                )
            })
            .count();
        if reviewable_count == 0 {
            return Ok(None);
        }

        let message = format!(
            "已生成或更新 {reviewable_count} 张待人工复核原料草稿。模型在整理最终回复时未及时结束，但草稿已安全保留；请打开检查，确认后再保存。"
        );
        self.repository
            .update_message(&assistant.id, &message, AgentMessageStatus::Complete)?;
        let completed =
            self.repository
                .update_run(&run.id, AgentRunStatus::Completed, None, None)?;
        (self.events)(AgentRuntimeEvent::DraftsChanged {
            run_id: run.id.clone(),
            import_job_id: context.import_job_id.clone(),
        });
        (self.events)(AgentRuntimeEvent::RunCompleted {
            run_id: run.id.clone(),
        });
        Ok(Some(completed))
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
        task_plan: AgentTaskPlan,
    ) -> Result<String, AgentError> {
        let mut actual_tool_called = false;
        let mut tool_rounds = Vec::new();
        for _ in 0..MAX_AGENT_TURNS {
            self.require_not_cancelled()?;
            let mut messages = self
                .repository
                .list_messages(conversation_id)?
                .into_iter()
                .filter(|message| {
                    message.id != assistant.id && message.role != AgentMessageRole::Tool
                })
                .collect::<Vec<_>>();
            append_attachment_scope(&mut messages, &attachment_ids, &attachments);
            // Old failed runs may contain an empty user placeholder. Some providers
            // (notably Kimi) reject the whole request when any historical message is
            // empty, so remove empty history after the current attachment scope has
            // had a chance to turn an attachment-only user message into real content.
            messages.retain(|message| !message.content.trim().is_empty());
            if let (Some(recipe_id), Some(recipe_name)) = (
                context.active_recipe_id.as_deref(),
                context.active_recipe_name.as_deref(),
            ) && let Some(message) = messages
                .iter_mut()
                .rev()
                .find(|message| message.role == AgentMessageRole::User)
            {
                message.content.push_str(&format!(
                    "\n\n[当前工作台上下文：配方“{recipe_name}”，recipeId={recipe_id}。当用户要求诊断当前配方时必须调用 diagnose_recipe；要求复盘研发记录或给出下一轮打样建议时必须调用 review_recipe_development，并严格区分已记录事实、待确认项和建议，没有记录的工艺或感官信息必须明确写未记录；比较供应商替代影响时必须调用 compare_supplier_variant。这些工具只读，不能宣称已经修改配方。]"
                ));
            }
            let turn = self
                .run_provider_turn(
                    ProviderTurnRequest {
                        messages,
                        attachment_ids: attachment_ids.clone(),
                        attachments: attachments.clone(),
                        tools: task_plan.tool_definitions.clone(),
                        tool_rounds: tool_rounds.clone(),
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
            let tool_observations = turn
                .events
                .iter()
                .filter_map(|event| match event {
                    ProviderEvent::ToolObservation(call) => Some(call.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>();

            if is_cli_protocol(self.provider_config.protocol) {
                self.emit_cli_tool_observations(&context.run_id, &tool_observations);
                actual_tool_called |= !tool_observations.is_empty();
            }

            if !tool_calls.is_empty() {
                actual_tool_called = true;
                let calls = tool_calls;
                let mut results = Vec::with_capacity(calls.len());
                for call in &calls {
                    self.require_not_cancelled()?;
                    results.push(self.execute_tool(conversation_id, context, call.clone())?);
                }
                tool_rounds.push(ProviderToolRound { calls, results });
                continue;
            }

            let final_text = if is_cli_protocol(self.provider_config.protocol) {
                display_text(&turn, self.provider_config.protocol).ok_or_else(|| {
                    AgentError::invalid_model_output("本机模型没有返回可显示的最终答复")
                })?
            } else {
                let text = turn.final_text.trim();
                if text.is_empty() {
                    return Err(AgentError::invalid_model_output(
                        "模型没有返回可显示的最终答复",
                    ));
                }
                text.into()
            };
            if task_plan.requires_tool && !actual_tool_called {
                return Err(AgentError::required_tool_not_called());
            }
            if is_cli_protocol(self.provider_config.protocol) {
                (self.events)(AgentRuntimeEvent::MessageDelta {
                    run_id: context.run_id.clone(),
                    text: final_text.clone(),
                });
            }
            return Ok(final_text);
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
    ) -> Result<ProviderToolResult, AgentError> {
        (self.events)(AgentRuntimeEvent::ToolStarted {
            run_id: context.run_id.clone(),
            call_id: call.id.clone(),
            tool_name: call.name.clone(),
        });
        let result = self
            .tools
            .execute(context, &call.name, call.arguments.clone());
        let (output, summary, is_error) = match result {
            Ok(value) => (
                json!({
                    "ok": true,
                    "toolCallId": call.id,
                    "toolName": call.name,
                    "result": value
                }),
                "已完成".to_string(),
                false,
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
                }),
                error.message().to_string(),
                true,
            ),
        };
        self.repository.append_message(AgentMessageInput {
            conversation_id: conversation_id.into(),
            run_id: Some(context.run_id.clone()),
            role: AgentMessageRole::Tool,
            content: output.to_string(),
            attachment_ids: vec![],
            status: AgentMessageStatus::Complete,
        })?;
        (self.events)(AgentRuntimeEvent::ToolCompleted {
            run_id: context.run_id.clone(),
            call_id: call.id.clone(),
            summary,
        });
        if mutates_drafts(&call.name) {
            (self.events)(AgentRuntimeEvent::DraftsChanged {
                run_id: context.run_id.clone(),
                import_job_id: context.import_job_id.clone(),
            });
        }
        if mutates_recipe_proposals(&call.name) {
            (self.events)(AgentRuntimeEvent::RecipeProposalsChanged {
                run_id: context.run_id.clone(),
            });
        }
        Ok(ProviderToolResult {
            call_id: call.id,
            name: call.name,
            output,
            is_error,
        })
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
            if mutates_recipe_proposals(&call.name) {
                (self.events)(AgentRuntimeEvent::RecipeProposalsChanged {
                    run_id: run_id.into(),
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
        return display_text(result, protocol).is_some()
            || result.events.iter().any(|event| {
                matches!(
                    event,
                    ProviderEvent::ToolCall(_) | ProviderEvent::ToolObservation(_)
                )
            });
    }
    !result.final_text.trim().is_empty()
        || result
            .events
            .iter()
            .any(|event| matches!(event, ProviderEvent::ToolCall(_)))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AgentTaskKind {
    Conversation,
    IngredientImport,
    IngredientResearch,
    RecipeDesign,
    RecipeWorkspace,
}

impl AgentTaskKind {
    fn tool_names(self, has_attachments: bool) -> &'static [&'static str] {
        match (self, has_attachments) {
            (Self::Conversation, _) => &[],
            (Self::IngredientImport, _) => &[
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "search_categories",
                "list_nutrient_definitions",
                "read_task_attachments",
                "create_ingredient_import_draft",
                "update_ingredient_import_draft",
                "discard_ingredient_import_draft",
                "validate_ingredient_import_draft",
                "request_open_ingredient_review",
            ],
            (Self::IngredientResearch, _) => &[
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "search_categories",
                "list_nutrient_definitions",
            ],
            (Self::RecipeDesign, true) => &[
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "list_nutrient_definitions",
                "read_task_attachments",
                "evaluate_recipe_proposal",
                "create_recipe_proposal",
                "update_recipe_proposal",
                "request_open_recipe_proposal_review",
            ],
            (Self::RecipeDesign, false) => &[
                "search_material_groups",
                "search_supplier_variants",
                "search_suppliers",
                "list_nutrient_definitions",
                "evaluate_recipe_proposal",
                "create_recipe_proposal",
                "update_recipe_proposal",
                "request_open_recipe_proposal_review",
            ],
            (Self::RecipeWorkspace, _) => &[
                "search_supplier_variants",
                "diagnose_recipe",
                "review_recipe_development",
                "compare_supplier_variant",
            ],
        }
    }
}

fn classify_task(content: &str, has_attachments: bool, has_recipe_context: bool) -> AgentTaskKind {
    let compact = content
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();

    if has_recipe_context
        && [
            "诊断", "复盘", "比较", "对比", "替代", "建议", "优化", "调整",
        ]
        .iter()
        .any(|action| compact.contains(action))
    {
        return AgentTaskKind::RecipeWorkspace;
    }

    let recipe_tasks = [
        "设计配方",
        "创建配方",
        "生成配方",
        "开发配方",
        "试算配方",
        "优化配方",
        "调整配方",
        "逆向配方",
        "配方逆向",
        "逆向标签",
    ];
    let product_creation = [
        "我想做",
        "帮我做",
        "帮我设计",
        "帮我开发",
        "设计一款",
        "开发一款",
    ];
    if recipe_tasks.iter().any(|task| compact.contains(task))
        || product_creation
            .iter()
            .any(|prefix| compact.contains(prefix))
    {
        return AgentTaskKind::RecipeDesign;
    }

    let import_tasks = [
        "加入原料",
        "添加原料",
        "导入原料",
        "新建原料",
        "创建原料",
        "识别原料",
        "读取原料",
        "原料草稿",
    ];
    if import_tasks.iter().any(|task| compact.contains(task)) || has_attachments {
        return AgentTaskKind::IngredientImport;
    }

    let research_tasks = ["分析原料库", "检索原料", "搜索原料", "查找原料", "对比原料"];
    if research_tasks.iter().any(|task| compact.contains(task)) {
        return AgentTaskKind::IngredientResearch;
    }
    AgentTaskKind::Conversation
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
            | "discard_ingredient_import_draft"
    )
}

fn mutates_recipe_proposals(name: &str) -> bool {
    matches!(name, "create_recipe_proposal" | "update_recipe_proposal")
}

fn append_attachment_scope(
    messages: &mut [AgentMessage],
    attachment_ids: &[String],
    attachments: &[ProviderAttachment],
) {
    if attachment_ids.is_empty() {
        return;
    }
    let Some(message) = messages
        .iter_mut()
        .rev()
        .find(|message| message.role == AgentMessageRole::User)
    else {
        return;
    };

    message.content.push_str(
        "\n\n[系统生成的本次任务附件范围：调用 read_task_attachments 时将 attachmentIds 传 null 或空数组（兼容客户端也可省略），系统将只读取下列已选附件。创建草稿的 attachmentIds 和 sourceLinks.attachmentId 必须原样使用下列真实 ID，不得使用临时文件名、附件序号或历史任务 ID。\n",
    );
    for (index, attachment_id) in attachment_ids.iter().enumerate() {
        let media_type = attachments
            .iter()
            .find(|attachment| attachment.id == *attachment_id)
            .map(|attachment| attachment.media_type.as_str())
            .unwrap_or("unknown");
        message.content.push_str(&format!(
            "- 附件 {}: attachmentId={attachment_id}; mediaType={media_type}\n",
            index + 1
        ));
    }
    message.content.push(']');
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
