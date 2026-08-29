export type AgentRuntimeStatus =
  | "idle"
  | "starting"
  | "ready"
  | "damaged"
  | "failed";

export interface AgentRuntimeHealth {
  status: AgentRuntimeStatus;
  lastError: string | null;
  reinstallRequired: boolean;
}

/** Internal compatibility alias while the V2 source files are being renamed. */
export type HarnessHealth = AgentRuntimeHealth;

export interface HarnessStartRequest {
  activeRecipeId?: string | null;
  activeRecipeName?: string | null;
  activeDraftFingerprint?: string | null;
}

export type AgentRuntimeSettingsMethod =
  | "llm.providers"
  | "llm.models"
  | "llm.discoverModels"
  | "settings.describe"
  | "settings.mutate"
  | "credentials.describe"
  | "credentials.set"
  | "credentials.unset";

export interface AgentConfigurableProvider {
  provider: string;
  displayName: string;
  settingsNs: string;
  settingsPath: string[];
  active: boolean;
  custom?: boolean;
}

export interface AgentSettingsNamespace {
  ns: string;
  revision: string | number;
  value: unknown;
  user: unknown;
  base: unknown;
  schema?: unknown;
  secrets?: Array<{ path: string[]; set: boolean }>;
}

export interface AgentSettingsDescription {
  writable: boolean;
  namespaces: AgentSettingsNamespace[];
}

export interface AgentCredentialState {
  configured: boolean;
  source?: string;
  writable: boolean;
}

export interface AgentProviderProfileSaveRequest {
  settingsNs: string;
  settingsPath: string[];
  profile: Record<string, unknown>;
  expectedRevision: string | number;
  credentialRef?: string;
  credentialValue?: string;
}

export type AgentEngine = "foodlab_runtime" | "codex_app_server";

export interface AgentModelSelection {
  engine?: AgentEngine;
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AgentModelRoute extends AgentModelSelection {
  engine: AgentEngine;
}

export interface AgentModelCatalogItem {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: {
    efforts?: Array<{ id: string; name?: string; description?: string }>;
    defaultEffort?: string;
  };
  inputModalities?: Array<"text" | "image">;
  capabilityStatus?: "known" | "probed" | "unknown";
  capabilitySource?: "catalog" | "runtime_probe" | "unknown";
  capabilityKey?: string;
}

export interface AgentModelProviderGroup {
  engine?: AgentEngine;
  provider: string;
  displayName?: string;
  models: AgentModelCatalogItem[];
}

export interface AgentModelDirectory {
  current: AgentModelSelection;
  routable: boolean;
  hasUsableProvider: boolean;
  currentUsable: boolean;
  groups: AgentModelProviderGroup[];
  failures: Array<{ provider?: string; message?: string }>;
}

export type TaskOutcome =
  | "running"
  | "needs_input"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type HarnessTaskListScope = "active" | "archived";

export interface TaskContract {
  workflow: string;
  allowedTools: string[];
  requiredSteps: string[];
  requiredArtifactKinds: string[];
  approvalPolicy: "automatic" | "review_before_commit";
  completionPredicate: string;
}

export interface ContentColumn {
  key: string;
  label: string;
}

export interface ContentSource {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
}

export type FoodLabContentBlock =
  | { type: "markdown"; text: string }
  | { type: "table"; columns: ContentColumn[]; rows: unknown[][] }
  | { type: "citations"; sources: ContentSource[] }
  | {
      type: "question";
      prompt: string;
      choices: Array<{ id: string; label: string }>;
    }
  | { type: "artifact_ref"; artifactId: string }
  | { type: "action"; action: string; requiresApproval: boolean };

export interface HarnessTask {
  id: string;
  harnessSessionId: string | null;
  title: string;
  workflow: string;
  status: TaskOutcome;
  taskContract: TaskContract;
  activeRecipeId: string | null;
  activeRecipeName?: string | null;
  lastEventSeq: number;
  errorCode: string | null;
  errorSummary: string | null;
  activeRoute: AgentModelRoute;
  activeLeafTurnId?: string | null;
  queuePaused?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessTurn {
  id: string;
  taskId: string;
  harnessTurnId: string | null;
  parentTurnId: string | null;
  branchId?: string;
  status: TaskOutcome;
  userContent: string;
  contentBlocks: FoodLabContentBlock[];
  route: AgentModelRoute;
  recipeId?: string | null;
  recipeName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentDeliveryMode = "queue" | "steer";

export interface AgentRecipeReference {
  recipeId: string;
  recipeName: string;
}

export interface AgentQueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  references: AgentRecipeReference[];
  mode: AgentDeliveryMode;
  state: "queued" | "steering";
  route: AgentModelRoute;
  recipeId: string | null;
  recipeName: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConversationView {
  conversation: HarnessTask;
  activeTurns: HarnessTurn[];
  queuedMessages: AgentQueuedMessage[];
  queuePaused: boolean;
}

export interface AgentRecipeMatch {
  recipeId: string;
  recipeName: string;
  code: string | null;
  productId: string;
  schemeName: string;
  updatedAt: string;
}

export interface AgentRecipeMatchResult {
  kind: "none" | "unique" | "ambiguous";
  matches: AgentRecipeMatch[];
}

export interface HarnessTaskEvent {
  taskId: string;
  seq: number;
  eventType: string;
  turnId: string | null;
  stepId: string | null;
  callId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface ArtifactManifest {
  id: string;
  taskId: string;
  turnId: string;
  toolCallId: string | null;
  kind: string;
  title: string;
  domainRef: string | null;
  logicalPath: string | null;
  mimeType: string | null;
  sha256: string | null;
  byteSize: number | null;
  status: "needs_input" | "needs_review" | "accepted" | "rejected" | "stale";
  provenance: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyResetPreview {
  previewId: string;
  counts: Array<{ kind: string; count: number }>;
  filePaths: string[];
  keychainAccounts: string[];
  conflicts: string[];
  confirmationPhrase: string;
  canExecute: boolean;
}

export interface LegacyResetResult {
  previewId: string;
  deletedRecords: number;
  deletedFiles: number;
  clearedKeychainAccounts: number;
  cleanupFailures: string[];
}
