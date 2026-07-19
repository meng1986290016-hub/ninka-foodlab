use std::path::Path;

use image::{GenericImageView, ImageReader};

use crate::ingest::{IngestError, attachment_store::StoredAttachment};

use super::{ExtractedImageMetadata, ExtractedKind, empty_document, parse_error};

pub(super) fn extract_metadata(
    attachment: &StoredAttachment,
    path: &Path,
) -> Result<super::ExtractedDocument, IngestError> {
    let image = ImageReader::open(path)
        .map_err(IngestError::attachment)?
        .with_guessed_format()
        .map_err(IngestError::attachment)?
        .decode()
        .map_err(parse_error)?;
    let (width, height) = image.dimensions();
    let mut document = empty_document(attachment, ExtractedKind::Image);
    document.image_metadata = Some(ExtractedImageMetadata { width, height });
    document.requires_vision = true;
    Ok(document)
}
