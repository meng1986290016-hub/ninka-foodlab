use std::{
    collections::{BTreeMap, HashMap},
    path::Path,
    sync::Arc,
};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use thiserror::Error;
use uuid::Uuid;

use crate::database::{self, migrations};

use super::model::{
    Category, DataCompleteness, DatabaseStatus, DraftRecord, IngredientVariant,
    IngredientVariantInput, MaterialGroup, MaterialGroupInput, NutrientDefinition, Supplier,
    VariantComparison, VariantComparisonRow, VariantNutrition, VariantNutritionValue,
};

const DECIMAL_ERROR: &str = "请输入不带单位的非负数值";

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("{message}")]
    Domain {
        code: &'static str,
        message: String,
        field: Option<String>,
    },
    #[error("数据库操作失败")]
    Storage(#[source] rusqlite::Error),
    #[error("数据库文件无法访问")]
    Io(#[source] std::io::Error),
    #[error("JSON 数据无法处理")]
    Serialization(#[source] serde_json::Error),
}

impl RepositoryError {
    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Storage(_) | Self::Io(_) | Self::Serialization(_) => "storage_failure",
        }
    }

    pub fn field(&self) -> Option<&str> {
        match self {
            Self::Domain { field, .. } => field.as_deref(),
            _ => None,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Domain { message, .. } => message,
            Self::Storage(_) => "数据库操作失败",
            Self::Io(_) => "数据库文件无法访问",
            Self::Serialization(_) => "JSON 数据无法处理",
        }
    }

    pub fn io(error: std::io::Error) -> Self {
        Self::Io(error)
    }

    fn domain(code: &'static str, message: impl Into<String>) -> Self {
        Self::Domain {
            code,
            message: message.into(),
            field: None,
        }
    }

    fn invalid_decimal(field: impl Into<String>) -> Self {
        Self::Domain {
            code: "invalid_decimal",
            message: DECIMAL_ERROR.into(),
            field: Some(field.into()),
        }
    }
}

impl From<rusqlite::Error> for RepositoryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Storage(error)
    }
}

impl From<serde_json::Error> for RepositoryError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error)
    }
}

pub struct IngredientRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl IngredientRepository {
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

