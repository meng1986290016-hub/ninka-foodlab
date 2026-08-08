use std::{
    collections::{BTreeMap, BTreeSet},
    str::FromStr,
};

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{
    AgentError,
    model::{AgentProviderKind, AgentToolCallStatus},
    providers::AgentToolDefinition,
    repository::AgentRepository,
};
use crate::{
    agent_recipe::{
        calculator::normalize_and_evaluate, model::AgentRecipeProposalPayload,
        repository::AgentRecipeRepository,
    },
    ingest::{
        IngestError,
        coordinator::IngredientIngestCoordinator,
        model::{IngredientImportDraft, ReviewedIngredientImportDraft},
        validation::validate_review,
    },
    ingredients::model::IngredientVariant,
};

const TOOL_NAMES: &[&str] = &[
    "search_material_groups",
    "search_supplier_variants",
    "search_suppliers",
    "search_categories",
    "list_nutrient_definitions",
    "read_task_attachments",
    "create_ingredient_import_draft",
    "update_ingredient_import_draft",
    "merge_ingredient_import_drafts",
    "split_ingredient_import_draft",
    "discard_ingredient_import_draft",
    "validate_ingredient_import_draft",
    "request_open_ingredient_review",
    "evaluate_recipe_proposal",
    "create_recipe_proposal",
    "update_recipe_proposal",
    "request_open_recipe_proposal_review",
    "diagnose_recipe",
    "review_recipe_development",
    "compare_supplier_variant",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolContext {
    pub run_id: String,
    pub import_job_id: String,
    pub allowed_attachment_ids: BTreeSet<String>,
    pub provider_kind: AgentProviderKind,
    pub model: String,
    #[serde(default)]
    pub active_recipe_id: Option<String>,
    #[serde(default)]
    pub active_recipe_name: Option<String>,
}

pub struct AgentToolRegistry {
    coordinator: IngredientIngestCoordinator,
    audit: Option<AgentRepository>,
    recipes: Option<AgentRecipeRepository>,
}

impl AgentToolRegistry {
    pub fn new(coordinator: IngredientIngestCoordinator) -> Self {
        Self {
            coordinator,
            audit: None,
            recipes: None,
        }
    }

    pub fn with_audit(coordinator: IngredientIngestCoordinator, audit: AgentRepository) -> Self {
        Self {
            coordinator,
            audit: Some(audit),
            recipes: None,
        }
    }

    pub fn with_audit_and_recipes(
        coordinator: IngredientIngestCoordinator,
        audit: AgentRepository,
        recipes: AgentRecipeRepository,
    ) -> Self {
        Self {
            coordinator,
            audit: Some(audit),
            recipes: Some(recipes),
        }
    }

    pub fn coordinator(&self) -> &IngredientIngestCoordinator {
        &self.coordinator
    }

    pub fn coordinator_mut(&mut self) -> &mut IngredientIngestCoordinator {
        &mut self.coordinator
    }

    pub fn definitions(&self) -> Vec<AgentToolDefinition> {
        TOOL_NAMES
            .iter()
            .map(|name| definition(name))
            .collect::<Vec<_>>()
    }

    pub fn execute(
        &mut self,
        context: &AgentToolContext,
        name: &str,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let audit_id = self
            .audit
            .as_mut()
            .map(|audit| {
                audit.start_tool_call(&context.run_id, context.provider_kind, &context.model, name)
            })
            .transpose()?
            .map(|call| call.id);
        let result = self.dispatch(context, name, arguments);
        if let (Some(audit), Some(audit_id)) = (self.audit.as_mut(), audit_id) {
            let (status, error_summary) = match &result {
                Ok(_) => (AgentToolCallStatus::Completed, None),
                Err(error) if error.code() == "tool_denied" => {
                    (AgentToolCallStatus::Denied, Some(error.message()))
                }
                Err(error) => (AgentToolCallStatus::Failed, Some(error.message())),
            };
            audit.finish_tool_call(&audit_id, status, error_summary)?;
        }
        result
    }

    fn dispatch(
        &mut self,
        context: &AgentToolContext,
        name: &str,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        match name {
            "search_material_groups" => self.search_material_groups(arguments),
            "search_supplier_variants" => self.search_supplier_variants(arguments),
            "search_suppliers" => self.search_suppliers(arguments),
            "search_categories" => self.search_categories(arguments),
            "list_nutrient_definitions" => self.list_nutrient_definitions(),
            "read_task_attachments" => self.read_task_attachments(context, arguments),
            "create_ingredient_import_draft" => self.create_draft(context, arguments),
            "update_ingredient_import_draft" => self.update_draft(context, arguments),
            "merge_ingredient_import_drafts" => self.merge_drafts(context, arguments),
            "split_ingredient_import_draft" => self.split_draft(context, arguments),
            "discard_ingredient_import_draft" => self.discard_draft(context, arguments),
            "validate_ingredient_import_draft" => self.validate_draft(context, arguments),
            "request_open_ingredient_review" => self.request_open_review(context, arguments),
            "evaluate_recipe_proposal" => self.evaluate_recipe_proposal(arguments),
            "create_recipe_proposal" => self.create_recipe_proposal(context, arguments),
            "update_recipe_proposal" => self.update_recipe_proposal(context, arguments),
            "request_open_recipe_proposal_review" => {
                self.request_open_recipe_proposal_review(context, arguments)
            }
            "diagnose_recipe" => self.diagnose_recipe(arguments),
            "review_recipe_development" => self.review_recipe_development(arguments),
            "compare_supplier_variant" => self.compare_supplier_variant(arguments),
            _ => Err(AgentError::tool_denied(name)),
        }
    }

    fn search_material_groups(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: SearchArguments = parse_arguments(arguments)?;
        let groups = self
            .coordinator
            .ingredients()
            .list_material_groups(arguments.query.as_deref().unwrap_or_default())?
            .into_iter()
            .take(arguments.limit())
            .map(|group| {
                json!({
                    "id": group.id,
                    "name": group.name,
                    "categoryId": group.category_id,
                    "categoryName": group.category_name,
                    "supplierVariantCount": group.variants.len()
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({ "items": groups }))
    }

    fn search_supplier_variants(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: SearchArguments = parse_arguments(arguments)?;
        let query = arguments.query.as_deref().unwrap_or_default();
        let variants = self
            .coordinator
            .ingredients()
            .list_material_groups(query)?
            .into_iter()
            .flat_map(|group| {
                let material_name = group.name;
                group
                    .variants
                    .into_iter()
                    .map(move |variant| public_variant(&material_name, variant))
            })
            .take(arguments.limit())
            .collect::<Vec<_>>();
        Ok(json!({ "items": variants }))
    }

    fn search_suppliers(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: SearchArguments = parse_arguments(arguments)?;
        let values = self
            .coordinator
            .ingredients()
            .list_suppliers(arguments.query.as_deref().unwrap_or_default())?
            .into_iter()
            .take(arguments.limit())
            .collect::<Vec<_>>();
        Ok(json!({ "items": values }))
    }

    fn search_categories(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: SearchArguments = parse_arguments(arguments)?;
        let query = arguments
            .query
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        let values = self
            .coordinator
            .ingredients()
            .list_categories()?
            .into_iter()
            .filter(|category| query.is_empty() || category.name.to_lowercase().contains(&query))
            .take(arguments.limit())
            .collect::<Vec<_>>();
        Ok(json!({ "items": values }))
    }

    fn list_nutrient_definitions(&self) -> Result<Value, AgentError> {
        Ok(json!({
            "items": self.coordinator.ingredients().list_nutrient_definitions()?
        }))
    }

    fn read_task_attachments(
        &self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: AttachmentArguments = parse_arguments(arguments)?;
        require_allowed_attachments(context, &arguments.attachment_ids)?;
        let documents = self
            .coordinator
            .read_job_extractions(&context.import_job_id, &arguments.attachment_ids)
            .map_err(map_ingest_error)?;
        Ok(json!({ "items": documents }))
    }

    fn create_draft(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: CreateDraftArguments = parse_arguments(arguments)?;
        require_allowed_attachments(context, &arguments.attachment_ids)?;
        require_allowed_attachments(
            context,
            &arguments
                .source_links
                .iter()
                .map(|link| link.attachment_id.clone())
                .collect::<Vec<_>>(),
        )?;
        if arguments
            .source_links
            .iter()
            .any(|link| !arguments.attachment_ids.contains(&link.attachment_id))
        {
            return Err(AgentError::scope_violation(
                "字段来源必须属于这张草稿关联的附件",
            ));
        }
        let draft = self
            .coordinator
            .create_agent_draft(
                &context.import_job_id,
                arguments.review,
                arguments.attachment_ids,
                arguments.source_links,
            )
            .map_err(map_ingest_error)?;
        Ok(json!({ "draft": draft }))
    }

    fn update_draft(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: UpdateDraftArguments = parse_arguments(arguments)?;
        self.require_draft(context, &arguments.draft_id)?;
        let draft = self
            .coordinator
            .update_draft(&arguments.draft_id, arguments.review)
            .map_err(map_ingest_error)?;
        Ok(json!({ "draft": draft }))
    }

    fn merge_drafts(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: MergeDraftArguments = parse_arguments(arguments)?;
        if arguments.draft_ids.len() < 2 {
            return Err(AgentError::invalid_input("合并时至少选择两个草稿"));
        }
        for draft_id in &arguments.draft_ids {
            let draft = self.require_draft(context, draft_id)?;
            require_allowed_attachments(
                context,
                &draft
                    .attachments
                    .iter()
                    .map(|attachment| attachment.id.clone())
                    .collect::<Vec<_>>(),
            )?;
        }
        let merged = self
            .coordinator
            .merge_agent_drafts(
                &context.import_job_id,
                &arguments.draft_ids,
                arguments.review,
            )
            .map_err(map_ingest_error)?;
        Ok(json!({ "draft": merged, "discardedDraftIds": arguments.draft_ids }))
    }

    fn split_draft(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: SplitDraftArguments = parse_arguments(arguments)?;
        if arguments.reviews.len() < 2 {
            return Err(AgentError::invalid_input("拆分时至少提供两个草稿"));
        }
        let source = self.require_draft(context, &arguments.draft_id)?;
        let attachment_ids = source
            .attachments
            .iter()
            .map(|attachment| attachment.id.clone())
            .collect::<Vec<_>>();
        require_allowed_attachments(context, &attachment_ids)?;
        let drafts = self
            .coordinator
            .split_agent_draft(
                &context.import_job_id,
                &arguments.draft_id,
                arguments.reviews,
            )
            .map_err(map_ingest_error)?;
        Ok(json!({ "drafts": drafts, "discardedDraftId": arguments.draft_id }))
    }

    fn discard_draft(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: DraftIdArguments = parse_arguments(arguments)?;
        self.require_draft(context, &arguments.draft_id)?;
        self.coordinator
            .discard_draft(&arguments.draft_id)
            .map_err(map_ingest_error)?;
        Ok(json!({ "discarded": true, "draftId": arguments.draft_id }))
    }

    fn validate_draft(
        &self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: DraftIdArguments = parse_arguments(arguments)?;
        let draft = self.require_draft(context, &arguments.draft_id)?;
        let issues = validate_review(&draft.review);
        let valid = !issues
            .iter()
            .any(|issue| issue.severity == crate::ingest::model::ImportIssueSeverity::Error);
        Ok(json!({ "valid": valid, "issues": issues, "draftId": draft.id }))
    }

    fn request_open_review(
        &self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: DraftIdArguments = parse_arguments(arguments)?;
        let draft = self.require_draft(context, &arguments.draft_id)?;
        Ok(json!({
            "action": "openIngredientImportReview",
            "jobId": context.import_job_id,
            "draftId": draft.id,
            "requiresHumanConfirmation": true
        }))
    }

    fn require_draft(
        &self,
        context: &AgentToolContext,
        draft_id: &str,
    ) -> Result<IngredientImportDraft, AgentError> {
        let draft = self
            .coordinator
            .get_draft(draft_id)
            .map_err(map_ingest_error)?;
        if draft.job_id != context.import_job_id {
            return Err(AgentError::scope_violation("草稿不属于当前 Agent 导入任务"));
        }
        Ok(draft)
    }

    fn evaluate_recipe_proposal(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: RecipeProposalPayloadArguments = parse_arguments(arguments)?;
        let (payload, evaluation) =
            normalize_and_evaluate(self.coordinator.ingredients(), arguments.payload)?;
        Ok(json!({ "payload": payload, "evaluation": evaluation }))
    }

    fn create_recipe_proposal(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: CreateRecipeProposalArguments = parse_arguments(arguments)?;
        require_allowed_attachments(context, &arguments.source_attachment_ids)?;
        let (payload, evaluation) =
            normalize_and_evaluate(self.coordinator.ingredients(), arguments.payload)?;
        let conversation_id = self
            .audit
            .as_mut()
            .ok_or_else(|| AgentError::provider_failure("配方提案审计上下文不可用"))?
            .get_run(&context.run_id)?
            .conversation_id;
        let proposal = self
            .recipes
            .as_mut()
            .ok_or_else(|| AgentError::provider_failure("配方提案工具不可用"))?
            .create_proposal(
                Some(&conversation_id),
                Some(&context.run_id),
                payload,
                evaluation,
                arguments.source_attachment_ids,
            )?;
        Ok(json!({ "proposal": proposal, "requiresHumanConfirmation": true }))
    }

    fn update_recipe_proposal(
        &mut self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: UpdateRecipeProposalArguments = parse_arguments(arguments)?;
        let conversation_id = self
            .audit
            .as_mut()
            .ok_or_else(|| AgentError::provider_failure("配方提案审计上下文不可用"))?
            .get_run(&context.run_id)?
            .conversation_id;
        let existing = self
            .recipes
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("配方提案工具不可用"))?
            .get_proposal(&arguments.proposal_id)?;
        if existing.conversation_id.as_deref() != Some(&conversation_id) {
            return Err(AgentError::scope_violation("只能修改当前对话中的配方提案"));
        }
        let (payload, evaluation) =
            normalize_and_evaluate(self.coordinator.ingredients(), arguments.payload)?;
        let proposal = self
            .recipes
            .as_mut()
            .expect("recipe proposal repository checked")
            .update_proposal(&arguments.proposal_id, payload, evaluation)?;
        Ok(json!({ "proposal": proposal, "requiresHumanConfirmation": true }))
    }

    fn request_open_recipe_proposal_review(
        &self,
        context: &AgentToolContext,
        arguments: Value,
    ) -> Result<Value, AgentError> {
        let arguments: ProposalIdArguments = parse_arguments(arguments)?;
        let conversation_id = self
            .audit
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("配方提案审计上下文不可用"))?
            .get_run(&context.run_id)?
            .conversation_id;
        let proposal = self
            .recipes
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("配方提案工具不可用"))?
            .get_proposal(&arguments.proposal_id)?;
        if proposal.conversation_id.as_deref() != Some(&conversation_id) {
            return Err(AgentError::scope_violation("提案不属于当前对话"));
        }
        Ok(json!({
            "action": "openRecipeProposalReview",
            "proposalId": proposal.id,
            "requiresHumanConfirmation": true
        }))
    }

    fn diagnose_recipe(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: RecipeIdArguments = parse_arguments(arguments)?;
        let source = self
            .recipes
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("配方诊断工具不可用"))?
            .get_recipe_analysis_source(&arguments.recipe_id)?;
        let draft = source
            .get("draft")
            .filter(|value| !value.is_null())
            .ok_or_else(|| AgentError::invalid_input("该配方还没有可诊断的工作草稿"))?;
        let payload = draft.get("payload").unwrap_or(&Value::Null);
        let calculation = draft.get("calculation").unwrap_or(&Value::Null);
        let calculation_issues = draft
            .get("calculationIssues")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let items = payload
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut findings = Vec::new();
        if items.is_empty() {
            findings.push(json!({
                "code": "empty_formula", "severity": "blocker",
                "title": "配方尚未添加原料",
                "detail": "至少添加一项原料或半成品后才能诊断"
            }));
        }
        let material_need_count = items
            .iter()
            .filter(|item| item.get("kind").and_then(Value::as_str) == Some("material_need"))
            .count();
        if material_need_count > 0 {
            findings.push(json!({
                "code": "material_needs", "severity": "blocker",
                "title": format!("{material_need_count} 项原料仍待补充"),
                "detail": "占位原料的营养和成本按缺失处理，并会阻止保存正式版本"
            }));
        }
        for issue in &calculation_issues {
            let severity = if issue.get("severity").and_then(Value::as_str) == Some("error") {
                "blocker"
            } else {
                "warning"
            };
            findings.push(json!({
                "code": issue.get("code").cloned().unwrap_or_else(|| json!("calculation_issue")),
                "severity": severity,
                "title": if severity == "blocker" { "配方计算被阻断" } else { "配方数据需要确认" },
                "detail": issue.get("message").cloned().unwrap_or_else(|| json!("配方计算存在问题"))
            }));
        }
        if payload.get("finishedMassGrams").is_none_or(Value::is_null) {
            findings.push(json!({
                "code": "finished_mass_missing", "severity": "warning",
                "title": "尚未填写出成重量",
                "detail": "每100g营养和单位成本暂按当前投料合计计算，未计入加工失水或吸水"
            }));
        }
        let completeness = calculation
            .pointer("/completeness/percent")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        if completeness < 80 {
            findings.push(json!({
                "code": "low_completeness", "severity": "warning",
                "title": format!("数据完整度仅 {completeness}%"),
                "detail": calculation.pointer("/completeness/missingFields").cloned().unwrap_or_else(|| json!([]))
            }));
        }
        if calculation.pointer("/cost/status").and_then(Value::as_str) == Some("partial") {
            findings.push(json!({
                "code": "partial_cost", "severity": "warning",
                "title": "成本结果不完整",
                "detail": "部分配方项缺少可用价格"
            }));
        }
        let blocked = findings
            .iter()
            .any(|finding| finding.get("severity").and_then(Value::as_str) == Some("blocker"));
        let attention = findings
            .iter()
            .any(|finding| finding.get("severity").and_then(Value::as_str) == Some("warning"));
        let status = if blocked {
            "blocked"
        } else if attention {
            "attention"
        } else {
            "healthy"
        };
        let top_cost_contributors = calculation
            .pointer("/cost/breakdown")
            .and_then(Value::as_array)
            .map(|items| {
                let mut values = items
                    .iter()
                    .filter(|item| {
                        item.get("category").and_then(Value::as_str) == Some("ingredient")
                    })
                    .cloned()
                    .collect::<Vec<_>>();
                values.sort_by(|left, right| {
                    parse_decimal(right.get("amount").and_then(Value::as_str))
                        .unwrap_or(Decimal::ZERO)
                        .cmp(
                            &parse_decimal(left.get("amount").and_then(Value::as_str))
                                .unwrap_or(Decimal::ZERO),
                        )
                });
                values.truncate(3);
                values
            })
            .unwrap_or_default();
        Ok(json!({
            "recipe": source["recipe"].clone(),
            "draftUpdatedAt": draft.get("updatedAt").cloned().unwrap_or(Value::Null),
            "status": status,
            "findings": findings,
            "topCostContributors": top_cost_contributors,
            "calculation": calculation,
            "deterministic": true,
            "readOnly": true
        }))
    }

    fn review_recipe_development(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: RecipeIdArguments = parse_arguments(arguments)?;
        let source = self
            .recipes
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("研发复盘工具不可用"))?
            .get_recipe_analysis_source(&arguments.recipe_id)?;
        let draft = source
            .get("draft")
            .filter(|value| !value.is_null())
            .ok_or_else(|| AgentError::invalid_input("该配方还没有可复盘的工作草稿"))?;
        let payload = draft.get("payload").unwrap_or(&Value::Null);
        let calculation = draft.get("calculation").unwrap_or(&Value::Null);
        let current_notes = payload
            .get("markdownNotes")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let latest_formal = source
            .get("latestFormalVersion")
            .filter(|value| !value.is_null())
            .cloned()
            .unwrap_or(Value::Null);
        let latest_notes = latest_formal
            .pointer("/snapshot/markdownNotes")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let diagnosis = self.diagnose_recipe(json!({
            "recipeId": arguments.recipe_id
        }))?;
        let mut next_step_hints = Vec::new();
        if current_notes.trim().is_empty() {
            next_step_hints.push("当前研发备注为空；下一轮前先补记本轮工艺、感官结果和异常现象");
        }
        if payload.get("finishedMassGrams").is_none_or(Value::is_null) {
            next_step_hints.push("记录实际出成重量，用于校正得率和每100g结果");
        }
        if calculation
            .pointer("/completeness/percent")
            .and_then(Value::as_i64)
            .unwrap_or(0)
            < 80
        {
            next_step_hints.push("优先补齐高占比或高成本原料的营养与价格数据");
        }
        if diagnosis
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == "blocked")
        {
            next_step_hints.push("先解决诊断中的阻断项，再安排下一轮打样");
        }
        next_step_hints.push("下一轮只调整少量关键变量，并在同一备注框记录调整原因与结果");

        Ok(json!({
            "recipe": source["recipe"].clone(),
            "draftUpdatedAt": draft.get("updatedAt").cloned().unwrap_or(Value::Null),
            "currentFacts": {
                "plannedInputGrams": payload.get("targetBatchGrams").cloned().unwrap_or(Value::Null),
                "currentInputGrams": calculation.get("inputMassGrams").cloned().unwrap_or(Value::Null),
                "finishedMassGrams": payload.get("finishedMassGrams").cloned().unwrap_or(Value::Null),
                "yieldPercent": calculation.get("yieldPercent").cloned().unwrap_or(Value::Null),
                "batchCost": calculation.pointer("/cost/batchTotal").cloned().unwrap_or(Value::Null),
                "costStatus": calculation.pointer("/cost/status").cloned().unwrap_or(Value::Null),
                "dataCompletenessPercent": calculation.pointer("/completeness/percent").cloned().unwrap_or(Value::Null),
                "allergens": calculation.get("allergens").cloned().unwrap_or(Value::Null)
            },
            "researchNotes": {
                "current": current_notes,
                "latestFormalVersion": latest_notes,
                "changedFromLatestFormalVersion": !latest_formal.is_null() && current_notes != latest_notes
            },
            "latestFormalVersion": latest_formal,
            "diagnosis": {
                "status": diagnosis.get("status").cloned().unwrap_or(Value::Null),
                "findings": diagnosis.get("findings").cloned().unwrap_or_else(|| json!([])),
                "topCostContributors": diagnosis.get("topCostContributors").cloned().unwrap_or_else(|| json!([]))
            },
            "nextStepHints": next_step_hints,
            "deterministicFacts": true,
            "readOnly": true,
            "guardrails": [
                "只把备注和确定性计算结果当作已知事实",
                "没有记录的工艺、感官或原因必须明确写未记录，不能猜测",
                "下一轮建议是研发建议，应用前需人工确认"
            ]
        }))
    }

    fn compare_supplier_variant(&self, arguments: Value) -> Result<Value, AgentError> {
        let arguments: CompareSupplierVariantArguments = parse_arguments(arguments)?;
        let source = self
            .recipes
            .as_ref()
            .ok_or_else(|| AgentError::provider_failure("替代原料分析工具不可用"))?
            .get_recipe_analysis_source(&arguments.recipe_id)?;
        let draft = source
            .get("draft")
            .filter(|value| !value.is_null())
            .ok_or_else(|| AgentError::invalid_input("该配方还没有可分析的工作草稿"))?;
        let payload = draft.get("payload").unwrap_or(&Value::Null);
        let item = payload
            .get("items")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter().find(|item| {
                    item.get("id").and_then(Value::as_str) == Some(arguments.item_id.as_str())
                })
            })
            .ok_or_else(|| AgentError::invalid_input("找不到要替代的配方原料行"))?;
        if item.get("kind").and_then(Value::as_str) != Some("ingredient") {
            return Err(AgentError::invalid_input(
                "第一版只支持替代直接投料的供应商原料",
            ));
        }
        let source_variant_id = item
            .get("ingredientVariantId")
            .and_then(Value::as_str)
            .ok_or_else(|| AgentError::invalid_input("配方原料缺少供应商版本"))?;
        let source_variant = self
            .coordinator
            .ingredients()
            .get_variant(source_variant_id)?;
        let candidate = self
            .coordinator
            .ingredients()
            .get_variant(&arguments.candidate_variant_id)?;
        if candidate.archived_at.is_some() {
            return Err(AgentError::invalid_input("候选供应商版本已经归档"));
        }
        if source_variant.material_group_id != candidate.material_group_id {
            return Err(AgentError::invalid_input("候选版本必须属于同一种通用原料"));
        }
        if source_variant.id == candidate.id {
            return Err(AgentError::invalid_input("候选供应商版本与当前原料相同"));
        }
        let amount = item.get("amount").and_then(Value::as_str).unwrap_or("0");
        let unit = item.get("unit").and_then(Value::as_str).unwrap_or("g");
        let source_metrics = line_metrics(&source_variant, amount, unit)?;
        let candidate_metrics = line_metrics(&candidate, amount, unit)?;
        let calculation = draft.get("calculation").unwrap_or(&Value::Null);
        let basis_mass = parse_decimal(calculation.get("basisMassGrams").and_then(Value::as_str));
        let current_batch_cost = parse_decimal(
            calculation
                .pointer("/cost/batchTotal")
                .and_then(Value::as_str),
        );
        let estimated_batch_cost = match (
            current_batch_cost,
            source_metrics.cost,
            candidate_metrics.cost,
        ) {
            (Some(current), Some(before), Some(after)) => Some(current - before + after),
            _ => None,
        };
        let definitions = self
            .coordinator
            .ingredients()
            .list_nutrient_definitions()?
            .into_iter()
            .map(|definition| (definition.id, (definition.name, definition.unit)))
            .collect::<BTreeMap<_, _>>();
        let nutrient_changes = nutrient_changes(
            calculation,
            basis_mass,
            source_metrics.mass_grams,
            &source_metrics.nutrients,
            &candidate_metrics.nutrients,
            &definitions,
        );
        let contains_added = list_difference(
            &candidate.allergens.contains,
            &source_variant.allergens.contains,
        );
        let contains_removed = list_difference(
            &source_variant.allergens.contains,
            &candidate.allergens.contains,
        );
        let may_contain_added = list_difference(
            &candidate.allergens.may_contain,
            &source_variant.allergens.may_contain,
        );
        let may_contain_removed = list_difference(
            &source_variant.allergens.may_contain,
            &candidate.allergens.may_contain,
        );
        let material_name = self
            .coordinator
            .ingredients()
            .get_material_name_for_variant(&candidate.id)?;
        Ok(json!({
            "recipe": source["recipe"].clone(),
            "draftUpdatedAt": draft.get("updatedAt").cloned().unwrap_or(Value::Null),
            "itemId": arguments.item_id,
            "materialName": material_name,
            "amount": amount,
            "unit": unit,
            "source": public_variant(&material_name, source_variant),
            "candidate": public_variant(&material_name, candidate.clone()),
            "impact": {
                "lineMassGrams": decimal_string(source_metrics.mass_grams),
                "sourceLineCost": source_metrics.cost.map(decimal_string),
                "candidateLineCost": candidate_metrics.cost.map(decimal_string),
                "batchCostBefore": current_batch_cost.map(decimal_string),
                "estimatedBatchCostAfter": estimated_batch_cost.map(decimal_string),
                "nutrientChangesPer100g": nutrient_changes,
                "allergensAdded": contains_added,
                "allergensRemoved": contains_removed,
                "mayContainAdded": may_contain_added,
                "mayContainRemoved": may_contain_removed,
                "dataCompletenessDifference": candidate.completeness.percent - source_metrics.completeness
            },
            "deterministic": true,
            "readOnly": true,
            "requiresHumanConfirmationToApply": true,
            "note": "该工具不会修改草稿；同用量替换后的工艺、感官和法规适用性仍需人工复核"
        }))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchArguments {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

impl SearchArguments {
    fn limit(&self) -> usize {
        self.limit.unwrap_or(20).clamp(1, 50)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentArguments {
    attachment_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDraftArguments {
    review: ReviewedIngredientImportDraft,
    #[serde(default)]
    attachment_ids: Vec<String>,
    #[serde(default)]
    source_links: Vec<crate::ingest::model::DraftSourceLink>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDraftArguments {
    draft_id: String,
    review: ReviewedIngredientImportDraft,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergeDraftArguments {
    draft_ids: Vec<String>,
    review: ReviewedIngredientImportDraft,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SplitDraftArguments {
    draft_id: String,
    reviews: Vec<ReviewedIngredientImportDraft>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftIdArguments {
    draft_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecipeProposalPayloadArguments {
    payload: AgentRecipeProposalPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRecipeProposalArguments {
    payload: AgentRecipeProposalPayload,
    #[serde(default)]
    source_attachment_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRecipeProposalArguments {
    proposal_id: String,
    payload: AgentRecipeProposalPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposalIdArguments {
    proposal_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecipeIdArguments {
    recipe_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompareSupplierVariantArguments {
    recipe_id: String,
    item_id: String,
    candidate_variant_id: String,
}

struct VariantLineMetrics {
    mass_grams: Decimal,
    cost: Option<Decimal>,
    nutrients: BTreeMap<String, Option<Decimal>>,
    completeness: i64,
}

fn line_metrics(
    variant: &IngredientVariant,
    amount: &str,
    unit: &str,
) -> Result<VariantLineMetrics, AgentError> {
    let amount = Decimal::from_str(amount)
        .map_err(|_| AgentError::invalid_input("配方原料用量不是有效数字"))?;
    let density = variant
        .density_g_per_ml
        .as_deref()
        .map(Decimal::from_str)
        .transpose()
        .map_err(|_| AgentError::invalid_input("供应商原料密度不是有效数字"))?;
    let thousand = Decimal::from(1000);
    let mass_grams = match unit {
        "mg" => amount / thousand,
        "g" => amount,
        "kg" => amount * thousand,
        "mL" => {
            amount * density.ok_or_else(|| AgentError::invalid_input("体积投料需要候选原料密度"))?
        }
        "L" => {
            amount
                * thousand
                * density.ok_or_else(|| AgentError::invalid_input("体积投料需要候选原料密度"))?
        }
        _ => return Err(AgentError::invalid_input("不支持的配方用量单位")),
    };
    let price = variant
        .current_price
        .as_deref()
        .map(Decimal::from_str)
        .transpose()
        .map_err(|_| AgentError::invalid_input("供应商原料价格不是有效数字"))?;
    let price_per_kg = match (price, variant.price_unit.as_str()) {
        (None, _) => None,
        (Some(value), "kg") => Some(value),
        (Some(value), "g") => Some(value * thousand),
        (Some(value), "L") => {
            Some(value / density.ok_or_else(|| AgentError::invalid_input("体积计价需要原料密度"))?)
        }
        (Some(value), "mL") => Some(
            value * thousand
                / density.ok_or_else(|| AgentError::invalid_input("体积计价需要原料密度"))?,
        ),
        _ => return Err(AgentError::invalid_input("不支持的价格单位")),
    };
    let cost = price_per_kg.map(|value| mass_grams / thousand * value);
    let nutrients = variant
        .nutrition
        .values
        .iter()
        .map(|value| {
            let parsed = value
                .value
                .as_deref()
                .map(Decimal::from_str)
                .transpose()
                .map_err(|_| AgentError::invalid_input("供应商营养数据不是有效数字"))?;
            let per_100g = match (parsed, variant.nutrition.basis.as_str()) {
                (None, _) => None,
                (Some(amount), "per_100g" | "每100g") => Some(amount),
                (Some(amount), "per_100ml" | "每100mL" | "每100ml") => Some(
                    amount
                        / density.ok_or_else(|| {
                            AgentError::invalid_input("每100mL营养数据需要原料密度")
                        })?,
                ),
                (Some(_), _) => return Err(AgentError::invalid_input("不支持的营养数据基准")),
            };
            Ok((value.nutrient_definition_id.clone(), per_100g))
        })
        .collect::<Result<BTreeMap<_, _>, AgentError>>()?;
    Ok(VariantLineMetrics {
        mass_grams,
        cost,
        nutrients,
        completeness: variant.completeness.percent,
    })
}

fn nutrient_changes(
    calculation: &Value,
    basis_mass: Option<Decimal>,
    line_mass_grams: Decimal,
    source: &BTreeMap<String, Option<Decimal>>,
    candidate: &BTreeMap<String, Option<Decimal>>,
    definitions: &BTreeMap<String, (String, String)>,
) -> Vec<Value> {
    let Some(basis_mass) = basis_mass.filter(|value| !value.is_zero()) else {
        return Vec::new();
    };
    let current = calculation
        .get("nutrients")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ids = source
        .keys()
        .chain(candidate.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    ids.iter()
        .filter_map(|id| {
            let before_line = source.get(id).copied().flatten()?;
            let after_line = candidate.get(id).copied().flatten()?;
            let current_value = current
                .iter()
                .find(|item| {
                    item.get("nutrientDefinitionId").and_then(Value::as_str) == Some(id.as_str())
                })
                .and_then(|item| item.get("per100gKnownAmount"))
                .and_then(Value::as_str)
                .and_then(|value| Decimal::from_str(value).ok())?;
            let difference = (after_line - before_line) * line_mass_grams / basis_mass;
            if difference.is_zero() {
                return None;
            }
            let (name, unit) = definitions
                .get(id)
                .cloned()
                .unwrap_or_else(|| (id.clone(), "".into()));
            Some(json!({
                "nutrientDefinitionId": id,
                "name": name,
                "unit": unit,
                "before": decimal_string(current_value),
                "after": decimal_string(current_value + difference),
                "difference": decimal_string(difference)
            }))
        })
        .collect()
}

fn list_difference(left: &[String], right: &[String]) -> Vec<String> {
    let right = right.iter().collect::<BTreeSet<_>>();
    left.iter()
        .filter(|value| !right.contains(value))
        .cloned()
        .collect()
}

fn parse_decimal(value: Option<&str>) -> Option<Decimal> {
    value.and_then(|value| Decimal::from_str(value).ok())
}

fn decimal_string(value: Decimal) -> String {
    value.normalize().to_string()
}

fn parse_arguments<T: for<'de> Deserialize<'de>>(arguments: Value) -> Result<T, AgentError> {
    serde_json::from_value(arguments)
        .map_err(|_| AgentError::invalid_input("Agent 工具参数缺失或格式不正确"))
}

fn require_allowed_attachments(
    context: &AgentToolContext,
    attachment_ids: &[String],
) -> Result<(), AgentError> {
    if attachment_ids
        .iter()
        .all(|id| context.allowed_attachment_ids.contains(id))
    {
        Ok(())
    } else {
        Err(AgentError::scope_violation(
            "工具只能读取当前消息选择的附件",
        ))
    }
}

fn public_variant(material_name: &str, variant: IngredientVariant) -> Value {
    json!({
        "id": variant.id,
        "materialGroupId": variant.material_group_id,
        "materialName": material_name,
        "supplierId": variant.supplier_id,
        "supplierName": variant.supplier_name,
        "modelOrSpecification": variant.model_or_specification,
        "currentPrice": variant.current_price,
        "priceUnit": variant.price_unit,
        "densityGPerMl": variant.density_g_per_ml,
        "source": variant.source,
        "researchNotes": variant.research_notes,
        "nutrition": variant.nutrition,
        "allergens": variant.allergens,
        "completeness": variant.completeness,
        "updatedAt": variant.updated_at
    })
}

fn map_ingest_error(error: IngestError) -> AgentError {
    match error.code() {
        "scope_violation" => AgentError::scope_violation(error.message()),
        "invalid_input" | "invalid_state" | "not_found" | "import_failure" => {
            AgentError::invalid_input(error.message())
        }
        _ => AgentError::provider_failure(error.message()),
    }
}

fn definition(name: &str) -> AgentToolDefinition {
    let (description, input_schema) = match name {
        "search_material_groups" => ("按名称或分类搜索通用原料，不返回内部编号", search_schema()),
        "search_supplier_variants" => (
            "搜索已有供应商原料版本，返回营养、价格与研发备注",
            search_schema(),
        ),
        "search_suppliers" => ("搜索供应商", search_schema()),
        "search_categories" => ("搜索原料分类", search_schema()),
        "list_nutrient_definitions" => ("列出系统中的营养成分定义", empty_schema()),
        "read_task_attachments" => (
            "读取本次任务已选择附件的提取内容",
            json!({
                "type": "object",
                "properties": {
                    "attachmentIds": {
                        "type": "array",
                        "items": { "type": "string" }
                    }
                },
                "required": ["attachmentIds"],
                "additionalProperties": false
            }),
        ),
        "create_ingredient_import_draft" => (
            "创建待用户人工复核的原料草稿，不能正式保存原料；同一原料、供应商和型号规格的文件应合并关联，身份不同必须分开，并为字段提供来源链接",
            review_mutation_schema(false),
        ),
        "update_ingredient_import_draft" => (
            "更新当前任务内的待复核原料草稿",
            review_mutation_schema(true),
        ),
        "merge_ingredient_import_drafts" => (
            "把当前任务内多个识别草稿合并为一个",
            json!({
                "type": "object",
                "properties": {
                    "draftIds": {
                        "type": "array",
                        "minItems": 2,
                        "items": { "type": "string" }
                    },
                    "review": review_schema()
                },
                "required": ["draftIds", "review"],
                "additionalProperties": false
            }),
        ),
        "split_ingredient_import_draft" => (
            "把一个识别草稿拆分为多个待复核草稿",
            json!({
                "type": "object",
                "properties": {
                    "draftId": { "type": "string" },
                    "reviews": {
                        "type": "array",
                        "minItems": 2,
                        "items": review_schema()
                    }
                },
                "required": ["draftId", "reviews"],
                "additionalProperties": false
            }),
        ),
        "discard_ingredient_import_draft" => ("丢弃当前任务内不需要的识别草稿", draft_id_schema()),
        "validate_ingredient_import_draft" => {
            ("校验草稿并返回需要人工修正的问题", draft_id_schema())
        }
        "request_open_ingredient_review" => {
            ("请求界面打开草稿供用户人工复核和保存", draft_id_schema())
        }
        "evaluate_recipe_proposal" => (
            "用系统确定性计算引擎试算配方提案的营养、成本、投料、得率与数据完整度；设计或逆向配方时必须调用，不能用模型心算替代",
            recipe_proposal_payload_schema(false, false),
        ),
        "create_recipe_proposal" => (
            "创建一张待用户人工复核的配方提案卡，不能直接创建配方或正式版本",
            recipe_proposal_payload_schema(true, false),
        ),
        "update_recipe_proposal" => (
            "根据用户反馈更新当前对话中的待复核配方提案，并重新确定性试算",
            recipe_proposal_payload_schema(false, true),
        ),
        "request_open_recipe_proposal_review" => (
            "请求界面打开完整配方提案复核层；最终创建工作草稿必须由用户在界面确认",
            proposal_id_schema(),
        ),
        "diagnose_recipe" => (
            "只读诊断指定配方的当前草稿，返回确定性计算结果、数据缺失、得率和成本风险；不会修改配方",
            recipe_id_schema(),
        ),
        "review_recipe_development" => (
            "只读读取当前配方草稿、单一研发备注框、最新正式版本和确定性诊断，供模型整理本轮事实、待确认项与下一轮打样建议；不得编造未记录的工艺或感官结果",
            recipe_id_schema(),
        ),
        "compare_supplier_variant" => (
            "只读比较配方中一条直接投料原料与同种通用原料的候选供应商版本，确定性计算成本、营养和过敏原差异；不会修改草稿",
            json!({
                "type": "object",
                "properties": {
                    "recipeId": { "type": "string" },
                    "itemId": { "type": "string" },
                    "candidateVariantId": { "type": "string" }
                },
                "required": ["recipeId", "itemId", "candidateVariantId"],
                "additionalProperties": false
            }),
        ),
        _ => unreachable!(),
    };
    AgentToolDefinition {
        name: name.into(),
        description: description.into(),
        input_schema,
    }
}

fn search_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "query": { "type": ["string", "null"] },
            "limit": { "type": ["integer", "null"], "minimum": 1, "maximum": 50 }
        },
        "required": ["query", "limit"],
        "additionalProperties": false
    })
}

fn empty_schema() -> Value {
    json!({ "type": "object", "properties": {}, "additionalProperties": false })
}

fn draft_id_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "draftId": { "type": "string" } },
        "required": ["draftId"],
        "additionalProperties": false
    })
}

fn proposal_id_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "proposalId": { "type": "string" } },
        "required": ["proposalId"],
        "additionalProperties": false
    })
}

fn recipe_id_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "recipeId": { "type": "string" } },
        "required": ["recipeId"],
        "additionalProperties": false
    })
}

