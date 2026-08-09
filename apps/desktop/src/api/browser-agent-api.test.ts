import { describe, expect, it, vi } from "vitest";

import { BrowserAgentEventSource } from "./agent-event-source";
import { BrowserDemoApi } from "./browser-demo-api";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("BrowserDemoApi Agent", () => {
  it("keeps a delayed demo run visible before emitting its completed response", async () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const events = new BrowserAgentEventSource();
      const listener = vi.fn();
      await events.subscribe(listener);
      const api = new BrowserDemoApi({
        storage,
        agentEvents: events,
        agentResponseDelayMs: 900,
        now: () => "2026-08-09T12:00:00.000Z",
      });
      const conversation = await api.createAgentConversation("动效测试");

      const run = await api.startAgentRun({
        conversationId: conversation.id,
        content: "帮我检查这份配方",
        files: [],
      });

      expect(run.status).toBe("running");
      expect(await api.listAgentMessages(conversation.id)).toHaveLength(1);
      expect(listener).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(900);

      expect((await api.getAgentRun(run.id)).status).toBe("completed");
      expect(await api.listAgentMessages(conversation.id)).toHaveLength(2);
      expect(listener).toHaveBeenCalledWith({
        type: "run_completed",
        runId: run.id,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("recognizes multiple demo files into separate review drafts without network access", async () => {
    const storage = new MemoryStorage();
    const events = new BrowserAgentEventSource();
    const listener = vi.fn();
    await events.subscribe(listener);
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      agentEvents: events,
      createId: () => `agent-${++sequence}`,
      now: () => "2026-07-30T08:00:00.000Z",
    });
    const fetch = vi.spyOn(globalThis, "fetch");
    const conversation = await api.createAgentConversation("原料识别");

    const run = await api.startAgentRun({
      conversationId: conversation.id,
      content: "分别读取并建立原料草稿",
      files: [
        { kind: "browser_demo", value: "脱脂乳粉A.xlsx" },
        { kind: "browser_demo", value: "脱脂乳粉B.pdf" },
      ],
    });

    expect(run.status).toBe("completed");
    expect(await api.listAgentImportDrafts(run.id)).toHaveLength(2);
    expect(
      (await api.listAgentMessages(conversation.id)).at(-1)?.content,
    ).toBe("已分别识别 2 份原料资料，并生成 2 张待人工复核草稿。");
    expect(listener).toHaveBeenCalledWith({
      type: "drafts_changed",
      runId: run.id,
      importJobId: run.importJobId,
    });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("persists provider settings but never stores the submitted API key", async () => {
    const storage = new MemoryStorage();
    const api = new BrowserDemoApi({
      storage,
      now: () => "2026-07-30T08:00:00.000Z",
    });

    await api.setAgentProviderSecret({
      providerId: "deepseek",
      apiKey: "browser-test-secret",
    });

    expect(
      (await api.listAgentProviderConfigs()).find(
        (provider) => provider.id === "deepseek",
      )?.hasSecret,
    ).toBe(true);
    expect(storage.getItem("food-rd.browser-demo.v8")).not.toContain(
      "browser-test-secret",
    );
  });

  it("creates a deterministic review proposal and only adds a recipe after acceptance", async () => {
    const storage = new MemoryStorage();
    const events = new BrowserAgentEventSource();
    const listener = vi.fn();
    await events.subscribe(listener);
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      agentEvents: events,
      createId: () => `proposal-${++sequence}`,
      now: () => "2026-08-02T08:00:00.000Z",
    });
    const conversation = await api.createAgentConversation("产品设计");

    const run = await api.startAgentRun({
      conversationId: conversation.id,
      content: "我想做一个低糖产品，请根据营养要求设计配方",
      files: [],
    });
    const proposals = await api.listAgentRecipeProposals(conversation.id);

    expect(await api.listRecipes()).toEqual([]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: "pending_review",
      payload: {
        mode: "goal_design",
        yieldAssumption: "assumed_100_percent",
      },
      evaluation: {
        calculation: expect.objectContaining({ inputMassGrams: expect.any(String) }),
      },
    });
    expect(listener).toHaveBeenCalledWith({
      type: "recipe_proposals_changed",
      runId: run.id,
    });

    const accepted = await api.acceptAgentRecipeProposal({
      proposalId: proposals[0]!.id,
      destination: { kind: "new_product" },
    });
    const draft = await api.getRecipeDraft(accepted.recipe.id);
    expect(await api.listRecipes()).toHaveLength(1);
    expect(accepted.materialNeeds).toHaveLength(1);
    expect(draft?.source).toBe("agent");
    expect(draft?.items.some((item) => item.kind === "material_need")).toBe(true);
  });

  it("returns a read-only recipe retrospective instead of creating another proposal", async () => {
    const storage = new MemoryStorage();
    const api = new BrowserDemoApi({
      storage,
      now: () => "2026-08-03T08:00:00.000Z",
    });
    const recipe = await api.createRecipe({
      name: "研发复盘测试",
      code: null,
      tags: [],
      kind: "formula",
    });
    const draft = await api.saveRecipeDraft({
      recipeId: recipe.id,
      basedOnVersionId: null,
      source: "manual",
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "甜度降低后口感偏硬。",
      calculation: null,
      calculationIssues: [],
    });
    const conversation = await api.createAgentConversation("研发复盘");

    await api.startAgentRun({
      conversationId: conversation.id,
      content: "请复盘当前配方，并给出下一轮打样建议",
      files: [],
      recipeContext: {
        recipeId: recipe.id,
        recipeName: recipe.name,
        draftFingerprint: draft.updatedAt,
      },
    });

    const response = (await api.listAgentMessages(conversation.id)).at(-1)?.content;
    expect(response).toContain("研发复盘（仅基于当前草稿）");
    expect(response).toContain("甜度降低后口感偏硬");
    expect(response).toContain("下一轮打样建议");
    expect(await api.listAgentRecipeProposals(conversation.id)).toHaveLength(0);
    expect((await api.getRecipeDraft(recipe.id))?.markdownNotes).toBe(
      "甜度降低后口感偏硬。",
    );
  });
});
