use thiserror::Error;

#[derive(Debug, Error)]
pub enum IngestError {
    #[error("{message}")]
    Domain { code: &'static str, message: String },
    #[error("附件文件无法处理")]
    Attachment(#[source] std::io::Error),
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

    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Attachment(_) => "attachment_failure",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Domain { message, .. } => message,
            Self::Attachment(_) => "附件文件无法处理",
        }
    }
}