fn recipe_proposal_payload_schema(include_attachments: bool, include_id: bool) -> Value {
    let mut properties = serde_json::Map::new();
    properties.insert("payload".into(), recipe_proposal_schema());
    let mut required = vec![Value::String("payload".into())];
    if include_attachments {
        properties.insert(
            "sourceAttachmentIds".into(),
            json!({ "type": "array", "items": { "type": "string" } }),
        );
        required.push(Value::String("sourceAttachmentIds".into()));
    }
    if include_id {
        properties.insert("proposalId".into(), json!({ "type": "string" }));
        required.push(Value::String("proposalId".into()));
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

fn recipe_proposal_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "productName": { "type": "string" },
            "recipeKind": { "type": "string", "enum": ["formula", "semi_finished"] },
            "mode": { "type": "string", "enum": ["goal_design", "label_reverse"] },
            "plannedInputGrams": { "type": "string" },
            "finishedMassGrams": { "type": ["string", "null"] },
            "yieldAssumption": { "type": "string", "enum": ["provided", "assumed_100_percent"] },
            "items": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "oneOf": [
                        {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string" }, "position": { "type": "integer" },
                                "kind": { "const": "ingredient" }, "amount": { "type": "string" },
                                "unit": { "type": "string", "enum": ["g", "kg"] },
                                "estimatedMinimum": { "type": ["string", "null"] },
                                "estimatedMaximum": { "type": ["string", "null"] },
                                "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
                                "ingredientVariantId": { "type": "string" },
                                "ingredientUpdatedAt": { "type": "string" },
                                "materialName": { "type": "string" }, "supplierName": { "type": "string" },
                                "modelOrSpecification": { "type": "string" }, "selectionReason": { "type": "string" }
                            },
                            "required": ["id", "position", "kind", "amount", "unit", "estimatedMinimum", "estimatedMaximum", "confidence", "ingredientVariantId", "ingredientUpdatedAt", "materialName", "supplierName", "modelOrSpecification", "selectionReason"],
                            "additionalProperties": false
                        },
                        {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string" }, "position": { "type": "integer" },
                                "kind": { "const": "material_need" }, "amount": { "type": "string" },
                                "unit": { "type": "string", "enum": ["g", "kg"] },
                                "estimatedMinimum": { "type": ["string", "null"] },
                                "estimatedMaximum": { "type": ["string", "null"] },
                                "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
                                "materialName": { "type": "string" }, "purpose": { "type": "string" },
                                "desiredSpecification": { "type": "string" }, "missingReason": { "type": "string" }
                            },
                            "required": ["id", "position", "kind", "amount", "unit", "estimatedMinimum", "estimatedMaximum", "confidence", "materialName", "purpose", "desiredSpecification", "missingReason"],
                            "additionalProperties": false
                        }
                    ]
                }
            },
            "requirements": { "type": "array", "items": { "type": "object" } },
            "assumptions": { "type": "array", "items": { "type": "string" } },
            "warnings": { "type": "array", "items": { "type": "string" } },
            "markdownNotes": { "type": "string" }
        },
        "required": ["productName", "recipeKind", "mode", "plannedInputGrams", "finishedMassGrams", "yieldAssumption", "items", "requirements", "assumptions", "warnings", "markdownNotes"],
        "additionalProperties": false
    })
}

