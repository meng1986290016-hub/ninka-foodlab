use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde_json::{Value, json};

use crate::ingredients::repository::RepositoryError;

use super::{
    contract::validate_completion,
    model::{
        AgentTask, AgentTaskEvent, ApprovalPolicy, ArtifactStatus, ContentChoice, ContentSource,
        FoodLabContentBlock, TaskOutcome,
    },
    repository::HarnessRepository,
};

/// Persists a complete Harness history cut and rebuilds FoodLab's durable UI projection.
/// Harness remains the canonical log; this mirror intentionally redacts raw tool arguments.
pub fn ingest_history(
    repository: &mut HarnessRepository,
    task_id: &str,
    entries: &[Value],
) -> Result<AgentTask, RepositoryError> {
    bind_turns(repository, task_id, entries)?;
    let mut ordered = entries.to_vec();
    ordered.sort_by_key(event_seq);
    let mut task = repository.get_task(task_id)?;
    let mut last_seen_seq = task.last_event_seq;
    let mut active_harness_turn: Option<String> = None;

    for entry in &ordered {
        let Some(event) = entry
            .get("event")
            .or_else(|| entry.get("type").map(|_| entry))
        else {
            continue;
        };
        let Some(seq) = event.get("seq").and_then(Value::as_i64) else {
            continue;
        };
        if seq <= task.last_event_seq {
            continue;
        }
        last_seen_seq = last_seen_seq.max(seq);
        let event_type = event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        if event_type == "turn/start" {
            active_harness_turn = event_turn(event);
        }
        let harness_turn = event_turn(event).or_else(|| {
            matches!(event_type, "user/message")
                .then(|| active_harness_turn.clone())
                .flatten()
        });
        let turn = harness_turn
            .as_deref()
            .map(|turn| repository.find_turn_by_harness_id(task_id, turn))
            .transpose()?
            .flatten();
        let mut payload = event.clone();
        redact_event_payload(event_type, &mut payload);
        if let Some(view) = entry.get("view")
            && let Some(object) = payload.as_object_mut()
        {
            object.insert("_view".into(), view.clone());
        }
        let data = event.get("data").unwrap_or(&Value::Null);
        let step = scalar_string(data.get("step"));
        let call_id = data
            .get("callId")
            .or_else(|| data.pointer("/message/toolCallId"))
            .and_then(Value::as_str);
        if event_type == "assistant/chunk"
            && payload.pointer("/data/chunk/type").and_then(Value::as_str) != Some("text-delta")
        {
            continue;
        }
        repository.append_event(
            task_id,
            seq,
            event_type,
            turn.as_ref().map(|turn| turn.id.as_str()),
            step.as_deref(),
            call_id,
            &payload,
        )?;
        task.last_event_seq = seq;
    }

    if last_seen_seq > task.last_event_seq {
        task = repository.advance_event_cursor(task_id, last_seen_seq)?;
    }

    project_turns(repository, task_id)?;
    let _ = task;
    repository.get_task(task_id)
}

fn bind_turns(
    repository: &mut HarnessRepository,
    task_id: &str,
    entries: &[Value],
) -> Result<(), RepositoryError> {
    let mut unbound = repository
        .list_turns(task_id)?
        .into_iter()
        .filter(|turn| turn.harness_turn_id.is_none())
        .map(|turn| turn.id)
        .collect::<Vec<_>>()
        .into_iter();
    let mut seen = BTreeSet::new();
    for entry in entries {
        let Some(event) = entry
            .get("event")
            .or_else(|| entry.get("type").map(|_| entry))
        else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) != Some("turn/start") {
            continue;
        }
        let Some(harness_turn_id) = event_turn(event) else {
            continue;
        };
        if !seen.insert(harness_turn_id.clone())
            || repository
                .find_turn_by_harness_id(task_id, &harness_turn_id)?
                .is_some()
        {
            continue;
        }
        if let Some(turn_id) = unbound.next() {
            repository.bind_harness_turn(&turn_id, &harness_turn_id)?;
        }
    }
    Ok(())
}

