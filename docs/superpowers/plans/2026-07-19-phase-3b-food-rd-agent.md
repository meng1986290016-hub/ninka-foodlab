# Phase 3B Food R&D Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent global Food R&D Agent Chat that uses API, Ollama, Codex CLI, or Claude Code CLI providers to read selected ingredient sources and create reviewable 3A import drafts without gaining formal-save authority.

**Architecture:** A Rust `agent` module owns provider configuration, secret references, conversations, runtime events, tool permissions, HTTP/CLI adapters, and local MCP bridging. Every provider emits the same `AgentEvent` stream and calls the same `AgentToolRegistry`; ingredient ingestion is implemented only by invoking the stable 3A coordinator. React renders settings and a global right-side Chat panel through typed commands and Tauri events, while browser demo mode uses a deterministic fake provider.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Testing Library, Tauri 2.11, Rust 2024, rusqlite 0.40.1, Tokio, Reqwest with rustls, OS keyring, JSON Schema, stdio MCP, Codex CLI non-interactive mode, and Claude Code print mode.

## Global Constraints

- `启用食品研发 Agent` defaults to `true`; disabling it hides the entry and prevents new runs without deleting conversations or drafts.
- Manual ingredient entry and all 3A import/export functions remain fully usable with no configured provider.
- Exactly one Chat provider is active at a time; image recognition defaults to the Chat provider and can point to a second capable provider.
- API keys are stored only in the operating-system credential store; SQLite, logs, exports, and browser demo state contain only `secretRef` and `hasSecret`.
- Agent tools may search data, read current-task attachments, create/update/merge/split/discard/validate drafts, and request opening the review form.
- Agent tools must not save or overwrite a formal ingredient, archive/delete formal data, modify settings, read unrelated recipes, or read unselected local files.
- Codex CLI, Claude Code CLI, and API providers receive the same `AgentToolDefinition[]`; CLI is not a reduced-capability provider.
- CLI commands are generated as argument arrays, never shell strings. The working directory contains only current-task attachments, prompt, schema, and ephemeral MCP configuration.
- Agent does not read, suggest, or fill `internalCode`.
- Unknown values remain `null`; only source-explicit zeros become `"0"`; deterministic 3A validation remains authoritative.
- Source conflicts remain unresolved with `source_conflict` issues; a model cannot silently choose one source.
- Chat never displays or persists hidden reasoning text.
- LLM Wiki GPLv3 source, visual details, and wording are not copied; only the approved information architecture is referenced.

## External protocol references

- Codex non-interactive mode: `codex exec --json`, `--output-schema`, and read-only sandbox behavior from <https://developers.openai.com/codex/noninteractive/>.
- Claude Code CLI: `claude -p`, `--output-format stream-json`, `--json-schema`, `--mcp-config`, `--strict-mcp-config`, `--allowedTools`, and `--tools` from <https://code.claude.com/docs/en/cli-usage>.
- MCP stdio transport: newline-delimited UTF-8 JSON-RPC from <https://modelcontextprotocol.io/specification/draft/basic/transports>.

---

## File map

- `apps/desktop/src/api/agent-types.ts`: provider, conversation, message, run, event, and tool-call contracts.
- `apps/desktop/src-tauri/src/agent/model.rs`: Rust mirror of the public contract.
- `apps/desktop/src-tauri/src/agent/repository.rs`: provider metadata, conversations, messages, and audit summaries.
- `apps/desktop/src-tauri/src/agent/providers/`: registry plus HTTP and CLI adapters.
- `apps/desktop/src-tauri/src/agent/runtime.rs`: provider-independent run loop and event persistence.
- `apps/desktop/src-tauri/src/agent/tools.rs`: the only application-tool allow-list and dispatcher.
- `apps/desktop/src-tauri/src/agent/mcp.rs`: task-scoped stdio MCP server exposing the same registry.
- `apps/desktop/src-tauri/src/bin/food_rd_mcp.rs`: child-process entry point used by CLI providers.
- `apps/desktop/src/features/settings/`: settings shell and model-provider cards.
- `apps/desktop/src/features/agent/`: global Chat panel, message stream, uploads, task state, and import draft cards.

---

### Task 1: Define the provider, Chat, run, and event contract

**Files:**
- Create: `apps/desktop/src/api/agent-types.ts`
- Modify: `apps/desktop/src/api/desktop-api.ts`
- Modify: `apps/desktop/src/api/types.ts`
- Modify: `apps/desktop/src/api/desktop-api-contract.test.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.test.ts`

**Interfaces:**
- Consumes: 3A `ImportFileReference`, `IngredientImportDraft`, and `IngredientImportJob`.
- Produces: the stable public Agent API implemented by every provider and UI task.

- [ ] **Step 1: Write the failing contract test**

```ts
import type {
  AgentConversation,
  AgentMessage,
  AgentProviderConfig,
  AgentRun,
  AgentRunRequest,
  CliDetectionResult,
} from "./agent-types";

it("exposes persistent provider and conversation operations", () => {
  expectTypeOf<Awaited<ReturnType<DesktopApi["listAgentProviderConfigs"]>>>()
    .toEqualTypeOf<AgentProviderConfig[]>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["createAgentConversation"]>>>()
    .toEqualTypeOf<AgentConversation>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["listAgentMessages"]>>>()
    .toEqualTypeOf<AgentMessage[]>();
  expectTypeOf<Parameters<DesktopApi["startAgentRun"]>[0]>()
    .toEqualTypeOf<AgentRunRequest>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["startAgentRun"]>>>()
    .toEqualTypeOf<AgentRun>();
  expectTypeOf<Awaited<ReturnType<DesktopApi["detectCliProviders"]>>>()
    .toEqualTypeOf<CliDetectionResult[]>();
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts`

Expected: FAIL because `agent-types.ts` and Agent API methods do not exist.

- [ ] **Step 3: Define provider and capability types**

