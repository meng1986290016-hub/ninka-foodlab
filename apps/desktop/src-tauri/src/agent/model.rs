use serde::{Deserialize, Serialize};

use crate::ingest::model::ImportFileReference;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentProviderKind {
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "azure_openai")]
    AzureOpenAi,
    #[serde(rename = "deepseek")]
    DeepSeek,
    #[serde(rename = "kimi_cn")]
    KimiCn,
    #[serde(rename = "zhipu_glm")]
    ZhipuGlm,
    #[serde(rename = "minimax_cn")]
    MinimaxCn,
    #[serde(rename = "bailian")]
    Bailian,
    #[serde(rename = "volcengine_ark")]
    VolcengineArk,
    #[serde(rename = "ollama")]
    Ollama,
    #[serde(rename = "custom")]
    Custom,
    #[serde(rename = "codex_cli")]
    CodexCli,
    #[serde(rename = "claude_code_cli")]
    ClaudeCodeCli,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentProviderProtocol {
    #[serde(rename = "openai_responses")]
    OpenAiResponses,
    #[serde(rename = "openai_compatible")]
    OpenAiCompatible,
    #[serde(rename = "anthropic_messages")]
    AnthropicMessages,
    #[serde(rename = "gemini_generate_content")]
    GeminiGenerateContent,
    #[serde(rename = "codex_cli")]
    CodexCli,
    #[serde(rename = "claude_code_cli")]
    ClaudeCodeCli,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Auto,
    Off,
    Low,
    Medium,
    High,
    Max,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderCapabilities {
    pub text: bool,
    pub images: bool,
    pub tools: bool,
    pub structured_output: bool,
    pub streaming: bool,
}

impl AgentProviderCapabilities {
    pub fn all() -> Self {
        Self {
            text: true,
            images: true,
            tools: true,
            structured_output: true,
            streaming: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderConfig {
    pub id: String,
    pub kind: AgentProviderKind,
    pub display_name: String,
    pub protocol: AgentProviderProtocol,
    pub endpoint: String,
    pub model: String,
    pub context_window: u64,
    pub reasoning_effort: ReasoningEffort,
    pub timeout_seconds: u64,
    pub executable_path: Option<String>,
    pub enabled: bool,
    pub has_secret: bool,
    pub capabilities: AgentProviderCapabilities,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderConfigInput {
    pub id: String,
    pub kind: AgentProviderKind,
    pub display_name: String,
    pub protocol: AgentProviderProtocol,
    pub endpoint: String,
    pub model: String,
    pub context_window: u64,
    pub reasoning_effort: ReasoningEffort,
    pub timeout_seconds: u64,
    pub executable_path: Option<String>,
    pub enabled: bool,
    pub capabilities: AgentProviderCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderSecretInput {
    pub provider_id: String,
    pub api_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPreferences {
    pub enabled: bool,
    pub vision_provider_config_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMessageRole {
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMessageStatus {
    Complete,
    Streaming,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    pub id: String,
    pub conversation_id: String,
    pub run_id: Option<String>,
    pub role: AgentMessageRole,
    pub content: String,
    pub attachment_ids: Vec<String>,
    pub status: AgentMessageStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentMessageInput {
    pub conversation_id: String,
    pub run_id: Option<String>,
    pub role: AgentMessageRole,
    pub content: String,
    pub attachment_ids: Vec<String>,
    pub status: AgentMessageStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRunStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub conversation_id: String,
    pub provider_config_id: String,
    pub import_job_id: Option<String>,
    pub status: AgentRunStatus,
    pub error_code: Option<String>,
    pub error_summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentRunInput {
    pub conversation_id: String,
    pub provider_config_id: String,
    pub import_job_id: Option<String>,
    pub status: AgentRunStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRequest {
    pub conversation_id: String,
    pub content: String,
    #[serde(default)]
    pub files: Vec<ImportFileReference>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentToolCallStatus {
    Started,
    Completed,
    Failed,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolCall {
    pub id: String,
    pub run_id: String,
    pub provider_kind: AgentProviderKind,
    pub model: String,
    pub tool_name: String,
    pub status: AgentToolCallStatus,
    pub error_summary: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}
