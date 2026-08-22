use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ingest::model::ImportFileReference;

pub const EXPECTED_HARNESS_VERSION: &str = "0.1.0-rc.6";
pub const EXPECTED_NODE_VERSION: &str = "24.19.0";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HarnessHealthStatus {
    Idle,
    Starting,
    Ready,
    Damaged,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessHealth {
    pub status: HarnessHealthStatus,
    pub last_error: Option<String>,
    pub reinstall_required: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessStartRequest {
    pub active_recipe_id: Option<String>,
    pub active_recipe_name: Option<String>,
    pub active_draft_fingerprint: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentTaskRequest {
    pub title: String,
    pub workflow: Option<String>,
    pub content: Option<String>,
    pub active_recipe_id: Option<String>,
    pub active_draft_fingerprint: Option<String>,
    #[serde(default)]
    pub files: Vec<ImportFileReference>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentTurnRequest {
    pub task_id: String,
    pub parent_turn_id: Option<String>,
    pub content: String,
    pub active_recipe_id: Option<String>,
    pub active_draft_fingerprint: Option<String>,
    #[serde(default)]
    pub branch_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentDeliveryMode {
    Queue,
    Steer,
}

impl AgentDeliveryMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queue => "queue",
            Self::Steer => "steer",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "queue" => Self::Queue,
            "steer" => Self::Steer,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecipeReference {
    pub recipe_id: String,
    pub recipe_name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitAgentMessageRequest {
    pub conversation_id: String,
    pub content: String,
    #[serde(default)]
    pub references: Vec<AgentRecipeReference>,
    pub mode: AgentDeliveryMode,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditAgentQueuedMessageRequest {
    pub message_id: String,
    pub content: String,
    #[serde(default)]
    pub references: Vec<AgentRecipeReference>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditAgentTurnRequest {
    pub turn_id: String,
    pub content: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentEngine {
    FoodlabRuntime,
    CodexAppServer,
}

impl AgentEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FoodlabRuntime => "foodlab_runtime",
            Self::CodexAppServer => "codex_app_server",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "foodlab_runtime" => Self::FoodlabRuntime,
            "codex_app_server" => Self::CodexAppServer,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelRoute {
    pub engine: AgentEngine,
    pub provider: String,
    pub model: String,
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskOutcome {
    Running,
    NeedsInput,
    NeedsReview,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HarnessTaskListScope {
    #[default]
    Active,
    Archived,
}

impl TaskOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::NeedsInput => "needs_input",
            Self::NeedsReview => "needs_review",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "running" => Self::Running,
            "needs_input" => Self::NeedsInput,
            "needs_review" => Self::NeedsReview,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            "interrupted" => Self::Interrupted,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalPolicy {
    Automatic,
    ReviewBeforeCommit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskContract {
    pub workflow: String,
    pub allowed_tools: Vec<String>,
    pub required_steps: Vec<String>,
    pub required_artifact_kinds: Vec<String>,
    pub approval_policy: ApprovalPolicy,
    pub completion_predicate: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum FoodLabContentBlock {
    Markdown {
        text: String,
    },
    Table {
        columns: Vec<ContentColumn>,
        rows: Vec<Vec<Value>>,
    },
    Citations {
        sources: Vec<ContentSource>,
    },
    Question {
        prompt: String,
        #[serde(default)]
        choices: Vec<ContentChoice>,
    },
    ArtifactRef {
        artifact_id: String,
    },
    Action {
        action: String,
        requires_approval: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentColumn {
    pub key: String,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSource {
    pub url: String,
    pub title: Option<String>,
    pub snippet: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentChoice {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTask {
    pub id: String,
    pub harness_session_id: Option<String>,
    pub title: String,
    pub workflow: String,
    pub status: TaskOutcome,
    pub task_contract: TaskContract,
    pub active_recipe_id: Option<String>,
    pub active_recipe_name: Option<String>,
    #[serde(default, skip_serializing)]
    pub active_draft_fingerprint: Option<String>,
    pub last_event_seq: i64,
    pub error_code: Option<String>,
    pub error_summary: Option<String>,
    pub active_route: AgentModelRoute,
    pub active_leaf_turn_id: Option<String>,
    pub queue_paused: bool,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurn {
    pub id: String,
    pub task_id: String,
    pub harness_turn_id: Option<String>,
    pub parent_turn_id: Option<String>,
    pub branch_id: String,
    pub status: TaskOutcome,
    pub user_content: String,
    pub content_blocks: Vec<FoodLabContentBlock>,
    pub route: AgentModelRoute,
    pub recipe_id: Option<String>,
    pub recipe_name: Option<String>,
    #[serde(default, skip_serializing)]
    pub draft_fingerprint: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentQueuedMessageState {
    Queued,
    Steering,
}

impl AgentQueuedMessageState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Steering => "steering",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "queued" => Self::Queued,
            "steering" => Self::Steering,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentQueuedMessage {
    pub id: String,
    pub conversation_id: String,
    pub content: String,
    pub references: Vec<AgentRecipeReference>,
    pub mode: AgentDeliveryMode,
    pub state: AgentQueuedMessageState,
    pub route: AgentModelRoute,
    pub recipe_id: Option<String>,
    pub recipe_name: Option<String>,
    #[serde(default, skip_serializing)]
    pub draft_fingerprint: Option<String>,
    pub branch_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConversationView {
    pub conversation: AgentTask,
    pub active_turns: Vec<AgentTurn>,
    pub queued_messages: Vec<AgentQueuedMessage>,
    pub queue_paused: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskEvent {
    pub task_id: String,
    pub seq: i64,
    pub event_type: String,
    pub turn_id: Option<String>,
    pub step_id: Option<String>,
    pub call_id: Option<String>,
    pub payload: Value,
    pub created_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactStatus {
    NeedsInput,
    NeedsReview,
    Accepted,
    Rejected,
    Stale,
}

impl ArtifactStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NeedsInput => "needs_input",
            Self::NeedsReview => "needs_review",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
            Self::Stale => "stale",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "needs_input" => Self::NeedsInput,
            "needs_review" => Self::NeedsReview,
            "accepted" => Self::Accepted,
            "rejected" => Self::Rejected,
            "stale" => Self::Stale,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactManifest {
    pub id: String,
    pub task_id: String,
    pub turn_id: String,
    pub tool_call_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub domain_ref: Option<String>,
    pub logical_path: Option<String>,
    pub mime_type: Option<String>,
    pub sha256: Option<String>,
    pub byte_size: Option<u64>,
    pub status: ArtifactStatus,
    pub provenance: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyResetCount {
    pub kind: String,
    pub count: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyResetPreview {
    pub preview_id: String,
    pub counts: Vec<LegacyResetCount>,
    pub file_paths: Vec<String>,
    pub keychain_accounts: Vec<String>,
    pub conflicts: Vec<String>,
    pub confirmation_phrase: String,
    pub can_execute: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyResetResult {
    pub preview_id: String,
    pub deleted_records: u64,
    pub deleted_files: u64,
    pub cleared_keychain_accounts: u64,
    pub cleanup_failures: Vec<String>,
}
