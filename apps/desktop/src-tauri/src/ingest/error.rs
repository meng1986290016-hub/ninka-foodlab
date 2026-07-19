use thiserror::Error;

use crate::{ingest::model::ImportIssue, ingredients::repository::RepositoryError};

#[derive(Debug, Error)]
pub enum IngestError {
    #[error("{message}")]
    Domain { code: &'static str, message: String },
    #[error("附件文件无法处理")]
    Attachment(#[source] std::io::Error),
    #[error("数据存储失败")]
    Storage(#[source] RepositoryError),
    #[error("导入数据无法序列化")]
    Serialization(#[source] serde_json::Error),
    #[error("导入草稿需要修正")]
    Validation { issues: Vec<ImportIssue> },
}

impl IngestError {
    pub fn domain(code: &'static str, message: impl Into<String>) -> Self {
        Self::Domain {
            code,
            message: message.into(),
        }
    }

    pub fn attachment(error: std::io::Error) -> Self {
        Self::Attachment(error)
    }

    pub fn validation(issues: Vec<ImportIssue>) -> Self {
        Self::Validation { issues }
    }

    pub fn issues(&self) -> Option<&[ImportIssue]> {
        match self {
            Self::Validation { issues } => Some(issues),
            _ => None,
        }
    }

    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Attachment(_) => "attachment_failure",
            Self::Storage(error) => error.code(),
            Self::Serialization(_) => "import_failure",
            Self::Validation { .. } => "import_failure",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Domain { message, .. } => message,
            Self::Attachment(_) => "附件文件无法处理",
            Self::Storage(error) => error.message(),
            Self::Serialization(_) => "导入数据无法序列化",
            Self::Validation { .. } => "导入草稿中有需要修正的数据",
        }
    }
}

impl From<RepositoryError> for IngestError {
    fn from(error: RepositoryError) -> Self {
        Self::Storage(error)
    }
}

impl From<rusqlite::Error> for IngestError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Storage(error.into())
    }
}

impl From<serde_json::Error> for IngestError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error)
    }
}
