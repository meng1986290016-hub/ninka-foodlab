import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserAgentEventSource } from "../../api/agent-event-source";
import type {
  HarnessHealth,
  HarnessTask,
  HarnessTaskEvent,
  HarnessTurn,
} from "../../api/agent-harness-types";
import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import { HarnessAgentPanel } from "./HarnessAgentPanel";

const task: HarnessTask = {
  id: "task-1",
  harnessSessionId: "task-1",
  title: "标签审核",
  workflow: "label_compliance",
  status: "needs_input",
  taskContract: {
    workflow: "label_compliance",
    allowedTools: ["diagnose_recipe", "web_search"],
    requiredSteps: ["diagnose_recipe"],
    requiredArtifactKinds: ["label_compliance_review"],
    approvalPolicy: "review_before_commit",
    completionPredicate: "formal evidence is required",
  },
  activeRecipeId: null,
  lastEventSeq: 4,
  errorCode: null,
  errorSummary: null,
  activeRoute: { engine: "foodlab_runtime", provider: "mock", model: "mock-model" },
  archivedAt: null,
  createdAt: "2026-08-20T00:00:00Z",
  updatedAt: "2026-08-20T00:00:00Z",
};

const firstTurn: HarnessTurn = {
  id: "turn-1",
  taskId: task.id,
  harnessTurnId: "0",
  parentTurnId: null,
  status: "needs_input",
  userContent: "审核标签",
  contentBlocks: [
    {
      type: "markdown",
      text: "| 项目 | 状态 |\n| --- | --- |\n| 产品范围 | 待确认 |\n\n[官方入口](https://openstd.samr.gov.cn/)",
    },
    { type: "question", prompt: "是否为国产普通预包装食品？", choices: [] },
  ],
  route: { engine: "foodlab_runtime", provider: "mock", model: "mock-model" },
  createdAt: "2026-08-20T00:00:00Z",
  updatedAt: "2026-08-20T00:00:00Z",
};

class HarnessPanelApi extends BrowserDemoApi {
  readonly turnRequests: Array<{
    taskId: string;
    parentTurnId?: string | null;
    content: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }> = [];
  readonly selectedRoutes: Array<{ engine?: "foodlab_runtime" | "codex_app_server"; provider: string; model: string }> = [];
  readonly renamedTasks: Array<{ taskId: string; title: string }> = [];
  private turns = [firstTurn];
  private taskState = task;

  override async getHarnessHealth(): Promise<HarnessHealth> {
    return {
      status: "ready",
      lastError: null,
      reinstallRequired: false,
    };
  }

  override async getAgentModelDirectory() {
    return {
      current: { provider: "mock", model: "mock-model" },
      routable: true,
      hasUsableProvider: true,
      currentUsable: true,
      groups: [
        { provider: "mock", models: [{ id: "mock-model" }] },
        { provider: "alternate", displayName: "备用 Provider", models: [{ id: "alternate-model" }] },
      ],
      failures: [],
    };
  }

  override async listHarnessTasks(scope: "active" | "archived" = "active") {
    const archived = this.taskState.archivedAt != null;
    return scope === "archived" ? (archived ? [this.taskState] : []) : (archived ? [] : [this.taskState]);
  }

  override async listHarnessTurns() {
    return [...this.turns];
  }

  override async listHarnessArtifacts() {
    return [];
  }

  override async listRecipes() {
    return [{
      recipe: {
        id: "recipe-icecream",
        name: "冰淇淋基底",
        code: "IC-001",
        tags: [],
        kind: "formula" as const,
        currentDraftId: "draft-icecream",
        latestVersionNumber: 1,
        createdAt: "2026-08-20T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
        archivedAt: null,
      },
      draftUpdatedAt: "2026-08-20T00:00:00Z",
      latestVersion: null,
      referencedByCount: 0,
    }];
  }

  override async listHarnessEvents(): Promise<HarnessTaskEvent[]> {
    return [{
      taskId: task.id,
      seq: 2,
      eventType: "tool/call",
      turnId: firstTurn.id,
      stepId: "0",
      callId: "call-1",
      payload: {
        data: {
          name: "mcp__food_rd__diagnose_recipe",
          argumentsRedacted: true,
        },
      },
      createdAt: "2026-08-20T00:00:01Z",
    }];
  }

  override async createHarnessTurn(input: {
    taskId: string;
    parentTurnId?: string | null;
    content: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }) {
    this.turnRequests.push(input);
    const next: HarnessTurn = {
      ...firstTurn,
      id: "turn-2",
      harnessTurnId: null,
      parentTurnId: input.parentTurnId ?? null,
      status: "running",
      userContent: input.content,
      contentBlocks: [],
      route: task.activeRoute,
    };
    this.turns = [...this.turns, next];
    return next;
  }

  override async syncHarnessTask() {
    return task;
  }

  override async selectHarnessTaskModel(input: {
    taskId: string;
    engine: "foodlab_runtime" | "codex_app_server";
    provider: string;
    model: string;
  }) {
    this.selectedRoutes.push(input);
    return { ...task, activeRoute: { engine: input.engine, provider: input.provider, model: input.model } };
  }

  override async selectAgentDefaultModel(input: {
    engine?: "foodlab_runtime" | "codex_app_server";
    provider: string;
    model: string;
  }) {
    this.selectedRoutes.push(input);
    return { selected: input };
  }

  override async renameHarnessTask(taskId: string, title: string) {
    this.renamedTasks.push({ taskId, title });
    this.taskState = { ...this.taskState, title };
    return this.taskState;
  }

