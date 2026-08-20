import { describe, expect, it } from "vitest";

import type { AgentProviderConfig } from "../../api/agent-types";
import { editableProvider } from "./provider-utils";

describe("editableProvider", () => {
  it("fills the current DeepSeek agent model when an old saved config is blank", () => {
    const provider = {
      id: "deepseek",
      kind: "deepseek",
      displayName: "DeepSeek",
      protocol: "openai_compatible",
      endpoint: "https://api.deepseek.com",
      model: "",
      contextWindow: 128_000,
      reasoningEffort: "auto",
      timeoutSeconds: 120,
      executablePath: null,
      enabled: false,
      hasSecret: true,
      capabilities: {
        text: true,
        images: false,
        tools: true,
        structuredOutput: true,
        streaming: true,
        nativeWebSearch: false,
      },
      updatedAt: "2026-08-09T00:00:00Z",
    } satisfies AgentProviderConfig;

    expect(editableProvider(provider).model).toBe("deepseek-v4-flash");
  });

  it("preserves a user-selected DeepSeek model", () => {
    const provider = {
      id: "deepseek",
      kind: "deepseek",
      displayName: "DeepSeek",
      protocol: "openai_compatible",
      endpoint: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      contextWindow: 128_000,
      reasoningEffort: "auto",
      timeoutSeconds: 120,
      executablePath: null,
      enabled: false,
      hasSecret: true,
      capabilities: {
        text: true,
        images: false,
        tools: true,
        structuredOutput: true,
        streaming: true,
        nativeWebSearch: false,
      },
      updatedAt: "2026-08-09T00:00:00Z",
    } satisfies AgentProviderConfig;

    expect(editableProvider(provider).model).toBe("deepseek-v4-pro");
  });
});