```ts
export type AgentProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "azure_openai"
  | "deepseek"
  | "kimi_cn"
  | "zhipu_glm"
  | "minimax_cn"
  | "bailian"
  | "volcengine_ark"
  | "ollama"
  | "custom"
  | "codex_cli"
  | "claude_code_cli";

export type AgentProviderProtocol =
  | "openai_responses"
  | "openai_compatible"
  | "anthropic_messages"
  | "gemini_generate_content"
  | "codex_cli"
  | "claude_code_cli";

export interface AgentProviderCapabilities {
  text: boolean;
  images: boolean;
  tools: boolean;
  structuredOutput: boolean;
  streaming: boolean;
}

export interface AgentProviderConfig {
  id: string;
  kind: AgentProviderKind;
  displayName: string;
  protocol: AgentProviderProtocol;
  endpoint: string;
  model: string;
  contextWindow: number;
  reasoningEffort: "auto" | "off" | "low" | "medium" | "high" | "max";
  timeoutSeconds: number;
  executablePath: string | null;
  enabled: boolean;
  hasSecret: boolean;
  capabilities: AgentProviderCapabilities;
  updatedAt: string;
}

export type AgentProviderConfigInput = Omit<
  AgentProviderConfig,
  "hasSecret" | "updatedAt"
>;

export interface AgentPreferences {
  enabled: boolean;
  visionProviderConfigId: string | null;
}

export interface AgentModelOption {
  id: string;
  label: string;
}

export interface AgentProviderSecretInput {
  providerId: string;
  apiKey: string;
}

export interface AgentProviderTestResult {
  ok: boolean;
  kind: "connection" | "structured_output";
  latencyMs: number | null;
  message: string;
}

export interface CliDetectionResult {
  kind: "codex_cli" | "claude_code_cli";
  executablePath: string | null;
  version: string | null;
  installed: boolean;
  authenticated: boolean;
  message: string;
}
```

The single `custom` provider card stores its OpenAI-compatible and Anthropic-compatible sub-configurations independently; `protocol` selects which sub-configuration is active.

- [ ] **Step 4: Define Chat and run records**

```ts
export type AgentMessageRole = "user" | "assistant" | "tool";
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  runId: string | null;
  role: AgentMessageRole;
  content: string;
  attachmentIds: string[];
  status: "complete" | "streaming" | "failed";
  createdAt: string;
}

export interface AgentRunRequest {
  conversationId: string;
  content: string;
  files: ImportFileReference[];
}

export interface AgentRun {
  id: string;
  conversationId: string;
  providerConfigId: string;
  importJobId: string | null;
  status: AgentRunStatus;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | { type: "message_delta"; runId: string; text: string }
  | { type: "tool_started"; runId: string; callId: string; toolName: string }
  | { type: "tool_completed"; runId: string; callId: string; summary: string }
  | { type: "drafts_changed"; runId: string; importJobId: string }
  | { type: "run_completed"; runId: string }
  | { type: "run_failed"; runId: string; code: string; message: string };
```

- [ ] **Step 5: Add exact `DesktopApi` methods and invoke assertions**

Add these exact signatures:

```ts
getAgentPreferences(): Promise<AgentPreferences>;
saveAgentPreferences(input: AgentPreferences): Promise<AgentPreferences>;
listAgentProviderConfigs(): Promise<AgentProviderConfig[]>;
saveAgentProviderConfig(input: AgentProviderConfigInput): Promise<AgentProviderConfig>;
setAgentProviderSecret(input: AgentProviderSecretInput): Promise<void>;
clearAgentProviderSecret(providerId: string): Promise<void>;
listAgentProviderModels(providerId: string): Promise<AgentModelOption[]>;
testAgentProvider(providerId: string, kind: AgentProviderTestResult["kind"]): Promise<AgentProviderTestResult>;
detectCliProviders(): Promise<CliDetectionResult[]>;
listAgentConversations(): Promise<AgentConversation[]>;
createAgentConversation(title?: string): Promise<AgentConversation>;
deleteAgentConversation(id: string): Promise<void>;
listAgentMessages(conversationId: string): Promise<AgentMessage[]>;
startAgentRun(request: AgentRunRequest): Promise<AgentRun>;
cancelAgentRun(id: string): Promise<AgentRun>;
getAgentRun(id: string): Promise<AgentRun>;
listAgentImportDrafts(runId: string): Promise<IngredientImportDraft[]>;
```

Adapter tests must assert camel-case request bodies and must assert API keys are passed only to `set_agent_provider_secret`.

- [ ] **Step 6: Run contract and adapter tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts src/api/tauri-desktop-api.test.ts`

Expected: PASS for public shapes and invoke names; full adapter parity is completed in Task 6.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/api
git commit -m "feat(agent): define provider and chat contract"
```

---

### Task 2: Add Agent persistence schema version 3

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0003_food_rd_agent.sql`
- Modify: `apps/desktop/src-tauri/src/database/migrations.rs`
- Create: `apps/desktop/src-tauri/src/agent/mod.rs`
- Create: `apps/desktop/src-tauri/src/agent/model.rs`
- Create: `apps/desktop/src-tauri/src/agent/repository.rs`
- Create: `apps/desktop/src-tauri/tests/agent_repository.rs`
- Modify: `apps/desktop/src-tauri/tests/import_migrations.rs`

**Interfaces:**
- Consumes: schema version 2 attachments and import jobs.
- Produces: provider metadata, conversations, messages, runs, and tool audit records without plaintext secrets.

- [ ] **Step 1: Write failing migration and persistence tests**

```rust
#[test]
fn agent_records_survive_reopen_without_secret_values() {
    let fixture = AgentRepositoryFixture::file_database();
    let provider = fixture.repository.save_provider(openai_config()).unwrap();
    let conversation = fixture.repository.create_conversation("原料资料导入").unwrap();
    fixture.repository.append_message(user_message(&conversation.id)).unwrap();
    drop(fixture.repository);
    let reopened = fixture.reopen();
    assert_eq!(reopened.list_providers().unwrap()[0].id, provider.id);
    assert_eq!(reopened.list_messages(&conversation.id).unwrap().len(), 1);
    assert!(!String::from_utf8_lossy(&fixture.database_bytes()).contains("sk-test-secret"));
}
```

- [ ] **Step 2: Run the repository test and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_repository`

Expected: FAIL because schema version 3 and the `agent` module do not exist.

- [ ] **Step 3: Create the version 3 tables**

```sql
CREATE TABLE agent_provider_configs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  context_window INTEGER NOT NULL,
  reasoning_effort TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL,
  executable_path TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  secret_ref TEXT,
  capabilities_json TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX agent_provider_one_enabled_idx
ON agent_provider_configs(enabled) WHERE enabled = 1;

CREATE TABLE agent_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  provider_config_id TEXT NOT NULL REFERENCES agent_provider_configs(id) ON DELETE RESTRICT,
  import_job_id TEXT REFERENCES ingredient_import_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE agent_message_attachments (
  message_id TEXT NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES source_attachments(id) ON DELETE RESTRICT,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE TABLE agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  provider_kind TEXT NOT NULL,
  model TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'denied')),
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
```

