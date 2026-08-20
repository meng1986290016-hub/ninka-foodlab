use std::{path::Path, str::FromStr, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, params};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::{database, ingredients::repository::RepositoryError};

use super::model::{
    AgentRecipeEstimateCard, AgentRecipeEstimateCardDraft, AgentRecipeEstimateCardStatus,
    PersonalReferenceCardInput, RndReferenceCard, RndReferenceCardOrigin, RndReferenceCardStatus,
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct RndReferenceRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl RndReferenceRepository {
    pub fn open(path: &Path) -> Result<Self, RepositoryError> {
        Self::from_connection(
            database::open(path)?,
            Arc::new(|| Utc::now().to_rfc3339()),
            Arc::new(|| Uuid::new_v4().to_string()),
        )
    }

    #[cfg(test)]
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
        database::migrations::apply(&mut connection, &clock())?;
        Ok(Self {
            connection,
            clock,
            create_id,
        })
    }

    pub fn list_reference_cards(
        &self,
        query: &str,
        include_archived: bool,
    ) -> Result<Vec<RndReferenceCard>, RepositoryError> {
        let mut cards = builtin_cards()?
            .into_iter()
            .filter(|card| card.status == RndReferenceCardStatus::Approved)
            .collect::<Vec<_>>();
        cards.extend(self.personal_cards(include_archived)?);
        let normalized = query.trim().to_lowercase();
        cards.retain(|card| {
            (include_archived || card.status == RndReferenceCardStatus::Approved)
                && (normalized.is_empty() || card_matches(card, &normalized))
        });
        cards.sort_by(|left, right| {
            match_score(left, &normalized)
                .cmp(&match_score(right, &normalized))
                .then_with(|| left.title.cmp(&right.title))
        });
        Ok(cards)
    }

    pub fn get_reference_card(&self, id: &str) -> Result<RndReferenceCard, RepositoryError> {
        if let Some(card) = builtin_cards()?.into_iter().find(|card| card.id == id) {
            return Ok(card);
        }
        self.connection
            .query_row(
                "SELECT payload_json FROM personal_rnd_reference_cards WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|value| serde_json::from_str::<RndReferenceCard>(&value))
            .transpose()?
            .ok_or_else(|| not_found("找不到研发参考卡"))
    }

    pub fn create_personal_card(
        &mut self,
        input: PersonalReferenceCardInput,
    ) -> Result<RndReferenceCard, RepositoryError> {
        validate_personal_input(&input)?;
        let timestamp = (self.clock)();
        let card = RndReferenceCard {
            id: (self.create_id)(),
            origin: RndReferenceCardOrigin::Personal,
            status: RndReferenceCardStatus::Approved,
            parameter_key: input.parameter_key,
            title: input.title.trim().into(),
            ingredient_names: cleaned_values(input.ingredient_names),
            specification: input.specification.trim().into(),
            applicability: input.applicability.trim().into(),
            unit: input.unit,
            basis: input.basis,
            typical_value: input.typical_value,
            minimum_value: input.minimum_value,
            maximum_value: input.maximum_value,
            source: input.source,
            review_version: 1,
            reviewed_at: Some(timestamp.clone()),
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
            archived_at: None,
        };
        self.connection.execute(
            "INSERT INTO personal_rnd_reference_cards (
               id, status, payload_json, created_at, updated_at, archived_at
             ) VALUES (?1, 'approved', ?2, ?3, ?3, NULL)",
            params![card.id, serde_json::to_string(&card)?, timestamp],
        )?;
        Ok(card)
    }

    pub fn update_personal_card(
        &mut self,
        id: &str,
        input: PersonalReferenceCardInput,
    ) -> Result<RndReferenceCard, RepositoryError> {
        validate_personal_input(&input)?;
        let existing = self.get_reference_card(id)?;
        if existing.origin != RndReferenceCardOrigin::Personal {
            return Err(domain("内置参考卡不能修改"));
        }
        if existing.status == RndReferenceCardStatus::Archived {
            return Err(domain("已归档参考卡不能修改"));
        }
        let timestamp = (self.clock)();
        let updated = RndReferenceCard {
            id: existing.id,
            origin: RndReferenceCardOrigin::Personal,
            status: RndReferenceCardStatus::Approved,
            parameter_key: input.parameter_key,
            title: input.title.trim().into(),
            ingredient_names: cleaned_values(input.ingredient_names),
            specification: input.specification.trim().into(),
            applicability: input.applicability.trim().into(),
            unit: input.unit,
            basis: input.basis,
            typical_value: input.typical_value,
            minimum_value: input.minimum_value,
            maximum_value: input.maximum_value,
            source: input.source,
            review_version: existing.review_version + 1,
            reviewed_at: Some(timestamp.clone()),
            created_at: existing.created_at,
            updated_at: timestamp.clone(),
            archived_at: None,
        };
        let changed = self.connection.execute(
            "UPDATE personal_rnd_reference_cards
             SET status = 'approved', payload_json = ?1, updated_at = ?2, archived_at = NULL
             WHERE id = ?3 AND status = 'approved'",
            params![serde_json::to_string(&updated)?, timestamp, id],
        )?;
        if changed == 0 {
            return Err(domain("参考卡已发生变化，请重新打开"));
        }
        Ok(updated)
    }

    pub fn archive_personal_card(&mut self, id: &str) -> Result<RndReferenceCard, RepositoryError> {
        let mut card = self.get_reference_card(id)?;
        if card.origin != RndReferenceCardOrigin::Personal {
            return Err(domain("内置参考卡不能归档"));
        }
        let timestamp = (self.clock)();
        card.status = RndReferenceCardStatus::Archived;
        card.archived_at = Some(timestamp.clone());
        card.updated_at = timestamp.clone();
        self.connection.execute(
            "UPDATE personal_rnd_reference_cards
             SET status = 'archived', payload_json = ?1, updated_at = ?2, archived_at = ?2
             WHERE id = ?3",
            params![serde_json::to_string(&card)?, timestamp, id],
        )?;
        Ok(card)
    }

    pub fn create_estimate_card(
        &mut self,
        conversation_id: &str,
        run_id: &str,
        recipe_name: &str,
        draft: AgentRecipeEstimateCardDraft,
    ) -> Result<AgentRecipeEstimateCard, RepositoryError> {
        self.validate_estimate_draft(&draft)?;
        let current_draft_updated_at = self.current_draft_updated_at(&draft.recipe_id)?;
        if current_draft_updated_at != draft.source_draft_updated_at {
            return Err(RepositoryError::domain(
                "stale_reference",
                "配方草稿已发生变化，请重新估算",
            ));
        }
        let timestamp = (self.clock)();
        let mut cited_titles = Vec::new();
        for id in &draft.cited_reference_card_ids {
            let card = self.get_reference_card(id)?;
            if card.status != RndReferenceCardStatus::Approved || card.archived_at.is_some() {
                return Err(domain("估算引用了不可用的参考卡"));
            }
            cited_titles.push(card.title);
        }
        let note_preview = estimate_note_preview(recipe_name, &draft, &cited_titles, &timestamp);
        let card = AgentRecipeEstimateCard {
            id: (self.create_id)(),
            conversation_id: conversation_id.into(),
            run_id: run_id.into(),
            recipe_id: draft.recipe_id,
            recipe_name: recipe_name.into(),
            source_draft_updated_at: draft.source_draft_updated_at,
            source_draft_fingerprint: draft.source_draft_fingerprint,
            status: draft.status,
            parameter_key: draft.parameter_key,
            title: draft.title.trim().into(),
            estimated_value: draft.estimated_value,
            minimum_value: draft.minimum_value,
            maximum_value: draft.maximum_value,
            unit: draft.unit,
            basis: draft.basis,
            confidence: draft.confidence,
            formula_inputs: draft.formula_inputs,
            cited_reference_card_ids: draft.cited_reference_card_ids,
            calculation_summary: draft.calculation_summary.trim().into(),
            assumptions: cleaned_values(draft.assumptions),
            influencing_factors: cleaned_values(draft.influencing_factors),
            missing_inputs: cleaned_values(draft.missing_inputs),
            conflict: draft.conflict,
            note_preview,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        };
        self.connection.execute(
            "INSERT INTO agent_recipe_estimate_cards (
               id, conversation_id, run_id, recipe_id, source_draft_updated_at,
               status, payload_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                card.id,
                card.conversation_id,
                card.run_id,
                card.recipe_id,
                card.source_draft_updated_at,
                estimate_status_str(card.status),
                serde_json::to_string(&card)?,
                timestamp,
            ],
        )?;
        Ok(card)
    }

    pub fn list_estimate_cards(
        &mut self,
        conversation_id: &str,
    ) -> Result<Vec<AgentRecipeEstimateCard>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT payload_json FROM agent_recipe_estimate_cards
             WHERE conversation_id = ?1 ORDER BY created_at",
        )?;
        let rows = statement
            .query_map([conversation_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        let mut cards = rows
            .into_iter()
            .map(|value| serde_json::from_str::<AgentRecipeEstimateCard>(&value))
            .collect::<Result<Vec<_>, _>>()?;
        for card in &mut cards {
            let current = self
                .connection
                .query_row(
                    "SELECT updated_at FROM recipe_drafts WHERE recipe_id = ?1",
                    [&card.recipe_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if current.as_deref() != Some(card.source_draft_updated_at.as_str())
                && card.status != AgentRecipeEstimateCardStatus::Stale
            {
                card.status = AgentRecipeEstimateCardStatus::Stale;
                card.updated_at = (self.clock)();
                self.connection.execute(
                    "UPDATE agent_recipe_estimate_cards
                     SET status = 'stale', payload_json = ?1, updated_at = ?2 WHERE id = ?3",
                    params![serde_json::to_string(card)?, card.updated_at, card.id],
                )?;
            }
        }
        Ok(cards)
    }

    fn validate_estimate_draft(
        &self,
        draft: &AgentRecipeEstimateCardDraft,
    ) -> Result<(), RepositoryError> {
        if draft.missing_inputs.len() > 2 {
            return Err(domain("需要补充信息卡最多列出两个最关键条件"));
        }
        if draft.source_draft_fingerprint.trim().is_empty() {
            return Err(domain("估算卡缺少当前草稿指纹"));
        }
        if draft.parameter_key != "relative_sweetness"
            || draft.unit != "g_sucrose_equivalent_per_100g"
            || !matches!(
                draft.basis.as_str(),
                "finished_product_100g" | "input_mix_100g"
            )
        {
            return Err(domain("当前只支持当前配方的甜度参考估算"));
        }
        if draft.title.trim().is_empty() {
            return Err(domain("估算卡标题不能为空"));
        }
        match draft.status {
            AgentRecipeEstimateCardStatus::Ready => {
                if !draft.missing_inputs.is_empty() || draft.cited_reference_card_ids.is_empty() {
                    return Err(domain("已就绪估算卡必须引用参考卡且不能缺少关键输入"));
                }
                let estimated = parse_decimal(draft.estimated_value.as_deref(), "estimatedValue")?;
                let minimum = parse_decimal(draft.minimum_value.as_deref(), "minimumValue")?;
                let maximum = parse_decimal(draft.maximum_value.as_deref(), "maximumValue")?;
                if minimum.is_sign_negative() || minimum > estimated || estimated > maximum {
                    return Err(domain("中心估计值必须位于可能区间内"));
                }
                if draft.calculation_summary.trim().is_empty() || draft.formula_inputs.is_empty() {
                    return Err(domain("估算卡必须列出配方输入和简要推算过程"));
                }
            }
            AgentRecipeEstimateCardStatus::NeedsInput => {
                if draft.estimated_value.is_some()
                    || draft.minimum_value.is_some()
                    || draft.maximum_value.is_some()
                    || draft.missing_inputs.is_empty()
                {
                    return Err(domain("缺少输入的估算卡不能包含中心值或区间"));
                }
            }
            AgentRecipeEstimateCardStatus::Stale => {
                return Err(domain("不能直接创建过期估算卡"));
            }
        }
        let mut unique = draft.cited_reference_card_ids.clone();
        unique.sort();
        unique.dedup();
        if unique.len() != draft.cited_reference_card_ids.len() {
            return Err(domain("引用的参考卡不能重复"));
        }
        for input in &draft.formula_inputs {
            let amount = Decimal::from_str(&input.amount)
                .map_err(|_| domain("估算卡中的配方投料不是有效数值"))?;
            if input.label.trim().is_empty()
                || amount.is_sign_negative()
                || !matches!(input.unit.as_str(), "mg" | "g" | "kg" | "mL" | "L")
            {
                return Err(domain("估算卡中的配方投料或单位无效"));
            }
            if let Some(id) = input.reference_card_id.as_ref()
                && !draft.cited_reference_card_ids.contains(id)
            {
                return Err(domain("配方输入引用的参考卡未列入估算依据"));
            }
        }
        if let Some(conflict) = &draft.conflict {
            if !draft
                .cited_reference_card_ids
                .contains(&conflict.selected_reference_card_id)
                || conflict.alternative_reference_card_ids.is_empty()
                || conflict.rationale.trim().is_empty()
            {
                return Err(domain("来源冲突记录不完整"));
            }
            let mut alternatives = conflict.alternative_reference_card_ids.clone();
            alternatives.sort();
            alternatives.dedup();
            if alternatives.len() != conflict.alternative_reference_card_ids.len()
                || alternatives.contains(&conflict.selected_reference_card_id)
            {
                return Err(domain("来源冲突中的其他参考卡无效"));
            }
            for id in alternatives {
                let card = self.get_reference_card(&id)?;
                if card.status != RndReferenceCardStatus::Approved || card.archived_at.is_some() {
                    return Err(domain("来源冲突引用了不可用的参考卡"));
                }
            }
        }
        Ok(())
    }

    fn current_draft_updated_at(&self, recipe_id: &str) -> Result<String, RepositoryError> {
        self.connection
            .query_row(
                "SELECT updated_at FROM recipe_drafts WHERE recipe_id = ?1",
                [recipe_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| not_found("当前配方没有可估算的工作草稿"))
    }

    fn personal_cards(
        &self,
        include_archived: bool,
    ) -> Result<Vec<RndReferenceCard>, RepositoryError> {
        let sql = if include_archived {
            "SELECT payload_json FROM personal_rnd_reference_cards ORDER BY updated_at DESC"
        } else {
            "SELECT payload_json FROM personal_rnd_reference_cards WHERE status = 'approved' ORDER BY updated_at DESC"
        };
        let mut statement = self.connection.prepare(sql)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(|value| serde_json::from_str::<RndReferenceCard>(&value).map_err(Into::into))
            .collect()
    }
}

fn builtin_cards() -> Result<Vec<RndReferenceCard>, RepositoryError> {
    let cards = serde_json::from_str::<Vec<RndReferenceCard>>(include_str!(
        "../../../src/data/rnd-reference-cards.json"
    ))?;
    let mut ids = cards
        .iter()
        .map(|card| card.id.as_str())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    if ids.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(domain("内置参考卡 ID 重复"));
    }
    for card in &cards {
        validate_card(card)?;
    }
    Ok(cards)
}

fn validate_card(card: &RndReferenceCard) -> Result<(), RepositoryError> {
    if card.origin != RndReferenceCardOrigin::Builtin
        || card.parameter_key != "relative_sweetness"
        || card.unit != "x_sucrose"
        || card.basis != "sucrose_1"
        || card.title.trim().is_empty()
        || card.ingredient_names.is_empty()
        || card.source.title.trim().is_empty()
        || card.source.publisher.trim().is_empty()
    {
        return Err(domain("内置参考卡结构无效"));
    }
    validate_range(
        &card.typical_value,
        &card.minimum_value,
        &card.maximum_value,
    )
}

fn validate_personal_input(input: &PersonalReferenceCardInput) -> Result<(), RepositoryError> {
    if input.parameter_key != "relative_sweetness"
        || input.unit != "x_sucrose"
        || input.basis != "sucrose_1"
        || input.title.trim().is_empty()
        || cleaned_values(input.ingredient_names.clone()).is_empty()
        || input.source.title.trim().is_empty()
        || input.source.publisher.trim().is_empty()
    {
        return Err(domain("请补齐参考卡名称、原料别名、单位基准和来源"));
    }
    validate_range(
        &input.typical_value,
        &input.minimum_value,
        &input.maximum_value,
    )
}

fn validate_range(typical: &str, minimum: &str, maximum: &str) -> Result<(), RepositoryError> {
    let typical = Decimal::from_str(typical).map_err(|_| domain("参考卡数值格式无效"))?;
    let minimum = Decimal::from_str(minimum).map_err(|_| domain("参考卡数值格式无效"))?;
    let maximum = Decimal::from_str(maximum).map_err(|_| domain("参考卡数值格式无效"))?;
    if minimum.is_sign_negative() || minimum > typical || typical > maximum {
        return Err(domain("参考卡中心值必须位于最小值与最大值之间"));
    }
    Ok(())
}

fn parse_decimal(value: Option<&str>, field: &str) -> Result<Decimal, RepositoryError> {
    Decimal::from_str(value.unwrap_or_default()).map_err(|_| {
        RepositoryError::domain(
            "invalid_decimal",
            format!("估算卡字段 {field} 不是有效数值"),
        )
    })
}

fn card_matches(card: &RndReferenceCard, query: &str) -> bool {
    card.title.to_lowercase().contains(query)
        || card.specification.to_lowercase().contains(query)
        || card.applicability.to_lowercase().contains(query)
        || card
            .ingredient_names
            .iter()
            .any(|name| name.to_lowercase().contains(query))
}

fn match_score(card: &RndReferenceCard, query: &str) -> u8 {
    if query.is_empty() {
        return 2;
    }
    if card
        .ingredient_names
        .iter()
        .any(|name| name.to_lowercase() == query)
    {
        0
    } else if card.title.to_lowercase().contains(query)
        || card
            .ingredient_names
            .iter()
            .any(|name| name.to_lowercase().contains(query))
    {
        1
    } else {
        2
    }
}

fn cleaned_values(values: Vec<String>) -> Vec<String> {
    let mut values = values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

fn estimate_note_preview(
    recipe_name: &str,
    draft: &AgentRecipeEstimateCardDraft,
    cited_titles: &[String],
    timestamp: &str,
) -> String {
    if draft.status != AgentRecipeEstimateCardStatus::Ready {
        return String::new();
    }
    let mut lines = vec![
        format!("### Agent 当前配方参考估算 · {}", draft.title.trim()),
        format!(
            "- 当前估计：{} g 蔗糖当量 / 100 g",
            draft.estimated_value.as_deref().unwrap_or("—")
        ),
        format!(
            "- 可能区间：{}–{} g / 100 g",
            draft.minimum_value.as_deref().unwrap_or("—"),
            draft.maximum_value.as_deref().unwrap_or("—")
        ),
        format!("- 配方：{recipe_name}"),
        format!("- 推算：{}", draft.calculation_summary.trim()),
        format!("- 参考卡：{}", cited_titles.join("、")),
    ];
    if !draft.assumptions.is_empty() {
        lines.push(format!("- 主要假设：{}", draft.assumptions.join("；")));
    }
    if !draft.influencing_factors.is_empty() {
        lines.push(format!(
            "- 影响因素：{}",
            draft.influencing_factors.join("；")
        ));
    }
    lines.push(format!("- 记录时间：{timestamp}"));
    lines.join("\n")
}

fn estimate_status_str(status: AgentRecipeEstimateCardStatus) -> &'static str {
    match status {
        AgentRecipeEstimateCardStatus::Ready => "ready",
        AgentRecipeEstimateCardStatus::NeedsInput => "needs_input",
        AgentRecipeEstimateCardStatus::Stale => "stale",
    }
}

fn domain(message: &str) -> RepositoryError {
    RepositoryError::domain("invalid_input", message)
}

fn not_found(message: &str) -> RepositoryError {
    RepositoryError::domain("not_found", message)
}
