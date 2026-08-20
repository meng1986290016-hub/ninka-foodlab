import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { BrowserAgentEventSource } from "../../api/agent-event-source";
import type { AgentRun, AgentRunRequest } from "../../api/agent-types";
import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { ImportFileReference } from "../../api/import-types";
import { AgentPanel } from "./AgentPanel";
import { recipeDraftFingerprint } from "../recipes/recipe-agent-analysis";
import type { AgentRecipeEstimateCard } from "../../api/rnd-reference-types";

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

function picker(files: ImportFileReference[] = []): ImportFilePicker {
  return {
    async pickSources() {
      return files;
    },
    async pickDestination() {
      return null;
    },
  };
}

function setup() {
  const events = new BrowserAgentEventSource();
  const api = new BrowserDemoApi({
    storage: new MemoryStorage(),
    agentEvents: events,
    now: () => "2026-07-30T18:00:00.000Z",
  });
  return { api, events };
}

class ControlledRunApi extends BrowserDemoApi {
  readonly requests: AgentRunRequest[] = [];
  private visibleRun: AgentRun | null = null;

  override async startAgentRun(request: AgentRunRequest) {
    this.requests.push(request);
    if (request.retryRunId) {
      this.visibleRun = {
        ...this.visibleRun!,
        id: "retried-run",
        status: "completed",
        errorCode: null,
        errorSummary: null,
      };
      return this.visibleRun;
    }
    const persisted = await super.startAgentRun(request);
    this.visibleRun = { ...persisted, status: "running" };
    return this.visibleRun;
  }

  override async cancelAgentRun(id: string) {
    if (!this.visibleRun || this.visibleRun.id !== id) {
      return super.cancelAgentRun(id);
    }
    this.visibleRun = {
      ...this.visibleRun,
      status: "cancelled",
      errorCode: "cancelled",
      errorSummary: "用户已取消本次 Agent 任务",
    };
    return this.visibleRun;
  }

  override async getAgentRun(id: string) {
    if (this.visibleRun?.id === id) return this.visibleRun;
    return super.getAgentRun(id);
  }
}

class FailedDraftRunApi extends BrowserDemoApi {
  readonly requests: AgentRunRequest[] = [];
  private visibleRun: AgentRun | null = null;

  async seedFailedDraft() {
    const conversation = await this.createAgentConversation("原料识别测试");
    const completed = await super.startAgentRun({
      conversationId: conversation.id,
      content: "请识别这份原料资料",
      files: [
        {
          kind: "browser_demo",
          value: "乳粉标签.png",
          mediaType: "image/png",
        },
      ],
    });
    this.visibleRun = {
      ...completed,
      status: "failed",
      errorCode: "provider_timeout",
      errorSummary: "模型在整理最终回复时超时",
    };
    return this.visibleRun;
  }

  override async startAgentRun(request: AgentRunRequest) {
    this.requests.push(request);
    if (request.retryRunId && this.visibleRun) {
      this.visibleRun = {
        ...this.visibleRun,
        status: "completed",
        errorCode: null,
        errorSummary: null,
      };
      return this.visibleRun;
    }
    return super.startAgentRun(request);
  }

  override async getAgentRun(id: string) {
    if (this.visibleRun?.id === id) return this.visibleRun;
    return super.getAgentRun(id);
  }
}

class EstimateCardApi extends BrowserDemoApi {
  estimateCard: AgentRecipeEstimateCard | null = null;

  override async listAgentRecipeEstimateCards(_conversationId: string) {
    return this.estimateCard ? [this.estimateCard] : [];
  }
}