fn project_turns(repository: &mut HarnessRepository, task_id: &str) -> Result<(), RepositoryError> {
    let task = repository.get_task(task_id)?;
    let events = repository.list_events(task_id, -1)?;
    let mut audit_statuses = BTreeMap::<String, VecDeque<String>>::new();
    for (tool, status) in repository.legacy_tool_statuses(task_id)? {
        audit_statuses
            .entry(normalize_tool_name(&tool).to_string())
            .or_default()
            .push_back(status);
    }
    let mut audited_call_status = BTreeMap::<String, String>::new();
    for event in &events {
        if event.event_type != "tool/call" {
            continue;
        }
        let data = event.payload.get("data").unwrap_or(&Value::Null);
        let (Some(call_id), Some(name)) = (
            data.get("callId").and_then(Value::as_str),
            data.get("name").and_then(Value::as_str),
        ) else {
            continue;
        };
        if let Some(status) = audit_statuses
            .get_mut(normalize_tool_name(name))
            .and_then(VecDeque::pop_front)
        {
            audited_call_status.insert(call_id.to_string(), status);
        }
    }
    for turn in repository.list_turns(task_id)? {
        let turn_events = events
            .iter()
            .filter(|event| event.turn_id.as_deref() == Some(&turn.id))
            .collect::<Vec<_>>();
        if turn_events.is_empty() {
            continue;
        }
        let mut blocks = Vec::new();
        let mut structured_blocks = Vec::new();
        let mut final_text: Option<String> = None;
        let mut streamed_text = BTreeMap::<String, String>::new();
        let mut finalized_steps = BTreeSet::<String>::new();
        let mut tool_names = BTreeMap::<String, String>::new();
        let mut tool_calls_by_seq = BTreeMap::<i64, String>::new();
        let mut questions = BTreeMap::<String, (String, Vec<ContentChoice>)>::new();
        let mut completed_tools = Vec::new();
        let mut artifact_kinds = Vec::new();
        let mut sources = BTreeMap::<String, ContentSource>::new();
        let mut end_reason: Option<Value> = None;
        let mut requested_input = false;

        for event in &turn_events {
            let data = event.payload.get("data").unwrap_or(&Value::Null);
            match event.event_type.as_str() {
                "assistant/message" => {
                    if let Some(step) = scalar_string(data.get("step")) {
                        finalized_steps.insert(step);
                    }
                    if let Some(text) = message_text(data.pointer("/message/content"))
                        && !text.trim().is_empty()
                    {
                        final_text = Some(text);
                    }
                }
                "assistant/chunk" => {
                    if data.pointer("/chunk/type").and_then(Value::as_str) == Some("text-delta")
                        && let Some(text) = data.pointer("/chunk/text").and_then(Value::as_str)
                    {
                        let step = scalar_string(data.get("step")).unwrap_or_else(|| "0".into());
                        streamed_text.entry(step).or_default().push_str(text);
                    }
                }
                "tool/call" => {
                    if let (Some(call_id), Some(name)) = (
                        data.get("callId").and_then(Value::as_str),
                        data.get("name").and_then(Value::as_str),
                    ) {
                        let normalized = normalize_tool_name(name);
                        tool_names.insert(call_id.into(), normalized.into());
                        tool_calls_by_seq.insert(event.seq, call_id.into());
                        if normalized == "request_task_input"
                            && let Some(question) = structured_question(data.get("question"))
                        {
                            questions.insert(call_id.into(), question);
                        }
                    }
                }
                "tool/result" => {
                    let call_id = tool_result_call_id(event, &tool_calls_by_seq);
                    if let Some(name) = call_id.and_then(|call_id| tool_names.get(call_id)) {
                        let audited_status =
                            call_id.and_then(|call_id| audited_call_status.get(call_id));
                        let succeeded = audited_status
                            .map(|status| status == "completed")
                            .unwrap_or_else(|| tool_result_succeeded(data));
                        if !succeeded {
                            continue;
                        }
                        completed_tools.push(name.clone());
                        if name == "request_task_input" {
                            requested_input = true;
                            if let Some((prompt, choices)) =
                                call_id.and_then(|call_id| questions.get(call_id)).cloned()
                            {
                                structured_blocks
                                    .push(FoodLabContentBlock::Question { prompt, choices });
                            }
                        }
                        if let Some(kind) = artifact_kind_for_tool(name) {
                            artifact_kinds.push(kind.to_string());
                            let domain_id = tool_result_domain_id(data)
                                .or_else(|| call_id.map(str::to_string))
                                .unwrap_or_else(|| format!("event-{}", event.seq));
                            let domain_ref = format!("{kind}:{domain_id}");
                            let artifact =
                                match repository.find_artifact_by_domain_ref(&domain_ref)? {
                                    Some(artifact) => artifact,
                                    None => repository.create_artifact(
                                        task_id,
                                        &turn.id,
                                        call_id,
                                        kind,
                                        artifact_title(kind, data).as_str(),
                                        Some(&domain_ref),
                                        artifact_status(kind),
                                        &json!({
                                            "source": "harness_tool_result",
                                            "eventSeq": event.seq,
                                            "tool": name,
                                            "evidenceSource": data.get("evidenceSource"),
                                            "argumentsStored": false,
                                        }),
                                    )?,
                                };
                            structured_blocks.push(FoodLabContentBlock::ArtifactRef {
                                artifact_id: artifact.id,
                            });
                        }
                    }
                }
                "turn/end" => end_reason = data.get("reason").cloned(),
                _ => {}
            }
            collect_sources(&event.payload, &mut sources);
        }
        if let Some(text) = final_text {
            blocks.push(FoodLabContentBlock::Markdown { text });
        } else if let Some((_, text)) = streamed_text
            .into_iter()
            .filter(|(step, text)| !finalized_steps.contains(step) && !text.trim().is_empty())
            .last()
        {
            blocks.push(FoodLabContentBlock::Markdown { text });
        }
        blocks.extend(structured_blocks);
        if !sources.is_empty() {
            blocks.push(FoodLabContentBlock::Citations {
                sources: sources.into_values().collect(),
            });
        }

        let (outcome, error_code, error_summary) = outcome_for(
            end_reason.as_ref(),
            &task,
            &completed_tools,
            &artifact_kinds,
            requested_input,
        );
        repository.settle_turn(&turn.id, outcome, &blocks)?;
        if repository.is_latest_turn(task_id, &turn.id)? {
            repository.update_task_outcome(
                task_id,
                outcome,
                error_code.as_deref(),
                error_summary.as_deref(),
            )?;
        }
    }
    Ok(())
}

