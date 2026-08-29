use std::{path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    agent_recipe::model::{
        AcceptedAgentRecipeProposal, AgentRecipeProposal, AgentRecipeProposalDestination,
        AgentRecipeProposalItem, AgentRecipeProposalPayload, AgentRecipeProposalStatus,
        MaterialNeed, MaterialNeedStatus,
    },
    database,
    ingredients::repository::RepositoryError,
    recipes::{
        model::{Recipe, RecipeKind},
        repository::RecipeRepository,
    },
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct AgentRecipeRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl AgentRecipeRepository {
    pub fn open(path: &Path) -> Result<Self, RepositoryError> {
        Ok(Self {
            connection: database::open(path)?,
            clock: Arc::new(|| Utc::now().to_rfc3339()),
            create_id: Arc::new(|| Uuid::new_v4().to_string()),
        })
    }

    pub fn create_proposal(
        &mut self,
        conversation_id: Option<&str>,
        run_id: Option<&str>,
        payload: AgentRecipeProposalPayload,
        evaluation: Value,
        source_attachment_ids: Vec<String>,
    ) -> Result<AgentRecipeProposal, RepositoryError> {
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO agent_recipe_proposals (
               id, conversation_id, run_id, status, payload_version, payload_json,
               evaluation_json, source_attachment_ids_json, accepted_recipe_id,
               created_at, updated_at
             ) VALUES (?1, ?2, ?3, 'pending_review', 2, ?4, ?5, ?6, NULL, ?7, ?7)",
            params![
                id,
                conversation_id,
                run_id,
                serde_json::to_string(&payload)?,
                serde_json::to_string(&evaluation)?,
                serde_json::to_string(&source_attachment_ids)?,
                timestamp
            ],
        )?;
        self.get_proposal(&id)
    }

    pub fn get_recipe_analysis_source(&self, recipe_id: &str) -> Result<Value, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT recipe.id, recipe.name, recipe.kind, recipe.archived_at,
                        recipe.scheme_status, draft.id, draft.payload_json,
                        draft.calculation_json, draft.calculation_issues_json,
                        draft.updated_at
                 FROM recipes recipe
                 LEFT JOIN recipe_drafts draft ON draft.recipe_id = recipe.id
                 WHERE recipe.id = ?1",
                [recipe_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| not_found("找不到配方"))?;
        let payload = row
            .6
            .map(|value| serde_json::from_str::<Value>(&value))
            .transpose()?
            .unwrap_or(Value::Null);
        let calculation = row
            .7
            .map(|value| serde_json::from_str::<Value>(&value))
            .transpose()?
            .unwrap_or(Value::Null);
        let calculation_issues = row
            .8
            .map(|value| serde_json::from_str::<Value>(&value))
            .transpose()?
            .unwrap_or_else(|| json!([]));
        let latest_formal_version = self
            .connection
            .query_row(
                "SELECT id, version_number, snapshot_json, created_at
                 FROM recipe_versions
                 WHERE recipe_id = ?1
                 ORDER BY version_number DESC
                 LIMIT 1",
                [recipe_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?
            .map(|version| {
                Ok::<_, RepositoryError>(json!({
                    "id": version.0,
                    "versionNumber": version.1,
                    "snapshot": serde_json::from_str::<Value>(&version.2)?,
                    "createdAt": version.3
                }))
            })
            .transpose()?
            .unwrap_or(Value::Null);
        Ok(json!({
            "recipe": {
                "id": row.0,
                "name": row.1,
                "kind": row.2,
                "archived": row.3.is_some(),
                "schemeStatus": row.4
            },
            "draft": if row.5.is_some() {
                json!({
                    "id": row.5,
                    "payload": payload,
                    "calculation": calculation,
                    "calculationIssues": calculation_issues,
                    "updatedAt": row.9
                })
            } else {
                Value::Null
            },
            "latestFormalVersion": latest_formal_version
        }))
    }

    pub fn update_proposal(
        &mut self,
        id: &str,
        payload: AgentRecipeProposalPayload,
        evaluation: Value,
    ) -> Result<AgentRecipeProposal, RepositoryError> {
        let proposal = self.get_proposal(id)?;
        if proposal.status != AgentRecipeProposalStatus::PendingReview {
            return Err(domain("只有待复核提案可以修改"));
        }
        self.connection.execute(
            "UPDATE agent_recipe_proposals
             SET payload_version = 2, payload_json = ?1, evaluation_json = ?2, updated_at = ?3
             WHERE id = ?4",
            params![
                serde_json::to_string(&payload)?,
                serde_json::to_string(&evaluation)?,
                (self.clock)(),
                id
            ],
        )?;
        self.get_proposal(id)
    }

    pub fn list_proposals(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<AgentRecipeProposal>, RepositoryError> {
        let mut statement = self.connection.prepare(&format!(
            "{} WHERE conversation_id = ?1 ORDER BY created_at",
            PROPOSAL_SELECT
        ))?;
        statement
            .query_map([conversation_id], map_proposal_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(proposal_from_row)
            .collect()
    }

    pub fn list_proposals_for_run(
        &self,
        run_id: &str,
    ) -> Result<Vec<AgentRecipeProposal>, RepositoryError> {
        let mut statement = self.connection.prepare(&format!(
            "{} WHERE run_id = ?1 ORDER BY created_at, rowid",
            PROPOSAL_SELECT
        ))?;
        statement
            .query_map([run_id], map_proposal_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(proposal_from_row)
            .collect()
    }

    pub fn get_proposal(&self, id: &str) -> Result<AgentRecipeProposal, RepositoryError> {
        let row = self
            .connection
            .query_row(
                &format!("{} WHERE id = ?1", PROPOSAL_SELECT),
                [id],
                map_proposal_row,
            )
            .optional()?;
        row.map(proposal_from_row)
            .transpose()?
            .ok_or_else(|| not_found("找不到配方提案"))
    }

    pub fn discard_proposal(&mut self, id: &str) -> Result<AgentRecipeProposal, RepositoryError> {
        let proposal = self.get_proposal(id)?;
        if proposal.status == AgentRecipeProposalStatus::Accepted {
            return Err(domain("已创建草稿的提案不能放弃"));
        }
        self.connection.execute(
            "UPDATE agent_recipe_proposals SET status = 'discarded', updated_at = ?1 WHERE id = ?2",
            params![(self.clock)(), id],
        )?;
        self.get_proposal(id)
    }

    pub fn list_material_needs(
        &self,
        status: Option<MaterialNeedStatus>,
    ) -> Result<Vec<MaterialNeed>, RepositoryError> {
        let status_value = status.map(material_need_status_str);
        let mut statement = self.connection.prepare(&format!(
            "{} WHERE (?1 IS NULL OR status = ?1) ORDER BY updated_at DESC",
            MATERIAL_NEED_SELECT
        ))?;
        statement
            .query_map([status_value], map_material_need_row)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(material_need_from_row)
            .collect()
    }

    pub fn get_material_need(&self, id: &str) -> Result<MaterialNeed, RepositoryError> {
        let row = self
            .connection
            .query_row(
                &format!("{} WHERE id = ?1", MATERIAL_NEED_SELECT),
                [id],
                map_material_need_row,
            )
            .optional()?;
        row.map(material_need_from_row)
            .transpose()?
            .ok_or_else(|| not_found("找不到待补充原料需求"))
    }

    pub fn resolve_material_need(
        &mut self,
        id: &str,
        variant_id: &str,
    ) -> Result<MaterialNeed, RepositoryError> {
        self.get_material_need(id)?;
        let active = self.connection.query_row("SELECT EXISTS(SELECT 1 FROM ingredient_variants WHERE id = ?1 AND archived_at IS NULL)", [variant_id], |row| row.get::<_, bool>(0))?;
        if !active {
            return Err(domain("请选择未归档的供应商原料版本"));
        }
        self.connection.execute("UPDATE material_needs SET status = 'resolved', resolved_ingredient_variant_id = ?1, updated_at = ?2 WHERE id = ?3", params![variant_id, (self.clock)(), id])?;
        self.get_material_need(id)
    }

    pub fn dismiss_material_need(&mut self, id: &str) -> Result<MaterialNeed, RepositoryError> {
        let need = self.get_material_need(id)?;
        if need.status == MaterialNeedStatus::Resolved {
            return Err(domain("已关联原料的需求不能直接关闭"));
        }
        self.connection.execute(
            "UPDATE material_needs SET status = 'dismissed', updated_at = ?1 WHERE id = ?2",
            params![(self.clock)(), id],
        )?;
        self.get_material_need(id)
    }

    pub fn accept_proposal(
        &mut self,
        proposal_id: &str,
        destination: AgentRecipeProposalDestination,
    ) -> Result<(String, Vec<MaterialNeed>), RepositoryError> {
        let proposal = self.get_proposal(proposal_id)?;
        if proposal.status != AgentRecipeProposalStatus::PendingReview {
            return Err(domain("该提案当前不能创建工作草稿"));
        }
        let stale = proposal
            .evaluation
            .get("staleItemIds")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty());
        if stale {
            return Err(domain("原料数据已更新或归档，请先重新试算提案"));
        }
        let recipe_id = (self.create_id)();
        let draft_id = (self.create_id)();
        let timestamp = (self.clock)();
        let transaction = self.connection.transaction()?;
        let (
            recipe_name,
            recipe_code,
            recipe_kind,
            product_id,
            tags_json,
            scheme_name,
            scheme_status,
            based_on_version_id,
        ) = match destination {
            AgentRecipeProposalDestination::NewProduct => (
                proposal.payload.product_name.trim().to_string(),
                proposal.payload.recipe_code.as_deref().and_then(|code| {
                    let code = code.trim();
                    (!code.is_empty()).then(|| code.to_string())
                }),
                recipe_kind_str(proposal.payload.recipe_kind).to_string(),
                recipe_id.clone(),
                "[]".to_string(),
                "主配方".to_string(),
                "current".to_string(),
                None,
            ),
            AgentRecipeProposalDestination::Alternative {
                source_version_id,
                scheme_name,
            } => {
                let scheme_name = scheme_name.trim().to_string();
                if scheme_name.is_empty() {
                    return Err(domain("请填写替代配方名称"));
                }
                let source = transaction.query_row(
                    "SELECT recipe.name, recipe.kind, recipe.product_id, recipe.tags_json, recipe.archived_at, recipe.scheme_status
                     FROM recipe_versions version JOIN recipes recipe ON recipe.id = version.recipe_id WHERE version.id = ?1",
                    [&source_version_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, Option<String>>(4)?, row.get::<_, String>(5)?)),
                ).optional()?.ok_or_else(|| not_found("找不到替代配方来源版本"))?;
                if source.4.is_some() || source.5 == "inactive" {
                    return Err(domain("已归档或停用的配方不能作为替代来源"));
                }
                let duplicate = transaction.query_row("SELECT EXISTS(SELECT 1 FROM recipes WHERE product_id = ?1 AND lower(scheme_name) = lower(?2))", params![source.2, scheme_name], |row| row.get::<_, bool>(0))?;
                if duplicate {
                    return Err(domain("同一产品下已经存在同名配方方案"));
                }
                (
                    source.0,
                    None,
                    source.1,
                    source.2,
                    source.3,
                    scheme_name,
                    "researching".to_string(),
                    Some(source_version_id),
                )
            }
        };
        if recipe_name.is_empty() {
            return Err(domain("请填写产品名称"));
        }
        if let Some(code) = recipe_code.as_deref() {
            let duplicate = transaction.query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM recipes
                   WHERE archived_at IS NULL AND lower(code) = lower(?1)
                 )",
                [code],
                |row| row.get::<_, bool>(0),
            )?;
            if duplicate {
                return Err(RepositoryError::domain(
                    "duplicate_code",
                    "配方编号已存在，请修改提案中的编号后再创建工作草稿",
                ));
            }
        }
        transaction.execute(
            "INSERT INTO recipes (id, name, code, tags_json, kind, created_at, updated_at, archived_at, product_id, scheme_name, scheme_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, NULL, ?7, ?8, ?9)",
            params![recipe_id, recipe_name, recipe_code, tags_json, recipe_kind, timestamp, product_id, scheme_name, scheme_status],
        )?;

        let mut draft_items = Vec::new();
        let mut need_ids = Vec::new();
        let mut sorted = proposal.payload.items.clone();
        sorted.sort_by_key(AgentRecipeProposalItem::position);
        for item in sorted {
            match item {
                AgentRecipeProposalItem::Ingredient {
                    id,
                    position,
                    amount,
                    unit,
                    ingredient_variant_id,
                    ..
                } => {
                    let variant_updated_at = transaction.query_row("SELECT updated_at FROM ingredient_variants WHERE id = ?1 AND archived_at IS NULL", [&ingredient_variant_id], |row| row.get::<_, String>(0)).optional()?.ok_or_else(|| domain("提案中的供应商原料已归档或不存在"))?;
                    let expected = proposal
                        .payload
                        .items
                        .iter()
                        .find_map(|candidate| match candidate {
                            AgentRecipeProposalItem::Ingredient {
                                id: candidate_id,
                                ingredient_updated_at,
                                ..
                            } if candidate_id == &id => Some(ingredient_updated_at),
                            _ => None,
                        })
                        .unwrap();
                    if &variant_updated_at != expected {
                        return Err(domain("原料数据已更新，请先重新试算提案"));
                    }
                    draft_items.push(json!({ "id": id, "position": position, "kind": "ingredient", "ingredientVariantId": ingredient_variant_id, "amount": amount, "unit": unit, "locked": false, "autoFill": false }));
                }
                AgentRecipeProposalItem::MaterialNeed {
                    id,
                    position,
                    amount,
                    unit,
                    material_name,
                    purpose,
                    desired_specification,
                    missing_reason,
                    ..
                } => {
                    let need_id = (self.create_id)();
                    transaction.execute(
                        "INSERT INTO material_needs (id, proposal_id, recipe_id, material_name, purpose, desired_specification, missing_reason, suggested_amount, suggested_unit, status, resolved_ingredient_variant_id, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', NULL, ?10, ?10)",
                        params![need_id, proposal_id, recipe_id, material_name, purpose, desired_specification, missing_reason, amount, unit, timestamp],
                    )?;
                    need_ids.push(need_id.clone());
                    draft_items.push(json!({ "id": id, "position": position, "kind": "material_need", "materialNeedId": need_id, "amount": amount, "unit": unit, "locked": false, "autoFill": false }));
                }
            }
        }
        let notes = proposal_notes(&proposal.payload);
        let input_mass_grams = proposal
            .evaluation
            .pointer("/calculation/inputMassGrams")
            .cloned()
            .unwrap_or_else(|| json!("0"));
        let payload = json!({
            "recipeId": recipe_id, "basedOnVersionId": based_on_version_id, "source": "agent",
            "targetBatchGrams": input_mass_grams,
            "finishedMassGrams": proposal.payload.finished_mass_grams,
            "servingMassGrams": null, "packageCount": null,
            "items": draft_items, "packagingCosts": [], "additionalCosts": [], "targets": [],
            "markdownNotes": notes
        });
        transaction.execute(
            "INSERT INTO recipe_drafts (id, recipe_id, based_on_version_id, source, payload_version, payload_json, calculation_json, calculation_issues_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'agent', 1, ?4, NULL, '[]', ?5, ?5)",
            params![draft_id, recipe_id, based_on_version_id, serde_json::to_string(&payload)?, timestamp],
        )?;
        transaction.execute("UPDATE agent_recipe_proposals SET status = 'accepted', accepted_recipe_id = ?1, updated_at = ?2 WHERE id = ?3", params![recipe_id, timestamp, proposal_id])?;
        transaction.commit()?;
        let needs = need_ids
            .iter()
            .map(|id| self.get_material_need(id))
            .collect::<Result<Vec<_>, _>>()?;
        Ok((recipe_id, needs))
    }
}

