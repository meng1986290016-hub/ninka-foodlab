use std::sync::Arc;

use super::{
    AgentProvider, anthropic::AnthropicProvider, claude_cli::ClaudeCliProvider,
    codex_cli::CodexCliProvider, gemini::GeminiProvider, openai::OpenAiProvider,
    openai_compatible::OpenAiCompatibleProvider,
};
use crate::agent::{
    AgentError,
    mcp::McpTaskLaunchConfig,
    model::{AgentProviderConfig, AgentProviderProtocol},
};

pub fn build_provider(
    config: AgentProviderConfig,
    secret: Option<String>,
    mcp: Option<McpTaskLaunchConfig>,
) -> Result<Arc<dyn AgentProvider>, AgentError> {
    match config.protocol {
        AgentProviderProtocol::OpenAiResponses => {
            let secret = required_secret(secret, &config.display_name)?;
            Ok(Arc::new(OpenAiProvider::new(config, secret)?))
        }
        AgentProviderProtocol::OpenAiCompatible => {
            Ok(Arc::new(OpenAiCompatibleProvider::new(config, secret)?))
        }
        AgentProviderProtocol::AnthropicMessages => {
            let secret = required_secret(secret, &config.display_name)?;
            Ok(Arc::new(AnthropicProvider::new(config, secret)?))
        }
        AgentProviderProtocol::GeminiGenerateContent => {
            let secret = required_secret(secret, &config.display_name)?;
            Ok(Arc::new(GeminiProvider::new(config, secret)?))
        }
        AgentProviderProtocol::CodexCli => {
            let provider = CodexCliProvider::new(config)?;
            Ok(Arc::new(match mcp {
                Some(mcp) => provider.with_mcp(mcp),
                None => provider,
            }))
        }
        AgentProviderProtocol::ClaudeCodeCli => {
            let provider = ClaudeCliProvider::new(config)?;
            Ok(Arc::new(match mcp {
                Some(mcp) => provider.with_mcp(mcp),
                None => provider,
            }))
        }
    }
}

fn required_secret(secret: Option<String>, display_name: &str) -> Result<String, AgentError> {
    secret
        .filter(|secret| !secret.trim().is_empty())
        .ok_or_else(|| {
            AgentError::provider_not_configured(format!("请先配置 {display_name} 的 API 密钥"))
        })
}