- [ ] **Step 4: Seed provider cards and default Agent setting**

On a fresh database insert one disabled card for each approved kind and set `app_settings['agent.enabled']` to JSON `true`. The `custom` row stores both protocol sub-configurations in `config_json`; provider cards contain no keys.

- [ ] **Step 5: Implement repository operations and interrupted-run recovery**

Saving a provider enables it and disables the previous active row in one transaction. On startup change `running` runs to `failed` with `error_code = 'application_restarted'`, leave their messages/import drafts intact, and mark any streaming assistant message failed.

- [ ] **Step 6: Run migration, reopen, and serialization tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_repository --test import_migrations`

Expected: PASS with schema version 3, one-active-provider enforcement, restart recovery, and no secret content in SQLite.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/migrations apps/desktop/src-tauri/src/database/migrations.rs apps/desktop/src-tauri/src/agent apps/desktop/src-tauri/tests
git commit -m "feat(agent): persist provider and chat metadata"
```

---

### Task 3: Store provider credentials in the OS keyring and build `ProviderRegistry`

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/agent/secrets.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/mod.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/presets.rs`
- Create: `apps/desktop/src-tauri/tests/provider_registry.rs`

**Interfaces:**
- Consumes: Task 2 provider rows.
- Produces: `SecretStore`, `ProviderRegistry::active_chat`, `vision_provider`, capability checks, and provider test dispatch.

- [ ] **Step 1: Write failing secret and switching tests**

```rust
#[test]
fn key_is_written_to_secret_store_and_only_reference_is_persisted() {
    let secrets = MemorySecretStore::default();
    let mut registry = fixture_registry(secrets.clone());
    registry.set_secret("openai", "sk-private").unwrap();
    assert_eq!(secrets.get("food-rd-studio", "agent/openai").unwrap(), "sk-private");
    let stored = registry.get_config("openai").unwrap();
    assert!(stored.has_secret);
    assert!(!serde_json::to_string(&stored).unwrap().contains("sk-private"));
}

#[test]
fn custom_protocol_switch_preserves_both_subconfigurations() {
    let mut registry = fixture_registry(MemorySecretStore::default());
    registry.save_custom(openai_custom("https://openai.example/v1", "model-a")).unwrap();
    registry.save_custom(anthropic_custom("https://anthropic.example", "model-b")).unwrap();
    assert_eq!(registry.custom_subconfig(OpenAiCompatible).model, "model-a");
    assert_eq!(registry.custom_subconfig(AnthropicMessages).model, "model-b");
}
```

- [ ] **Step 2: Run registry tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test provider_registry`

Expected: FAIL because secret storage and provider presets do not exist.

- [ ] **Step 3: Define a testable secret boundary**

Add `keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }` and implement:

```rust
pub trait SecretStore: Send + Sync {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), AgentError>;
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, AgentError>;
    fn delete(&self, service: &str, account: &str) -> Result<(), AgentError>;
}
```

The production service name is `com.foodrd.studio`; construct account names with `format!("agent/{provider_id}")`. Convert keyring errors to Chinese messages without including secret values.

- [ ] **Step 4: Define the approved provider presets**

Create cards for OpenAI, Anthropic, Gemini, Azure OpenAI, DeepSeek, Kimi 中国, 智谱 GLM, MiniMax 中国, 阿里百炼, 火山引擎 Ark, Ollama, 自定义模型服务, Codex CLI, and Claude Code CLI. Use these editable endpoint defaults:

```rust
const OPENAI_ENDPOINT: &str = "https://api.openai.com/v1";
const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com";
const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEEPSEEK_ENDPOINT: &str = "https://api.deepseek.com";
const KIMI_CN_ENDPOINT: &str = "https://api.moonshot.cn/v1";
const ZHIPU_ENDPOINT: &str = "https://open.bigmodel.cn/api/paas/v4";
const MINIMAX_CN_ENDPOINT: &str = "https://api.minimaxi.com/v1";
const BAILIAN_ENDPOINT: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const ARK_ENDPOINT: &str = "https://ark.cn-beijing.volces.com/api/v3";
const OLLAMA_ENDPOINT: &str = "http://127.0.0.1:11434/v1";
```

Azure requires the user’s resource endpoint and deployment/model name rather than a shared default. `custom` has one visible card with independent `openaiCompatible` and `anthropicCompatible` values in `config_json`. Every endpoint remains user-editable so a provider change does not require an application release.

- [ ] **Step 5: Implement selection and capability rules**

`active_chat()` returns a configured enabled provider or `AgentError("provider_not_configured")`. `vision_provider()` follows Chat when `images` is true, otherwise resolves the separately selected provider setting. Connection tests do not create conversations or import jobs.

- [ ] **Step 6: Run registry tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test provider_registry`

Expected: PASS for secure secret references, provider switching, custom protocol preservation, capability checks, and missing-provider errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/agent apps/desktop/src-tauri/tests/provider_registry.rs
git commit -m "feat(agent): configure secure model providers"
```

---

### Task 4: Implement HTTP provider adapters behind one runtime contract

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/agent/providers/http.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/openai.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/openai_compatible.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/anthropic.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/gemini.rs`
- Create: `apps/desktop/src-tauri/tests/http_provider_contract.rs`

**Interfaces:**
- Consumes: `AgentProviderConfig`, a resolved secret, messages, images, and tool definitions.
- Produces: `AgentProvider::run(request, event_sink) -> ProviderTurnResult` for all HTTP presets.

- [ ] **Step 1: Write provider contract tests against a local mock server**

```rust
#[tokio::test]
async fn every_http_adapter_emits_text_and_normalized_tool_calls() {
    for fixture in http_provider_fixtures().await {
        let result = fixture.provider.run(fixture.request(), fixture.event_sink()).await.unwrap();
        assert!(result.events.iter().any(|event| matches!(event, ProviderEvent::TextDelta(_))));
        assert!(result.events.iter().any(|event| matches!(event, ProviderEvent::ToolCall(call) if call.name == "create_ingredient_import_draft")));
        fixture.server.assert_secret_header_only().await;
    }
}