    pub fn list_categories(&self) -> Result<Vec<Category>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, name, sort_order, created_at, updated_at, archived_at
             FROM categories WHERE archived_at IS NULL ORDER BY sort_order, name",
        )?;
        let values = statement
            .query_map([], map_category)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn create_category(&mut self, name: &str) -> Result<Category, RepositoryError> {
        let name = required_name(name, "请填写分类名称")?;
        assert_unique_name(&self.connection, "categories", &name, None)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let sort_order = self.connection.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        self.connection.execute(
            "INSERT INTO categories
             (id, name, sort_order, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?4, NULL)",
            params![id, name, sort_order, timestamp],
        )?;
        find_category(&self.connection, &id)
    }

    pub fn rename_category(&mut self, id: &str, name: &str) -> Result<Category, RepositoryError> {
        find_category(&self.connection, id)?;
        let name = required_name(name, "请填写分类名称")?;
        assert_unique_name(&self.connection, "categories", &name, Some(id))?;
        self.connection.execute(
            "UPDATE categories SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, (self.clock)(), id],
        )?;
        find_category(&self.connection, id)
    }

    pub fn archive_category(&mut self, id: &str) -> Result<(), RepositoryError> {
        find_category(&self.connection, id)?;
        let referenced = self.connection.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM material_groups
               WHERE category_id = ?1 AND archived_at IS NULL
             )",
            [id],
            |row| row.get::<_, bool>(0),
        )?;
        if referenced {
            return Err(RepositoryError::domain(
                "reference_conflict",
                "该分类仍被原料使用，暂时不能删除",
            ));
        }
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE categories SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn list_suppliers(&self, query: &str) -> Result<Vec<Supplier>, RepositoryError> {
        let pattern = format!("%{}%", query.trim().to_lowercase());
        let mut statement = self.connection.prepare(
            "SELECT id, name, notes, created_at, updated_at, archived_at
             FROM suppliers
             WHERE archived_at IS NULL
               AND (?1 = '%%' OR lower(name || ' ' || notes) LIKE ?1)
             ORDER BY name",
        )?;
        let values = statement
            .query_map([pattern], map_supplier)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn create_supplier(
        &mut self,
        name: &str,
        notes: &str,
    ) -> Result<Supplier, RepositoryError> {
        let name = required_name(name, "请填写供应商名称")?;
        assert_unique_name(&self.connection, "suppliers", &name, None)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO suppliers
             (id, name, notes, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?4, NULL)",
            params![id, name, notes.trim(), timestamp],
        )?;
        find_supplier(&self.connection, &id)
    }

    pub fn update_supplier(
        &mut self,
        id: &str,
        name: &str,
        notes: &str,
    ) -> Result<Supplier, RepositoryError> {
        find_supplier(&self.connection, id)?;
        let name = required_name(name, "请填写供应商名称")?;
        assert_unique_name(&self.connection, "suppliers", &name, Some(id))?;
        self.connection.execute(
            "UPDATE suppliers SET name = ?1, notes = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, notes.trim(), (self.clock)(), id],
        )?;
        find_supplier(&self.connection, id)
    }

    pub fn archive_supplier(&mut self, id: &str) -> Result<(), RepositoryError> {
        find_supplier(&self.connection, id)?;
        let referenced = self.connection.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM ingredient_variants
               WHERE supplier_id = ?1 AND archived_at IS NULL
             )",
            [id],
            |row| row.get::<_, bool>(0),
        )?;
        if referenced {
            return Err(RepositoryError::domain(
                "reference_conflict",
                "该供应商仍有原料版本，暂时不能删除",
            ));
        }
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE suppliers SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn create_material_group(
        &mut self,
        input: MaterialGroupInput,
    ) -> Result<MaterialGroup, RepositoryError> {
        let name = required_name(&input.name, "请填写原料名称")?;
        assert_unique_name(&self.connection, "material_groups", &name, None)?;
        if let Some(category_id) = input.category_id.as_deref() {
            find_category(&self.connection, category_id)?;
        }
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO material_groups
             (id, name, category_id, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?4, NULL)",
            params![id, name, input.category_id, timestamp],
        )?;
        get_material_group(&self.connection, &id)
    }

    pub fn update_material_group(
        &mut self,
        id: &str,
        input: MaterialGroupInput,
    ) -> Result<MaterialGroup, RepositoryError> {
        get_material_group(&self.connection, id)?;
        let name = required_name(&input.name, "请填写原料名称")?;
        assert_unique_name(&self.connection, "material_groups", &name, Some(id))?;
        if let Some(category_id) = input.category_id.as_deref() {
            find_category(&self.connection, category_id)?;
        }
        self.connection.execute(
            "UPDATE material_groups
             SET name = ?1, category_id = ?2, updated_at = ?3
             WHERE id = ?4",
            params![name, input.category_id, (self.clock)(), id],
        )?;
        get_material_group(&self.connection, id)
    }

    pub fn archive_material_group(&mut self, id: &str) -> Result<(), RepositoryError> {
        get_material_group(&self.connection, id)?;
        let referenced = self.connection.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM ingredient_variants
               WHERE material_group_id = ?1 AND archived_at IS NULL
             )",
            [id],
            |row| row.get::<_, bool>(0),
        )?;
        if referenced {
            return Err(RepositoryError::domain(
                "reference_conflict",
                "请先归档该原料下的供应商版本",
            ));
        }
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE material_groups SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn list_material_groups(&self, query: &str) -> Result<Vec<MaterialGroup>, RepositoryError> {
        let mut statement = self.connection.prepare(
            "SELECT g.id, g.name, g.category_id, c.name, g.created_at, g.updated_at, g.archived_at
             FROM material_groups g
             LEFT JOIN categories c ON c.id = g.category_id
             WHERE g.archived_at IS NULL
             ORDER BY g.name",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(MaterialGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                category_id: row.get(2)?,
                category_name: row.get(3)?,
                variants: Vec::new(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                archived_at: row.get(6)?,
            })
        })?;
        let normalized_query = query.trim().to_lowercase();
        let mut groups = Vec::new();
        for row in rows {
            let mut group = row?;
            group.variants = list_variants_for_group(&self.connection, &group.id)?;
            let group_text = format!(
                "{} {}",
                group.name,
                group.category_name.as_deref().unwrap_or("")
            );
            let variant_match = group.variants.iter().any(|variant| {
                format!(
                    "{} {} {} {} {}",
                    variant.supplier_name,
                    variant.model_or_specification,
                    variant.internal_code.as_deref().unwrap_or(""),
                    variant.source,
                    variant.research_notes
                )
                .to_lowercase()
                .contains(&normalized_query)
            });
            if normalized_query.is_empty()
                || group_text.to_lowercase().contains(&normalized_query)
                || variant_match
            {
                groups.push(group);
            }
        }
        Ok(groups)
    }

    pub fn save_variant(
        &mut self,
        mut input: IngredientVariantInput,
    ) -> Result<IngredientVariant, RepositoryError> {
        normalize_and_validate_variant(&mut input)?;
        get_material_group(&self.connection, &input.material_group_id)?;
        find_supplier(&self.connection, &input.supplier_id)?;
        assert_unique_variant(&self.connection, &input)?;
        assert_unique_internal_code(&self.connection, &input)?;

        let previous_created_at = match input.id.as_deref() {
            Some(id) => Some(get_variant_from_connection(&self.connection, id)?.created_at),
            None => None,
        };
        let id = input.id.clone().unwrap_or_else(|| (self.create_id)());
        let timestamp = (self.clock)();
        let created_at = previous_created_at.unwrap_or_else(|| timestamp.clone());

        let transaction = self.connection.transaction()?;
        upsert_variant(&transaction, &id, &input, &created_at, &timestamp)?;
        transaction.execute(
            "DELETE FROM ingredient_nutrient_values WHERE ingredient_variant_id = ?1",
            [&id],
        )?;
        for value in &input.nutrition.values {
            transaction.execute(
                "INSERT INTO ingredient_nutrient_values
                 (ingredient_variant_id, nutrient_definition_id, value)
                 VALUES (?1, ?2, ?3)",
                params![id, value.nutrient_definition_id, value.value],
            )?;
        }
        transaction.commit()?;
        get_variant_from_connection(&self.connection, &id)
    }

    pub fn get_variant(&self, id: &str) -> Result<IngredientVariant, RepositoryError> {
        get_variant_from_connection(&self.connection, id)
    }

    pub fn archive_variant(&mut self, id: &str) -> Result<(), RepositoryError> {
        get_variant_from_connection(&self.connection, id)?;
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE ingredient_variants
             SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn copy_variant(
        &mut self,
        source_id: &str,
        supplier_id: &str,
    ) -> Result<IngredientVariant, RepositoryError> {
        let source = get_variant_from_connection(&self.connection, source_id)?;
        self.save_variant(IngredientVariantInput {
            id: None,
            material_group_id: source.material_group_id,
            supplier_id: supplier_id.to_string(),
            model_or_specification: source.model_or_specification,
            internal_code: None,
            current_price: source.current_price,
            price_unit: source.price_unit,
            density_g_per_ml: source.density_g_per_ml,
            source: source.source,
            research_notes: source.research_notes,
            nutrition: source.nutrition,
            duplicate_confirmed: false,
        })
    }

    pub fn compare_variants(
        &self,
        material_group_id: &str,
        variant_ids: &[String],
    ) -> Result<VariantComparison, RepositoryError> {
        get_material_group(&self.connection, material_group_id)?;
        if variant_ids.len() < 2 {
            return Err(RepositoryError::domain(
                "invalid_input",
                "请至少选择两个供应商版本",
            ));
        }
        let mut variants = Vec::with_capacity(variant_ids.len());
        for id in variant_ids {
            let variant = get_variant_from_connection(&self.connection, id)?;
            if variant.material_group_id != material_group_id {
                return Err(RepositoryError::domain(
                    "invalid_input",
                    "只能比较同一种原料的供应商版本",
                ));
            }
            variants.push(variant);
        }

        let mut rows = vec![
            comparison_row(
                &variants,
                "currentPrice",
                "当前含税价",
                None,
                |variant| {
                    variant
                        .current_price
                        .as_ref()
                        .map(|price| format!("{} 元/{}", price, variant.price_unit))
                },
            ),
            comparison_row(
                &variants,
                "densityGPerMl",
                "密度",
                Some("g/mL"),
                |variant| variant.density_g_per_ml.clone(),
            ),
            comparison_row(
                &variants,
                "completeness",
                "数据完整度",
                None,
                |variant| Some(format!("{}%", variant.completeness.percent)),
            ),
            comparison_row(
                &variants,
                "updatedAt",
                "最新更新日期",
                None,
                |variant| Some(variant.updated_at.clone()),
            ),
            comparison_row(&variants, "source", "数据来源", None, |variant| {
                non_empty(&variant.source)
            }),
            comparison_row(&variants, "researchNotes", "研发备注", None, |variant| {
                non_empty(&variant.research_notes)
            }),
        ];
        for definition in self.list_nutrient_definitions()? {
            let nutrient_id = definition.id.clone();
            rows.push(comparison_row(
                &variants,
                &format!("nutrient:{}", definition.id),
                &definition.name,
                Some(&definition.unit),
                move |variant| {
                    variant
                        .nutrition
                        .values
                        .iter()
                        .find(|value| value.nutrient_definition_id == nutrient_id)
                        .and_then(|value| value.value.clone())
                },
            ));
        }
        Ok(VariantComparison {
            material_group_id: material_group_id.to_string(),
            variants,
            rows,
        })
    }

    pub fn list_nutrient_definitions(&self) -> Result<Vec<NutrientDefinition>, RepositoryError> {
        list_nutrient_definitions(&self.connection)
    }

    pub fn create_nutrient_definition(
        &mut self,
        name: &str,
        unit: &str,
    ) -> Result<NutrientDefinition, RepositoryError> {
        let name = required_name(name, "请填写营养成分名称")?;
        let unit = required_name(unit, "请填写营养成分单位")?;
        let exists = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM nutrient_definitions WHERE lower(name) = lower(?1))",
            [&name],
            |row| row.get::<_, bool>(0),
        )?;
        if exists {
            return Err(RepositoryError::domain("duplicate_name", "名称已存在"));
        }
        let id = (self.create_id)();
        let code = format!("custom:{}", name.to_lowercase());
        let sort_order = self.connection.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM nutrient_definitions",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        self.connection.execute(
            "INSERT INTO nutrient_definitions (id, code, name, unit, built_in, sort_order)
             VALUES (?1, ?2, ?3, ?4, 0, ?5)",
            params![id, code, name, unit, sort_order],
        )?;
        self.connection
            .query_row(
                "SELECT id, code, name, unit, built_in, sort_order
             FROM nutrient_definitions WHERE id = ?1",
                [&id],
                map_nutrient_definition,
            )
            .map_err(Into::into)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<serde_json::Value>, RepositoryError> {
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

    pub fn set_setting(
        &mut self,
        key: &str,
        value: &serde_json::Value,
    ) -> Result<(), RepositoryError> {
        let value_json = serde_json::to_string(value)?;
        self.connection.execute(
            "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
            params![key, value_json, (self.clock)()],
        )?;
        Ok(())
    }

    pub fn get_draft(&self, kind: &str, key: &str) -> Result<Option<DraftRecord>, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT kind, draft_key, payload_version, payload_json, updated_at
                 FROM workspace_drafts WHERE kind = ?1 AND draft_key = ?2",
                params![kind, key],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()?;
        row.map(|(kind, key, payload_version, payload_json, updated_at)| {
            Ok(DraftRecord {
                kind,
                key,
                payload_version,
                payload: serde_json::from_str(&payload_json)?,
                updated_at,
            })
        })
        .transpose()
    }

    pub fn save_draft(
        &mut self,
        kind: &str,
        key: &str,
        payload_version: i64,
        payload: &serde_json::Value,
    ) -> Result<DraftRecord, RepositoryError> {
        let updated_at = (self.clock)();
        let payload_json = serde_json::to_string(payload)?;
        self.connection.execute(
            "INSERT INTO workspace_drafts
             (kind, draft_key, payload_version, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(kind, draft_key) DO UPDATE SET
               payload_version = excluded.payload_version,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![kind, key, payload_version, payload_json, updated_at],
        )?;
        Ok(DraftRecord {
            kind: kind.to_string(),
            key: key.to_string(),
            payload_version,
            payload: payload.clone(),
            updated_at,
        })
    }

    pub fn clear_draft(&mut self, kind: &str, key: &str) -> Result<(), RepositoryError> {
        self.connection.execute(
            "DELETE FROM workspace_drafts WHERE kind = ?1 AND draft_key = ?2",
            params![kind, key],
        )?;
        Ok(())
    }

    pub fn database_status(&self) -> Result<DatabaseStatus, RepositoryError> {
        let schema_version = self.connection.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let healthy = self
            .connection
            .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))?
            == "ok";
        Ok(DatabaseStatus {
            mode: "sqlite".into(),
            schema_version,
            healthy,
        })
    }
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn comparison_row<F>(
    variants: &[IngredientVariant],
    key: &str,
    label: &str,
    unit: Option<&str>,
    get_value: F,
) -> VariantComparisonRow
where
    F: Fn(&IngredientVariant) -> Option<String>,
{
    VariantComparisonRow {
        key: key.to_string(),
        label: label.to_string(),
        unit: unit.map(str::to_string),
        values: variants
            .iter()
            .map(|variant| (variant.id.clone(), get_value(variant)))
            .collect::<BTreeMap<_, _>>(),
    }
}

