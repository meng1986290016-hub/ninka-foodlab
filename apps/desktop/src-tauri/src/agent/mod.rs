pub mod mcp;
pub mod model;
pub mod providers;
pub mod repository;
pub mod runtime;
pub mod secrets;
pub mod tools;

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
    #[error("{message}")]
    Provider {
        code: &'static str,
        message: String,
        retryable_once: bool,
    },
}

impl AgentError {
    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Repository(error) => error.code(),
            Self::SecretStore { .. } => "credential_store_failure",
            Self::Provider { code, .. } => code,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Domain { message, .. }
            | Self::SecretStore { message }
            | Self::Provider { message, .. } => message,
            Self::Repository(error) => error.message(),
        }
    }

    pub fn retryable_once(&self) -> bool {
        matches!(
            self,
            Self::Provider {
                retryable_once: true,
                ..
            }
        )
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

    pub fn scope_violation(message: impl Into<String>) -> Self {
        Self::Domain {
            code: "scope_violation",
            message: message.into(),
        }
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::Domain {
            code: "unauthorized",
            message: message.into(),
        }
    }

    pub fn cancelled(message: impl Into<String>) -> Self {
        Self::Domain {
            code: "cancelled",
            message: message.into(),
        }
    }

    pub fn tool_denied(name: &str) -> Self {
        Self::Domain {
            code: "tool_denied",
            message: format!("Agent 无权调用工具：{name}"),
        }
    }

    pub fn required_tool_not_called() -> Self {
        Self::Domain {
            code: "required_tool_not_called",
            message: "本次任务需要读取或写入食品研发数据，但模型没有发起任何真实工具调用。系统已阻止把它标记为完成；请重试，或切换其他模型。".into(),
        }
    }

    pub fn provider_failure(message: impl Into<String>) -> Self {
        Self::Provider {
            code: "provider_failure",
            message: message.into(),
            retryable_once: false,
        }
    }

    pub fn provider_timeout(message: impl Into<String>) -> Self {
        Self::Provider {
            code: "provider_timeout",
            message: message.into(),
            retryable_once: false,
        }
    }

    pub fn invalid_model_output(message: impl Into<String>) -> Self {
        Self::Provider {
            code: "invalid_model_output",
            message: message.into(),
            retryable_once: true,
        }
    }

    fn secret_store(message: impl Into<String>) -> Self {
        Self::SecretStore {
            message: message.into(),
        }
    }
}