fn outcome_for(
    reason: Option<&Value>,
    task: &AgentTask,
    completed_tools: &[String],
    artifact_kinds: &[String],
    requested_input: bool,
) -> (TaskOutcome, Option<String>, Option<String>) {
    let Some(reason) = reason else {
        return (TaskOutcome::Running, None, None);
    };
    if requested_input {
        return (TaskOutcome::NeedsInput, None, None);
    }
    match reason.get("kind").and_then(Value::as_str) {
        Some("completed") => {
            match validate_completion(&task.task_contract, completed_tools, artifact_kinds) {
                Ok(())
                    if task.task_contract.approval_policy == ApprovalPolicy::ReviewBeforeCommit =>
                {
                    (TaskOutcome::NeedsReview, None, None)
                }
                Ok(()) => (TaskOutcome::Completed, None, None),
                Err(missing) => (
                    TaskOutcome::Failed,
                    Some("required_contract_unmet".into()),
                    Some(format!("任务合约未满足：{}", missing.join("，"))),
                ),
            }
        }
        Some("blocked") => (TaskOutcome::NeedsInput, None, None),
        Some("aborted")
            if reason.pointer("/reason/kind").and_then(Value::as_str) == Some("user") =>
        {
            (TaskOutcome::Cancelled, None, None)
        }
        Some("aborted") | Some("interrupted") => (TaskOutcome::Interrupted, None, None),
        Some("max-tokens") => (
            TaskOutcome::Interrupted,
            Some("max_tokens".into()),
            Some("模型输出达到上限，可补充条件后继续同一任务".into()),
        ),
        Some("error") => {
            let (code, summary) = normalized_provider_error(reason);
            (TaskOutcome::Failed, Some(code), Some(summary))
        }
        _ => (
            TaskOutcome::Failed,
            Some("unknown_turn_outcome".into()),
            None,
        ),
    }
}

