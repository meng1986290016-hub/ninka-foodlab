use std::path::Path;

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{ExtractedKind, ExtractedTextBlock, empty_document, parse_error, password_protected};

pub(super) fn extract(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    let bytes = std::fs::read(path).map_err(IngestError::attachment)?;
    if bytes
        .windows(b"/Encrypt".len())
        .any(|part| part == b"/Encrypt")
    {
        return Err(password_protected());
    }
    let text = pdf_extract::extract_text(path).map_err(parse_error)?;
    let mut document = empty_document(attachment, ExtractedKind::Text);
    if !text.trim().is_empty() {
        document.text_blocks.push(ExtractedTextBlock {
            text: text.trim().to_string(),
            source_locator: None,
        });
    }
    Ok(document)
}
