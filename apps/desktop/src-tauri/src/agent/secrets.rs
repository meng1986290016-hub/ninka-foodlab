use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

use keyring::{Entry, Error as KeyringError};

use super::AgentError;

type SecretCacheKey = (String, String);
type SecretCache = HashMap<SecretCacheKey, String>;

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

#[derive(Clone)]
pub struct SessionSecretStore<S> {
    persistent: S,
    cache: Arc<Mutex<SecretCache>>,
}

impl<S> SessionSecretStore<S> {
    pub fn new(persistent: S) -> Self {
        Self {
            persistent,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn cache(&self) -> Result<MutexGuard<'_, SecretCache>, AgentError> {
        self.cache
            .lock()
            .map_err(|_| AgentError::secret_store("API 密钥内存缓存暂不可用"))
    }
}

impl<S: SecretStore> SecretStore for SessionSecretStore<S> {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), AgentError> {
        self.persistent.set(service, account, secret)?;
        self.cache()?
            .insert((service.into(), account.into()), secret.into());
        Ok(())
    }

    fn get(&self, service: &str, account: &str) -> Result<Option<String>, AgentError> {
        let mut cache = self.cache()?;
        let key = (service.into(), account.into());
        if let Some(secret) = cache.get(&key) {
            return Ok(Some(secret.clone()));
        }

        let secret = self.persistent.get(service, account)?;
        if let Some(secret) = secret.as_ref() {
            cache.insert(key, secret.clone());
        }
        Ok(secret)
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), AgentError> {
        self.persistent.delete(service, account)?;
        self.cache()?.remove(&(service.into(), account.into()));
        Ok(())
    }
}

fn entry(service: &str, account: &str) -> Result<Entry, AgentError> {
    Entry::new(service, account)
        .map_err(|_| AgentError::secret_store("无法访问系统凭据库，请检查系统权限"))
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[derive(Clone, Default)]
    struct CountingSecretStore {
        values: Arc<Mutex<HashMap<(String, String), String>>>,
        reads: Arc<AtomicUsize>,
    }

    impl SecretStore for CountingSecretStore {
        fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), AgentError> {
            self.values
                .lock()
                .unwrap()
                .insert((service.into(), account.into()), secret.into());
            Ok(())
        }

        fn get(&self, service: &str, account: &str) -> Result<Option<String>, AgentError> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(self
                .values
                .lock()
                .unwrap()
                .get(&(service.into(), account.into()))
                .cloned())
        }

        fn delete(&self, service: &str, account: &str) -> Result<(), AgentError> {
            self.values
                .lock()
                .unwrap()
                .remove(&(service.into(), account.into()));
            Ok(())
        }
    }

    #[test]
    fn repeated_reads_only_access_the_persistent_store_once() {
        let persistent = CountingSecretStore::default();
        persistent.set("service", "account", "secret").unwrap();
        let store = SessionSecretStore::new(persistent.clone());

        assert_eq!(
            store.get("service", "account").unwrap().as_deref(),
            Some("secret")
        );
        let next_command = store.clone();
        assert_eq!(
            next_command.get("service", "account").unwrap().as_deref(),
            Some("secret")
        );
        assert_eq!(persistent.reads.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn newly_saved_secrets_are_available_without_a_persistent_read() {
        let persistent = CountingSecretStore::default();
        let store = SessionSecretStore::new(persistent.clone());

        store.set("service", "account", "new-secret").unwrap();

        assert_eq!(
            store.get("service", "account").unwrap().as_deref(),
            Some("new-secret")
        );
        assert_eq!(persistent.reads.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn deleting_a_secret_evicts_the_cached_value() {
        let persistent = CountingSecretStore::default();
        let store = SessionSecretStore::new(persistent.clone());
        store.set("service", "account", "secret").unwrap();

        store.delete("service", "account").unwrap();

        assert_eq!(store.get("service", "account").unwrap(), None);
        assert_eq!(persistent.reads.load(Ordering::SeqCst), 1);
    }
}