fn normalized_provider_error(reason: &Value) -> (String, String) {
    let raw_code = reason
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("provider_request_failed");
    let raw_message = reason
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("");
    let diagnostic = format!("{raw_code} {raw_message}").to_ascii_lowercase();
    if diagnostic.contains("provider is not configured") {
        return (
            "provider_not_configured".into(),
            "当前会话所选 Provider 尚未配置，请在模型设置中保存 API Key 后重试".into(),
        );
    }
    if diagnostic.contains("401")
        || diagnostic.contains("403")
        || diagnostic.contains("auth")
        || diagnostic.contains("credential")
        || diagnostic.contains("api key")
    {
        return (
            "provider_auth_failed".into(),
            "API Key 无效、已过期或无权访问当前模型".into(),
        );
    }
    if diagnostic.contains("402")
        || diagnostic.contains("balance")
        || diagnostic.contains("quota")
        || diagnostic.contains("insufficient")
    {
        return (
            "provider_quota_exceeded".into(),
            "Provider 余额或额度不足，请充值或切换模型".into(),
        );
    }
    if diagnostic.contains("429") || diagnostic.contains("rate") {
        return (
            "provider_rate_limited".into(),
            "Provider 请求过于频繁，请稍后重试".into(),
        );
    }
    if diagnostic.contains("model")
        && (diagnostic.contains("not found") || diagnostic.contains("unavailable"))
    {
        return (
            "provider_model_unavailable".into(),
            "当前模型不可用，请在模型选择器中改用其他模型".into(),
        );
    }
    if diagnostic.contains("transport")
        || diagnostic.contains("network")
        || diagnostic.contains("fetch")
        || diagnostic.contains("connect")
        || diagnostic.contains("timeout")
    {
        return (
            "provider_network_unavailable".into(),
            "无法连接 Provider，请检查网络后重试".into(),
        );
    }
    (
        "provider_request_failed".into(),
        "Provider 未能完成本次请求，请重试或切换模型".into(),
    )
}

fn event_seq(entry: &Value) -> i64 {
    entry
        .pointer("/event/seq")
        .or_else(|| entry.get("seq"))
        .and_then(Value::as_i64)
        .unwrap_or(i64::MAX)
}

fn event_turn(event: &Value) -> Option<String> {
    scalar_string(event.pointer("/data/turn"))
}

fn scalar_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn message_text(content: Option<&Value>) -> Option<String> {
    let text = content?
        .as_array()?
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n\n");
    Some(text)
}

fn normalize_tool_name(name: &str) -> &str {
    name.strip_prefix("mcp__food_rd__").unwrap_or(name)
}

fn tool_result_succeeded(data: &Value) -> bool {
    data.get("error").is_none()
        && data.pointer("/message/isError").and_then(Value::as_bool) != Some(true)
}

fn tool_result_call_id<'a>(
    event: &'a AgentTaskEvent,
    tool_calls_by_seq: &'a BTreeMap<i64, String>,
) -> Option<&'a str> {
    event
        .payload
        .pointer("/data/message/toolCallId")
        .and_then(Value::as_str)
        .or(event.call_id.as_deref())
        .or_else(|| {
            event
                .payload
                .get("sourceEventSeqs")
                .or_else(|| event.payload.pointer("/data/sourceEventSeqs"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_i64)
                .find_map(|seq| tool_calls_by_seq.get(&seq).map(String::as_str))
        })
}

fn artifact_kind_for_tool(name: &str) -> Option<&'static str> {
    Some(match name {
        "create_ingredient_import_draft" | "update_ingredient_import_draft" => {
            "ingredient_import_draft"
        }
        "create_recipe_proposal" | "update_recipe_proposal" => "recipe_proposal",
        "create_recipe_estimate_card" => "recipe_estimate_card",
        "diagnose_recipe" => "recipe_analysis",
        "create_label_compliance_review" => "label_compliance_review",
        "create_research_report_draft" => "research_report",
        _ => return None,
    })
}

fn artifact_status(kind: &str) -> ArtifactStatus {
    match kind {
        "recipe_analysis" => ArtifactStatus::Accepted,
        _ => ArtifactStatus::NeedsReview,
    }
}

fn artifact_title(kind: &str, data: &Value) -> String {
    find_string_key(data, &["artifactTitle", "title", "name"])
        .map(str::to_string)
        .unwrap_or_else(|| match kind {
            "ingredient_import_draft" => "原料导入草稿".into(),
            "recipe_proposal" => "配方提案".into(),
            "recipe_estimate_card" => "研发估算卡".into(),
            "recipe_analysis" => "配方分析".into(),
            "label_compliance_review" => "标签合规审查草稿".into(),
            "research_report" => "研发报告草稿".into(),
            _ => "FoodLab 成果".into(),
        })
}