#[tokio::test]
async fn malformed_structured_output_returns_one_retryable_error() {
    let fixture = malformed_openai_fixture().await;
    let error = fixture.provider.run(fixture.request()).await.unwrap_err();
    assert_eq!(error.code(), "invalid_model_output");
    assert!(error.retryable_once());
}
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test http_provider_contract`

Expected: FAIL because `AgentProvider` and HTTP adapters do not exist.

- [ ] **Step 3: Add asynchronous HTTP dependencies and define the trait**

Add `async-trait = "0.1"`, `futures-util = "0.3"`, `reqwest = { version = "0.12", default-features = false, features = ["json", "multipart", "rustls-tls", "stream"] }`, `tokio = { version = "1", features = ["process", "io-util", "time", "sync", "rt-multi-thread"] }`, and `wiremock = "0.6"` as a dev dependency.

```rust
#[derive(Clone, Debug, PartialEq)]
pub enum ProviderEvent {
    TextDelta(String),
    ToolCall(ProviderToolCall),
    Usage { input_tokens: u64, output_tokens: u64 },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

pub struct ProviderTurnRequest {
    pub messages: Vec<AgentMessage>,
    pub attachment_ids: Vec<String>,
    pub tools: Vec<AgentToolDefinition>,
    pub output_schema: serde_json::Value,
}

pub struct ProviderTurnResult {
    pub final_text: String,
    pub structured_output: Option<serde_json::Value>,
    pub events: Vec<ProviderEvent>,
}

pub type AgentEventSink = std::sync::Arc<dyn Fn(ProviderEvent) + Send + Sync>;

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn capabilities(&self) -> AgentProviderCapabilities;
    async fn test(&self, kind: ProviderTestKind) -> Result<AgentProviderTestResult, AgentError>;
    async fn run(&self, request: ProviderTurnRequest, sink: AgentEventSink) -> Result<ProviderTurnResult, AgentError>;
}
```

- [ ] **Step 4: Normalize OpenAI, compatible, Anthropic, and Gemini events**

The OpenAI adapter uses Responses structured outputs and function tools. OpenAI-compatible presets use Chat Completions unless their preset declares Responses support. Anthropic uses Messages content blocks. Gemini uses `generateContent`. Each adapter maps text, tool calls, usage, rate-limit, authentication, timeout, image-support, and malformed-output errors into provider-independent records.

Implement `list_models` on providers that expose a model-list endpoint. If listing is unavailable or rejected, return the preset’s cached common options and keep the custom model text field enabled; model-list failure never disables an otherwise valid manually entered model.

- [ ] **Step 5: Enforce request minimization**

Send only selected message attachments, the import JSON Schema, current-task extracted content, and tool results. Do not include the entire ingredient database, other conversations, recipes, local paths, or `internalCode`. Log request ID, provider kind, model, latency, and status only.

- [ ] **Step 6: Run provider contract and timeout tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test http_provider_contract`

Expected: PASS for all native and compatible protocol shapes without network access.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/agent/providers apps/desktop/src-tauri/tests/http_provider_contract.rs
git commit -m "feat(agent): add HTTP model provider adapters"
```

---

### Task 5: Build the unified `AgentToolRegistry` and enforce the save boundary

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/tools.rs`
- Create: `apps/desktop/src-tauri/tests/agent_tool_registry.rs`

**Interfaces:**
- Consumes: ingredient read APIs and the 3A ingest coordinator.
- Produces: `definitions() -> Vec<AgentToolDefinition>` and `execute(context, name, arguments)` used by API and CLI providers.

- [ ] **Step 1: Write failing allow-list and denial tests**

```rust
#[test]
fn registry_exposes_only_approved_phase_three_tools() {
    let names = registry().definitions().into_iter().map(|tool| tool.name).collect::<Vec<_>>();
    assert_eq!(names, vec![
        "search_material_groups",
        "search_supplier_variants",
        "search_suppliers",
        "search_categories",
        "list_nutrient_definitions",
        "read_task_attachments",
        "create_ingredient_import_draft",
        "update_ingredient_import_draft",
        "merge_ingredient_import_drafts",
        "split_ingredient_import_draft",
        "discard_ingredient_import_draft",
        "validate_ingredient_import_draft",
        "request_open_ingredient_review",
    ]);
}

#[test]
fn formal_writes_and_unrelated_reads_are_denied() {
    for name in ["save_ingredient_variant", "archive_ingredient_variant", "set_setting", "read_recipe", "read_local_file"] {
        let error = registry().execute(context(), name, serde_json::json!({})).unwrap_err();
        assert_eq!(error.code(), "tool_denied");
    }
}
```

- [ ] **Step 2: Run the tool tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_tool_registry`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Define scoped tool context and JSON schemas**

```rust
pub struct AgentToolContext {
    pub run_id: String,
    pub import_job_id: String,
    pub allowed_attachment_ids: BTreeSet<String>,
}

pub struct AgentToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}
```

Every attachment read verifies membership in `allowed_attachment_ids`; every draft mutation verifies `draft.job_id == context.import_job_id`.

- [ ] **Step 4: Implement one dispatch map for all providers**

```rust
pub fn execute(&mut self, context: &AgentToolContext, name: &str, arguments: Value) -> Result<Value, AgentError> {
    match name {
        "search_material_groups" => self.search_material_groups(arguments),
        "search_supplier_variants" => self.search_supplier_variants(arguments),
        "search_suppliers" => self.search_suppliers(arguments),
        "search_categories" => self.search_categories(arguments),
        "list_nutrient_definitions" => self.list_nutrient_definitions(),
        "read_task_attachments" => self.read_task_attachments(context, arguments),
        "create_ingredient_import_draft" => self.create_draft(context, arguments),
        "update_ingredient_import_draft" => self.update_draft(context, arguments),
        "merge_ingredient_import_drafts" => self.merge_drafts(context, arguments),
        "split_ingredient_import_draft" => self.split_draft(context, arguments),
        "discard_ingredient_import_draft" => self.discard_draft(context, arguments),
        "validate_ingredient_import_draft" => self.validate_draft(context, arguments),
        "request_open_ingredient_review" => self.request_open_review(context, arguments),
        _ => Err(AgentError::tool_denied(name)),
    }
}
```

- [ ] **Step 5: Audit every call without raw arguments or results**

Persist provider, model, tool name, status, timestamps, and sanitized error summary. Never store attachment text, model reasoning, API key, raw tool arguments, or full result payload in `agent_tool_calls`.

- [ ] **Step 6: Run tool scope, schema, and audit tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_tool_registry`

