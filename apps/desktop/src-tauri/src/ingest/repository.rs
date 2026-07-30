use std::collections::HashSet;

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use super::{
    IngestError,
    attachment_store::{StagedAttachment, StoredAttachment},
    extractors::ExtractedDocument,
    model::{
        DraftSourceLink, ImportIssue, IngredientImportDraft, IngredientImportDraftStatus,
        IngredientImportJob, IngredientImportJobStatus, IngredientImportSourceKind,
        ReviewedIngredientImportDraft, SourceAttachment,
    },
};

pub struct NewImportDraft {
    pub attachment_ids: Vec<String>,
    pub issues: Vec<ImportIssue>,
    pub review: ReviewedIngredientImportDraft,
}

pub fn insert_job(connection: &Connection, job: &IngredientImportJob) -> Result<(), IngestError> {
    connection.execute(
        "INSERT INTO ingredient_import_jobs (
           id, source_kind, status, progress_current, progress_total,
           error_summary, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            job.id,
            source_kind_str(job.source_kind),
            job_status_str(job.status),
            job.progress_current as i64,
            job.progress_total as i64,
            job.error_summary,
            job.created_at,
            job.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_job(connection: &Connection, id: &str) -> Result<IngredientImportJob, IngestError> {
    connection
        .query_row(
            "SELECT id, source_kind, status, progress_current, progress_total,
                    error_summary, created_at, updated_at
             FROM ingredient_import_jobs WHERE id = ?1",
            [id],
            |row| {
                let source_kind = parse_source_kind(&row.get::<_, String>(1)?)?;
                let status = parse_job_status(&row.get::<_, String>(2)?)?;
                Ok(IngredientImportJob {
                    id: row.get(0)?,
                    source_kind,
                    status,
                    progress_current: row.get::<_, i64>(3)? as u64,
                    progress_total: row.get::<_, i64>(4)? as u64,
                    error_summary: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| IngestError::domain("not_found", "找不到该导入任务"))
}

pub fn transition_job(
    connection: &Connection,
    id: &str,
    to: IngredientImportJobStatus,
    error_summary: Option<&str>,
    updated_at: &str,
) -> Result<IngredientImportJob, IngestError> {
    let current = get_job(connection, id)?;
    if !may_transition(current.status, to) {
        return Err(IngestError::domain(
            "invalid_state",
            "当前任务状态不能执行此操作",
        ));
    }
    connection.execute(
        "UPDATE ingredient_import_jobs
         SET status = ?1, error_summary = ?2, updated_at = ?3
         WHERE id = ?4",
        params![job_status_str(to), error_summary, updated_at, id],
    )?;
    get_job(connection, id)
}

pub fn set_job_progress(
    connection: &Connection,
    id: &str,
    current: u64,
    total: u64,
    updated_at: &str,
) -> Result<(), IngestError> {
    connection.execute(
        "UPDATE ingredient_import_jobs
         SET progress_current = ?1, progress_total = ?2, updated_at = ?3
         WHERE id = ?4",
        params![current as i64, total as i64, updated_at, id],
    )?;
    Ok(())
}

pub fn fail_job(
    connection: &Connection,
    id: &str,
    error_summary: &str,
    updated_at: &str,
) -> Result<IngredientImportJob, IngestError> {
    connection.execute(
        "UPDATE ingredient_import_jobs
         SET status = 'failed', error_summary = ?1, updated_at = ?2
         WHERE id = ?3",
        params![error_summary, updated_at, id],
    )?;
    get_job(connection, id)
}

pub fn recover_interrupted(connection: &Connection, updated_at: &str) -> Result<(), IngestError> {
    connection.execute(
        "UPDATE ingredient_import_jobs
         SET status = 'failed',
             error_summary = '应用上次在处理中退出，可安全重试',
             updated_at = ?1
         WHERE status IN ('extracting', 'grouping')",
        [updated_at],
    )?;
    Ok(())
}

pub fn insert_or_get_attachment(
    connection: &Connection,
    staged: StagedAttachment,
    id: &str,
    created_at: &str,
) -> Result<StoredAttachment, IngestError> {
    connection.execute(
        "INSERT INTO source_attachments (
           id, original_name, media_type, byte_size, sha256, relative_path, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(sha256) DO NOTHING",
        params![
            id,
            staged.original_name,
            staged.media_type,
            staged.byte_size as i64,
            staged.sha256,
            staged.relative_path,
            created_at,
        ],
    )?;
    connection
        .query_row(
            "SELECT id, original_name, media_type, byte_size, sha256, relative_path
         FROM source_attachments WHERE sha256 = ?1",
            [&staged.sha256],
            |row| {
                Ok(StoredAttachment {
                    id: row.get(0)?,
                    original_name: row.get(1)?,
                    media_type: row.get(2)?,
                    byte_size: row.get::<_, i64>(3)? as u64,
                    sha256: row.get(4)?,
                    relative_path: row.get(5)?,
                })
            },
        )
        .map_err(Into::into)
}

pub fn link_job_attachment(
    connection: &Connection,
    job_id: &str,
    attachment_id: &str,
    position: usize,
) -> Result<(), IngestError> {
    connection.execute(
        "INSERT OR IGNORE INTO ingredient_import_job_attachments
         (job_id, attachment_id, position) VALUES (?1, ?2, ?3)",
        params![job_id, attachment_id, position as i64],
    )?;
    Ok(())
}

pub fn list_job_attachments(
    connection: &Connection,
    job_id: &str,
) -> Result<Vec<StoredAttachment>, IngestError> {
    let mut statement = connection.prepare(
        "SELECT a.id, a.original_name, a.media_type, a.byte_size, a.sha256, a.relative_path
         FROM ingredient_import_job_attachments ja
         JOIN source_attachments a ON a.id = ja.attachment_id
         WHERE ja.job_id = ?1 ORDER BY ja.position",
    )?;
    statement
        .query_map([job_id], |row| {
            Ok(StoredAttachment {
                id: row.get(0)?,
                original_name: row.get(1)?,
                media_type: row.get(2)?,
                byte_size: row.get::<_, i64>(3)? as u64,
                sha256: row.get(4)?,
                relative_path: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn referenced_attachment_hashes(
    connection: &Connection,
) -> Result<HashSet<String>, IngestError> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT a.sha256
         FROM source_attachments a
         WHERE EXISTS (
           SELECT 1 FROM ingredient_variant_attachments va
           WHERE va.attachment_id = a.id
         )
         OR EXISTS (
           SELECT 1
           FROM import_draft_attachments da
           JOIN ingredient_import_drafts d ON d.id = da.draft_id
           WHERE da.attachment_id = a.id
             AND d.status IN ('needs_review', 'ready', 'failed')
         )
         OR EXISTS (
           SELECT 1
           FROM import_draft_source_links sl
           JOIN ingredient_import_drafts d ON d.id = sl.draft_id
           WHERE sl.attachment_id = a.id
             AND d.status IN ('needs_review', 'ready', 'failed')
         )
         OR EXISTS (
           SELECT 1
           FROM ingredient_import_job_attachments ja
           JOIN ingredient_import_jobs j ON j.id = ja.job_id
           WHERE ja.attachment_id = a.id
             AND j.status IN ('pending', 'extracting', 'recognizing', 'grouping', 'failed')
         )",
    )?;
    statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(Into::into)
}

pub fn prune_unreferenced_attachment_metadata(
    transaction: &Transaction<'_>,
    referenced_hashes: &HashSet<String>,
) -> Result<usize, IngestError> {
    let mut statement = transaction.prepare("SELECT id, sha256 FROM source_attachments")?;
    let orphan_ids = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|row| match row {
            Ok((id, hash)) if !referenced_hashes.contains(&hash) => Some(Ok(id)),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    for id in &orphan_ids {
        transaction.execute(
            "DELETE FROM import_draft_source_links WHERE attachment_id = ?1",
            [id],
        )?;
        transaction.execute(
            "DELETE FROM import_draft_attachments WHERE attachment_id = ?1",
            [id],
        )?;
        transaction.execute(
            "DELETE FROM ingredient_import_job_attachments WHERE attachment_id = ?1",
            [id],
        )?;
        transaction.execute(
            "DELETE FROM attachment_extractions WHERE attachment_id = ?1",
            [id],
        )?;
        transaction.execute("DELETE FROM source_attachments WHERE id = ?1", [id])?;
    }
    Ok(orphan_ids.len())
}

pub fn save_extraction(
    connection: &Connection,
    attachment_id: &str,
    extraction: &ExtractedDocument,
    created_at: &str,
) -> Result<(), IngestError> {
    let content_json = serde_json::to_string(extraction)?;
    connection.execute(
        "INSERT INTO attachment_extractions
         (attachment_id, extractor_version, content_json, created_at)
         VALUES (?1, 1, ?2, ?3)
         ON CONFLICT(attachment_id) DO UPDATE SET
           extractor_version = excluded.extractor_version,
           content_json = excluded.content_json,
           created_at = excluded.created_at",
        params![attachment_id, content_json, created_at],
    )?;
    Ok(())
}

pub fn replace_drafts(
    transaction: &Transaction<'_>,
    job_id: &str,
    drafts: Vec<NewImportDraft>,
    updated_at: &str,
    create_id: &dyn Fn() -> String,
) -> Result<(), IngestError> {
    transaction.execute(
        "DELETE FROM ingredient_import_drafts WHERE job_id = ?1",
        [job_id],
    )?;
    for (position, draft) in drafts.into_iter().enumerate() {
        let id = create_id();
        let review_json = serde_json::to_string(&draft.review)?;
        let issues_json = serde_json::to_string(&draft.issues)?;
        let status = if draft
            .issues
            .iter()
            .any(|issue| issue.severity == super::model::ImportIssueSeverity::Error)
        {
            IngredientImportDraftStatus::NeedsReview
        } else {
            IngredientImportDraftStatus::Ready
        };
        transaction.execute(
            "INSERT INTO ingredient_import_drafts (
               id, job_id, position, status, review_json, issues_json,
               imported_variant_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7)",
            params![
                id,
                job_id,
                position as i64,
                draft_status_str(status),
                review_json,
                issues_json,
                updated_at,
            ],
        )?;
        for attachment_id in draft.attachment_ids {
            transaction.execute(
                "INSERT INTO import_draft_attachments (draft_id, attachment_id)
                 VALUES (?1, ?2)",
                params![id, attachment_id],
            )?;
        }
    }
    Ok(())
}

pub fn insert_draft(
    connection: &Connection,
    job_id: &str,
    draft: NewImportDraft,
    updated_at: &str,
    create_id: &dyn Fn() -> String,
) -> Result<String, IngestError> {
    get_job(connection, job_id)?;
    for attachment_id in &draft.attachment_ids {
        let belongs_to_job = connection.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM ingredient_import_job_attachments
               WHERE job_id = ?1 AND attachment_id = ?2
             )",
            params![job_id, attachment_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !belongs_to_job {
            return Err(IngestError::domain(
                "scope_violation",
                "附件不属于当前导入任务",
            ));
        }
    }
    let id = create_id();
    let position = connection.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1
         FROM ingredient_import_drafts WHERE job_id = ?1",
        [job_id],
        |row| row.get::<_, i64>(0),
    )?;
    let review_json = serde_json::to_string(&draft.review)?;
    let issues_json = serde_json::to_string(&draft.issues)?;
    let status = if draft
        .issues
        .iter()
        .any(|issue| issue.severity == super::model::ImportIssueSeverity::Error)
    {
        IngredientImportDraftStatus::NeedsReview
    } else {
        IngredientImportDraftStatus::Ready
    };
    connection.execute(
        "INSERT INTO ingredient_import_drafts (
           id, job_id, position, status, review_json, issues_json,
           imported_variant_id, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7)",
        params![
            id,
            job_id,
            position,
            draft_status_str(status),
            review_json,
            issues_json,
            updated_at,
        ],
    )?;
    for attachment_id in draft.attachment_ids {
        connection.execute(
            "INSERT INTO import_draft_attachments (draft_id, attachment_id)
             VALUES (?1, ?2)",
            params![id, attachment_id],
        )?;
    }
    Ok(id)
}

pub fn read_job_extractions(
    connection: &Connection,
    job_id: &str,
    attachment_ids: &[String],
) -> Result<Vec<ExtractedDocument>, IngestError> {
    let mut documents = Vec::with_capacity(attachment_ids.len());
    for attachment_id in attachment_ids {
        let content = connection
            .query_row(
                "SELECT e.content_json
                 FROM ingredient_import_job_attachments ja
                 JOIN attachment_extractions e ON e.attachment_id = ja.attachment_id
                 WHERE ja.job_id = ?1 AND ja.attachment_id = ?2",
                params![job_id, attachment_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| {
                IngestError::domain("scope_violation", "附件不属于当前任务或尚未完成内容提取")
            })?;
        documents.push(serde_json::from_str(&content)?);
    }
    Ok(documents)
}

pub fn list_drafts(
    connection: &Connection,
    job_id: &str,
) -> Result<Vec<IngredientImportDraft>, IngestError> {
    let mut statement = connection.prepare(
        "SELECT id, job_id, position, status, review_json, issues_json,
                imported_variant_id, created_at, updated_at
         FROM ingredient_import_drafts WHERE job_id = ?1 ORDER BY position",
    )?;
    let raw = statement
        .query_map([job_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? as u64,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    raw.into_iter()
        .map(|row| hydrate_draft(connection, row))
        .collect()
}

pub fn get_draft(connection: &Connection, id: &str) -> Result<IngredientImportDraft, IngestError> {
    let row = connection
        .query_row(
            "SELECT id, job_id, position, status, review_json, issues_json,
                    imported_variant_id, created_at, updated_at
             FROM ingredient_import_drafts WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)? as u64,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| IngestError::domain("not_found", "找不到该导入草稿"))?;
    hydrate_draft(connection, row)
}

#[allow(clippy::type_complexity)]
fn hydrate_draft(
    connection: &Connection,
    row: (
        String,
        String,
        u64,
        String,
        String,
        String,
        Option<String>,
        String,
        String,
    ),
) -> Result<IngredientImportDraft, IngestError> {
    let (
        id,
        job_id,
        position,
        status,
        review_json,
        issues_json,
        imported_variant_id,
        created_at,
        updated_at,
    ) = row;
    let mut attachment_statement = connection.prepare(
        "SELECT a.id, a.original_name, a.media_type, a.byte_size, a.sha256, a.created_at
         FROM import_draft_attachments da
         JOIN source_attachments a ON a.id = da.attachment_id
         WHERE da.draft_id = ?1 ORDER BY a.created_at, a.original_name",
    )?;
    let attachments = attachment_statement
        .query_map([&id], |row| {
            Ok(SourceAttachment {
                id: row.get(0)?,
                original_name: row.get(1)?,
                media_type: row.get(2)?,
                byte_size: row.get::<_, i64>(3)? as u64,
                sha256: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut link_statement = connection.prepare(
        "SELECT field_path, attachment_id, source_locator
         FROM import_draft_source_links WHERE draft_id = ?1 ORDER BY id",
    )?;
    let source_links = link_statement
        .query_map([&id], |row| {
            Ok(DraftSourceLink {
                field_path: row.get(0)?,
                attachment_id: row.get(1)?,
                source_locator: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(IngredientImportDraft {
        id,
        job_id,
        position,
        status: parse_draft_status(&status)?,
        review: serde_json::from_str(&review_json)?,
        issues: serde_json::from_str(&issues_json)?,
        attachments,
        source_links,
        imported_variant_id,
        created_at,
        updated_at,
    })
}

pub fn update_draft(
    connection: &Connection,
    id: &str,
    review: &ReviewedIngredientImportDraft,
    issues: &[ImportIssue],
    updated_at: &str,
) -> Result<IngredientImportDraft, IngestError> {
    let existing = get_draft(connection, id)?;
    if existing.status == IngredientImportDraftStatus::Imported {
        return Err(IngestError::domain("invalid_state", "已导入的草稿不能修改"));
    }
    let status = if issues
        .iter()
        .any(|issue| issue.severity == super::model::ImportIssueSeverity::Error)
    {
        IngredientImportDraftStatus::NeedsReview
    } else {
        IngredientImportDraftStatus::Ready
    };
    connection.execute(
        "UPDATE ingredient_import_drafts
         SET status = ?1, review_json = ?2, issues_json = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            draft_status_str(status),
            serde_json::to_string(review)?,
            serde_json::to_string(issues)?,
            updated_at,
            id,
        ],
    )?;
    get_draft(connection, id)
}

pub fn mark_draft_imported(
    transaction: &Transaction<'_>,
    draft_id: &str,
    variant_id: &str,
    review: &ReviewedIngredientImportDraft,
    updated_at: &str,
) -> Result<(), IngestError> {
    transaction.execute(
        "UPDATE ingredient_import_drafts
         SET status = 'imported', imported_variant_id = ?1,
             review_json = ?2, issues_json = '[]', updated_at = ?3
         WHERE id = ?4",
        params![
            variant_id,
            serde_json::to_string(review)?,
            updated_at,
            draft_id
        ],
    )?;
    Ok(())
}

pub fn link_draft_attachments_to_variant(
    transaction: &Transaction<'_>,
    draft_id: &str,
    variant_id: &str,
) -> Result<(), IngestError> {
    transaction.execute(
        "INSERT OR IGNORE INTO ingredient_variant_attachments
         (ingredient_variant_id, attachment_id)
         SELECT ?1, attachment_id FROM import_draft_attachments WHERE draft_id = ?2",
        params![variant_id, draft_id],
    )?;
    Ok(())
}

pub fn discard_draft(
    connection: &Connection,
    id: &str,
    updated_at: &str,
) -> Result<(), IngestError> {
    let draft = get_draft(connection, id)?;
    if draft.status == IngredientImportDraftStatus::Imported {
        return Err(IngestError::domain("invalid_state", "已导入的草稿不能丢弃"));
    }
    connection.execute(
        "UPDATE ingredient_import_drafts SET status = 'discarded', updated_at = ?1 WHERE id = ?2",
        params![updated_at, id],
    )?;
    Ok(())
}

pub fn may_transition(from: IngredientImportJobStatus, to: IngredientImportJobStatus) -> bool {
    use IngredientImportJobStatus::{
        Cancelled, DraftsReady, Extracting, Failed, Grouping, PartiallyCompleted, Pending,
        Recognizing,
    };
    matches!(
        (from, to),
        (Pending, Extracting)
            | (Extracting, Recognizing)
            | (Extracting, Grouping)
            | (Recognizing, Grouping)
            | (Grouping, DraftsReady)
            | (DraftsReady, PartiallyCompleted)
            | (PartiallyCompleted, DraftsReady)
            | (
                Pending
                    | Extracting
                    | Recognizing
                    | Grouping
                    | DraftsReady
                    | PartiallyCompleted
                    | Failed,
                Cancelled
            )
            | (Failed | Cancelled, Pending)
    )
}

fn source_kind_str(value: IngredientImportSourceKind) -> &'static str {
    match value {
        IngredientImportSourceKind::Spreadsheet => "spreadsheet",
        IngredientImportSourceKind::Documents => "documents",
        IngredientImportSourceKind::Agent => "agent",
    }
}

fn parse_source_kind(value: &str) -> rusqlite::Result<IngredientImportSourceKind> {
    match value {
        "spreadsheet" => Ok(IngredientImportSourceKind::Spreadsheet),
        "documents" => Ok(IngredientImportSourceKind::Documents),
        "agent" => Ok(IngredientImportSourceKind::Agent),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn job_status_str(value: IngredientImportJobStatus) -> &'static str {
    match value {
        IngredientImportJobStatus::Pending => "pending",
        IngredientImportJobStatus::Extracting => "extracting",
        IngredientImportJobStatus::Recognizing => "recognizing",
        IngredientImportJobStatus::Grouping => "grouping",
        IngredientImportJobStatus::DraftsReady => "drafts_ready",
        IngredientImportJobStatus::PartiallyCompleted => "partially_completed",
        IngredientImportJobStatus::Failed => "failed",
        IngredientImportJobStatus::Cancelled => "cancelled",
    }
}

fn parse_job_status(value: &str) -> rusqlite::Result<IngredientImportJobStatus> {
    match value {
        "pending" => Ok(IngredientImportJobStatus::Pending),
        "extracting" => Ok(IngredientImportJobStatus::Extracting),
        "recognizing" => Ok(IngredientImportJobStatus::Recognizing),
        "grouping" => Ok(IngredientImportJobStatus::Grouping),
        "drafts_ready" => Ok(IngredientImportJobStatus::DraftsReady),
        "partially_completed" => Ok(IngredientImportJobStatus::PartiallyCompleted),
        "failed" => Ok(IngredientImportJobStatus::Failed),
        "cancelled" => Ok(IngredientImportJobStatus::Cancelled),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn draft_status_str(value: IngredientImportDraftStatus) -> &'static str {
    match value {
        IngredientImportDraftStatus::NeedsReview => "needs_review",
        IngredientImportDraftStatus::Ready => "ready",
        IngredientImportDraftStatus::Imported => "imported",
        IngredientImportDraftStatus::Discarded => "discarded",
        IngredientImportDraftStatus::Failed => "failed",
    }
}

fn parse_draft_status(value: &str) -> Result<IngredientImportDraftStatus, IngestError> {
    match value {
        "needs_review" => Ok(IngredientImportDraftStatus::NeedsReview),
        "ready" => Ok(IngredientImportDraftStatus::Ready),
        "imported" => Ok(IngredientImportDraftStatus::Imported),
        "discarded" => Ok(IngredientImportDraftStatus::Discarded),
        "failed" => Ok(IngredientImportDraftStatus::Failed),
        _ => Err(IngestError::domain("storage_failure", "导入草稿状态无效")),
    }
}
