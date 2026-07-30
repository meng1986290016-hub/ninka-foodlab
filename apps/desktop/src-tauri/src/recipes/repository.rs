use std::{collections::HashSet, path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::model::{
    Recipe, RecipeDraft, RecipeDraftInput, RecipeInput, RecipeKind, RecipeSummary, RecipeVersion,
    RecipeVersionInput, RecipeVersionReference,
};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;
type IdGenerator = Arc<dyn Fn() -> String + Send + Sync>;

pub struct RecipeRepository {
    connection: Connection,
    clock: Clock,
    create_id: IdGenerator,
}

impl RecipeRepository {
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

    pub fn list_recipes(&self) -> Result<Vec<Recipe>, RepositoryError> {
        let mut statement = self.connection.prepare(RECIPE_SELECT)?;
        let rows = statement
            .query_map([], map_recipe_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter().map(recipe_from_row).collect()
    }

    pub fn list_recipe_summaries(&self) -> Result<Vec<RecipeSummary>, RepositoryError> {
        self.list_recipes()?
            .into_iter()
            .map(|recipe| {
                let draft_updated_at = self.get_draft(&recipe.id)?.map(|draft| draft.updated_at);
                let latest_version = self
                    .list_versions(&recipe.id)?
                    .into_iter()
                    .next()
                    .map(|version| version_reference(&version));
                let referenced_by_count = self.connection.query_row(
                    "SELECT COUNT(DISTINCT dependency.version_id)
                     FROM recipe_version_dependencies dependency
                     JOIN recipe_versions referenced
                       ON referenced.id = dependency.referenced_version_id
                     WHERE referenced.recipe_id = ?1",
                    [&recipe.id],
                    |row| row.get::<_, i64>(0),
                )?;
                Ok(RecipeSummary {
                    recipe,
                    draft_updated_at,
                    latest_version,
                    referenced_by_count,
                })
            })
            .collect()
    }

    pub fn get_recipe(&self, id: &str) -> Result<Recipe, RepositoryError> {
        get_recipe_from_connection(&self.connection, id)
    }

    pub fn create_recipe(&mut self, input: RecipeInput) -> Result<Recipe, RepositoryError> {
        let input = normalize_recipe_input(input)?;
        assert_unique_code(&self.connection, input.code.as_deref(), None)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        self.connection.execute(
            "INSERT INTO recipes (
               id, name, code, tags_json, kind, created_at, updated_at, archived_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, NULL)",
            params![
                id,
                input.name,
                input.code,
                serde_json::to_string(&input.tags)?,
                recipe_kind_str(input.kind),
                timestamp,
            ],
        )?;
        self.get_recipe(&id)
    }

    pub fn update_recipe(
        &mut self,
        id: &str,
        input: RecipeInput,
    ) -> Result<Recipe, RepositoryError> {
        let existing = self.get_recipe(id)?;
        if existing.archived_at.is_some() {
            return Err(domain("archived", "已归档配方不能修改"));
        }
        let input = normalize_recipe_input(input)?;
        assert_unique_code(&self.connection, input.code.as_deref(), Some(id))?;
        self.connection.execute(
            "UPDATE recipes
             SET name = ?1, code = ?2, tags_json = ?3, kind = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                input.name,
                input.code,
                serde_json::to_string(&input.tags)?,
                recipe_kind_str(input.kind),
                (self.clock)(),
                id,
            ],
        )?;
        self.get_recipe(id)
    }

    pub fn archive_recipe(&mut self, id: &str) -> Result<(), RepositoryError> {
        let recipe = self.get_recipe(id)?;
        if recipe.archived_at.is_some() {
            return Ok(());
        }
        let referenced = self.connection.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM recipe_version_dependencies dependency
               JOIN recipe_versions referenced
                 ON referenced.id = dependency.referenced_version_id
               WHERE referenced.recipe_id = ?1
             )",
            [id],
            |row| row.get::<_, bool>(0),
        )?;
        if referenced {
            return Err(domain(
                "reference_conflict",
                "该配方版本仍被其他配方引用，暂时不能归档",
            ));
        }
        let timestamp = (self.clock)();
        self.connection.execute(
            "UPDATE recipes SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn get_draft(&self, recipe_id: &str) -> Result<Option<RecipeDraft>, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, recipe_id, based_on_version_id, source, payload_version,
                        payload_json, calculation_json, calculation_issues_json,
                        created_at, updated_at
                 FROM recipe_drafts WHERE recipe_id = ?1",
                [recipe_id],
                map_draft_row,
            )
            .optional()?;
        row.map(draft_from_row).transpose()
    }

    pub fn save_draft(&mut self, input: RecipeDraftInput) -> Result<RecipeDraft, RepositoryError> {
        let recipe = self.get_recipe(&input.recipe_id)?;
        if recipe.archived_at.is_some() {
            return Err(domain("archived", "已归档配方不能保存草稿"));
        }
        validate_draft_input(&self.connection, &input)?;
        let existing = self.get_draft(&input.recipe_id)?;
        let id = existing
            .as_ref()
            .map(|draft| draft.id.clone())
            .unwrap_or_else(|| (self.create_id)());
        let timestamp = (self.clock)();
        let created_at = existing
            .map(|draft| draft.created_at)
            .unwrap_or_else(|| timestamp.clone());
        let payload_json = serde_json::to_string(&input.payload)?;
        let calculation_json = input
            .calculation
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let issues_json = serde_json::to_string(&input.calculation_issues)?;
        self.connection.execute(
            "INSERT INTO recipe_drafts (
               id, recipe_id, based_on_version_id, source, payload_version,
               payload_json, calculation_json, calculation_issues_json,
               created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(recipe_id) DO UPDATE SET
               based_on_version_id = excluded.based_on_version_id,
               source = excluded.source,
               payload_version = excluded.payload_version,
               payload_json = excluded.payload_json,
               calculation_json = excluded.calculation_json,
               calculation_issues_json = excluded.calculation_issues_json,
               updated_at = excluded.updated_at",
            params![
                id,
                input.recipe_id,
                input.based_on_version_id,
                input.source,
                input.payload_version,
                payload_json,
                calculation_json,
                issues_json,
                created_at,
                timestamp,
            ],
        )?;
        self.get_draft(&input.recipe_id)?
            .ok_or_else(|| domain("not_found", "找不到配方草稿"))
    }

    pub fn create_version(
        &mut self,
        input: RecipeVersionInput,
    ) -> Result<RecipeVersion, RepositoryError> {
        validate_version_input_before_transaction(&self.connection, &input)?;
        let id = (self.create_id)();
        let timestamp = (self.clock)();
        let snapshot_json = serde_json::to_string(&input.snapshot)?;
        let transaction = self.connection.transaction()?;
        let version_number = transaction.query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1
             FROM recipe_versions WHERE recipe_id = ?1",
            [&input.recipe_id],
            |row| row.get::<_, i64>(0),
        )?;
        transaction.execute(
            "INSERT INTO recipe_versions (
               id, recipe_id, version_number, source_draft_id, based_on_version_id,
               snapshot_schema_version, snapshot_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.recipe_id,
                version_number,
                input.source_draft_id,
                input.based_on_version_id,
                input.snapshot_schema_version,
                snapshot_json,
                timestamp,
            ],
        )?;
        insert_dependencies(&transaction, &id, &input.dependency_version_ids)?;
        transaction.commit()?;
        get_version_from_connection(&self.connection, &id)
    }

    pub fn get_version(&self, id: &str) -> Result<RecipeVersion, RepositoryError> {
        get_version_from_connection(&self.connection, id)
    }

    pub fn list_versions(&self, recipe_id: &str) -> Result<Vec<RecipeVersion>, RepositoryError> {
        self.get_recipe(recipe_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, recipe_id, version_number, source_draft_id, based_on_version_id,
                    snapshot_schema_version, snapshot_json, created_at
             FROM recipe_versions
             WHERE recipe_id = ?1
             ORDER BY version_number DESC",
        )?;
        let rows = statement
            .query_map([recipe_id], map_version_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|row| version_from_row(&self.connection, row))
            .collect()
    }
}

