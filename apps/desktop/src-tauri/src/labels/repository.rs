use std::{path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, params};
use uuid::Uuid;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::model::{
    NutritionLabel, NutritionLabelDraft, NutritionLabelDraftInput, NutritionLabelInput,
    NutritionLabelVersion, NutritionLabelVersionInput,
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct NutritionLabelRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl NutritionLabelRepository {
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

    pub fn list_labels(&self, recipe_id: &str) -> Result<Vec<NutritionLabel>, RepositoryError> {
        assert_recipe_exists(&self.connection, recipe_id)?;
        let mut statement = self
            .connection
            .prepare(&format!("{LABEL_SELECT} WHERE label.recipe_id = ?1"))?;
        let rows = statement
            .query_map([recipe_id], map_label_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_label(&self, id: &str) -> Result<NutritionLabel, RepositoryError> {
        get_label_from_connection(&self.connection, id)
    }

    pub fn create_label(
        &mut self,
        input: NutritionLabelInput,
    ) -> Result<NutritionLabel, RepositoryError> {
        assert_recipe_exists(&self.connection, &input.recipe_id)?;
        let name = required_text(&input.name, "请填写营养标签名称")?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO nutrition_labels (
               id, recipe_id, name, created_at, updated_at, archived_at
             ) VALUES (?1, ?2, ?3, ?4, ?4, NULL)",
            params![id, input.recipe_id, name, timestamp],
        )?;
        self.get_label(&id)
    }

    pub fn get_draft(
        &self,
        label_id: &str,
    ) -> Result<Option<NutritionLabelDraft>, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, label_id, recipe_version_id, rule_pack_id,
                        payload_schema_version, payload_json, calculation_json,
                        issues_json, created_at, updated_at
                 FROM nutrition_label_drafts WHERE label_id = ?1",
                [label_id],
                map_draft_row,
            )
            .optional()?;
        row.map(draft_from_row).transpose()
    }

    pub fn save_draft(
        &mut self,
        input: NutritionLabelDraftInput,
    ) -> Result<NutritionLabelDraft, RepositoryError> {
        let label = self.get_label(&input.label_id)?;
        if label.archived_at.is_some() {
            return Err(domain("archived", "已归档营养标签不能保存草稿"));
        }
        validate_draft_input(&self.connection, &label, &input)?;
        let existing = self.get_draft(&input.label_id)?;
        let id = existing
            .as_ref()
            .map(|draft| draft.id.clone())
            .unwrap_or_else(|| (self.create_id)());
        let timestamp = (self.clock)();
        let created_at = existing
            .map(|draft| draft.created_at)
            .unwrap_or_else(|| timestamp.clone());
        let calculation_json = input
            .calculation
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        self.connection.execute(
            "INSERT INTO nutrition_label_drafts (
               id, label_id, recipe_version_id, rule_pack_id,
               payload_schema_version, payload_json, calculation_json,
               issues_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(label_id) DO UPDATE SET
               recipe_version_id = excluded.recipe_version_id,
               rule_pack_id = excluded.rule_pack_id,
               payload_schema_version = excluded.payload_schema_version,
               payload_json = excluded.payload_json,
               calculation_json = excluded.calculation_json,
               issues_json = excluded.issues_json,
               updated_at = excluded.updated_at",
            params![
                id,
                input.label_id,
                input.recipe_version_id,
                input.rule_pack_id,
                input.payload_schema_version,
                serde_json::to_string(&input.payload)?,
                calculation_json,
                serde_json::to_string(&input.issues)?,
                created_at,
                timestamp,
            ],
        )?;
        self.get_draft(&label.id)?
            .ok_or_else(|| domain("not_found", "找不到营养标签草稿"))
    }

    pub fn create_version(
        &mut self,
        input: NutritionLabelVersionInput,
    ) -> Result<NutritionLabelVersion, RepositoryError> {
        validate_version_input(&self.connection, &input)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let snapshot_json = serde_json::to_string(&input.snapshot)?;
        let transaction = self.connection.transaction()?;
        let version_number = transaction.query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1
             FROM nutrition_label_versions WHERE label_id = ?1",
            [&input.label_id],
            |row| row.get::<_, i64>(0),
        )?;
        transaction.execute(
            "INSERT INTO nutrition_label_versions (
               id, label_id, version_number, source_draft_id,
               recipe_version_id, rule_pack_id, rule_pack_revision,
               snapshot_schema_version, snapshot_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                input.label_id,
                version_number,
                input.source_draft_id,
                input.recipe_version_id,
                input.rule_pack_id,
                input.rule_pack_revision,
                input.snapshot_schema_version,
                snapshot_json,
                timestamp,
            ],
        )?;
        transaction.commit()?;
        self.get_version(&id)
    }

    pub fn get_version(&self, id: &str) -> Result<NutritionLabelVersion, RepositoryError> {
        get_version_from_connection(&self.connection, id)
    }

    pub fn list_versions(
        &self,
        label_id: &str,
    ) -> Result<Vec<NutritionLabelVersion>, RepositoryError> {
        self.get_label(label_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, label_id, version_number, source_draft_id,
                    recipe_version_id, rule_pack_id, rule_pack_revision,
                    snapshot_schema_version, snapshot_json, created_at
             FROM nutrition_label_versions
             WHERE label_id = ?1
             ORDER BY version_number DESC",
        )?;
        let rows = statement
            .query_map([label_id], map_version_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter().map(version_from_row).collect()
    }
}

