use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use food_rd_desktop::agent::{
    model::{AgentPreferences, AgentProviderConfigInput, AgentProviderProtocol, ReasoningEffort},
    providers::{
        ProviderRegistry,
        presets::{
            ANTHROPIC_ENDPOINT, ARK_ENDPOINT, BAILIAN_ENDPOINT, DEEPSEEK_ENDPOINT, GEMINI_ENDPOINT,
            KIMI_CN_ENDPOINT, MINIMAX_CN_ENDPOINT, OLLAMA_ENDPOINT, OPENAI_ENDPOINT,
            ZHIPU_ENDPOINT, provider_presets,
        },
    },
    repository::AgentRepository,
    secrets::SecretStore,
};

#[derive(Clone, Default)]
struct MemorySecretStore {
    values: Arc<Mutex<HashMap<(String, String), String>>>,
}

impl SecretStore for MemorySecretStore {
    fn set(
        &self,
        service: &str,
        account: &str,
        secret: &str,
    ) -> Result<(), food_rd_desktop::agent::AgentError> {
        self.values
            .lock()
            .unwrap()
            .insert((service.into(), account.into()), secret.into());
        Ok(())
    }

    fn get(
        &self,
        service: &str,
        account: &str,
    ) -> Result<Option<String>, food_rd_desktop::agent::AgentError> {
        Ok(self
            .values
            .lock()
            .unwrap()
            .get(&(service.into(), account.into()))
            .cloned())
    }

    fn delete(
        &self,
        service: &str,
        account: &str,
    ) -> Result<(), food_rd_desktop::agent::AgentError> {
        self.values
            .lock()
            .unwrap()
            .remove(&(service.into(), account.into()));
        Ok(())
    }
}

fn registry(secrets: MemorySecretStore) -> ProviderRegistry<MemorySecretStore> {
    let repository = AgentRepository::open_in_memory_with(
        || "2026-07-30T08:00:00Z".into(),
        || "registry-test-id".into(),
    )
    .unwrap();
    ProviderRegistry::new(repository, secrets)
}

fn enable_provider(registry: &mut ProviderRegistry<MemorySecretStore>, id: &str, model: &str) {
    let provider = registry.get_config(id).unwrap();
    registry
        .save_config(AgentProviderConfigInput {
            id: provider.id,
            kind: provider.kind,
            display_name: provider.display_name,
            protocol: provider.protocol,
            endpoint: provider.endpoint,
            model: model.into(),
            context_window: provider.context_window,
            reasoning_effort: ReasoningEffort::Auto,
            timeout_seconds: provider.timeout_seconds,
            executable_path: provider.executable_path,
            enabled: true,
            capabilities: provider.capabilities,
        })
        .unwrap();
}

#[test]
fn key_is_written_to_secret_store_and_only_reference_is_persisted() {
    let secrets = MemorySecretStore::default();
    let mut registry = registry(secrets.clone());

    registry.set_secret("openai", "sk-private").unwrap();

    assert_eq!(
        secrets
            .get("com.foodrd.studio", "agent/openai")
            .unwrap()
            .as_deref(),
        Some("sk-private")
    );
    let stored = registry.get_config("openai").unwrap();
    assert!(stored.has_secret);
    assert!(
        !serde_json::to_string(&stored)
            .unwrap()
            .contains("sk-private")
    );
    assert_eq!(
        registry.repository().provider_secret_ref("openai").unwrap(),
        Some("agent/openai".into())
    );
}

#[test]
fn clearing_a_secret_removes_the_keychain_value_and_reference() {
    let secrets = MemorySecretStore::default();
    let mut registry = registry(secrets.clone());
    registry.set_secret("openai", "sk-private").unwrap();

    registry.clear_secret("openai").unwrap();

    assert_eq!(
        secrets.get("com.foodrd.studio", "agent/openai").unwrap(),
        None
    );
    assert!(!registry.get_config("openai").unwrap().has_secret);
}

#[test]
fn custom_protocol_switch_preserves_both_subconfigurations() {
    let mut registry = registry(MemorySecretStore::default());

    registry
        .save_custom(
            AgentProviderProtocol::OpenAiCompatible,
            "https://openai.example/v1",
            "model-a",
        )
        .unwrap();
    registry
        .save_custom(
            AgentProviderProtocol::AnthropicMessages,
            "https://anthropic.example",
            "model-b",
        )
        .unwrap();

    let openai = registry
        .custom_subconfig(AgentProviderProtocol::OpenAiCompatible)
        .unwrap();
    let anthropic = registry
        .custom_subconfig(AgentProviderProtocol::AnthropicMessages)
        .unwrap();
    assert_eq!(openai.model, "model-a");
    assert_eq!(openai.endpoint, "https://openai.example/v1");
    assert_eq!(anthropic.model, "model-b");
    assert_eq!(anthropic.endpoint, "https://anthropic.example");
    assert_eq!(
        registry.get_config("custom").unwrap().protocol,
        AgentProviderProtocol::AnthropicMessages
    );
}