fn required_name(value: &str, message: &str) -> Result<String, RepositoryError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(RepositoryError::domain("invalid_input", message));
    }
    Ok(trimmed.to_string())
}

fn nullable_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn is_decimal(value: &str) -> bool {
    let mut parts = value.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if parts.next().is_some() || integer.is_empty() || !integer.chars().all(|c| c.is_ascii_digit())
    {
        return false;
    }
    if integer.len() > 1 && integer.starts_with('0') {
        return false;
    }
    fraction.is_none_or(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn validate_decimal(value: &Option<String>, field: &str) -> Result<(), RepositoryError> {
    if let Some(value) = value
        && !is_decimal(value)
    {
        return Err(RepositoryError::invalid_decimal(field));
    }
    Ok(())
}

fn normalize_and_validate_variant(
    input: &mut IngredientVariantInput,
) -> Result<(), RepositoryError> {
    input.model_or_specification = input.model_or_specification.trim().to_string();
    input.internal_code = nullable_text(input.internal_code.take());
    input.current_price = nullable_text(input.current_price.take());
    input.density_g_per_ml = nullable_text(input.density_g_per_ml.take());
    input.source = input.source.trim().to_string();
    input.research_notes = input.research_notes.trim().to_string();
    validate_decimal(&input.current_price, "currentPrice")?;
    validate_decimal(&input.density_g_per_ml, "densityGPerMl")?;
    if !matches!(input.price_unit.as_str(), "kg" | "g" | "L" | "mL") {
        return Err(RepositoryError::domain("invalid_input", "价格单位无效"));
    }
    if !matches!(input.nutrition.basis.as_str(), "per_100g" | "per_100ml") {
        return Err(RepositoryError::domain("invalid_input", "营养数据基准无效"));
    }
    for value in &mut input.nutrition.values {
        value.value = nullable_text(value.value.take());
        validate_decimal(&value.value, &value.nutrient_definition_id)?;
    }
    Ok(())
}

fn assert_unique_name(
    connection: &Connection,
    table: &str,
    name: &str,
    except_id: Option<&str>,
) -> Result<(), RepositoryError> {
    let sql = format!(
        "SELECT EXISTS(
           SELECT 1 FROM {table}
           WHERE archived_at IS NULL AND lower(name) = lower(?1)
             AND (?2 IS NULL OR id <> ?2)
         )"
    );
    let exists =
        connection.query_row(&sql, params![name, except_id], |row| row.get::<_, bool>(0))?;
    if exists {
        return Err(RepositoryError::domain("duplicate_name", "名称已存在"));
    }
    Ok(())
}

fn assert_unique_variant(
    connection: &Connection,
    input: &IngredientVariantInput,
) -> Result<(), RepositoryError> {
    if input.duplicate_confirmed {
        return Ok(());
    }
    let exists = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM ingredient_variants
           WHERE material_group_id = ?1 AND supplier_id = ?2
             AND lower(model_or_specification) = lower(?3)
             AND archived_at IS NULL
             AND (?4 IS NULL OR id <> ?4)
         )",
        params![
            input.material_group_id,
            input.supplier_id,
            input.model_or_specification,
            input.id
        ],
        |row| row.get::<_, bool>(0),
    )?;
    if exists {
        return Err(RepositoryError::domain(
            "duplicate_variant",
            "该供应商和型号规格已经存在，是否仍要保存？",
        ));
    }
    Ok(())
}