  override async archiveHarnessTask() {
    this.taskState = { ...this.taskState, archivedAt: "2026-08-22T00:00:00Z" };
    return this.taskState;
  }

  override async restoreHarnessTask() {
    this.taskState = { ...this.taskState, archivedAt: null, queuePaused: true };
    return this.taskState;
  }
}

class FailingRuntimeApi extends HarnessPanelApi {
  override async getHarnessHealth(): Promise<HarnessHealth> {
    return { status: "idle", lastError: null, reinstallRequired: false };
  }

  override async startHarness(): Promise<HarnessHealth> {
    throw new Error("Agent 服务启动失败，请重试");
  }
}

const filePicker: ImportFilePicker = {
  async pickSources() { return []; },
  async pickDestination() { return null; },
};

describe("HarnessAgentPanel", () => {
  it("replaces the connecting placeholder with a retryable startup failure", async () => {
    const api = new FailingRuntimeApi({ storage: window.localStorage });
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={filePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    expect(await screen.findByText("Agent 服务启动失败，请重试")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
    expect(screen.queryByText("正在连接 Agent 服务，已有会话仍可查看。")).toBeNull();
  });

  it("renders GFM and continues a needs_input task with explicit parent lineage", async () => {
    const api = new HarnessPanelApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={filePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    expect(await screen.findByRole("table")).toBeTruthy();
    const link = screen.getByRole("link", { name: "官方入口" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("需要你补充条件后才能继续。")).toBeTruthy();
    expect(screen.queryByText("任务已完成")).toBeNull();
    expect(screen.queryByText("完成条件")).toBeNull();
    expect(screen.queryByText("步骤时间线")).toBeNull();
    expect(screen.getAllByText("已开始分析当前配方")).toHaveLength(2);
    expect(screen.queryByText(/argumentsRedacted|call-1/)).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "当前回答模型" }),
      "foodlab_runtime|alternate|alternate-model",
    );
    expect(api.selectedRoutes).toEqual([{
      engine: "foodlab_runtime",
      provider: "alternate",
      model: "alternate-model",
    }]);
    expect(screen.queryByText(/交接|创建新会话|切换确认/)).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "给 Ninka Agent 发消息" }), "是，国产普通预包装食品");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect(api.turnRequests).toEqual([{
      taskId: "task-1",
      parentTurnId: "turn-1",
      content: "是，国产普通预包装食品",
    }]);
  });

  it("keeps the conversation rail visible, removes resizing, and renames in a dialog", async () => {
    const api = new HarnessPanelApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={filePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    expect(await screen.findByRole("navigation", { name: "Agent 会话" })).toBeTruthy();
    expect(screen.getAllByText("标签审核").length).toBeGreaterThan(0);
    expect(screen.queryByRole("separator", { name: "调整 Agent 面板宽度" })).toBeNull();
    expect(screen.queryByRole("button", { name: "收起会话栏" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "重命名 标签审核" }));
    const input = screen.getByRole("textbox", { name: "会话名称" });
    await user.clear(input);
    await user.type(input, "标签审核 8 月版");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.renamedTasks).toEqual([{
      taskId: "task-1",
      title: "标签审核 8 月版",
    }]));
    expect(screen.getAllByText("标签审核 8 月版").length).toBeGreaterThan(0);
  });

  it("selects an @ recipe with the keyboard and stores a structured reference", async () => {
    const api = new HarnessPanelApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={filePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    const composer = await screen.findByRole("textbox", { name: "给 Ninka Agent 发消息" });
    await user.type(composer, "分析 @冰");
    expect(await screen.findByRole("option", { name: /冰淇淋基底/ })).toBeTruthy();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("button", { name: "移除 冰淇淋基底" })).toBeTruthy();
    expect((composer as HTMLTextAreaElement).value).toBe("分析 @冰淇淋基底 ");
  });

  it("manages archived conversations in the conversation rail and restores them read-only", async () => {
    const api = new HarnessPanelApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={filePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.click(await screen.findByRole("button", { name: "归档 标签审核" }));
    expect(screen.queryByText("标签审核")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "已归档" }));
    expect(await screen.findByText("此会话已归档，恢复后可继续对话。")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "给 Ninka Agent 发消息" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "恢复 标签审核" }));
    expect(await screen.findByRole("textbox", { name: "给 Ninka Agent 发消息" })).toBeTruthy();
  });

  it("keeps the remove action visible for a long attachment name", async () => {
    const api = new HarnessPanelApi({ storage: window.localStorage });
    const user = userEvent.setup();
    const longName = "这是一个非常非常长的供应商原料规格与营养证明文件名称-2026-最终版.pdf";
    const longFilePicker: ImportFilePicker = {
      async pickSources() { return [{ kind: "native_path", value: `/tmp/${longName}` }]; },
      async pickDestination() { return null; },
    };
    render(
      <HarnessAgentPanel
        api={api}
        events={new BrowserAgentEventSource()}
        filePicker={longFilePicker}
        onClose={() => {}}
        onConfigure={() => {}}
        onOpenImported={() => {}}
        onReviewDraft={() => {}}
        open
      />,
    );

    await user.click(await screen.findByRole("button", { name: "新建会话" }));
    await user.click(screen.getByRole("button", { name: "添加附件" }));
    expect(await screen.findByRole("button", { name: `移除 ${longName}` })).toBeTruthy();
    expect(screen.getByTitle(longName)).toBeTruthy();
  });
});
