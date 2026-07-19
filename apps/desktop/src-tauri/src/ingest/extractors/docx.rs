use std::{fs::File, io::Read, path::Path};

use quick_xml::{Reader, events::Event};
use zip::ZipArchive;

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{
    ExtractedKind, ExtractedTextBlock, damaged_file, empty_document, is_compound_office_file,
    parse_error, password_protected,
};

pub(super) fn extract(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    if is_compound_office_file(path)? {
        return Err(password_protected());
    }
    let file = File::open(path).map_err(IngestError::attachment)?;
    let mut archive = ZipArchive::new(file).map_err(parse_error)?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(parse_error)?
        .read_to_string(&mut xml)
        .map_err(|_| damaged_file("DOCX 正文无法读取"))?;

    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut blocks = Vec::new();
    let mut paragraph = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Text(text)) => {
                let value = text.decode().map_err(parse_error)?;
                paragraph.push_str(&value);
            }
            Ok(Event::End(end)) if end.name().as_ref() == b"w:p" => {
                if !paragraph.trim().is_empty() {
                    blocks.push(ExtractedTextBlock {
                        text: paragraph.trim().to_string(),
                        source_locator: None,
                    });
                }
                paragraph.clear();
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(parse_error(error)),
        }
    }
    if !paragraph.trim().is_empty() {
        blocks.push(ExtractedTextBlock {
            text: paragraph.trim().to_string(),
            source_locator: None,
        });
    }
    let mut document = empty_document(attachment, ExtractedKind::Text);
    document.text_blocks = blocks;
    Ok(document)
}