fn assert_unique_internal_code(
    connection: &Connection,
    input: &IngredientVariantInput,
) -> Result<(), RepositoryError> {
    let Some(code) = input.internal_code.as_deref() else {
        return Ok(());
    };
    let exists = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM ingredient_variants
           WHERE archived_at IS NULL AND lower(internal_code) = lower(?1)
             AND (?2 IS NULL OR id <> ?2)
         )",
        params![code, input.id],
        |row| row.get::<_, bool>(0),
    )?;
    if exists {
        return Err(RepositoryError::domain("duplicate_code", "内部编号已存在"));
    }
    Ok(())
}

fn upsert_variant(
    transaction: &Transaction<'_>,
    id: &str,
    input: &IngredientVariantInput,
    created_at: &str,
    updated_at: &str,
) -> Result<(), RepositoryError> {
    transaction.execute(
        "INSERT INTO ingredient_variants (
           id, material_group_id, supplier_id, model_or_specification, internal_code,
           current_price, price_unit, density_g_per_ml, source, research_notes,
           nutrition_basis, created_at, updated_at, archived_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL)
         ON CONFLICT(id) DO UPDATE SET
           material_group_id = excluded.material_group_id,
           supplier_id = excluded.supplier_id,
           model_or_specification = excluded.model_or_specification,
           internal_code = excluded.internal_code,
           current_price = excluded.current_price,
           price_unit = excluded.price_unit,
           density_g_per_ml = excluded.density_g_per_ml,
           source = excluded.source,
           research_notes = excluded.research_notes,
           nutrition_basis = excluded.nutrition_basis,
           updated_at = excluded.updated_at,
           archived_at = NULL",
        params![
            id,
            input.material_group_id,
            input.supplier_id,
            input.model_or_specification,
            input.internal_code,
            input.current_price,
            input.price_unit,
            input.density_g_per_ml,
            input.source,
            input.research_notes,
            input.nutrition.basis,
            created_at,
            updated_at,
        ],
    )?;
    Ok(())
}