Expected: PASS; no code path exposes a formal-save tool.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/agent/tools.rs apps/desktop/src-tauri/tests/agent_tool_registry.rs
git commit -m "feat(agent): enforce unified food R&D tools"
```

---

### Task 6: Orchestrate persistent Agent runs and expose desktop commands

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/runtime.rs`
- Create: `apps/desktop/src-tauri/src/commands/agent.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/api/tauri-desktop-api.ts`
- Modify: `apps/desktop/src/api/browser-schema.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.ts`
- Create: `apps/desktop/src/api/agent-event-source.ts`
- Create: `apps/desktop/src/api/agent-event-source.test.ts`
- Create: `apps/desktop/src-tauri/tests/agent_runtime.rs`
- Create: `apps/desktop/src/api/browser-agent-api.test.ts`

**Interfaces:**
- Consumes: provider registry, repository, tool registry, and 3A import coordinator.
- Produces: persistent runs, `agent-event` window events, commands, and browser fake-provider parity.

- [x] **Step 1: Write failing run-loop tests**

```rust
#[tokio::test]
async fn tool_calls_continue_until_a_final_message_and_persist_progress() {
    let fixture = RuntimeFixture::provider_sequence(vec![
        provider_tool_call("create_ingredient_import_draft", valid_draft_arguments()),
        provider_final_text("已创建 1 张原料草稿，请人工复核后保存。"),
    ]);
    let run = fixture.runtime.start(fixture.request()).await.unwrap();
    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(fixture.messages(&run.conversation_id).last().unwrap().content, "已创建 1 张原料草稿，请人工复核后保存。");
    assert_eq!(fixture.import_drafts(&run).len(), 1);
}

#[tokio::test]
async fn invalid_structured_output_retries_once_then_preserves_failed_job() {
    let fixture = RuntimeFixture::invalid_output_twice();
    let error = fixture.runtime.start(fixture.request()).await.unwrap_err();
    assert_eq!(fixture.provider_call_count(), 2);
    assert_eq!(error.code(), "invalid_model_output");
    assert!(fixture.import_job_still_exists());
}
```

- [x] **Step 2: Run runtime tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_runtime`

Expected: FAIL because the runtime and commands do not exist.

- [x] **Step 3: Implement the run lifecycle**

`start` verifies `agent.enabled`, stages selected files through 3A, creates the user message and run, builds the minimized provider request, executes at most 12 tool turns, validates every tool call, emits events, appends one final assistant message, and updates run/import-job states. Cancellation uses a Tokio cancellation token and never deletes completed drafts.

- [x] **Step 4: Persist streaming text without excessive SQLite writes**

Keep deltas in memory, emit each delta to the window, and checkpoint the assistant message at most once per second plus once at completion/failure. Do not persist hidden reasoning events.

- [x] **Step 5: Add commands and event names**

Register provider configuration, secret, model-list, test, CLI detection, conversation, run, cancel, and message commands. Emit only `food-rd://agent-event` with the exact `AgentEvent` payload. Add an `AgentEventSource` interface with `subscribe(listener) -> Promise<Unsubscribe>`; the Tauri source wraps `@tauri-apps/api/event.listen`, and the browser source uses an in-memory listener set. Structured command errors never include request bodies, keys, or local paths.

- [x] **Step 6: Implement browser fake-provider parity**

Browser schema v4 stores provider configs, conversations, runs, and messages. Its default fake provider recognizes a selected `browser_demo` file and creates deterministic import drafts through the existing browser 3A methods; it never calls `fetch`, native dialog, keyring, CLI, or MCP.

- [x] **Step 7: Run Rust, frontend adapter, browser, and type tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_runtime --test ingredient_commands`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api && pnpm --filter @food-rd/desktop typecheck`

Expected: PASS for runtime persistence, cancellation, one retry, events, browser parity, and command registration.

- [x] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/agent apps/desktop/src-tauri/src/commands apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests apps/desktop/src/api
git commit -m "feat(agent): orchestrate persistent chat runs"
```

---

### Task 7: Build the settings shell and LLM provider cards

**Files:**
- Create: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Create: `apps/desktop/src/features/settings/AgentGeneralSettings.tsx`
- Create: `apps/desktop/src/features/settings/ModelProviderSettings.tsx`
- Create: `apps/desktop/src/features/settings/ProviderCard.tsx`
- Create: `apps/desktop/src/features/settings/CustomProviderFields.tsx`
- Create: `apps/desktop/src/features/settings/CliProviderFields.tsx`
- Create: `apps/desktop/src/features/settings/ModelProviderSettings.test.tsx`
- Create: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/AppShell.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: provider/configuration desktop methods.
- Produces: navigable Settings, Agent toggle, provider selection, connection tests, and custom/CLI configuration UI.

- [x] **Step 1: Write failing settings interaction tests**

```tsx
it("shows one custom card with two protocol configurations", async () => {
  render(<ModelProviderSettings api={api} />);
  await user.click(await screen.findByRole("button", { name: /自定义模型服务/ }));
  expect(screen.getByRole("button", { name: "OpenAI 兼容" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anthropic 兼容" })).toBeInTheDocument();
  expect(screen.getAllByText("自定义模型服务")).toHaveLength(1);
});

it("enables one provider and keeps the previous provider configuration", async () => {
  render(<ModelProviderSettings api={api} />);
  await user.click(await screen.findByRole("button", { name: "启用 OpenAI" }));
  await user.click(screen.getByRole("button", { name: "启用 DeepSeek" }));
  expect(api.saveAgentProviderConfig).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "deepseek", enabled: true }));
  expect(api.savedConfig("openai").model).toBe("gpt-user-selected");
});
```

- [x] **Step 2: Run settings tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/settings/ModelProviderSettings.test.tsx`

Expected: FAIL because Settings navigation and provider cards do not exist.

- [x] **Step 3: Make application navigation stateful**

Replace disabled navigation buttons with an `AppPage = "ingredients" | "recipes" | "library" | "settings"` state owned by `App`. Settings renders in the content area; existing unimplemented pages render a clear placeholder without changing ingredient behavior.

- [x] **Step 4: Implement provider cards independently from LLM Wiki code and visuals**

Each card shows provider name, endpoint summary, active state, capability chips, and expand control. Expanded fields include Endpoint, key, model/custom model, context window, reasoning, timeout, connection test, and structured-function test. API key inputs start blank with `已保存` status; saving a blank input does not clear an existing key.

- [x] **Step 5: Implement the single custom and CLI card variations**

The custom card has protocol tabs and preserves both sub-configurations. CLI cards show detected executable, manual path, version/login result, model, reasoning, maximum runtime, connection test, and structured test. `启用食品研发 Agent` defaults visually on and saves to `agent.enabled`.