const LABEL_SELECT: &str = "
    SELECT label.id, label.recipe_id, label.name,
           (
             SELECT draft.id FROM nutrition_label_drafts draft
             WHERE draft.label_id = label.id
           ),
           (
             SELECT MAX(version.version_number)
             FROM nutrition_label_versions version
             WHERE version.label_id = label.id
           ),
           label.created_at, label.updated_at, label.archived_at
    FROM nutrition_labels label";

fn map_label_row(row: &Row<'_>) -> rusqlite::Result<NutritionLabel> {
    Ok(NutritionLabel {
        id: row.get(0)?,
        recipe_id: row.get(1)?,
        name: row.get(2)?,
        current_draft_id: row.get(3)?,
        latest_version_number: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        archived_at: row.get(7)?,
    })
}

fn get_label_from_connection(
    connection: &Connection,
    id: &str,
) -> Result<NutritionLabel, RepositoryError> {
    connection
        .query_row(
            &format!("{LABEL_SELECT} WHERE label.id = ?1"),
            [id],
            map_label_row,
        )
        .optional()?
        .ok_or_else(|| domain("not_found", "找不到该营养标签"))
}

struct DraftRow {
    id: String,
    label_id: String,
    recipe_version_id: String,
    rule_pack_id: String,
    payload_schema_version: i64,
    payload_json: String,
    calculation_json: Option<String>,
    issues_json: String,
    created_at: String,
    updated_at: String,
}