fn map_category(row: &Row<'_>) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        sort_order: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
    })
}

fn map_supplier(row: &Row<'_>) -> rusqlite::Result<Supplier> {
    Ok(Supplier {
        id: row.get(0)?,
        name: row.get(1)?,
        notes: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
    })
}

fn map_nutrient_definition(row: &Row<'_>) -> rusqlite::Result<NutrientDefinition> {
    Ok(NutrientDefinition {
        id: row.get(0)?,
        code: row.get(1)?,
        name: row.get(2)?,
        unit: row.get(3)?,
        built_in: row.get(4)?,
        sort_order: row.get(5)?,
    })
}

fn find_category(connection: &Connection, id: &str) -> Result<Category, RepositoryError> {
    connection
        .query_row(
            "SELECT id, name, sort_order, created_at, updated_at, archived_at
             FROM categories WHERE id = ?1 AND archived_at IS NULL",
            [id],
            map_category,
        )
        .optional()?
        .ok_or_else(|| RepositoryError::domain("not_found", "找不到该分类"))
}

fn find_supplier(connection: &Connection, id: &str) -> Result<Supplier, RepositoryError> {
    connection
        .query_row(
            "SELECT id, name, notes, created_at, updated_at, archived_at
             FROM suppliers WHERE id = ?1 AND archived_at IS NULL",
            [id],
            map_supplier,
        )
        .optional()?
        .ok_or_else(|| RepositoryError::domain("not_found", "找不到该供应商"))
}