- [x] **Step 6: Add provider capability warnings**

If the active Chat provider lacks images, Settings requires a separate image provider before photo upload. If it lacks tools or structured output, it cannot be activated for ingredient ingestion and the UI explains the missing capability.

- [x] **Step 7: Run settings, navigation, typecheck, and build tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/settings src/App.test.tsx`

Run: `pnpm --filter @food-rd/desktop typecheck && pnpm --filter @food-rd/desktop build`

Expected: PASS with one custom card, mutually exclusive active provider, secure-key behavior, and responsive settings layout.

- [x] **Step 8: Commit**

```bash
git add apps/desktop/src/features/settings apps/desktop/src/App.tsx apps/desktop/src/components/AppShell.tsx apps/desktop/src/styles/app.css
git commit -m "feat(agent): add model provider settings"
```

---

### Task 8: Add the persistent global Agent Chat panel

**Files:**
- Create: `apps/desktop/src/features/agent/AgentPanel.tsx`
- Create: `apps/desktop/src/features/agent/AgentMessageList.tsx`
- Create: `apps/desktop/src/features/agent/AgentComposer.tsx`
- Create: `apps/desktop/src/features/agent/AgentTaskStatus.tsx`
- Create: `apps/desktop/src/features/agent/useAgentConversation.ts`
- Create: `apps/desktop/src/features/agent/AgentPanel.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/AppShell.tsx`
- Modify: `apps/desktop/src/components/Icon.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: conversations, messages, run commands, `food-rd://agent-event`, and 3A file picker.
- Produces: a global open/close Chat experience that persists across pages and restarts.

- [x] **Step 1: Write failing panel tests**

```tsx
it("keeps the same conversation after closing, navigating, and reopening", async () => {
  render(<App api={api} agentEvents={events} filePicker={picker} />);
  await user.click(screen.getByRole("button", { name: "打开食品研发 Agent" }));
  await user.type(screen.getByRole("textbox", { name: "给食品研发 Agent 发消息" }), "读取原料资料");
  await user.click(screen.getByRole("button", { name: "发送" }));
  await user.click(screen.getByRole("button", { name: "关闭食品研发 Agent" }));
  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(screen.getByRole("button", { name: "打开食品研发 Agent" }));
  expect(screen.getByText("读取原料资料")).toBeInTheDocument();
});

it("shows a configuration action without breaking manual features", async () => {
  render(<AgentPanel api={apiWithoutActiveProvider} />);
  expect(await screen.findByRole("button", { name: "配置大模型" })).toBeInTheDocument();
  expect(screen.getByText("原料库和表格导入仍可正常使用")).toBeInTheDocument();
});
```

- [x] **Step 2: Run panel tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/agent/AgentPanel.test.tsx`

Expected: FAIL because the global panel does not exist.

- [x] **Step 3: Mount one panel at the application shell level**

The top bar contains `打开食品研发 Agent`. The panel is a third grid column at wide sizes and an overlay below 900 px. It remains mounted while application pages change. Closing changes visibility only, not conversation state.

- [x] **Step 4: Implement messages, composer, attachments, and privacy confirmation**

The composer accepts text, multiple file selection, drag/drop, removal before send, Stop, Retry, and Clear Conversation. Before the first send containing attachments to a remote provider, render `这些资料将发送给当前配置的模型服务：${provider.displayName}` and require confirmation. Local CLI/Ollama displays `资料仅交给本机配置处理`.

- [x] **Step 5: Render normalized events without reasoning**

Append text deltas, show friendly tool statuses (`正在读取附件`, `正在搜索供应商`, `已创建 3 张草稿`), replace them on completion, and display actionable provider errors. Ignore any provider event categorized as reasoning.

- [x] **Step 6: Implement cancel, retry, and conversation clearing**

Stop calls `cancelAgentRun`. Retry creates a new run with the failed user message and same attachment IDs; it does not duplicate staged files. Clearing asks for confirmation and deletes Chat messages while leaving formal ingredients and already imported source attachments untouched.

- [x] **Step 7: Run panel, App, typecheck, and build tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/agent src/App.test.tsx`

Run: `pnpm --filter @food-rd/desktop typecheck && pnpm --filter @food-rd/desktop build`

Expected: PASS for global persistence, upload confirmation, streaming states, cancellation, retry, and no-provider fallback.

- [x] **Step 8: Commit**

```bash
git add apps/desktop/src/features/agent apps/desktop/src/App.tsx apps/desktop/src/components apps/desktop/src/styles/app.css
git commit -m "feat(agent): add global food R&D chat"
```

---

### Task 9: Create multi-file ingredient drafts and open the review form

**Files:**
- Create: `apps/desktop/src/features/agent/IngredientImportDraftCard.tsx`
- Create: `apps/desktop/src/features/agent/IngredientImportDraftList.tsx`
- Create: `apps/desktop/src/features/agent/IngredientImportDraftCard.test.tsx`
- Modify: `apps/desktop/src/features/agent/AgentPanel.tsx`
- Modify: `apps/desktop/src/features/ingredients/VariantEditor.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.tsx`
- Create: `apps/desktop/src/features/ingredients/ImportedVariantReview.tsx`
- Create: `apps/desktop/src/features/ingredients/ImportedVariantReview.test.tsx`
- Create: `apps/desktop/src-tauri/tests/agent_ingest_flow.rs`

**Interfaces:**
- Consumes: tool-created 3A drafts and `commitReviewedIngredientImportDraft` available only to UI.
- Produces: draft cards, merge/split/retry/discard UI, and explicit human save using existing ingredient field components.

- [x] **Step 1: Write failing grouping and formal-save boundary tests**

```rust
#[tokio::test]
async fn eight_sources_group_into_three_supplier_drafts() {
    let fixture = AgentIngestFixture::two_milk_powders_and_one_whey();
    let result = fixture.run().await.unwrap();
    assert_eq!(result.drafts.len(), 3);
    assert_eq!(result.drafts.iter().filter(|draft| draft.review.material_name == "脱脂乳粉").count(), 2);
    assert!(fixture.formal_variants().is_empty());
}
```

```tsx
it("writes the variant only when the user clicks save", async () => {
  render(<ImportedVariantReview api={api} draft={draft} onSaved={vi.fn()} onCancel={vi.fn()} />);
  expect(api.commitReviewedIngredientImportDraft).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "保存供应商版本" }));
  expect(api.commitReviewedIngredientImportDraft).toHaveBeenCalledWith(draft.id, expect.objectContaining({
    materialName: "脱脂乳粉",
    supplierName: "供应商A",
  }));
});
```

