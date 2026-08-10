import type {
  AgentProviderConfig,
  AgentProviderConfigInput,
} from "../../api/agent-types";

export function editableProvider(
  provider: AgentProviderConfig,
): AgentProviderConfigInput {
  const { hasSecret: _hasSecret, updatedAt: _updatedAt, ...input } = provider;
  if (!input.model.trim() && provider.kind === "deepseek") {
    return { ...input, model: "deepseek-v4-flash" };
  }
  return input;
}

export function isCliProvider(provider: AgentProviderConfig) {
  return (
    provider.kind === "codex_cli" || provider.kind === "claude_code_cli"
  );
}

export function needsApiKey(provider: AgentProviderConfig) {
  return !isCliProvider(provider) && provider.kind !== "ollama";
}

export function canRunIngredientAgent(provider: AgentProviderConfig) {
  return provider.capabilities.tools && provider.capabilities.structuredOutput;
}