const RECIPE_SELECT: &str = "
    SELECT recipe.id, recipe.name, recipe.code, recipe.tags_json, recipe.kind,
           (
             SELECT draft.id FROM recipe_drafts draft
             WHERE draft.recipe_id = recipe.id
           ),
           (
             SELECT MAX(version.version_number) FROM recipe_versions version
             WHERE version.recipe_id = recipe.id
           ),
           recipe.created_at, recipe.updated_at, recipe.archived_at
    FROM recipes recipe
    ORDER BY recipe.archived_at IS NOT NULL, recipe.updated_at DESC, recipe.name";

struct RecipeRow {
    id: String,
    name: String,
    code: Option<String>,
    tags_json: String,
    kind: String,
    current_draft_id: Option<String>,
    latest_version_number: Option<i64>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

fn map_recipe_row(row: &Row<'_>) -> rusqlite::Result<RecipeRow> {
    Ok(RecipeRow {
        id: row.get(0)?,
        name: row.get(1)?,
        code: row.get(2)?,
        tags_json: row.get(3)?,
        kind: row.get(4)?,
        current_draft_id: row.get(5)?,
        latest_version_number: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        archived_at: row.get(9)?,
    })
}

fn recipe_from_row(row: RecipeRow) -> Result<Recipe, RepositoryError> {
    Ok(Recipe {
        id: row.id,
        name: row.name,
        code: row.code,
        tags: serde_json::from_str(&row.tags_json)?,
        kind: parse_recipe_kind(&row.kind)?,
        current_draft_id: row.current_draft_id,
        latest_version_number: row.latest_version_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at,
    })
}

fn get_recipe_from_connection(
    connection: &Connection,
    id: &str,
) -> Result<Recipe, RepositoryError> {
    let sql = format!("SELECT * FROM ({RECIPE_SELECT}) recipe_result WHERE recipe_result.id = ?1");
    let row = connection
        .query_row(&sql, [id], map_recipe_row)
        .optional()?
        .ok_or_else(|| domain("not_found", "找不到该配方"))?;
    recipe_from_row(row)
}

struct DraftRow {
    id: String,
    recipe_id: String,
    based_on_version_id: Option<String>,
    source: String,
    payload_version: i64,
    payload_json: String,
    calculation_json: Option<String>,
    calculation_issues_json: String,
    created_at: String,
    updated_at: String,
}

fn map_draft_row(row: &Row<'_>) -> rusqlite::Result<DraftRow> {
    Ok(DraftRow {
        id: row.get(0)?,
        recipe_id: row.get(1)?,
        based_on_version_id: row.get(2)?,
        source: row.get(3)?,
        payload_version: row.get(4)?,
        payload_json: row.get(5)?,
        calculation_json: row.get(6)?,
        calculation_issues_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn draft_from_row(row: DraftRow) -> Result<RecipeDraft, RepositoryError> {
    Ok(RecipeDraft {
        id: row.id,
        recipe_id: row.recipe_id,
        based_on_version_id: row.based_on_version_id,
        source: row.source,
        payload_version: row.payload_version,
        payload: serde_json::from_str(&row.payload_json)?,
        calculation: row
            .calculation_json
            .map(|json| serde_json::from_str(&json))
            .transpose()?,
        calculation_issues: serde_json::from_str(&row.calculation_issues_json)?,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

struct VersionRow {
    id: String,
    recipe_id: String,
    version_number: i64,
    source_draft_id: String,
    based_on_version_id: Option<String>,
    snapshot_schema_version: i64,
    snapshot_json: String,
    created_at: String,
}

fn map_version_row(row: &Row<'_>) -> rusqlite::Result<VersionRow> {
    Ok(VersionRow {
        id: row.get(0)?,
        recipe_id: row.get(1)?,
        version_number: row.get(2)?,
        source_draft_id: row.get(3)?,
        based_on_version_id: row.get(4)?,
        snapshot_schema_version: row.get(5)?,
        snapshot_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn version_from_row(
    connection: &Connection,
    row: VersionRow,
) -> Result<RecipeVersion, RepositoryError> {
    let mut statement = connection.prepare(
        "SELECT referenced_version_id
         FROM recipe_version_dependencies
         WHERE version_id = ?1 ORDER BY position",
    )?;
    let dependency_version_ids = statement
        .query_map([&row.id], |dependency| dependency.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RecipeVersion {
        id: row.id,
        recipe_id: row.recipe_id,
        version_number: row.version_number,
        source_draft_id: row.source_draft_id,
        based_on_version_id: row.based_on_version_id,
        snapshot_schema_version: row.snapshot_schema_version,
        snapshot: serde_json::from_str(&row.snapshot_json)?,
        dependency_version_ids,
        created_at: row.created_at,
    })
}

fn get_version_from_connection(
    connection: &Connection,
    id: &str,
) -> Result<RecipeVersion, RepositoryError> {
    let row = connection
        .query_row(
            "SELECT id, recipe_id, version_number, source_draft_id, based_on_version_id,
                    snapshot_schema_version, snapshot_json, created_at
             FROM recipe_versions WHERE id = ?1",
            [id],
            map_version_row,
        )
        .optional()?
        .ok_or_else(|| domain("not_found", "找不到该配方版本"))?;
    version_from_row(connection, row)
}

pub fn version_reference(version: &RecipeVersion) -> RecipeVersionReference {
    let recipe_name = version
        .snapshot
        .pointer("/recipe/name")
        .and_then(Value::as_str)
        .unwrap_or("未命名配方")
        .to_string();
    let output_mass_grams = version
        .snapshot
        .get("finishedMassGrams")
        .and_then(Value::as_str)
        .or_else(|| {
            version
                .snapshot
                .get("targetBatchGrams")
                .and_then(Value::as_str)
        })
        .unwrap_or("0")
        .to_string();
    RecipeVersionReference {
        id: version.id.clone(),
        recipe_id: version.recipe_id.clone(),
        recipe_name,
        version_number: version.version_number,
        output_mass_grams,
        created_at: version.created_at.clone(),
    }
}

fn insert_dependencies(
    transaction: &Transaction<'_>,
    version_id: &str,
    dependency_version_ids: &[String],
) -> Result<(), RepositoryError> {
    let mut seen = HashSet::new();
    for (position, dependency_id) in dependency_version_ids.iter().enumerate() {
        if !seen.insert(dependency_id) {
            return Err(domain("invalid_input", "半成品版本不能重复引用"));
        }
        let exists = transaction.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM recipe_versions version
               JOIN recipes recipe ON recipe.id = version.recipe_id
               WHERE version.id = ?1 AND recipe.archived_at IS NULL
             )",
            [dependency_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !exists {
            return Err(domain("missing_reference", "找不到引用的半成品版本"));
        }
        transaction.execute(
            "INSERT INTO recipe_version_dependencies
             (version_id, referenced_version_id, position)
             VALUES (?1, ?2, ?3)",
            params![version_id, dependency_id, position as i64],
        )?;
    }
    Ok(())
}

fn validate_draft_input(
    connection: &Connection,
    input: &RecipeDraftInput,
) -> Result<(), RepositoryError> {
    if !matches!(input.source.as_str(), "manual" | "agent") {
        return Err(domain("invalid_input", "草稿来源无效"));
    }
    if input.payload_version <= 0 {
        return Err(domain("invalid_input", "草稿数据版本无效"));
    }
    if !input.payload.is_object() {
        return Err(domain("invalid_input", "配方草稿必须是结构化对象"));
    }
    if let Some(version_id) = input.based_on_version_id.as_deref() {
        assert_version_belongs_to_recipe(connection, version_id, &input.recipe_id)?;
    }
    Ok(())
}

fn validate_version_input_before_transaction(
    connection: &Connection,
    input: &RecipeVersionInput,
) -> Result<(), RepositoryError> {
    let recipe = get_recipe_from_connection(connection, &input.recipe_id)?;
    if recipe.archived_at.is_some() {
        return Err(domain("archived", "已归档配方不能保存正式版本"));
    }
    if input.snapshot_schema_version <= 0 || !input.snapshot.is_object() {
        return Err(domain("invalid_input", "配方版本快照无效"));
    }
    let draft_recipe_id = connection
        .query_row(
            "SELECT recipe_id FROM recipe_drafts WHERE id = ?1",
            [&input.source_draft_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| domain("missing_reference", "找不到正式版本对应的草稿"))?;
    if draft_recipe_id != input.recipe_id {
        return Err(domain("invalid_input", "草稿不属于当前配方"));
    }
    if let Some(version_id) = input.based_on_version_id.as_deref() {
        assert_version_belongs_to_recipe(connection, version_id, &input.recipe_id)?;
    }
    for dependency_id in &input.dependency_version_ids {
        let reaches_current_recipe = connection.query_row(
            "WITH RECURSIVE dependency_tree(version_id) AS (
               SELECT ?1
               UNION
               SELECT dependency.referenced_version_id
               FROM recipe_version_dependencies dependency
               JOIN dependency_tree parent
                 ON dependency.version_id = parent.version_id
             )
             SELECT EXISTS(
               SELECT 1
               FROM dependency_tree tree
               JOIN recipe_versions version
                 ON version.id = tree.version_id
               WHERE version.recipe_id = ?2
             )",
            params![dependency_id, input.recipe_id],
            |row| row.get::<_, bool>(0),
        )?;
        if reaches_current_recipe {
            return Err(domain(
                "recipe_cycle",
                "不能引用当前配方自身或间接引用当前配方的半成品版本",
            ));
        }
    }
    Ok(())
}

fn assert_version_belongs_to_recipe(
    connection: &Connection,
    version_id: &str,
    recipe_id: &str,
) -> Result<(), RepositoryError> {
    let matching = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM recipe_versions
           WHERE id = ?1 AND recipe_id = ?2
         )",
        params![version_id, recipe_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !matching {
        return Err(domain("missing_reference", "找不到配方来源版本"));
    }
    Ok(())
}

fn normalize_recipe_input(mut input: RecipeInput) -> Result<RecipeInput, RepositoryError> {
    input.name = input.name.trim().to_string();
    if input.name.is_empty() {
        return Err(domain("invalid_input", "请填写配方名称"));
    }
    input.code = input.code.and_then(|code| {
        let code = code.trim();
        (!code.is_empty()).then(|| code.to_string())
    });
    let mut seen = HashSet::new();
    input.tags = input
        .tags
        .into_iter()
        .filter_map(|tag| {
            let tag = tag.trim();
            (!tag.is_empty() && seen.insert(tag.to_lowercase())).then(|| tag.to_string())
        })
        .collect();
    Ok(input)
}

fn assert_unique_code(
    connection: &Connection,
    code: Option<&str>,
    except_id: Option<&str>,
) -> Result<(), RepositoryError> {
    let Some(code) = code else {
        return Ok(());
    };
    let exists = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM recipes
           WHERE archived_at IS NULL AND lower(code) = lower(?1)
             AND (?2 IS NULL OR id <> ?2)
         )",
        params![code, except_id],
        |row| row.get::<_, bool>(0),
    )?;
    if exists {
        return Err(domain("duplicate_code", "配方编号已存在"));
    }
    Ok(())
}

fn recipe_kind_str(kind: RecipeKind) -> &'static str {
    match kind {
        RecipeKind::Formula => "formula",
        RecipeKind::SemiFinished => "semi_finished",
    }
}

fn parse_recipe_kind(value: &str) -> Result<RecipeKind, RepositoryError> {
    match value {
        "formula" => Ok(RecipeKind::Formula),
        "semi_finished" => Ok(RecipeKind::SemiFinished),
        _ => Err(domain("storage_failure", "配方类型数据无效")),
    }
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}
