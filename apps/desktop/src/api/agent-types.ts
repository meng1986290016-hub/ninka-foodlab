import type { ImportFileReference } from "./import-types";

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

export interface AgentCustomProviderSubconfig {
  endpoint: string;
  model: string;
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

export type AgentMessageRole = "user" | "assistant" | "tool";
export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

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
  | {
      type: "tool_started";
      runId: string;
      callId: string;
      toolName: string;
    }
  | {
      type: "tool_completed";
      runId: string;
      callId: string;
      summary: string;
    }
  | { type: "drafts_changed"; runId: string; importJobId: string }
  | { type: "run_completed"; runId: string }
  | { type: "run_failed"; runId: string; code: string; message: string };