- [x] **Step 2: Run flow and component tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_ingest_flow`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/agent/IngredientImportDraftCard.test.tsx src/features/ingredients/ImportedVariantReview.test.tsx`

Expected: FAIL because grouping cards and imported review mode do not exist.

- [x] **Step 3: Enforce grouping keys and conflict behavior in Agent instructions and tools**

Group on normalized `materialName + supplierName + modelOrSpecification`. Multiple files may join only when all non-empty identity values agree. A document containing multiple identity groups creates multiple drafts. Unassigned attachments remain on the job with a warning. Conflicting field values add `source_conflict` with all source links and leave the reviewed value empty.

- [x] **Step 4: Render independent draft cards**

Each card shows material, supplier, specification, nutrient count, missing fields, source names, status, and actions: `打开并检查`, `重新识别`, `合并`, `拆分`, `放弃`. One failed card does not disable the others. Imported cards link to the formal variant.

- [x] **Step 5: Reuse existing ingredient fields in review mode**

`ImportedVariantReview` composes `VariantBasicFields` and `NutritionEditor`, adds material/category/supplier name-or-existing selectors and allergen fields, and omits internal code entirely. Saving calls only `commitReviewedIngredientImportDraft`; the Agent tool registry has no access to this desktop command.

- [x] **Step 6: Refresh Chat cards after save without deleting unsaved drafts**

After a successful save, refresh the ingredient library and the job draft list. Mark only that card imported. Closing or cancelling the review form leaves the draft `needs_review` and does not create reference records.

- [x] **Step 7: Run grouping, UI, and existing ingredient tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_ingest_flow --test agent_tool_registry`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/agent src/features/ingredients`

Expected: PASS for grouping, conflict preservation, manual save, individual failure isolation, and existing editor behavior.

- [x] **Step 8: Commit**

```bash
git add apps/desktop/src/features/agent apps/desktop/src/features/ingredients apps/desktop/src-tauri/tests/agent_ingest_flow.rs
git commit -m "feat(agent): review agent-created ingredient drafts"
```

---

### Task 10: Add Codex CLI and Claude Code CLI providers

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/providers/cli.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/codex_cli.rs`
- Create: `apps/desktop/src-tauri/src/agent/providers/claude_cli.rs`
- Create: `apps/desktop/src-tauri/tests/cli_provider_contract.rs`
- Create: `apps/desktop/src-tauri/tests/fixtures/fake-codex`
- Create: `apps/desktop/src-tauri/tests/fixtures/fake-claude`

**Interfaces:**
- Consumes: the same `AgentProvider`, event sink, tool schemas, and task directory builder as HTTP adapters.
- Produces: CLI discovery, connection/functional tests, JSONL event parsing, cancellation, timeout, and structured results.

- [x] **Step 1: Write failing fake-executable contract tests**

```rust
#[tokio::test]
async fn both_cli_adapters_emit_the_same_normalized_result() {
    for provider in [fixture_codex_cli(), fixture_claude_cli()] {
        let result = provider.run(provider_request(), collecting_sink()).await.unwrap();
        assert_eq!(result.structured_output, expected_draft_output());
        assert!(result.events.iter().any(|event| matches!(event, ProviderEvent::ToolCall(_))));
        assert!(!provider.recorded_arguments().join(" ").contains("internalCode"));
    }
}

#[tokio::test]
async fn cancellation_terminates_the_child_and_keeps_the_import_job() {
    let fixture = hanging_cli_fixture();
    let run = fixture.start();
    fixture.cancel();
    assert_eq!(run.await.unwrap_err().code(), "cancelled");
    assert!(fixture.import_job_exists());
}
```

- [x] **Step 2: Run CLI tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test cli_provider_contract`

Expected: FAIL because CLI discovery and runners do not exist.

- [x] **Step 3: Implement executable discovery and diagnostics**

Search the configured manual path first, then the application process `PATH`, and on macOS/Linux the common login-shell locations without executing a shell command. Detection runs `tokio::process::Command::new(executable_path).arg("--version")` and a minimal non-interactive structured test. Return path, version, installed, authenticated, and diagnostic message; never read or copy CLI credential files.

- [x] **Step 4: Build argument arrays for Codex**

Build the Codex process without a shell:

```rust
let mut command = tokio::process::Command::new(&config.executable_path);
command
    .current_dir(&task.directory)
    .arg("exec")
    .arg("--json")
    .arg("--ephemeral")
    .arg("--sandbox")
    .arg("read-only")
    .arg("--output-schema")
    .arg(&task.schema_path)
    .arg("-o")
    .arg(&task.result_path)
    .arg("-c")
    .arg(format!("mcp_servers.food_rd.command={:?}", task.mcp_binary))
    .arg("-c")
    .arg(format!("mcp_servers.food_rd.args={:?}", task.mcp_args))
    .arg(&task.prompt);
```

Parse stdout as JSONL. Consume `item.*`, MCP tool-call, completion, failure, and error events; ignore reasoning item text.

- [x] **Step 5: Build argument arrays for Claude Code**

Build the Claude Code process without a shell:

```rust
let mut command = tokio::process::Command::new(&config.executable_path);
command
    .current_dir(&task.directory)
    .arg("-p")
    .arg("--output-format")
    .arg("stream-json")
    .arg("--json-schema")
    .arg(&task.schema_json)
    .arg("--max-turns")
    .arg("12")
    .arg("--mcp-config")
    .arg(&task.mcp_config_path)
    .arg("--strict-mcp-config")
    .arg("--tools")
    .arg("")
    .arg("--allowedTools")
    .arg("mcp__food_rd__*")
    .arg("--no-session-persistence")
    .arg(&task.prompt);
```

Do not use `--dangerously-skip-permissions`. Parse stream-json, tool-use, result, and error records and ignore thinking content.

- [x] **Step 6: Enforce process lifecycle and output limits**

Use `tokio::process::Command` without a shell, clear inherited environment variables that are not required, preserve CLI-native authentication, cap each stdout/stderr line and total captured diagnostic text, terminate on configured timeout/cancel, and remove the task directory after result persistence.