#[test]
fn provider_switching_does_not_lose_inactive_provider_settings() {
    let secrets = MemorySecretStore::default();
    let mut registry = registry(secrets);
    registry.set_secret("openai", "sk-openai").unwrap();
    registry.set_secret("deepseek", "sk-deepseek").unwrap();
    enable_provider(&mut registry, "openai", "gpt-test");

    let mut deepseek = registry.get_config("deepseek").unwrap();
    deepseek.endpoint = "https://gateway.example/deepseek".into();
    registry
        .save_config(AgentProviderConfigInput {
            id: deepseek.id,
            kind: deepseek.kind,
            display_name: deepseek.display_name,
            protocol: deepseek.protocol,
            endpoint: deepseek.endpoint,
            model: "deepseek-test".into(),
            context_window: deepseek.context_window,
            reasoning_effort: deepseek.reasoning_effort,
            timeout_seconds: deepseek.timeout_seconds,
            executable_path: deepseek.executable_path,
            enabled: true,
            capabilities: deepseek.capabilities,
        })
        .unwrap();

    assert_eq!(registry.active_chat().unwrap().id, "deepseek");
    assert_eq!(registry.get_config("openai").unwrap().model, "gpt-test");
    assert_eq!(
        registry.get_config("deepseek").unwrap().endpoint,
        "https://gateway.example/deepseek"
    );
}

#[test]
fn active_chat_rejects_missing_or_incomplete_provider_configuration() {
    let mut registry = registry(MemorySecretStore::default());
    assert_eq!(
        registry.active_chat().unwrap_err().code(),
        "provider_not_configured"
    );

    enable_provider(&mut registry, "openai", "gpt-test");
    assert_eq!(
        registry.active_chat().unwrap_err().code(),
        "provider_not_configured"
    );
}

#[test]
fn vision_follows_capable_chat_or_uses_the_selected_image_provider() {
    let mut registry = registry(MemorySecretStore::default());
    registry.set_secret("openai", "sk-openai").unwrap();
    registry.set_secret("deepseek", "sk-deepseek").unwrap();
    enable_provider(&mut registry, "openai", "gpt-vision");
    assert_eq!(registry.vision_provider().unwrap().id, "openai");

    enable_provider(&mut registry, "deepseek", "deepseek-chat");
    registry
        .save_preferences(AgentPreferences {
            enabled: true,
            vision_provider_config_id: Some("openai".into()),
        })
        .unwrap();

    assert_eq!(registry.active_chat().unwrap().id, "deepseek");
    assert_eq!(registry.vision_provider().unwrap().id, "openai");
}

#[test]
fn ollama_does_not_require_an_api_key() {
    let mut registry = registry(MemorySecretStore::default());
    enable_provider(&mut registry, "ollama", "qwen3");

    assert_eq!(registry.active_chat().unwrap().id, "ollama");
}

#[test]
fn approved_presets_have_editable_expected_endpoints() {
    let presets = provider_presets();
    assert_eq!(presets.len(), 14);
    for (id, endpoint) in [
        ("openai", OPENAI_ENDPOINT),
        ("anthropic", ANTHROPIC_ENDPOINT),
        ("gemini", GEMINI_ENDPOINT),
        ("deepseek", DEEPSEEK_ENDPOINT),
        ("kimi_cn", KIMI_CN_ENDPOINT),
        ("zhipu_glm", ZHIPU_ENDPOINT),
        ("minimax_cn", MINIMAX_CN_ENDPOINT),
        ("bailian", BAILIAN_ENDPOINT),
        ("volcengine_ark", ARK_ENDPOINT),
        ("ollama", OLLAMA_ENDPOINT),
    ] {
        assert_eq!(
            presets
                .iter()
                .find(|preset| preset.id == id)
                .unwrap()
                .endpoint,
            endpoint
        );
    }
    assert_eq!(
        presets
            .iter()
            .find(|preset| preset.id == "azure_openai")
            .unwrap()
            .endpoint,
        ""
    );
}
