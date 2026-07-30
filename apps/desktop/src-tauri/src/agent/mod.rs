pub mod model;
pub mod providers;
pub mod repository;
pub mod secrets;

use thiserror::Error;

use crate::ingredients::repository::RepositoryError;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("{message}")]
    Domain { code: &'static str, message: String },
    #[error("Agent 数据无法保存")]
    Repository(#[from] RepositoryError),
    #[error("{message}")]
    SecretStore { message: String },
}

impl AgentError {
    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Repository(error) => error.code(),
            Self::SecretStore { .. } => "credential_store_failure",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Domain { message, .. } | Self::SecretStore { message } => message,
            Self::Repository(error) => error.message(),
        }
    }

    pub fn provider_not_configured(message: impl Into<String>) -> Self {
        Self::Domain {
            code: "provider_not_configured",
            message: message.into(),
        }
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::Domain {
            code: "invalid_input",
            message: message.into(),
        }
    }

    pub fn tool_denied(name: &str) -> Self {
        Self::Domain {
            code: "tool_denied",
            message: format!("Agent 无权调用工具：{name}"),
        }
    }

    fn secret_store(message: impl Into<String>) -> Self {
        Self::SecretStore {
            message: message.into(),
        }
    }
}