fn tool_result_domain_id(data: &Value) -> Option<String> {
    if let Some(domain_id) = data.get("domainId").and_then(Value::as_str) {
        return Some(domain_id.to_string());
    }
    tool_result_embedded_string(
        data,
        &[
            "artifactId",
            "draftId",
            "proposalId",
            "estimateCardId",
            "id",
        ],
    )
}

fn tool_result_embedded_string(data: &Value, keys: &[&str]) -> Option<String> {
    if let Some(value) = find_string_key(data, keys) {
        return Some(value.to_string());
    }
    let content = data.pointer("/message/content")?.as_array()?;
    for block in content {
        let Some(text) = block.get("text").and_then(Value::as_str) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(text) else {
            continue;
        };
        if let Some(value) = find_string_key(&value, keys) {
            return Some(value.into());
        }
    }
    None
}

fn find_string_key<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    match value {
        Value::Object(object) => {
            for key in keys {
                if let Some(value) = object.get(*key).and_then(Value::as_str) {
                    return Some(value);
                }
            }
            object
                .values()
                .find_map(|value| find_string_key(value, keys))
        }
        Value::Array(array) => array.iter().find_map(|value| find_string_key(value, keys)),
        _ => None,
    }
}

fn collect_sources(value: &Value, sources: &mut BTreeMap<String, ContentSource>) {
    match value {
        Value::Object(object) => {
            if let Some(url) = object.get("url").and_then(Value::as_str)
                && url.starts_with("http")
            {
                sources.entry(url.into()).or_insert_with(|| ContentSource {
                    url: url.into(),
                    title: object
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    snippet: object
                        .get("snippet")
                        .or_else(|| object.get("citedText"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    published_at: object
                        .get("publishedAt")
                        .or_else(|| object.get("pageAge"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                });
            }
            for nested in object.values() {
                collect_sources(nested, sources);
            }
        }
        Value::Array(array) => {
            for nested in array {
                collect_sources(nested, sources);
            }
        }
        _ => {}
    }
}

fn redact_event_payload(event_type: &str, payload: &mut Value) {
    let sources = sanitized_source_values(payload);
    let Some(data) = payload.get_mut("data").and_then(Value::as_object_mut) else {
        return;
    };
    match event_type {
        "assistant/message" => {
            if let Some(message) = data.get_mut("message").and_then(Value::as_object_mut) {
                let role = message.get("role").cloned();
                let id = message.get("id").cloned();
                let content = message
                    .get("content")
                    .and_then(Value::as_array)
                    .map(|content| {
                        content
                            .iter()
                            .filter(|block| {
                                block.get("type").and_then(Value::as_str) == Some("text")
                            })
                            .filter_map(|block| {
                                block
                                    .get("text")
                                    .and_then(Value::as_str)
                                    .map(|text| json!({ "type": "text", "text": text }))
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                message.clear();
                if let Some(role) = role {
                    message.insert("role".into(), role);
                }
                if let Some(id) = id {
                    message.insert("id".into(), id);
                }
                message.insert("content".into(), Value::Array(content));
                message.insert("privateBlocksRedacted".into(), Value::Bool(true));
            }
            data.remove("reasoning");
            data.remove("arguments");
        }
        "tool/call" | "tool/code-dispatch-start" => {
            let question = data
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| normalize_tool_name(name) == "request_task_input")
                .and_then(|_| data.get("arguments"))
                .and_then(Value::as_str)
                .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
                .and_then(|arguments| sanitized_question_value(&arguments));
            data.remove("arguments");
            data.remove("args");
            data.insert("argumentsRedacted".into(), Value::Bool(true));
            if let Some(question) = question {
                data.insert("question".into(), question);
            }
        }
        "tool/result" | "tool/code-dispatch" => {
            let message = data.get("message").cloned().unwrap_or(Value::Null);
            let tool_call_id = message.get("toolCallId").cloned();
            let is_error = message.get("isError").cloned();
            let domain_id = tool_result_domain_id(&Value::Object(data.clone()));
            let artifact_title =
                tool_result_embedded_string(&Value::Object(data.clone()), &["title", "name"]);
            let evidence_source =
                tool_result_embedded_string(&Value::Object(data.clone()), &["evidenceSource"]);
            data.remove("message");
            data.remove("meta");
            data.remove("content");
            data.remove("arguments");
            if tool_call_id.is_some() || is_error.is_some() {
                data.insert(
                    "message".into(),
                    json!({
                        "toolCallId": tool_call_id,
                        "isError": is_error,
                        "contentRedacted": true,
                    }),
                );
            }
            data.insert("resultRedacted".into(), Value::Bool(true));
            if let Some(domain_id) = domain_id {
                data.insert("domainId".into(), Value::String(domain_id));
            }
            if let Some(title) = artifact_title {
                data.insert("artifactTitle".into(), Value::String(title));
            }
            if let Some(evidence_source) = evidence_source {
                data.insert("evidenceSource".into(), Value::String(evidence_source));
            }
        }
        "assistant/chunk" => {
            let visible_delta = data
                .get("chunk")
                .filter(|chunk| chunk.get("type").and_then(Value::as_str) == Some("text-delta"))
                .and_then(|chunk| chunk.get("text").and_then(Value::as_str))
                .map(str::to_string);
            data.remove("chunk");
            match visible_delta {
                Some(text) => {
                    data.insert(
                        "chunk".into(),
                        json!({ "type": "text-delta", "text": text }),
                    );
                }
                None => {
                    data.insert("chunkRedacted".into(), Value::Bool(true));
                }
            }
        }
        "request/header" => {
            if let Some(header) = data.get_mut("header").and_then(Value::as_object_mut) {
                header.remove("system");
                header.remove("tools");
                header.insert("promptAndToolsRedacted".into(), Value::Bool(true));
            }
        }
        _ => {}
    }
    if !sources.is_empty()
        && let Some(object) = payload.as_object_mut()
    {
        object.insert("_sources".into(), Value::Array(sources));
    }
}

fn sanitized_question_value(arguments: &Value) -> Option<Value> {
    let prompt = arguments.get("prompt")?.as_str()?.trim();
    if prompt.is_empty() {
        return None;
    }
    let choices = arguments
        .get("choices")
        .and_then(Value::as_array)
        .map(|choices| {
            choices
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|choice| !choice.is_empty())
                .take(8)
                .enumerate()
                .map(|(index, label)| json!({ "id": format!("choice-{index}"), "label": label }))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some(json!({ "prompt": prompt, "choices": choices }))
}

fn structured_question(value: Option<&Value>) -> Option<(String, Vec<ContentChoice>)> {
    let value = value?;
    let prompt = value.get("prompt")?.as_str()?.to_string();
    let choices = value
        .get("choices")
        .and_then(Value::as_array)
        .map(|choices| {
            choices
                .iter()
                .filter_map(|choice| {
                    Some(ContentChoice {
                        id: choice.get("id")?.as_str()?.to_string(),
                        label: choice.get("label")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some((prompt, choices))
}

fn sanitized_source_values(value: &Value) -> Vec<Value> {
    let mut sources = BTreeMap::new();
    collect_sources(value, &mut sources);
    sources
        .into_values()
        .map(|source| {
            json!({
                "url": source.url,
                "title": source.title,
                "snippet": source.snippet,
                "publishedAt": source.published_at,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_harness::{
        contract::{Workflow, contract_for},
        repository::HarnessRepository,
    };

    fn repository() -> HarnessRepository {
        let ids = std::sync::Mutex::new((0_u64..).map(|id| format!("id-{id}")));
        HarnessRepository::open_in_memory_with(
            || "2026-08-20T00:00:00Z".into(),
            move || ids.lock().unwrap().next().unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn provider_errors_are_mapped_to_actionable_foodlab_messages() {
        let mut repository = repository();
        let task = repository
            .create_task("问答", &contract_for(Workflow::LocalKnowledge), None, None)
            .unwrap();
        let reason = json!({
            "kind": "error",
            "error": {
                "code": "PI_AI_ERROR",
                "message": "Provider is not configured: openai"
            }
        });
        let (outcome, code, summary) = outcome_for(Some(&reason), &task, &[], &[], false);
        assert_eq!(outcome, TaskOutcome::Failed);
        assert_eq!(code.as_deref(), Some("provider_not_configured"));
        assert!(summary.unwrap().contains("模型设置"));
    }

    #[test]
    fn completed_turn_fails_when_required_chain_is_missing_and_arguments_are_redacted() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "甜度估算",
                &contract_for(Workflow::RecipeEstimate),
                None,
                None,
            )
            .unwrap();
        repository.create_turn(&task.id, None, "估算").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"tool/call","seq":1,"time":2,"data":{"turn":0,"step":0,"callId":"c1","name":"mcp__food_rd__create_recipe_estimate_card","arguments":"{\"secret\":true}"}}}),
            json!({"event":{"type":"tool/result","seq":2,"time":3,"data":{"turn":0,"step":0,"message":{"toolCallId":"c1","content":[{"type":"text","text":"{\"estimateCardId\":\"e1\"}"}],"isError":false}}}}),
            json!({"event":{"type":"turn/end","seq":3,"time":4,"data":{"turn":0,"reason":{"kind":"completed"}}}}),
        ];
        let projected = ingest_history(&mut repository, &task.id, &events).unwrap();
        assert_eq!(projected.status, TaskOutcome::Failed);
        assert_eq!(
            projected.error_code.as_deref(),
            Some("required_contract_unmet")
        );
        let stored = repository.list_events(&task.id, -1).unwrap();
        assert!(stored[1].payload.pointer("/data/arguments").is_none());
        assert_eq!(
            stored[1].payload.pointer("/data/argumentsRedacted"),
            Some(&Value::Bool(true))
        );
        assert!(stored[2].payload.pointer("/data/message/content").is_none());
        assert_eq!(
            stored[2].payload.pointer("/data/resultRedacted"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn late_old_turn_cannot_clear_the_latest_turn_status() {
        let mut repository = repository();
        let task = repository
            .create_task("问答", &contract_for(Workflow::LocalKnowledge), None, None)
            .unwrap();
        repository.create_turn(&task.id, None, "第一轮").unwrap();
        let latest = repository.create_turn(&task.id, None, "第二轮").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"turn/end","seq":1,"time":2,"data":{"turn":0,"reason":{"kind":"completed"}}}}),
            json!({"event":{"type":"turn/start","seq":2,"time":3,"data":{"turn":1}}}),
        ];
        let projected = ingest_history(&mut repository, &task.id, &events).unwrap();
        assert_eq!(projected.status, TaskOutcome::Running);
        assert_eq!(
            repository.get_turn(&latest.id).unwrap().status,
            TaskOutcome::Running
        );
    }

    #[test]
    fn structured_input_request_projects_question_and_needs_input() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "标签审核",
                &contract_for(Workflow::LabelCompliance),
                None,
                None,
            )
            .unwrap();
        let turn = repository.create_turn(&task.id, None, "审核").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"tool/call","seq":1,"time":2,"data":{"turn":0,"step":0,"callId":"q1","name":"mcp__food_rd__request_task_input","arguments":"{\"taskId\":\"ignored\",\"turnId\":\"ignored\",\"prompt\":\"是否为国产普通预包装食品？\",\"choices\":[\"是\",\"否\"]}"}}}),
            json!({"event":{"type":"tool/result","seq":2,"time":3,"sourceEventSeqs":[1],"data":{"turn":0,"step":0,"domainId":"input-request"}}}),
            json!({"event":{"type":"turn/end","seq":3,"time":4,"data":{"turn":0,"reason":{"kind":"completed"}}}}),
        ];
        let projected = ingest_history(&mut repository, &task.id, &events).unwrap();
        assert_eq!(projected.status, TaskOutcome::NeedsInput);
        let projected_turn = repository.get_turn(&turn.id).unwrap();
        assert!(matches!(
            projected_turn.content_blocks.as_slice(),
            [FoodLabContentBlock::Question { prompt, choices }]
                if prompt.contains("国产") && choices.len() == 2
        ));
        let stored = repository.list_events(&task.id, -1).unwrap();
        assert!(stored[1].payload.pointer("/data/arguments").is_none());
    }

    #[test]
    fn visible_text_chunks_stream_without_persisting_reasoning_chunks() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "本地问答",
                &contract_for(Workflow::LocalKnowledge),
                None,
                None,
            )
            .unwrap();
        let turn = repository.create_turn(&task.id, None, "总结").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"assistant/chunk","seq":1,"time":2,"data":{"turn":0,"step":0,"chunk":{"type":"text-delta","text":"正在整理"}}}}),
            json!({"event":{"type":"assistant/chunk","seq":2,"time":3,"data":{"turn":0,"step":0,"chunk":{"type":"thinking-delta","text":"private reasoning"}}}}),
        ];
        ingest_history(&mut repository, &task.id, &events).unwrap();
        assert!(matches!(
            repository.get_turn(&turn.id).unwrap().content_blocks.as_slice(),
            [FoodLabContentBlock::Markdown { text }] if text == "正在整理"
        ));
        let stored = repository.list_events(&task.id, -1).unwrap();
        assert_eq!(
            stored[1].payload.pointer("/data/chunk/text"),
            Some(&Value::String("正在整理".into()))
        );
        assert_eq!(stored.len(), 2);
        assert_eq!(repository.get_task(&task.id).unwrap().last_event_seq, 2);
        assert!(
            stored
                .iter()
                .all(|event| { event.payload.to_string().contains("private reasoning") == false })
        );
    }

    #[test]
    fn assistant_message_keeps_visible_text_and_drops_private_blocks() {
        let mut repository = repository();
        let task = repository
            .create_task("问答", &contract_for(Workflow::LocalKnowledge), None, None)
            .unwrap();
        let turn = repository.create_turn(&task.id, None, "总结").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"assistant/message","seq":1,"time":2,"data":{"turn":0,"step":0,"message":{"role":"assistant","content":[{"type":"reasoning","text":"private reasoning"},{"type":"tool-call","arguments":{"secret":true}},{"type":"text","text":"可见结论"}]}}}}),
        ];
        ingest_history(&mut repository, &task.id, &events).unwrap();
        assert!(matches!(
            repository.get_turn(&turn.id).unwrap().content_blocks.as_slice(),
            [FoodLabContentBlock::Markdown { text }] if text == "可见结论"
        ));
        let stored = repository.list_events(&task.id, -1).unwrap();
        let payload = stored[1].payload.to_string();
        assert!(payload.contains("可见结论"));
        assert!(!payload.contains("private reasoning"));
        assert!(!payload.contains("secret"));
    }

    #[test]
    fn compliance_review_requires_and_records_approved_evidence_provenance() {
        let mut repository = repository();
        let task = repository
            .create_task(
                "标签审核",
                &contract_for(Workflow::LabelCompliance),
                None,
                None,
            )
            .unwrap();
        repository.create_turn(&task.id, None, "审核").unwrap();
        let events = vec![
            json!({"event":{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}}),
            json!({"event":{"type":"tool/call","seq":1,"time":2,"data":{"turn":0,"step":0,"callId":"c1","name":"mcp__food_rd__diagnose_recipe","arguments":"{}"}}}),
            json!({"event":{"type":"tool/result","seq":2,"time":3,"data":{"turn":0,"step":0,"message":{"toolCallId":"c1","content":[{"type":"text","text":"{}"}],"isError":false}}}}),
            json!({"event":{"type":"tool/call","seq":3,"time":4,"data":{"turn":0,"step":1,"callId":"c2","name":"mcp__food_rd__create_label_compliance_review","arguments":"{\"evidenceSource\":\"local_official_full_text\"}"}}}),
            json!({"event":{"type":"tool/result","seq":4,"time":5,"data":{"turn":0,"step":1,"message":{"toolCallId":"c2","content":[{"type":"text","text":"{\"artifactId\":\"review-1\",\"title\":\"标签合规审查\",\"evidenceSource\":\"local_official_full_text\"}"}],"isError":false}}}}),
            json!({"event":{"type":"turn/end","seq":5,"time":6,"data":{"turn":0,"reason":{"kind":"completed"}}}}),
        ];
        let projected = ingest_history(&mut repository, &task.id, &events).unwrap();
        assert_eq!(projected.status, TaskOutcome::NeedsReview);
        let artifact = repository
            .list_artifacts(&task.id)
            .unwrap()
            .into_iter()
            .find(|artifact| artifact.kind == "label_compliance_review")
            .unwrap();
        assert_eq!(artifact.title, "标签合规审查");
        assert_eq!(
            artifact.provenance.get("evidenceSource"),
            Some(&Value::String("local_official_full_text".into()))
        );
    }
}
