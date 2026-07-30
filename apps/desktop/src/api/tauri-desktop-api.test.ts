import { describe, expect, it, vi } from "vitest";

import { TauriDesktopApi } from "./tauri-desktop-api";
import { DesktopApiError } from "./types";

describe("TauriDesktopApi", () => {
  it("creates an ingredient import job with the stable native command payload", async () => {
    const invoke = vi.fn().mockResolvedValue({ id: "job-1" });
    const api = new TauriDesktopApi(invoke);

    await api.createIngredientImportJob({
      sourceKind: "spreadsheet",
      files: [{ kind: "native_path", value: "/selected/import.xlsx" }],
    });

    expect(invoke).toHaveBeenCalledWith("create_ingredient_import_job", {
      request: {
        sourceKind: "spreadsheet",
        files: [{ kind: "native_path", value: "/selected/import.xlsx" }],
      },
    });
  });

  it("uses camel-case Agent payloads and sends API keys only to the secret command", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);
    const provider = {
      id: "provider-openai",
      kind: "openai" as const,
      displayName: "OpenAI",
      protocol: "openai_responses" as const,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-5.5",
      contextWindow: 128_000,
      reasoningEffort: "auto" as const,
      timeoutSeconds: 120,
      executablePath: null,
      enabled: true,
      capabilities: {
        text: true,
        images: true,
        tools: true,
        structuredOutput: true,
        streaming: true,
      },
    };

    await api.saveAgentProviderConfig(provider);
    await api.setAgentProviderSecret({
      providerId: provider.id,
      apiKey: "test-only-secret",
    });
    await api.testAgentProvider(provider.id, "structured_output");
    await api.startAgentRun({
      conversationId: "conversation-1",
      content: "读取这些原料资料",
      files: [{ kind: "browser_demo", value: "乳粉规格书.pdf" }],
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "save_agent_provider_config", {
      input: provider,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "set_agent_provider_secret", {
      input: {
        providerId: "provider-openai",
        apiKey: "test-only-secret",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "test_agent_provider", {
      providerId: "provider-openai",
      kind: "structured_output",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "start_agent_run", {
      request: {
        conversationId: "conversation-1",
        content: "读取这些原料资料",
        files: [{ kind: "browser_demo", value: "乳粉规格书.pdf" }],
      },
    });

    const callsContainingSecret = invoke.mock.calls.filter(([, args]) =>
      JSON.stringify(args).includes("test-only-secret"),
    );
    expect(callsContainingSecret).toEqual([
      [
        "set_agent_provider_secret",
        {
          input: {
            providerId: "provider-openai",
            apiKey: "test-only-secret",
          },
        },
      ],
    ]);
  });

  it("maps the complete Agent metadata and conversation command contract", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);
    const preferences = {
      enabled: true,
      visionProviderConfigId: "provider-vision",
    };

    await api.getAgentPreferences();
    await api.saveAgentPreferences(preferences);
    await api.listAgentProviderConfigs();
    await api.clearAgentProviderSecret("provider-1");
    await api.listAgentProviderModels("provider-1");
    await api.detectCliProviders();
    await api.listAgentConversations();
    await api.createAgentConversation("乳粉资料分析");
    await api.deleteAgentConversation("conversation-1");
    await api.listAgentMessages("conversation-1");
    await api.cancelAgentRun("run-1");
    await api.getAgentRun("run-1");
    await api.listAgentImportDrafts("run-1");

    expect(invoke.mock.calls).toEqual([
      ["get_agent_preferences", undefined],
      ["save_agent_preferences", { input: preferences }],
      ["list_agent_provider_configs", undefined],
      ["clear_agent_provider_secret", { providerId: "provider-1" }],
      ["list_agent_provider_models", { providerId: "provider-1" }],
      ["detect_cli_providers", undefined],
      ["list_agent_conversations", undefined],
      ["create_agent_conversation", { title: "乳粉资料分析" }],
      ["delete_agent_conversation", { id: "conversation-1" }],
      ["list_agent_messages", { conversationId: "conversation-1" }],
      ["cancel_agent_run", { id: "run-1" }],
      ["get_agent_run", { id: "run-1" }],
      ["list_agent_import_drafts", { runId: "run-1" }],
    ]);
  });

  it("uses the grouped material list command contract", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const api = new TauriDesktopApi(invoke);

    await api.listMaterialGroups("乳粉");

    expect(invoke).toHaveBeenCalledWith("list_material_groups", {
      query: "乳粉",
    });
  });

  it("saves a supplier variant without a client-controlled update date", async () => {
    const invoke = vi.fn().mockResolvedValue({ id: "variant-1" });
    const api = new TauriDesktopApi(invoke);
    const input = {
      materialGroupId: "material-1",
      supplierId: "supplier-1",
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: "31.50",
      priceUnit: "kg" as const,
      densityGPerMl: null,
      source: "供应商规格书",
      researchNotes: "溶解性好",
      nutrition: {
        basis: "per_100g" as const,
        values: [{ nutrientDefinitionId: "protein", value: "34.0" }],
      },
    };

    await api.saveIngredientVariant(input);

    expect(invoke).toHaveBeenCalledWith("save_ingredient_variant", { input });
    expect(invoke.mock.calls[0]?.[1]?.input).not.toHaveProperty("updatedAt");
  });

  it("maps comparison and versioned drafts to camel-case payloads", async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const api = new TauriDesktopApi(invoke);

    await api.compareIngredientVariants("material-1", ["variant-1", "variant-2"]);
    await api.saveDraft("ingredient-variant-editor", "new:material-1", 2, {
      currentPrice: "31.50",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "compare_ingredient_variants", {
      materialGroupId: "material-1",
      variantIds: ["variant-1", "variant-2"],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "save_draft", {
      kind: "ingredient-variant-editor",
      key: "new:material-1",
      payloadVersion: 2,
      payload: { currentPrice: "31.50" },
    });
  });

  it("maps structured native failures without exposing storage details", async () => {
    const invoke = vi.fn().mockRejectedValue({
      code: "storage_failure",
      message: "数据库操作失败",
      field: null,
    });
    const api = new TauriDesktopApi(invoke);

    const failure = await api.listCategories().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DesktopApiError);
    expect(failure).toMatchObject({
      code: "storage_failure",
      message: "数据库操作失败",
    });
  });

  it("uses the stable list command contract", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const api = new TauriDesktopApi(invoke);

    await api.listIngredients({ query: "乳粉" });

    expect(invoke).toHaveBeenCalledWith("list_ingredients", {
      request: { query: "乳粉" },
    });
  });

  it("uses the stable create command contract", async () => {
    const invoke = vi.fn().mockResolvedValue({ id: "ingredient-1" });
    const api = new TauriDesktopApi(invoke);
    const input = {
      name: "白砂糖",
      internalCode: "RM-0001",
      category: "甜味原料",
      tags: [],
      notes: "",
      densityGPerMl: null,
      currentPrice: "6.80",
      priceUnit: "kg" as const,
      priceUpdatedAt: "2026-07-16",
      source: "供应商规格书",
      sourceDate: "2026-07-10",
    };

    await api.createIngredient(input);

    expect(invoke).toHaveBeenCalledWith("create_ingredient", { input });
  });
});
