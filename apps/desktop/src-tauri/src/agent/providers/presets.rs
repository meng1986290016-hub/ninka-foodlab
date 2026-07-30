use crate::agent::model::{
    AgentProviderCapabilities, AgentProviderConfigInput, AgentProviderKind, AgentProviderProtocol,
    ReasoningEffort,
};

pub const OPENAI_ENDPOINT: &str = "https://api.openai.com/v1";
pub const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com";
pub const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta";
pub const DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com";
pub const KIMI_CN_ENDPOINT: &str = "https://api.moonshot.cn/v1";
pub const ZHIPU_ENDPOINT: &str = "https://open.bigmodel.cn/api/paas/v4";
pub const MINIMAX_CN_ENDPOINT: &str = "https://api.minimaxi.com/v1";
pub const BAILIAN_ENDPOINT: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
pub const ARK_ENDPOINT: &str = "https://ark.cn-beijing.volces.com/api/v3";
pub const OLLAMA_ENDPOINT: &str = "http://127.0.0.1:11434/v1";

pub fn provider_presets() -> Vec<AgentProviderConfigInput> {
    vec![
        preset(
            "openai",
            AgentProviderKind::OpenAi,
            "OpenAI",
            AgentProviderProtocol::OpenAiResponses,
            OPENAI_ENDPOINT,
            128_000,
            true,
        ),
        preset(
            "anthropic",
            AgentProviderKind::Anthropic,
            "Anthropic (Claude)",
            AgentProviderProtocol::AnthropicMessages,
            ANTHROPIC_ENDPOINT,
            200_000,
            true,
        ),
        preset(
            "gemini",
            AgentProviderKind::Gemini,
            "Google (Gemini)",
            AgentProviderProtocol::GeminiGenerateContent,
            GEMINI_ENDPOINT,
            128_000,
            true,
        ),
        preset(
            "azure_openai",
            AgentProviderKind::AzureOpenAi,
            "Azure OpenAI",
            AgentProviderProtocol::OpenAiResponses,
            "",
            128_000,
            true,
        ),
        preset(
            "deepseek",
            AgentProviderKind::DeepSeek,
            "DeepSeek",
            AgentProviderProtocol::OpenAiCompatible,
            DEEPSEEK_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "kimi_cn",
            AgentProviderKind::KimiCn,
            "Kimi (Moonshot 中国)",
            AgentProviderProtocol::OpenAiCompatible,
            KIMI_CN_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "zhipu_glm",
            AgentProviderKind::ZhipuGlm,
            "智谱 GLM",
            AgentProviderProtocol::OpenAiCompatible,
            ZHIPU_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "minimax_cn",
            AgentProviderKind::MinimaxCn,
            "MiniMax (中国)",
            AgentProviderProtocol::OpenAiCompatible,
            MINIMAX_CN_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "bailian",
            AgentProviderKind::Bailian,
            "阿里百炼",
            AgentProviderProtocol::OpenAiCompatible,
            BAILIAN_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "volcengine_ark",
            AgentProviderKind::VolcengineArk,
            "火山引擎 Ark",
            AgentProviderProtocol::OpenAiCompatible,
            ARK_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "ollama",
            AgentProviderKind::Ollama,
            "Ollama (本地)",
            AgentProviderProtocol::OpenAiCompatible,
            OLLAMA_ENDPOINT,
            128_000,
            false,
        ),
        preset(
            "custom",
            AgentProviderKind::Custom,
            "自定义模型服务",
            AgentProviderProtocol::OpenAiCompatible,
            "",
            128_000,
            false,
        ),
        preset(
            "codex_cli",
            AgentProviderKind::CodexCli,
            "Codex CLI (本地)",
            AgentProviderProtocol::CodexCli,
            "",
            128_000,
            true,
        ),
        preset(
            "claude_code_cli",
            AgentProviderKind::ClaudeCodeCli,
            "Claude Code CLI (本地)",
            AgentProviderProtocol::ClaudeCodeCli,
            "",
            200_000,
            true,
        ),
    ]
}

fn preset(
    id: &str,
    kind: AgentProviderKind,
    display_name: &str,
    protocol: AgentProviderProtocol,
    endpoint: &str,
    context_window: u64,
    images: bool,
) -> AgentProviderConfigInput {
    AgentProviderConfigInput {
        id: id.into(),
        kind,
        display_name: display_name.into(),
        protocol,
        endpoint: endpoint.into(),
        model: String::new(),
        context_window,
        reasoning_effort: ReasoningEffort::Auto,
        timeout_seconds: 120,
        executable_path: None,
        enabled: false,
        capabilities: AgentProviderCapabilities {
            text: true,
            images,
            tools: true,
            structured_output: true,
            streaming: true,
        },
    }
}