fn get_material_group(connection: &Connection, id: &str) -> Result<MaterialGroup, RepositoryError> {
    let group = connection
        .query_row(
            "SELECT g.id, g.name, g.category_id, c.name,
                    g.created_at, g.updated_at, g.archived_at
             FROM material_groups g
             LEFT JOIN categories c ON c.id = g.category_id
             WHERE g.id = ?1 AND g.archived_at IS NULL",
            [id],
            |row| {
                Ok(MaterialGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    category_name: row.get(3)?,
                    variants: Vec::new(),
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    archived_at: row.get(6)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| RepositoryError::domain("not_found", "找不到该原料"))?;
    Ok(MaterialGroup {
        variants: list_variants_for_group(connection, id)?,
        ..group
    })
}

#[derive(Debug)]
struct RawVariant {
    id: String,
    material_group_id: String,
    supplier_id: String,
    supplier_name: String,
    model_or_specification: String,
    internal_code: Option<String>,
    current_price: Option<String>,
    price_unit: String,
    density_g_per_ml: Option<String>,
    source: String,
    research_notes: String,
    nutrition_basis: String,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

fn map_raw_variant(row: &Row<'_>) -> rusqlite::Result<RawVariant> {
    Ok(RawVariant {
        id: row.get(0)?,
        material_group_id: row.get(1)?,
        supplier_id: row.get(2)?,
        supplier_name: row.get(3)?,
        model_or_specification: row.get(4)?,
        internal_code: row.get(5)?,
        current_price: row.get(6)?,
        price_unit: row.get(7)?,
        density_g_per_ml: row.get(8)?,
        source: row.get(9)?,
        research_notes: row.get(10)?,
        nutrition_basis: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        archived_at: row.get(14)?,
    })
}

const VARIANT_SELECT: &str = "SELECT v.id, v.material_group_id, v.supplier_id, s.name,
            v.model_or_specification, v.internal_code, v.current_price, v.price_unit,
            v.density_g_per_ml, v.source, v.research_notes, v.nutrition_basis,
            v.created_at, v.updated_at, v.archived_at
     FROM ingredient_variants v
     JOIN suppliers s ON s.id = v.supplier_id";

fn list_variants_for_group(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<IngredientVariant>, RepositoryError> {
    let sql = format!(
        "{VARIANT_SELECT}
         WHERE v.material_group_id = ?1 AND v.archived_at IS NULL
         ORDER BY s.name, v.model_or_specification"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([group_id], map_raw_variant)?;
    let mut variants = Vec::new();
    for row in rows {
        variants.push(hydrate_variant(connection, row?)?);
    }
    Ok(variants)
}

fn get_variant_from_connection(
    connection: &Connection,
    id: &str,
) -> Result<IngredientVariant, RepositoryError> {
    let sql = format!("{VARIANT_SELECT} WHERE v.id = ?1 AND v.archived_at IS NULL");
    let raw = connection
        .query_row(&sql, [id], map_raw_variant)
        .optional()?
        .ok_or_else(|| RepositoryError::domain("not_found", "找不到该供应商版本"))?;
    hydrate_variant(connection, raw)
}

fn hydrate_variant(
    connection: &Connection,
    raw: RawVariant,
) -> Result<IngredientVariant, RepositoryError> {
    let mut statement = connection.prepare(
        "SELECT nv.nutrient_definition_id, nv.value
         FROM ingredient_nutrient_values nv
         JOIN nutrient_definitions nd ON nd.id = nv.nutrient_definition_id
         WHERE nv.ingredient_variant_id = ?1
         ORDER BY nd.sort_order",
    )?;
    let values = statement
        .query_map([&raw.id], |row| {
            Ok(VariantNutritionValue {
                nutrient_definition_id: row.get(0)?,
                value: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let definitions = list_nutrient_definitions(connection)?;
    let completeness = calculate_completeness(&raw, &values, &definitions);
    Ok(IngredientVariant {
        id: raw.id,
        material_group_id: raw.material_group_id,
        supplier_id: raw.supplier_id,
        supplier_name: raw.supplier_name,
        model_or_specification: raw.model_or_specification,
        internal_code: raw.internal_code,
        current_price: raw.current_price,
        price_unit: raw.price_unit,
        density_g_per_ml: raw.density_g_per_ml,
        source: raw.source,
        research_notes: raw.research_notes,
        nutrition: VariantNutrition {
            basis: raw.nutrition_basis,
            values,
        },
        completeness,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        archived_at: raw.archived_at,
    })
}

fn list_nutrient_definitions(
    connection: &Connection,
) -> Result<Vec<NutrientDefinition>, RepositoryError> {
    let mut statement = connection.prepare(
        "SELECT id, code, name, unit, built_in, sort_order
         FROM nutrient_definitions ORDER BY sort_order",
    )?;
    let values = statement
        .query_map([], map_nutrient_definition)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn calculate_completeness(
    variant: &RawVariant,
    values: &[VariantNutritionValue],
    definitions: &[NutrientDefinition],
) -> DataCompleteness {
    let value_map = values
        .iter()
        .map(|value| {
            (
                value.nutrient_definition_id.as_str(),
                value.value.as_deref(),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut missing_fields = Vec::new();
    if variant.current_price.is_none() {
        missing_fields.push("当前含税价".to_string());
    }
    if variant.source.trim().is_empty() {
        missing_fields.push("数据来源".to_string());
    }
    if variant.nutrition_basis == "per_100ml" && variant.density_g_per_ml.is_none() {
        missing_fields.push("密度".to_string());
    }
    let built_ins = definitions.iter().filter(|definition| definition.built_in);
    let built_in_count = built_ins.clone().count();
    for definition in built_ins {
        if value_map
            .get(definition.id.as_str())
            .copied()
            .flatten()
            .is_none()
        {
            missing_fields.push(definition.name.clone());
        }
    }
    let total = 2 + built_in_count + usize::from(variant.nutrition_basis == "per_100ml");
    let present = total.saturating_sub(missing_fields.len());
    DataCompleteness {
        percent: ((present as f64 / total as f64) * 100.0).round() as i64,
        missing_fields,
    }
}
