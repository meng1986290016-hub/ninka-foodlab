use std::path::Path;

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{ExtractedKind, ExtractedTextBlock, damaged_file, empty_document};

pub(super) fn extract(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    let bytes = std::fs::read(path).map_err(IngestError::attachment)?;
    let text = String::from_utf8(bytes)
        .map_err(|_| damaged_file("TXT 文件不是有效的 UTF-8 文本"))?
        .trim_start_matches('\u{feff}')
        .to_string();
    let mut document = empty_document(attachment, ExtractedKind::Text);
    if !text.is_empty() {
        document.text_blocks.push(ExtractedTextBlock {
            text,
            source_locator: None,
        });
    }
    Ok(document)
}