describe("AgentPanel", () => {
  it("shows the thinking orb while the browser demo response is pending", async () => {
    const events = new BrowserAgentEventSource();
    const api = new BrowserDemoApi({
      storage: new MemoryStorage(),
      agentEvents: events,
      agentResponseDelayMs: 2_000,
      now: () => "2026-08-09T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.type(
      await screen.findByRole("textbox", {
        name: "给食品研发 Agent 发消息",
      }),
      "帮我检查这份配方",
    );
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("正在思考")).toBeTruthy();
    expect(screen.getByText("帮我检查这份配方")).toBeTruthy();
    expect(
      await screen.findByText(
        /我已结合原料库中的具体供应商版本生成配方提案/,
        {},
        { timeout: 4_000 },
      ),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("正在思考")).toBeNull());
  });

  it("offers common food R&D tasks and fills the composer for review", async () => {
    const { api, events } = setup();
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    expect(await screen.findByText("你想先做什么？")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /设计新产品/ }));

    expect(
      (
        screen.getByRole("textbox", {
          name: "给食品研发 Agent 发消息",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("我想设计一款新产品");
    expect(screen.getByText("人工复核后才会写入原料库或创建配方草稿")).toBeTruthy();
  });

  it("keeps the same conversation after closing, navigating, and reopening", async () => {
    const { api, events } = setup();
    const user = userEvent.setup();
    render(<App api={api} agentEvents={events} filePicker={picker()} />);

    await user.click(
      screen.getByRole("button", { name: "打开食品研发 Agent" }),
    );
    const composer = await screen.findByRole("textbox", {
      name: "给食品研发 Agent 发消息",
    });
    await user.type(composer, "读取原料资料");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("读取原料资料")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "关闭食品研发 Agent" }),
    );
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(
      screen.getByRole("button", { name: "打开食品研发 Agent" }),
    );
    expect(await screen.findByText("读取原料资料")).toBeTruthy();
  });

  it("shows a configuration action without breaking manual features", async () => {
    const { api, events } = setup();
    const providers = await api.listAgentProviderConfigs();
    const active = providers.find((provider) => provider.enabled)!;
    await api.saveAgentProviderConfig({ ...active, enabled: false });

    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    expect(
      await screen.findByRole("button", { name: "配置大模型" }),
    ).toBeTruthy();
    expect(screen.getByText("原料库和表格导入仍可正常使用。")).toBeTruthy();
  });

  it("requires confirmation before sending attachments to a remote model", async () => {
    const { api, events } = setup();
    const openai = (await api.listAgentProviderConfigs()).find(
      (provider) => provider.id === "openai",
    )!;
    await api.saveAgentProviderConfig({
      ...openai,
      enabled: true,
      endpoint: "https://api.example.test/v1",
      model: "gpt-food-test",
    });
    await api.setAgentProviderSecret({
      providerId: "openai",
      apiKey: "test-key",
    });
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker([
          {
            kind: "browser_demo",
            value: "乳粉标签.png",
            mediaType: "image/png",
          },
          {
            kind: "browser_demo",
            value: "乳粉规格书.pdf",
            mediaType: "application/pdf",
          },
        ])}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "添加原料资料" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "给食品研发 Agent 发消息" }),
      "分别读取这些资料",
    );
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(
      await screen.findByText(
        "这些资料将发送给当前配置的模型服务：OpenAI",
      ),
    ).toBeTruthy();
    expect(
      (await api.listAgentConversations()).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (await api.listAgentMessages((await api.listAgentConversations())[0]!.id))
        .length,
    ).toBe(0);

    await user.click(screen.getByRole("button", { name: "确认发送" }));
    await waitFor(async () => {
      const conversation = (await api.listAgentConversations())[0]!;
      expect(await api.listAgentMessages(conversation.id)).toHaveLength(2);
    });
  });

  it("stops a running task and retries with the original run reference", async () => {
    const events = new BrowserAgentEventSource();
    const api = new ControlledRunApi({
      storage: new MemoryStorage(),
      now: () => "2026-07-30T18:00:00.000Z",
    });
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.type(
      await screen.findByRole("textbox", {
        name: "给食品研发 Agent 发消息",
      }),
      "重新检查这份原料",
    );
    await user.click(screen.getByRole("button", { name: "发送" }));
    await user.click(await screen.findByRole("button", { name: "停止" }));
    await user.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(api.requests).toHaveLength(2));
    expect(api.requests[1]).toMatchObject({
      content: "重新检查这份原料",
      files: [],
      retryRunId: expect.any(String),
    });
  });

  it("retries a draft from an older failed run instead of rejecting it", async () => {
    const events = new BrowserAgentEventSource();
    const api = new FailedDraftRunApi({
      storage: new MemoryStorage(),
      agentEvents: events,
      now: () => "2026-08-09T12:00:00.000Z",
    });
    const failedRun = await api.seedFailedDraft();
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "重新识别" }),
    );

    await waitFor(() => expect(api.requests).toHaveLength(1));
    expect(api.requests[0]).toMatchObject({
      content: expect.stringContaining("请重新读取草稿"),
      files: [],
      retryRunId: failedRun.id,
    });
  });

  it("reviews the current recipe notes without creating or changing a formula", async () => {
    const { api, events } = setup();
    const recipe = await api.createRecipe({
      name: "复盘测试冰淇淋",
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
      markdownNotes: "本轮降低甜度，口感偏硬。",
      calculation: null,
      calculationIssues: [],
    });
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
        recipeContext={{
          recipe,
          draft,
          referencedVersions: [],
          nutrientDefinitions: await api.listNutrientDefinitions(),
          readOnly: false,
          draftFingerprint: recipeDraftFingerprint(draft),
          applyIngredientSubstitution: () => {},
          appendResearchNotes: async () => {},
          saveDraftNow: async () => {},
        }}
      />,
    );

    const reviewButton = await screen.findByRole("button", {
      name: "复盘研发记录",
    });
    await waitFor(() =>
      expect((reviewButton as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(reviewButton);

    expect(
      await screen.findByText(/研发复盘（仅基于当前草稿）/),
    ).toBeTruthy();
    expect(screen.getByText(/本轮降低甜度，口感偏硬/)).toBeTruthy();
    expect(await api.listRecipeVersions(recipe.id)).toHaveLength(0);
    expect((await api.getRecipeDraft(recipe.id))?.markdownNotes).toBe(
      "本轮降低甜度，口感偏硬。",
    );
  });

  it("shows estimate evidence and requires an editable preview before appending notes", async () => {
    const events = new BrowserAgentEventSource();
    const api = new EstimateCardApi({
      storage: new MemoryStorage(),
      agentEvents: events,
      now: () => "2026-08-20T10:00:00.000Z",
    });
    const recipe = await api.createRecipe({
      name: "甜度卡片测试",
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
      markdownNotes: "",
      calculation: null,
      calculationIssues: [],
    });
    api.estimateCard = {
      id: "estimate-card-1",
      conversationId: "conversation-any",
      runId: "run-1",
      recipeId: recipe.id,
      recipeName: recipe.name,
      sourceDraftUpdatedAt: draft.updatedAt,
      sourceDraftFingerprint: recipeDraftFingerprint(draft),
      status: "ready",
      parameterKey: "relative_sweetness",
      title: "当前配方甜度参考估算",
      estimatedValue: "10",
      minimumValue: "9",
      maximumValue: "11",
      unit: "g_sucrose_equivalent_per_100g",
      basis: "finished_product_100g",
      confidence: "medium",
      formulaInputs: [
        {
          label: "白砂糖",
          amount: "100",
          unit: "g",
          referenceCardId: "sweetness-sucrose",
        },
      ],
      citedReferenceCardIds: ["sweetness-sucrose"],
      calculationSummary: "按当前出成重量折算。",
      assumptions: ["白砂糖按蔗糖纯品处理"],
      influencingFactors: ["产品基质"],
      missingInputs: [],
      conflict: null,
      notePreview: "### Agent 当前配方参考估算\n- 当前估计：10 g 蔗糖当量 / 100 g",
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };
    const appendResearchNotes = vi.fn(
      async (_expectedDraftUpdatedAt: string, _appendText: string) => {},
    );
    const user = userEvent.setup();
    render(
      <AgentPanel
        api={api}
        events={events}
        filePicker={picker()}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
        recipeContext={{
          recipe,
          draft,
          referencedVersions: [],
          nutrientDefinitions: await api.listNutrientDefinitions(),
          readOnly: false,
          draftFingerprint: recipeDraftFingerprint(draft),
          applyIngredientSubstitution: () => {},
          appendResearchNotes,
          saveDraftNow: async () => {},
        }}
      />,
    );

    expect(
      await screen.findByText("当前配方甜度参考估算"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "查看参考卡" }));
    expect(
      await screen.findByRole("dialog", { name: "研发参考资料库" }),
    ).toBeTruthy();
    expect(screen.getAllByText("蔗糖相对甜度基准").length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole("button", { name: "关闭研发参考资料库" }),
    );

    await user.click(screen.getByRole("button", { name: "加入研发备注" }));
    const preview = await screen.findByRole("textbox", {
      name: "待追加的研发备注",
    });
    await user.type(preview, "\n- 人工补充：已复核");
    expect(appendResearchNotes).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认追加" }));
    await waitFor(() => expect(appendResearchNotes).toHaveBeenCalledTimes(1));
    expect(appendResearchNotes.mock.calls[0]?.[0]).toBe(draft.updatedAt);
    expect(appendResearchNotes.mock.calls[0]?.[1]).toContain("人工补充：已复核");
  });
});
