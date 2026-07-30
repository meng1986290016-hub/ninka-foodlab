pub mod anthropic;
pub mod claude_cli;
pub mod cli;
pub mod codex_cli;
pub mod factory;
pub mod gemini;
pub mod http;
pub mod openai;
pub mod openai_compatible;
pub mod presets;

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    AgentError,
    model::{
        AgentMessage, AgentPreferences, AgentProviderCapabilities, AgentProviderConfig,
        AgentProviderConfigInput, AgentProviderKind, AgentProviderProtocol,
    },
    repository::AgentRepository,
    secrets::SecretStore,
};

pub const CREDENTIAL_SERVICE: &str = "com.foodrd.studio";

#[derive(Clone, Debug, PartialEq)]
pub enum ProviderEvent {
    TextDelta(String),
    ToolCall(ProviderToolCall),
    Usage {
        input_tokens: u64,
        output_tokens: u64,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderAttachment {
    pub id: String,
    pub media_type: String,
    pub data_base64: Option<String>,
    pub extracted_text: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ProviderTurnRequest {
    pub messages: Vec<AgentMessage>,
    pub attachment_ids: Vec<String>,
    pub attachments: Vec<ProviderAttachment>,
    pub tools: Vec<AgentToolDefinition>,
    pub output_schema: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProviderTurnResult {
    pub final_text: String,
    pub structured_output: Option<Value>,
    pub events: Vec<ProviderEvent>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderTestKind {
    Connection,
    StructuredOutput,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderTestResult {
    pub ok: bool,
    pub kind: ProviderTestKind,
    pub latency_ms: Option<u64>,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentModelOption {
    pub id: String,
    pub label: String,
}

pub type AgentEventSink = Arc<dyn Fn(ProviderEvent) + Send + Sync>;

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn capabilities(&self) -> AgentProviderCapabilities;

    fn cancel(&self) {}

    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError>;

    async fn run(
        &self,
        request: ProviderTurnRequest,
        sink: AgentEventSink,
    ) -> Result<ProviderTurnResult, AgentError>;

    async fn list_models(&self) -> Result<Vec<AgentModelOption>, AgentError>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomProviderStorage {
    openai_compatible: CustomProviderSubconfig,
    anthropic_compatible: CustomProviderSubconfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderSubconfig {
    pub endpoint: String,
    pub model: String,
}

pub struct ProviderRegistry<S: SecretStore> {
    repository: AgentRepository,
    secrets: S,
}

impl<S: SecretStore> ProviderRegistry<S> {
    pub fn new(repository: AgentRepository, secrets: S) -> Self {
        Self {
            repository,
            secrets,
        }
    }

    pub fn repository(&self) -> &AgentRepository {
        &self.repository
    }

    pub fn list_configs(&self) -> Result<Vec<AgentProviderConfig>, AgentError> {
        self.repository.list_providers().map_err(Into::into)
    }

    pub fn get_config(&self, provider_id: &str) -> Result<AgentProviderConfig, AgentError> {
        self.repository
            .get_provider(provider_id)
            .map_err(Into::into)
    }

    pub fn save_config(
        &mut self,
        input: AgentProviderConfigInput,
    ) -> Result<AgentProviderConfig, AgentError> {
        self.repository.save_provider(input).map_err(Into::into)
    }

    pub fn save_preferences(
        &mut self,
        preferences: AgentPreferences,
    ) -> Result<AgentPreferences, AgentError> {
        self.repository
            .save_preferences(preferences)
            .map_err(Into::into)
    }

    pub fn set_secret(&mut self, provider_id: &str, secret: &str) -> Result<(), AgentError> {
        self.repository.get_provider(provider_id)?;
        let secret = secret.trim();
        if secret.is_empty() {
            return Err(AgentError::invalid_input("API 密钥不能为空"));
        }
        let account = secret_account(provider_id);
        self.secrets.set(CREDENTIAL_SERVICE, &account, secret)?;
        if let Err(error) = self
            .repository
            .set_provider_secret_ref(provider_id, Some(&account))
        {
            let _ = self.secrets.delete(CREDENTIAL_SERVICE, &account);
            return Err(error.into());
        }
        Ok(())
    }

    pub fn clear_secret(&mut self, provider_id: &str) -> Result<(), AgentError> {
        self.repository.get_provider(provider_id)?;
        let account = secret_account(provider_id);
        self.secrets.delete(CREDENTIAL_SERVICE, &account)?;
        self.repository
            .set_provider_secret_ref(provider_id, None)
            .map_err(Into::into)
    }

    pub fn resolved_secret(&self, provider_id: &str) -> Result<Option<String>, AgentError> {
        let secret_ref = self.repository.provider_secret_ref(provider_id)?;
        match secret_ref {
            Some(account) => self.secrets.get(CREDENTIAL_SERVICE, &account),
            None => Ok(None),
        }
    }

    pub fn active_chat(&self) -> Result<AgentProviderConfig, AgentError> {
        let provider = self
            .list_configs()?
            .into_iter()
            .find(|provider| provider.enabled)
            .ok_or_else(|| AgentError::provider_not_configured("请先在设置中启用一个聊天模型"))?;
        if !self.is_configured(&provider)? {
            return Err(AgentError::provider_not_configured(format!(
                "{} 的配置尚未完成",
                provider.display_name
            )));
        }
        Ok(provider)
    }

    pub fn vision_provider(&self) -> Result<AgentProviderConfig, AgentError> {
        let chat = self.active_chat()?;
        if http::supports_image_input(&chat) {
            return Ok(chat);
        }
        let preferences = self.repository.get_preferences()?;
        let provider_id = preferences.vision_provider_config_id.ok_or_else(|| {
            AgentError::provider_not_configured("当前聊天模型不支持图片，请选择图片识别模型")
        })?;
        let provider = self.get_config(&provider_id)?;
        if !http::supports_image_input(&provider) || !self.is_configured(&provider)? {
            return Err(AgentError::provider_not_configured(
                "所选图片识别模型不可用，请检查配置",
            ));
        }
        Ok(provider)
    }

    pub fn save_custom(
        &mut self,
        protocol: AgentProviderProtocol,
        endpoint: &str,
        model: &str,
    ) -> Result<AgentProviderConfig, AgentError> {
        let mut storage = self.custom_storage()?;
        let subconfig = CustomProviderSubconfig {
            endpoint: endpoint.trim().into(),
            model: model.trim().into(),
        };
        match protocol {
            AgentProviderProtocol::OpenAiCompatible => {
                storage.openai_compatible = subconfig;
            }
            AgentProviderProtocol::AnthropicMessages => {
                storage.anthropic_compatible = subconfig;
            }
            _ => {
                return Err(AgentError::invalid_input(
                    "自定义模型仅支持 OpenAI 兼容或 Anthropic 兼容协议",
                ));
            }
        }

        let current = self.get_config("custom")?;
        let selected = match protocol {
            AgentProviderProtocol::OpenAiCompatible => &storage.openai_compatible,
            AgentProviderProtocol::AnthropicMessages => &storage.anthropic_compatible,
            _ => unreachable!(),
        };
        let saved = self.save_config(AgentProviderConfigInput {
            id: current.id,
            kind: current.kind,
            display_name: current.display_name,
            protocol,
            endpoint: selected.endpoint.clone(),
            model: selected.model.clone(),
            context_window: current.context_window,
            reasoning_effort: current.reasoning_effort,
            timeout_seconds: current.timeout_seconds,
            executable_path: current.executable_path,
            enabled: current.enabled,
            capabilities: current.capabilities,
        })?;
        let storage_json = serde_json::to_value(storage)
            .map_err(|_| AgentError::invalid_input("自定义模型配置无法保存"))?;
        self.repository
            .set_provider_config_json("custom", &storage_json)?;
        Ok(saved)
    }

    pub fn custom_subconfig(
        &self,
        protocol: AgentProviderProtocol,
    ) -> Result<CustomProviderSubconfig, AgentError> {
        let storage = self.custom_storage()?;
        match protocol {
            AgentProviderProtocol::OpenAiCompatible => Ok(storage.openai_compatible),
            AgentProviderProtocol::AnthropicMessages => Ok(storage.anthropic_compatible),
            _ => Err(AgentError::invalid_input(
                "自定义模型仅支持 OpenAI 兼容或 Anthropic 兼容协议",
            )),
        }
    }

    fn custom_storage(&self) -> Result<CustomProviderStorage, AgentError> {
        serde_json::from_value(self.repository.provider_config_json("custom")?)
            .map_err(|_| AgentError::invalid_input("自定义模型配置无法读取"))
    }

    fn is_configured(&self, provider: &AgentProviderConfig) -> Result<bool, AgentError> {
        match provider.kind {
            AgentProviderKind::CodexCli | AgentProviderKind::ClaudeCodeCli => Ok(provider
                .executable_path
                .as_deref()
                .is_some_and(|path| !path.trim().is_empty())),
            AgentProviderKind::Ollama => {
                Ok(!provider.endpoint.trim().is_empty() && !provider.model.trim().is_empty())
            }
            _ => Ok(!provider.endpoint.trim().is_empty()
                && !provider.model.trim().is_empty()
                && self.resolved_secret(&provider.id)?.is_some()),
        }
    }
}

fn secret_account(provider_id: &str) -> String {
    format!("agent/{provider_id}")
}