- [x] **Step 7: Run fake CLI, timeout, cancellation, and path tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test cli_provider_contract`

Expected: PASS on macOS, Windows-safe argument construction, no real CLI login dependency, and identical normalized output.

- [x] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/agent/providers apps/desktop/src-tauri/tests/cli_provider_contract.rs apps/desktop/src-tauri/tests/fixtures
git commit -m "feat(agent): add Codex and Claude CLI providers"
```

---

### Task 11: Expose the unified registry to CLI through task-scoped MCP

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/mcp.rs`
- Create: `apps/desktop/src-tauri/src/bin/food_rd_mcp.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/tests/mcp_tool_bridge.rs`

**Interfaces:**
- Consumes: `AgentToolRegistry`, `AgentToolContext`, run/import-job IDs, and a one-use capability token.
- Produces: an MCP stdio server supporting initialize, tools/list, tools/call, cancellation, and shutdown for one CLI task.

- [x] **Step 1: Write failing MCP protocol and parity tests**

```rust
#[tokio::test]
async fn stdio_server_lists_exactly_the_registry_tools() {
    let bridge = McpFixture::spawn().await;
    bridge.initialize().await;
    let listed = bridge.list_tools().await;
    assert_eq!(listed.names(), bridge.registry_names());
    assert!(!listed.names().contains(&"save_ingredient_variant".to_string()));
}

#[tokio::test]
async fn invalid_or_reused_task_token_is_rejected() {
    let fixture = McpFixture::new();
    assert_eq!(fixture.connect("wrong-token").await.unwrap_err().code(), "unauthorized");
    fixture.connect(fixture.token()).await.unwrap();
    assert_eq!(fixture.connect(fixture.token()).await.unwrap_err().code(), "unauthorized");
}
```

- [x] **Step 2: Run MCP tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mcp_tool_bridge`

Expected: FAIL because the stdio bridge does not exist.

- [x] **Step 3: Implement newline-delimited JSON-RPC stdio framing**

Read one UTF-8 JSON object per stdin line and write one JSON-RPC response per stdout line. Implement `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, and `notifications/cancelled`. Send diagnostics only to stderr so stdout remains valid MCP traffic.

- [x] **Step 4: Scope the child server to one task**

Before launching a CLI, create a 256-bit random token record containing run ID, import job ID, allowed attachment IDs, expiry, and unused status. Pass token and database path as child-only environment variables, validate once, mark used, and remove/expire it when the process ends. The server cannot enumerate other jobs or attachments.

- [x] **Step 5: Dispatch `tools/call` to the same registry instance contract**

Deserialize arguments against the registered JSON Schema, call `AgentToolRegistry::execute`, and serialize only the same sanitized result used by HTTP providers. Tool audit rows must be byte-for-byte equivalent in required fields regardless of provider transport.

- [x] **Step 6: Run MCP Inspector-compatible framing and parity tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mcp_tool_bridge --test agent_tool_registry --test cli_provider_contract`

Expected: PASS for initialization, tool listing, calls, cancellation, token expiry, denial rules, and API/CLI tool-name parity.

- [x] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/agent/mcp.rs apps/desktop/src-tauri/src/bin/food_rd_mcp.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tests/mcp_tool_bridge.rs
git commit -m "feat(agent): bridge CLI providers to food R&D tools"
```

---

### Task 12: Verify provider parity and the complete Agent acceptance scenario

**Files:**
- Create: `apps/desktop/src-tauri/tests/agent_provider_parity.rs`
- Create: `apps/desktop/src/features/agent/agent-acceptance.test.tsx`
- Create: `docs/testing/phase-3b-food-rd-agent-checklist.md`
- Modify: `apps/desktop/README.md`

**Interfaces:**
- Consumes: the complete 3B feature and 3A import foundation.
- Produces: release-level automated and human evidence for API, Codex CLI, Claude Code CLI, and browser fallback.

- [x] **Step 1: Write the provider-parity acceptance test**

```rust
#[tokio::test]
async fn api_codex_and_claude_create_equal_drafts_with_equal_permissions() {
    for provider in [mock_api_provider(), fake_codex_provider(), fake_claude_provider()] {
        let fixture = AcceptanceFixture::with_eight_files(provider);
        let result = fixture.run("读取这些资料，分别建立供应商版本").await.unwrap();
        assert_eq!(normalize_drafts(result.drafts), expected_three_drafts());
        assert_eq!(fixture.registry_tool_names(), expected_agent_tool_names());
        assert!(fixture.formal_variants().is_empty());
    }
}
```

- [x] **Step 2: Write the user-save and restart acceptance test**

Open all three draft cards, save two, leave one unsaved, restart the app fixture, and assert exactly two formal variants exist while the conversation and third draft remain. Assert the two milk-powder variants have different supplier IDs and one explicit zero remains `"0"` while an unknown value remains `null`.

- [x] **Step 3: Run the focused acceptance suites**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_provider_parity --test agent_ingest_flow --test mcp_tool_bridge`

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/agent/agent-acceptance.test.tsx`

Expected: PASS for all three provider families, equal tools, three drafts, two manual saves, restart persistence, and no formal Agent write.

- [x] **Step 4: Document setup and troubleshooting**

Document how to enable/disable Agent, configure API/Ollama/custom providers, test a connection, use Codex CLI or Claude Code CLI local login, select a vision model, understand remote-file sending, recover failed jobs, and confirm that ordinary import and ingredient editing do not require a model.

- [x] **Step 5: Write the human acceptance checklist**

Cover the approved eight-file/three-draft scenario separately with one API provider, Codex CLI, and Claude Code CLI; provider switching without lost settings; single custom card with two protocols; keychain persistence; missing CLI; expired login; image capability warning; timeout, rate limit, cancellation, one structured retry, merge/split/discard, source conflicts, no internal code, and browser demo not starting CLI.

- [x] **Step 6: Run the complete regression and secret scan**

Run: `pnpm test && pnpm typecheck && pnpm build`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Run: `rg -n "(^|[^A-Za-z])sk-[A-Za-z0-9]{16,}|api[_-]?key\\s*[=:]\\s*[\"'][^\"']{12,}|ANTHROPIC_API_KEY\\s*=\\s*[^\"'[:space:]]{12,}" apps docs --glob '!**/fixtures/**'`

Expected: all tests and builds PASS; the secret scan returns no committed credential values.

- [x] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/tests/agent_provider_parity.rs apps/desktop/src/features/agent/agent-acceptance.test.tsx docs/testing/phase-3b-food-rd-agent-checklist.md apps/desktop/README.md
git commit -m "test(agent): verify provider parity and manual save"
```
