use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use image::{GenericImageView, ImageFormat};
use lopdf::Document;
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::ZipArchive;

use crate::ingredients::repository::RepositoryError;

use super::model::ResearchReport;
pub use super::model::{ResearchReportExportFormat, ResearchReportExportRequest};

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;

pub fn export_research_report(
    report: &ResearchReport,
    request: ResearchReportExportRequest,
) -> Result<(), RepositoryError> {
    if request.report_id != report.id {
        return Err(domain("missing_reference", "研发报告导出记录不一致"));
    }
    let expected_hash = research_report_document_hash(&report.document)?;
    if request.document_hash != expected_hash {
        return Err(domain("invalid_input", "研发报告快照校验失败"));
    }
    validate_file_name(&request.file_name, request.format)?;
    let destination = PathBuf::from(&request.destination_path);
    validate_destination(&destination, request.format)?;
    let bytes = STANDARD
        .decode(request.bytes_base64)
        .map_err(|_| domain("invalid_input", "研发报告导出数据无效"))?;
    if bytes.is_empty() || bytes.len() > MAX_EXPORT_BYTES {
        return Err(domain("invalid_input", "研发报告导出数据大小无效"));
    }
    validate_bytes(request.format, &bytes, report, &expected_hash)?;
    write_atomic(&destination, &bytes)
}

pub fn research_report_document_hash(document: &Value) -> Result<String, RepositoryError> {
    let canonical = serde_json::to_vec(document)?;
    let digest = Sha256::digest(canonical);
    Ok(format!("sha256:{}", hex::encode(digest)))
}

fn validate_file_name(
    file_name: &str,
    format: ResearchReportExportFormat,
) -> Result<(), RepositoryError> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('.')
        || trimmed.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
        || !trimmed
            .to_ascii_lowercase()
            .ends_with(&format!(".{}", format.extension()))
    {
        return Err(domain("invalid_input", "研发报告文件名无效"));
    }
    Ok(())
}

fn validate_destination(
    destination: &Path,
    format: ResearchReportExportFormat,
) -> Result<(), RepositoryError> {
    let extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty());
    if !extension.eq_ignore_ascii_case(format.extension())
        || destination.file_name().is_none()
        || parent.is_none_or(|path| !path.is_dir())
    {
        return Err(domain("invalid_input", "研发报告保存位置无效"));
    }
    Ok(())
}

fn validate_bytes(
    format: ResearchReportExportFormat,
    bytes: &[u8],
    report: &ResearchReport,
    expected_hash: &str,
) -> Result<(), RepositoryError> {
    match format {
        ResearchReportExportFormat::Png => validate_png(bytes),
        ResearchReportExportFormat::Pdf => validate_pdf(bytes),
        ResearchReportExportFormat::Xlsx => validate_xlsx(bytes),
        ResearchReportExportFormat::Json => validate_json(bytes, report, expected_hash),
    }
}

fn validate_png(bytes: &[u8]) -> Result<(), RepositoryError> {
    let image = image::load_from_memory_with_format(bytes, ImageFormat::Png)
        .map_err(|_| domain("invalid_input", "研发报告 PNG 无效"))?;
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 || width > 10_000 || height > 10_000 {
        return Err(domain("invalid_input", "研发报告 PNG 尺寸无效"));
    }
    Ok(())
}

fn validate_pdf(bytes: &[u8]) -> Result<(), RepositoryError> {
    if contains_bytes(bytes, b"/JavaScript")
        || contains_bytes(bytes, b"/Launch")
        || contains_bytes(bytes, b"/EmbeddedFile")
    {
        return Err(domain("invalid_input", "研发报告 PDF 包含不安全内容"));
    }
    let document =
        Document::load_mem(bytes).map_err(|_| domain("invalid_input", "研发报告 PDF 无效"))?;
    if document.get_pages().is_empty() {
        return Err(domain("invalid_input", "研发报告 PDF 缺少页面"));
    }
    Ok(())
}

fn validate_xlsx(bytes: &[u8]) -> Result<(), RepositoryError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| domain("invalid_input", "研发报告 XLSX 无效"))?;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|_| domain("invalid_input", "研发报告 XLSX 无效"))?;
        if file.enclosed_name().is_none() {
            return Err(domain("invalid_input", "研发报告 XLSX 路径无效"));
        }
        let name = file.name().to_string();
        if name.ends_with(".xml") {
            let mut xml = String::new();
            file.read_to_string(&mut xml)
                .map_err(|_| domain("invalid_input", "研发报告 XLSX 无效"))?;
            if contains_formula_element(&xml) || contains_local_path_marker(&xml) {
                return Err(domain("invalid_input", "研发报告 XLSX 包含不安全内容"));
            }
        }
        names.insert(name);
    }
    for required in [
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet7.xml",
    ] {
        if !names.contains(required) {
            return Err(domain("invalid_input", "研发报告 XLSX 缺少必要工作表"));
        }
    }
    Ok(())
}

fn validate_json(
    bytes: &[u8],
    report: &ResearchReport,
    expected_hash: &str,
) -> Result<(), RepositoryError> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| domain("invalid_input", "研发报告 JSON 无效"))?;
    if value.get("schemaVersion").and_then(Value::as_i64) != Some(1)
        || value.get("kind").and_then(Value::as_str) != Some("food-rd-research-report")
        || value.get("reportId").and_then(Value::as_str) != Some(report.id.as_str())
        || value.get("snapshotHash").and_then(Value::as_str) != Some(expected_hash)
        || value.get("document") != Some(&report.document)
    {
        return Err(domain("invalid_input", "研发报告 JSON 与保存记录不一致"));
    }
    Ok(())
}

fn write_atomic(destination: &Path, bytes: &[u8]) -> Result<(), RepositoryError> {
    let parent = destination
        .parent()
        .ok_or_else(|| domain("invalid_input", "研发报告保存位置无效"))?;
    let file_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| domain("invalid_input", "研发报告文件名无效"))?;
    let temporary = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        replace_file(&temporary, destination)?;
        sync_parent(parent)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(RepositoryError::io(error));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(temporary, destination)
}

#[cfg(windows)]
fn replace_file(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn ReplaceFileW(
            replaced: *const u16,
            replacement: *const u16,
            backup: *const u16,
            flags: u32,
            exclude: *mut core::ffi::c_void,
            reserved: *mut core::ffi::c_void,
        ) -> i32;
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let destination_exists = destination.exists();
    let temporary = temporary
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        if destination_exists {
            ReplaceFileW(
                destination.as_ptr(),
                temporary.as_ptr(),
                ptr::null(),
                0x0000_0001,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        } else {
            MoveFileExW(temporary.as_ptr(), destination.as_ptr(), 0x0000_0008)
        }
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn contains_local_path_marker(value: &str) -> bool {
    value.contains("/Users/")
        || value.contains("/home/")
        || value.contains("\\Users\\")
        || value.contains(":\\")
}

fn contains_formula_element(value: &str) -> bool {
    value.contains("<f>") || value.contains("<f ") || value.contains("<f/")
}

fn domain(code: &'static str, message: impl Into<String>) -> RepositoryError {
    RepositoryError::Domain {
        code,
        message: message.into(),
        field: None,
    }
}
