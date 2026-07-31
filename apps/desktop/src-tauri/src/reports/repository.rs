use std::{path::Path, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::Value;

use crate::{
    database::{self, migrations},
    ingredients::repository::RepositoryError,
};

use super::model::{ResearchReport, ResearchReportInput};

type Clock = Arc<dyn Fn() -> String + Send + Sync>;

pub struct ResearchReportRepository {
    connection: Connection,
    clock: Clock,
}

impl ResearchReportRepository {
    pub fn open(path: &Path) -> Result<Self, RepositoryError> {
        Self::from_connection(database::open(path)?, Arc::new(|| Utc::now().to_rfc3339()))
    }

    pub fn open_in_memory_with<C>(clock: C) -> Result<Self, RepositoryError>
    where
        C: Fn() -> String + Send + Sync + 'static,
    {
        Self::from_connection(database::open_in_memory()?, Arc::new(clock))
    }

    fn from_connection(mut connection: Connection, clock: Clock) -> Result<Self, RepositoryError> {
        migrations::apply(&mut connection, &clock())?;
        Ok(Self { connection, clock })
    }

    pub fn create_report(
        &mut self,
        input: ResearchReportInput,
    ) -> Result<ResearchReport, RepositoryError> {
        let source = validate_input(&input)?;
        if self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM research_reports WHERE id = ?1)",
            [&source.id],
            |row| row.get::<_, bool>(0),
        )? {
            return Err(domain("invalid_state", "该研发报告记录已存在"));
        }
        assert_source_versions(
            &self.connection,
            &source.recipe_version_id,
            &source.nutrition_label_version_id,
        )?;
        let created_at = (self.clock)();
        self.connection.execute(
            "INSERT INTO research_reports (
               id, recipe_version_id, nutrition_label_version_id,
               document_schema_version, document_json, svg_text, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                source.id,
                source.recipe_version_id,
                source.nutrition_label_version_id,
                source.schema_version,
                serde_json::to_string(&input.document)?,
                input.svg,
                created_at,
            ],
        )?;
        self.get_report(&source.id)
    }

    pub fn list_reports(
        &self,
        recipe_version_id: &str,
    ) -> Result<Vec<ResearchReport>, RepositoryError> {
        assert_recipe_version_exists(&self.connection, recipe_version_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id, recipe_version_id, nutrition_label_version_id,
                    document_json, svg_text, created_at
             FROM research_reports
             WHERE recipe_version_id = ?1
             ORDER BY created_at DESC, id",
        )?;
        let rows = statement
            .query_map([recipe_version_id], map_report_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows.into_iter().map(report_from_row).collect()
    }

    pub fn get_report(&self, id: &str) -> Result<ResearchReport, RepositoryError> {
        let row = self
            .connection
            .query_row(
                "SELECT id, recipe_version_id, nutrition_label_version_id,
                        document_json, svg_text, created_at
                 FROM research_reports WHERE id = ?1",
                [id],
                map_report_row,
            )
            .optional()?
            .ok_or_else(|| domain("not_found", "找不到该研发报告记录"))?;
        report_from_row(row)
    }
}

struct ReportSource {
    id: String,
    recipe_version_id: String,
    nutrition_label_version_id: String,
    schema_version: i64,
}

struct ReportRow {
    id: String,
    recipe_version_id: String,
    nutrition_label_version_id: String,
    document_json: String,
    svg: String,
    created_at: String,
}

fn map_report_row(row: &Row<'_>) -> rusqlite::Result<ReportRow> {
    Ok(ReportRow {
        id: row.get(0)?,
        recipe_version_id: row.get(1)?,
        nutrition_label_version_id: row.get(2)?,
        document_json: row.get(3)?,
        svg: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn report_from_row(row: ReportRow) -> Result<ResearchReport, RepositoryError> {
    Ok(ResearchReport {
        id: row.id,
        recipe_version_id: row.recipe_version_id,
        nutrition_label_version_id: row.nutrition_label_version_id,
        document: serde_json::from_str(&row.document_json)?,
        svg: row.svg,
        created_at: row.created_at,
    })
}

fn validate_input(input: &ResearchReportInput) -> Result<ReportSource, RepositoryError> {
    let document = input
        .document
        .as_object()
        .ok_or_else(|| domain("invalid_input", "研发报告文档无效"))?;
    let id = required_string(&input.document, "/id")?;
    let title = required_string(&input.document, "/title")?;
    if title.trim().is_empty() {
        return Err(domain("invalid_input", "研发报告文档无效"));
    }
    let schema_version = document
        .get("schemaVersion")
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)
        .ok_or_else(|| domain("invalid_input", "研发报告文档版本无效"))?;
    let recipe_version_id = required_string(&input.document, "/provenance/recipeVersionId")?;
    let nutrition_label_version_id =
        required_string(&input.document, "/provenance/nutritionLabelVersionId")?;
    if required_string(&input.document, "/recipe/versionId")? != recipe_version_id
        || required_string(&input.document, "/nutrition/labelVersionId")?
            != nutrition_label_version_id
    {
        return Err(domain("missing_reference", "研发报告来源版本不一致"));
    }
    validate_svg(&input.svg)?;
    Ok(ReportSource {
        id,
        recipe_version_id,
        nutrition_label_version_id,
        schema_version,
    })
}

fn required_string(document: &Value, pointer: &str) -> Result<String, RepositoryError> {
    document
        .pointer(pointer)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| domain("invalid_input", "研发报告文档无效"))
}

fn validate_svg(svg: &str) -> Result<(), RepositoryError> {
    let normalized = svg.trim_start();
    let lowercase = normalized.to_ascii_lowercase();
    let disallowed = [
        "<script",
        "<foreignobject",
        "href=\"http:",
        "href='http:",
        "href=\"https:",
        "href='https:",
        "src=\"http:",
        "src='http:",
        "src=\"https:",
        "src='https:",
        "javascript:",
    ];
    if !normalized.starts_with("<svg") || disallowed.iter().any(|token| lowercase.contains(token)) {
        return Err(domain("invalid_input", "研发报告 SVG 无效"));
    }
    Ok(())
}

fn assert_source_versions(
    connection: &Connection,
    recipe_version_id: &str,
    nutrition_label_version_id: &str,
) -> Result<(), RepositoryError> {
    let matching = connection.query_row(
        "SELECT EXISTS(
           SELECT 1
           FROM recipe_versions recipe_version
           JOIN nutrition_label_versions label_version
             ON label_version.recipe_version_id = recipe_version.id
           WHERE recipe_version.id = ?1 AND label_version.id = ?2
         )",
        params![recipe_version_id, nutrition_label_version_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !matching {
        return Err(domain("missing_reference", "研发报告来源版本不一致"));
    }
    Ok(())
}

fn assert_recipe_version_exists(
    connection: &Connection,
    recipe_version_id: &str,
) -> Result<(), RepositoryError> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM recipe_versions WHERE id = ?1)",
        [recipe_version_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !exists {
        return Err(domain("not_found", "找不到该配方版本"));
    }
    Ok(())
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}