fn review_mutation_schema(update: bool) -> Value {
    let mut properties = serde_json::Map::new();
    properties.insert("review".into(), review_schema());
    let mut required = vec![Value::String("review".into())];
    if update {
        properties.insert("draftId".into(), json!({ "type": "string" }));
        required.insert(0, Value::String("draftId".into()));
    } else {
        properties.insert(
            "attachmentIds".into(),
            json!({ "type": "array", "items": { "type": "string" } }),
        );
        properties.insert(
            "sourceLinks".into(),
            json!({
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fieldPath": { "type": "string" },
                        "attachmentId": { "type": "string" },
                        "sourceLocator": { "type": ["string", "null"] },
                        "confidence": {
                            "type": ["string", "null"],
                            "enum": ["high", "medium", "low", null]
                        }
                    },
                    "required": ["fieldPath", "attachmentId", "sourceLocator", "confidence"],
                    "additionalProperties": false
                }
            }),
        );
        required.push(Value::String("attachmentIds".into()));
        required.push(Value::String("sourceLinks".into()));
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

fn review_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "materialGroupId": { "type": ["string", "null"] },
            "materialName": { "type": "string" },
            "categoryId": { "type": ["string", "null"] },
            "categoryName": { "type": ["string", "null"] },
            "supplierId": { "type": ["string", "null"] },
            "supplierName": { "type": "string" },
            "modelOrSpecification": { "type": "string" },
            "currentPrice": { "type": ["string", "null"] },
            "priceUnit": { "type": ["string", "null"] },
            "densityGPerMl": { "type": ["string", "null"] },
            "nutritionBasis": { "type": ["string", "null"] },
            "nutrients": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "definitionId": { "type": ["string", "null"] },
                        "name": { "type": "string" },
                        "unit": { "type": "string" },
                        "value": { "type": ["string", "null"] }
                    },
                    "required": ["definitionId", "name", "unit", "value"],
                    "additionalProperties": false
                }
            },
            "containsAllergens": { "type": "array", "items": { "type": "string" } },
            "mayContainAllergens": { "type": "array", "items": { "type": "string" } },
            "source": { "type": "string" },
            "researchNotes": { "type": "string" },
            "duplicateConfirmed": { "type": "boolean" }
        },
        "required": [
            "materialGroupId", "materialName", "categoryId", "categoryName",
            "supplierId", "supplierName", "modelOrSpecification", "currentPrice",
            "priceUnit", "densityGPerMl", "nutritionBasis", "nutrients",
            "containsAllergens", "mayContainAllergens", "source", "researchNotes",
            "duplicateConfirmed"
        ],
        "additionalProperties": false
    })
}