const PROPOSAL_SELECT: &str = "SELECT id, conversation_id, run_id, status, payload_version, payload_json, evaluation_json, source_attachment_ids_json, accepted_recipe_id, created_at, updated_at FROM agent_recipe_proposals";
const MATERIAL_NEED_SELECT: &str = "SELECT id, proposal_id, recipe_id, material_name, purpose, desired_specification, missing_reason, suggested_amount, suggested_unit, status, resolved_ingredient_variant_id, created_at, updated_at FROM material_needs";

struct ProposalRow {
    id: String,
    conversation_id: Option<String>,
    run_id: Option<String>,
    status: String,
    payload_version: i64,
    payload_json: String,
    evaluation_json: String,
    attachments_json: String,
    accepted_recipe_id: Option<String>,
    created_at: String,
    updated_at: String,
}
fn map_proposal_row(row: &Row<'_>) -> rusqlite::Result<ProposalRow> {
    Ok(ProposalRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        run_id: row.get(2)?,
        status: row.get(3)?,
        payload_version: row.get(4)?,
        payload_json: row.get(5)?,
        evaluation_json: row.get(6)?,
        attachments_json: row.get(7)?,
        accepted_recipe_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}
fn proposal_from_row(row: ProposalRow) -> Result<AgentRecipeProposal, RepositoryError> {
    Ok(AgentRecipeProposal {
        id: row.id,
        conversation_id: row.conversation_id,
        run_id: row.run_id,
        status: parse_proposal_status(&row.status)?,
        payload_version: row.payload_version,
        payload: serde_json::from_str(&row.payload_json)?,
        evaluation: serde_json::from_str(&row.evaluation_json)?,
        source_attachment_ids: serde_json::from_str(&row.attachments_json)?,
        accepted_recipe_id: row.accepted_recipe_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

struct MaterialNeedRow {
    id: String,
    proposal_id: Option<String>,
    recipe_id: Option<String>,
    material_name: String,
    purpose: String,
    desired_specification: String,
    missing_reason: String,
    suggested_amount: String,
    suggested_unit: String,
    status: String,
    resolved_variant_id: Option<String>,
    created_at: String,
    updated_at: String,
}
fn map_material_need_row(row: &Row<'_>) -> rusqlite::Result<MaterialNeedRow> {
    Ok(MaterialNeedRow {
        id: row.get(0)?,
        proposal_id: row.get(1)?,
        recipe_id: row.get(2)?,
        material_name: row.get(3)?,
        purpose: row.get(4)?,
        desired_specification: row.get(5)?,
        missing_reason: row.get(6)?,
        suggested_amount: row.get(7)?,
        suggested_unit: row.get(8)?,
        status: row.get(9)?,
        resolved_variant_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
fn material_need_from_row(row: MaterialNeedRow) -> Result<MaterialNeed, RepositoryError> {
    Ok(MaterialNeed {
        id: row.id,
        proposal_id: row.proposal_id,
        recipe_id: row.recipe_id,
        material_name: row.material_name,
        purpose: row.purpose,
        desired_specification: row.desired_specification,
        missing_reason: row.missing_reason,
        suggested_amount: row.suggested_amount,
        suggested_unit: row.suggested_unit,
        status: parse_material_need_status(&row.status)?,
        resolved_ingredient_variant_id: row.resolved_variant_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn parse_proposal_status(value: &str) -> Result<AgentRecipeProposalStatus, RepositoryError> {
    match value {
        "pending_review" => Ok(AgentRecipeProposalStatus::PendingReview),
        "accepted" => Ok(AgentRecipeProposalStatus::Accepted),
        "discarded" => Ok(AgentRecipeProposalStatus::Discarded),
        _ => Err(domain("配方提案状态无效")),
    }
}
fn parse_material_need_status(value: &str) -> Result<MaterialNeedStatus, RepositoryError> {
    match value {
        "open" => Ok(MaterialNeedStatus::Open),
        "resolved" => Ok(MaterialNeedStatus::Resolved),
        "dismissed" => Ok(MaterialNeedStatus::Dismissed),
        _ => Err(domain("原料需求状态无效")),
    }
}
fn material_need_status_str(value: MaterialNeedStatus) -> &'static str {
    match value {
        MaterialNeedStatus::Open => "open",
        MaterialNeedStatus::Resolved => "resolved",
        MaterialNeedStatus::Dismissed => "dismissed",
    }
}
fn recipe_kind_str(value: RecipeKind) -> &'static str {
    match value {
        RecipeKind::Formula => "formula",
        RecipeKind::SemiFinished => "semi_finished",
    }
}
fn proposal_notes(payload: &AgentRecipeProposalPayload) -> String {
    let mut sections = vec![
        payload.markdown_notes.trim().to_string(),
        "## Agent 配方提案".into(),
    ];
    if !payload.requirements.is_empty() {
        sections.push(format!(
            "营养要求：\n{}",
            payload
                .requirements
                .iter()
                .map(|item| format!(
                    "- {} {}–{} {}（{}）",
                    item.name,
                    item.minimum.as_deref().unwrap_or("—"),
                    item.maximum.as_deref().unwrap_or("—"),
                    item.unit,
                    item.rationale
                ))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }
    if !payload.assumptions.is_empty() {
        sections.push(format!(
            "关键假设：\n- {}",
            payload.assumptions.join("\n- ")
        ));
    }
    if !payload.warnings.is_empty() {
        sections.push(format!("风险提示：\n- {}", payload.warnings.join("\n- ")));
    }
    sections
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}
fn domain(message: &str) -> RepositoryError {
    RepositoryError::domain("invalid_input", message)
}
fn not_found(message: &str) -> RepositoryError {
    RepositoryError::domain("not_found", message)
}

pub fn accepted_result(
    path: &Path,
    recipe_id: &str,
    needs: Vec<MaterialNeed>,
) -> Result<AcceptedAgentRecipeProposal, RepositoryError> {
    let recipe: Recipe = RecipeRepository::open(path)?.get_recipe(recipe_id)?;
    Ok(AcceptedAgentRecipeProposal {
        recipe,
        material_needs: needs,
    })
}
