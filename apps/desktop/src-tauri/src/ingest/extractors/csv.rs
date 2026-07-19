use std::path::Path;

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{ExtractedKind, ExtractedTable, empty_document, parse_error};

pub(super) fn extract(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    let mut reader = ::csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_path(path)
        .map_err(parse_error)?;
    let rows = reader
        .records()
        .map(|record| {
            record
                .map(|record| record.iter().map(str::to_string).collect::<Vec<_>>())
                .map_err(parse_error)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut document = empty_document(attachment, ExtractedKind::Table);
    document.tables.push(ExtractedTable { name: None, rows });
    Ok(document)
}