fn map_draft_row(row: &Row<'_>) -> rusqlite::Result<DraftRow> {
    Ok(DraftRow {
        id: row.get(0)?,
        label_id: row.get(1)?,
        recipe_version_id: row.get(2)?,
        rule_pack_id: row.get(3)?,
        payload_schema_version: row.get(4)?,
        payload_json: row.get(5)?,
        calculation_json: row.get(6)?,
        issues_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn draft_from_row(row: DraftRow) -> Result<NutritionLabelDraft, RepositoryError> {
    Ok(NutritionLabelDraft {
        id: row.id,
        label_id: row.label_id,
        recipe_version_id: row.recipe_version_id,
        rule_pack_id: row.rule_pack_id,
        payload_schema_version: row.payload_schema_version,
        payload: serde_json::from_str(&row.payload_json)?,
        calculation: row
            .calculation_json
            .map(|json| serde_json::from_str(&json))
            .transpose()?,
        issues: serde_json::from_str(&row.issues_json)?,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

struct VersionRow {
    id: String,
    label_id: String,
    version_number: i64,
    source_draft_id: String,
    recipe_version_id: String,
    rule_pack_id: String,
    rule_pack_revision: String,
    snapshot_schema_version: i64,
    snapshot_json: String,
    created_at: String,
}

fn map_version_row(row: &Row<'_>) -> rusqlite::Result<VersionRow> {
    Ok(VersionRow {
        id: row.get(0)?,
        label_id: row.get(1)?,
        version_number: row.get(2)?,
        source_draft_id: row.get(3)?,
        recipe_version_id: row.get(4)?,
        rule_pack_id: row.get(5)?,
        rule_pack_revision: row.get(6)?,
        snapshot_schema_version: row.get(7)?,
        snapshot_json: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn version_from_row(row: VersionRow) -> Result<NutritionLabelVersion, RepositoryError> {
    Ok(NutritionLabelVersion {
        id: row.id,
        label_id: row.label_id,
        version_number: row.version_number,
        source_draft_id: row.source_draft_id,
        recipe_version_id: row.recipe_version_id,
        rule_pack_id: row.rule_pack_id,
        rule_pack_revision: row.rule_pack_revision,
        snapshot_schema_version: row.snapshot_schema_version,
        snapshot: serde_json::from_str(&row.snapshot_json)?,
        created_at: row.created_at,
    })
}

fn get_version_from_connection(
    connection: &Connection,
    id: &str,
) -> Result<NutritionLabelVersion, RepositoryError> {
    let row = connection
        .query_row(
            "SELECT id, label_id, version_number, source_draft_id,
                    recipe_version_id, rule_pack_id, rule_pack_revision,
                    snapshot_schema_version, snapshot_json, created_at
             FROM nutrition_label_versions WHERE id = ?1",
            [id],
            map_version_row,
        )
        .optional()?
        .ok_or_else(|| domain("not_found", "找不到该营养标签版本"))?;
    version_from_row(row)
}

fn validate_draft_input(
    connection: &Connection,
    label: &NutritionLabel,
    input: &NutritionLabelDraftInput,
) -> Result<(), RepositoryError> {
    validate_rule_pack_id(&input.rule_pack_id)?;
    if input.payload_schema_version <= 0 || !input.payload.is_object() {
        return Err(domain("invalid_input", "营养标签草稿数据无效"));
    }
    if input
        .calculation
        .as_ref()
        .is_some_and(|value| !value.is_object())
    {
        return Err(domain("invalid_input", "营养标签计算结果必须是结构化对象"));
    }
    assert_recipe_version_belongs_to_recipe(connection, &input.recipe_version_id, &label.recipe_id)
}

fn validate_version_input(
    connection: &Connection,
    input: &NutritionLabelVersionInput,
) -> Result<(), RepositoryError> {
    let label = get_label_from_connection(connection, &input.label_id)?;
    if label.archived_at.is_some() {
        return Err(domain("archived", "已归档营养标签不能发布正式版本"));
    }
    validate_rule_pack_revision(&input.rule_pack_id, &input.rule_pack_revision)?;
    if input.snapshot_schema_version <= 0 || !input.snapshot.is_object() {
        return Err(domain("invalid_input", "营养标签版本快照无效"));
    }
    assert_recipe_version_belongs_to_recipe(
        connection,
        &input.recipe_version_id,
        &label.recipe_id,
    )?;
    let draft = connection
        .query_row(
            "SELECT label_id, recipe_version_id, rule_pack_id
             FROM nutrition_label_drafts WHERE id = ?1",
            [&input.source_draft_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| domain("missing_reference", "找不到正式标签对应的草稿"))?;
    if draft.0 != input.label_id
        || draft.1 != input.recipe_version_id
        || draft.2 != input.rule_pack_id
    {
        return Err(domain(
            "invalid_input",
            "正式标签的配方版本或规则包与草稿不一致",
        ));
    }
    Ok(())
}

fn validate_rule_pack_id(rule_pack_id: &str) -> Result<(), RepositoryError> {
    if matches!(rule_pack_id, "gb-28050-2011" | "gb-28050-2025") {
        Ok(())
    } else {
        Err(domain("invalid_input", "营养标签规则包无效"))
    }
}

fn validate_rule_pack_revision(rule_pack_id: &str, revision: &str) -> Result<(), RepositoryError> {
    validate_rule_pack_id(rule_pack_id)?;
    let expected = match rule_pack_id {
        "gb-28050-2011" => "2011.1",
        "gb-28050-2025" => "2025.1",
        _ => unreachable!(),
    };
    if revision == expected {
        Ok(())
    } else {
        Err(domain("invalid_input", "营养标签规则包修订号无效"))
    }
}

fn assert_recipe_exists(connection: &Connection, recipe_id: &str) -> Result<(), RepositoryError> {
    let exists = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM recipes WHERE id = ?1 AND archived_at IS NULL
         )",
        [recipe_id],
        |row| row.get::<_, bool>(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(domain("missing_reference", "找不到可用的配方"))
    }
}

fn assert_recipe_version_belongs_to_recipe(
    connection: &Connection,
    recipe_version_id: &str,
    recipe_id: &str,
) -> Result<(), RepositoryError> {
    let exists = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM recipe_versions
           WHERE id = ?1 AND recipe_id = ?2
         )",
        params![recipe_version_id, recipe_id],
        |row| row.get::<_, bool>(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(domain("missing_reference", "找不到该配方的正式版本"))
    }
}

fn required_text(value: &str, message: &str) -> Result<String, RepositoryError> {
    let value = value.trim();
    if value.is_empty() {
        Err(domain("invalid_input", message))
    } else {
        Ok(value.to_string())
    }
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}
