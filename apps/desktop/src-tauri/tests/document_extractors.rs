use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use food_rd_desktop::ingest::{
    attachment_store::{AttachmentStore, StoredAttachment},
    extractors::{DocumentExtractor, ExtractedKind},
};
use image::{DynamicImage, ImageFormat};
use uuid::Uuid;
use zip::{ZipWriter, write::SimpleFileOptions};

struct ExtractorFixture {
    extractor: DocumentExtractor,
    root: PathBuf,
    source_root: PathBuf,
    store: AttachmentStore,
}

impl ExtractorFixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "food-rd-extractor-test-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let source_root = root.join("sources");
        let store = AttachmentStore::new(root.join("stored"));
        fs::create_dir_all(&source_root).unwrap();
        Self {
            extractor: DocumentExtractor::new(store.clone()),
            root,
            source_root,
            store,
        }
    }

    fn write(&self, name: &str, content: &[u8]) -> PathBuf {
        let path = self.source_root.join(name);
        fs::write(&path, content).unwrap();
        path
    }

    fn extract(
        &self,
        source: &Path,
    ) -> Result<
        food_rd_desktop::ingest::extractors::ExtractedDocument,
        food_rd_desktop::ingest::IngestError,
    > {
        let staged = self.store.stage(source)?;
        let attachment =
            StoredAttachment::from_staged(format!("attachment-{}", staged.sha256), staged);
        self.extractor.extract(&attachment)
    }
}

impl Drop for ExtractorFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn extracts_text_tables_and_marks_images_for_vision() {
    let fixture = ExtractorFixture::new();
    let txt = fixture.write("sample.txt", "蛋白质 34.0g".as_bytes());
    let csv = fixture.write(
        "sample.csv",
        "通用原料名称,供应商名称\n脱脂乳粉,供应商A\n".as_bytes(),
    );
    let docx = fixture.source_root.join("sample.docx");
    write_docx(&docx);
    let xlsx = fixture.source_root.join("sample.xlsx");
    write_xlsx(&xlsx);
    let pdf = fixture.source_root.join("sample.pdf");
    write_pdf(&pdf, "Skim milk powder");
    let png = fixture.source_root.join("label.png");
    DynamicImage::new_rgba8(2, 3)
        .save_with_format(&png, ImageFormat::Png)
        .unwrap();

    let cases = [
        (&txt, ExtractedKind::Text, false),
        (&csv, ExtractedKind::Table, false),
        (&xlsx, ExtractedKind::Table, false),
        (&docx, ExtractedKind::Text, false),
        (&pdf, ExtractedKind::Text, false),
        (&png, ExtractedKind::Image, true),
    ];
    for (source, kind, requires_vision) in cases {
        let document = fixture.extract(source).unwrap();
        assert_eq!(document.kind, kind, "{}", source.display());
        assert_eq!(document.requires_vision, requires_vision);
        assert_eq!(
            document.source_name,
            source.file_name().unwrap().to_string_lossy()
        );
    }
}

#[test]
fn image_extractors_support_all_allowed_raster_extensions() {
    let fixture = ExtractorFixture::new();
    for (name, format) in [
        ("label.jpg", ImageFormat::Jpeg),
        ("label.jpeg", ImageFormat::Jpeg),
        ("label.png", ImageFormat::Png),
        ("label.webp", ImageFormat::WebP),
    ] {
        let path = fixture.source_root.join(name);
        DynamicImage::new_rgb8(4, 5)
            .save_with_format(&path, format)
            .unwrap();

        let document = fixture.extract(&path).unwrap();

        assert_eq!(document.kind, ExtractedKind::Image);
        let metadata = document.image_metadata.unwrap();
        assert_eq!(metadata.width, 4);
        assert_eq!(metadata.height, 5);
        assert!(document.requires_vision);
    }
}

#[test]
fn damaged_archives_and_documents_return_actionable_errors() {
    let fixture = ExtractorFixture::new();
    for name in ["broken.docx", "broken.xlsx", "broken.pdf"] {
        let path = fixture.write(name, b"damaged");
        let error = fixture.extract(&path).unwrap_err();
        assert_eq!(error.code(), "damaged_file", "{name}");
    }
}

#[test]
fn encrypted_office_and_pdf_markers_return_password_protected() {
    let fixture = ExtractorFixture::new();
    let compound_file_header = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    for name in ["protected.docx", "protected.xlsx"] {
        let path = fixture.write(name, &compound_file_header);
        let error = fixture.extract(&path).unwrap_err();
        assert_eq!(error.code(), "password_protected", "{name}");
    }
    let protected_pdf = fixture.write(
        "protected.pdf",
        b"%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n",
    );
    assert_eq!(
        fixture.extract(&protected_pdf).unwrap_err().code(),
        "password_protected"
    );
}

fn write_docx(path: &Path) {
    let file = File::create(path).unwrap();
    let mut archive = ZipWriter::new(file);
    archive
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    archive
        .write_all(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>脱脂乳粉规格书</w:t></w:r></w:p></w:body>
</w:document>"#
                .as_bytes(),
        )
        .unwrap();
    archive.finish().unwrap();
}

fn write_xlsx(path: &Path) {
    let file = File::create(path).unwrap();
    let mut archive = ZipWriter::new(file);
    let files = [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#,
        ),
        (
            "xl/workbook.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="原料" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>通用原料名称</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>脱脂乳粉</t></is></c></row>
</sheetData></worksheet>"#,
        ),
    ];
    for (name, content) in files {
        archive
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        archive.write_all(content.as_bytes()).unwrap();
    }
    archive.finish().unwrap();
}

fn write_pdf(path: &Path, text: &str) {
    let stream = format!("BT /F1 12 Tf 72 120 Td ({text}) Tj ET");
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".to_string(),
        format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ];
    let mut bytes = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::new();
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
    }
    let xref = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    bytes.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    fs::write(path, bytes).unwrap();
}
