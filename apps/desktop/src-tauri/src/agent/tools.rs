use std::collections::BTreeSet;

use serde::Deserialize;
use serde_json::{Value, json};

use super::{
    AgentError,
    model::{AgentProviderKind, AgentToolCallStatus},
    providers::AgentToolDefinition,
    repository::AgentRepository,
};
use crate::{
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
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentToolContext {
    pub run_id: String,
    pub import_job_id: String,
    pub allowed_attachment_ids: BTreeSet<String>,
    pub provider_kind: AgentProviderKind,
    pub model: String,
}

pub struct AgentToolRegistry {
    coordinator: IngredientIngestCoordinator,
    audit: Option<AgentRepository>,
}

impl AgentToolRegistry {
    pub fn new(coordinator: IngredientIngestCoordinator) -> Self {
        Self {
            coordinator,
            audit: None,
        }
    }

    pub fn with_audit(coordinator: IngredientIngestCoordinator, audit: AgentRepository) -> Self {
        Self {
            coordinator,
            audit: Some(audit),
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
        let draft = self
            .coordinator
            .create_agent_draft(
                &context.import_job_id,
                arguments.review,
                arguments.attachment_ids,
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
            "创建待用户人工复核的原料草稿，不能正式保存原料",
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
        required.push(Value::String("attachmentIds".into()));
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
