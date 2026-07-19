mod csv;
mod docx;
mod image;
mod pdf;
mod text;
mod xlsx;

use std::{ffi::OsStr, path::Path};

use serde::{Deserialize, Serialize};

use crate::ingest::{
    IngestError,
    attachment_store::{AttachmentStore, StoredAttachment},
    model::ImportIssue,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractedKind {
    Text,
    Table,
    Image,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedTextBlock {
    pub text: String,
    pub source_locator: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedTable {
    pub name: Option<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedImageMetadata {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedDocument {
    pub attachment_id: String,
    pub source_name: String,
    pub kind: ExtractedKind,
    pub text_blocks: Vec<ExtractedTextBlock>,
    pub tables: Vec<ExtractedTable>,
    pub image_metadata: Option<ExtractedImageMetadata>,
    pub requires_vision: bool,
    pub warnings: Vec<ImportIssue>,
}

#[derive(Clone, Debug)]
pub struct DocumentExtractor {
    store: AttachmentStore,
}

impl DocumentExtractor {
    pub fn new(store: AttachmentStore) -> Self {
        Self { store }
    }

    pub fn extract(&self, attachment: &StoredAttachment) -> Result<ExtractedDocument, IngestError> {
        let path = self.store.open_for_extract(&attachment.relative_path)?;
        match path
            .extension()
            .and_then(OsStr::to_str)
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("txt") => text::extract(attachment, &path),
            Some("csv") => csv::extract(attachment, &path),
            Some("xlsx") => xlsx::extract(attachment, &path),
            Some("docx") => docx::extract(attachment, &path),
            Some("pdf") => pdf::extract(attachment, &path),
            Some("jpg" | "jpeg" | "png" | "webp") => image::extract_metadata(attachment, &path),
            _ => Err(IngestError::domain("unsupported_file", "不支持该文件格式")),
        }
    }
}

fn empty_document(attachment: &StoredAttachment, kind: ExtractedKind) -> ExtractedDocument {
    ExtractedDocument {
        attachment_id: attachment.id.clone(),
        source_name: attachment.original_name.clone(),
        kind,
        text_blocks: Vec::new(),
        tables: Vec::new(),
        image_metadata: None,
        requires_vision: false,
        warnings: Vec::new(),
    }
}

fn damaged_file(message: impl Into<String>) -> IngestError {
    IngestError::domain("damaged_file", message)
}

fn password_protected() -> IngestError {
    IngestError::domain("password_protected", "文件受密码保护，暂时无法读取")
}

fn is_compound_office_file(path: &Path) -> Result<bool, IngestError> {
    let bytes = std::fs::read(path).map_err(IngestError::attachment)?;
    Ok(bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))
}

fn parse_error(error: impl std::fmt::Display) -> IngestError {
    let message = error.to_string();
    let lowercase = message.to_ascii_lowercase();
    if lowercase.contains("password") || lowercase.contains("encrypt") {
        password_protected()
    } else {
        damaged_file("文件已损坏或格式不正确")
    }
}
