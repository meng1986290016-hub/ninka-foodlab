use std::{
    collections::HashSet,
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::IngestError;

const ALLOWED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "csv", "txt",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedAttachment {
    pub original_name: String,
    pub media_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub relative_path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttachment {
    pub id: String,
    pub original_name: String,
    pub media_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub relative_path: String,
}

impl StoredAttachment {
    pub fn from_staged(id: impl Into<String>, staged: StagedAttachment) -> Self {
        Self {
            id: id.into(),
            original_name: staged.original_name,
            media_type: staged.media_type,
            byte_size: staged.byte_size,
            sha256: staged.sha256,
            relative_path: staged.relative_path,
        }
    }
}

#[derive(Clone, Debug)]
pub struct AttachmentStore {
    root: PathBuf,
}

impl AttachmentStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn stage(&self, source: &Path) -> Result<StagedAttachment, IngestError> {
        let metadata = fs::symlink_metadata(source).map_err(IngestError::attachment)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(IngestError::domain(
                "attachment_failure",
                "只能导入普通文件",
            ));
        }

        let extension = safe_extension(source)?;
        let bytes = fs::read(source).map_err(IngestError::attachment)?;
        let sha256 = hex::encode(Sha256::digest(&bytes));
        let relative_path = format!("{}/{}.{}", &sha256[..2], sha256, extension);
        let destination = self.root.join(&relative_path);

        if !destination.exists() {
            let parent = destination
                .parent()
                .ok_or_else(|| IngestError::domain("attachment_failure", "附件存储路径无效"))?;
            fs::create_dir_all(parent).map_err(IngestError::attachment)?;
            let temporary = parent.join(format!("{}.partial", Uuid::new_v4()));
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(IngestError::attachment)?;
            if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
                let _ = fs::remove_file(&temporary);
                return Err(IngestError::attachment(error));
            }
            drop(file);
            if let Err(error) = fs::rename(&temporary, &destination) {
                let destination_was_created = destination.is_file();
                let _ = fs::remove_file(&temporary);
                if !destination_was_created {
                    return Err(IngestError::attachment(error));
                }
            }
        }

        Ok(StagedAttachment {
            original_name: sanitized_display_name(source)?,
            media_type: media_type_for(&extension),
            byte_size: metadata.len(),
            sha256,
            relative_path,
        })
    }

    pub fn open_for_extract(&self, relative_path: &str) -> Result<PathBuf, IngestError> {
        let relative = Path::new(relative_path);
        let components = relative.components().collect::<Vec<_>>();
        if components.len() != 2
            || components
                .iter()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(IngestError::domain(
                "attachment_failure",
                "附件存储路径无效",
            ));
        }

        let directory = self.root.join(components[0].as_os_str());
        let path = directory.join(components[1].as_os_str());
        for candidate in [&directory, &path] {
            let metadata = fs::symlink_metadata(candidate).map_err(IngestError::attachment)?;
            if metadata.file_type().is_symlink() {
                return Err(IngestError::domain(
                    "attachment_failure",
                    "附件存储路径无效",
                ));
            }
        }
        if !fs::symlink_metadata(&path)
            .map_err(IngestError::attachment)?
            .is_file()
        {
            return Err(IngestError::domain("attachment_failure", "附件文件不存在"));
        }
        Ok(path)
    }

    pub fn remove_orphans(
        &self,
        referenced_hashes: &HashSet<String>,
    ) -> Result<usize, IngestError> {
        let Ok(directories) = fs::read_dir(&self.root) else {
            return Ok(0);
        };
        let mut removed = 0;
        for directory in directories {
            let directory = directory.map_err(IngestError::attachment)?;
            if !directory
                .file_type()
                .map_err(IngestError::attachment)?
                .is_dir()
            {
                continue;
            }
            for entry in fs::read_dir(directory.path()).map_err(IngestError::attachment)? {
                let entry = entry.map_err(IngestError::attachment)?;
                if !entry
                    .file_type()
                    .map_err(IngestError::attachment)?
                    .is_file()
                {
                    continue;
                }
                let file_name = entry.file_name();
                let hash = Path::new(&file_name)
                    .file_stem()
                    .and_then(OsStr::to_str)
                    .unwrap_or_default();
                if !referenced_hashes.contains(hash) {
                    fs::remove_file(entry.path()).map_err(IngestError::attachment)?;
                    removed += 1;
                }
            }
            if fs::read_dir(directory.path())
                .map_err(IngestError::attachment)?
                .next()
                .is_none()
            {
                fs::remove_dir(directory.path()).map_err(IngestError::attachment)?;
            }
        }
        Ok(removed)
    }
}

fn safe_extension(path: &Path) -> Result<String, IngestError> {
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| IngestError::domain("unsupported_file", "文件缺少受支持的扩展名"))?;
    if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(IngestError::domain(
            "unsupported_file",
            "仅支持 JPG、PNG、WebP、PDF、DOCX、XLSX、CSV 和 TXT 文件",
        ));
    }
    Ok(extension)
}

fn sanitized_display_name(path: &Path) -> Result<String, IngestError> {
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| IngestError::domain("attachment_failure", "附件名称无效"))?;
    sanitize_display_name(name)
}

fn sanitize_display_name(name: &str) -> Result<String, IngestError> {
    let sanitized = name
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, '/' | '\\') {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    if sanitized.trim().is_empty() {
        return Err(IngestError::domain("attachment_failure", "附件名称无效"));
    }
    Ok(sanitized)
}

fn media_type_for(extension: &str) -> String {
    mime_guess::from_ext(extension)
        .first_or_octet_stream()
        .essence_str()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::sanitize_display_name;

    #[test]
    fn display_name_sanitization_does_not_require_an_invalid_filesystem_name() {
        assert_eq!(
            sanitize_display_name("bad\nname.TXT").unwrap(),
            "bad_name.TXT"
        );
        assert_eq!(
            sanitize_display_name("folder\\name.TXT").unwrap(),
            "folder_name.TXT"
        );
    }
}
