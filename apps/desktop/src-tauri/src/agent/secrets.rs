use keyring::{Entry, Error as KeyringError};

use super::AgentError;

pub trait SecretStore: Send + Sync {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), AgentError>;
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, AgentError>;
    fn delete(&self, service: &str, account: &str) -> Result<(), AgentError>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), AgentError> {
        entry(service, account)?
            .set_password(secret)
            .map_err(|_| AgentError::secret_store("无法将 API 密钥保存到系统凭据库"))
    }

    fn get(&self, service: &str, account: &str) -> Result<Option<String>, AgentError> {
        match entry(service, account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(_) => Err(AgentError::secret_store(
                "无法从系统凭据库读取 API 密钥，请检查系统权限",
            )),
        }
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), AgentError> {
        match entry(service, account)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(_) => Err(AgentError::secret_store(
                "无法从系统凭据库删除 API 密钥，请检查系统权限",
            )),
        }
    }
}

fn entry(service: &str, account: &str) -> Result<Entry, AgentError> {
    Entry::new(service, account)
        .map_err(|_| AgentError::secret_store("无法访问系统凭据库，请检查系统权限"))
}
