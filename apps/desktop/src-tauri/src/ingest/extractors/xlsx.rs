use std::path::Path;

use calamine::{Reader, open_workbook_auto};

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{
    ExtractedKind, ExtractedTable, empty_document, is_compound_office_file, parse_error,
    password_protected,
};

pub(super) fn extract(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    if is_compound_office_file(path)? {
        return Err(password_protected());
    }
    let mut workbook = open_workbook_auto(path).map_err(parse_error)?;
    let sheet_names = workbook.sheet_names().to_vec();
    let mut document = empty_document(attachment, ExtractedKind::Table);
    for sheet_name in sheet_names {
        let range = workbook.worksheet_range(&sheet_name).map_err(parse_error)?;
        let rows = range
            .rows()
            .map(|row| row.iter().map(ToString::to_string).collect::<Vec<_>>())
            .collect();
        document.tables.push(ExtractedTable {
            name: Some(sheet_name),
            rows,
        });
    }
    Ok(document)
}
