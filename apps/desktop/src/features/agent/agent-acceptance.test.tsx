import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../../App";
import type {
  HarnessHealth,
  HarnessTask,
  HarnessTurn,
} from "../../api/agent-harness-types";
import { BrowserDemoApi } from "../../api/browser-demo-api";

class ReadyHarnessDemoApi extends BrowserDemoApi {
  private readonly harnessTasks: HarnessTask[] = [];
  private readonly turns = new Map<string, HarnessTurn[]>();

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
      groups: [{ provider: "mock", models: [{ id: "mock-model" }] }],
      failures: [],
    };
  }

  override async listHarnessTasks() {
    return [...this.harnessTasks];
  }

  override async createHarnessTask(input: {
    title: string;
    workflow?: string;
    content?: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }): Promise<HarnessTask> {
    const workflow = input.workflow ?? "local_knowledge";
    const task: HarnessTask = {
      id: `task-${this.harnessTasks.length + 1}`,
      harnessSessionId: null,
      title: input.title,
      workflow,
      status: "running",
      taskContract: {
        workflow,
        allowedTools: [
          "read_recipe_reference_context",
          "search_rnd_reference_cards",
          "create_recipe_estimate_card",
        ],
        requiredSteps: [
          "read_recipe_reference_context",
          "search_rnd_reference_cards",
          "create_recipe_estimate_card",
        ],
        requiredArtifactKinds: ["recipe_estimate_card"],
        approvalPolicy: "automatic",
        completionPredicate:
          "an estimate card exists in ready or needs_input state",
      },
      activeRecipeId: input.activeRecipeId ?? null,
      lastEventSeq: -1,
      errorCode: null,
      errorSummary: null,
      activeRoute: { engine: "foodlab_runtime", provider: "mock", model: "mock-model" },
      archivedAt: null,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    };
    this.harnessTasks.unshift(task);
    this.turns.set(task.id, []);
    return task;
  }

  override async createHarnessTurn(input: {
    taskId: string;
    parentTurnId?: string | null;
    content: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }): Promise<HarnessTurn> {
    const turn: HarnessTurn = {
      id: `turn-${(this.turns.get(input.taskId)?.length ?? 0) + 1}`,
      taskId: input.taskId,
      harnessTurnId: "0",
      parentTurnId: input.parentTurnId ?? null,
      status: "completed",
      userContent: input.content,
      contentBlocks: [{ type: "markdown", text: "已记录当前研发问题。" }],
      route: { engine: "foodlab_runtime", provider: "mock", model: "mock-model" },
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    };
    this.turns.set(input.taskId, [...(this.turns.get(input.taskId) ?? []), turn]);
    return turn;
  }

  override async listHarnessTurns(taskId: string) {
    return [...(this.turns.get(taskId) ?? [])];
  }

  override async syncHarnessTask(taskId: string) {
    return this.harnessTasks.find((task) => task.id === taskId)!;
  }
}

describe("food R&D Agent V2 acceptance", () => {
  it("keeps a contracted task visible after closing and reopening the panel", async () => {
    const api = new ReadyHarnessDemoApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(<App api={api} />);

    await user.click(
      screen.getByRole("button", { name: "打开 Ninka Agent" }),
    );
    await user.type(
      await screen.findByRole("textbox", { name: "给 Ninka Agent 发消息" }),
      "请估算当前配方甜度",
    );
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect((await screen.findAllByText("请估算当前配方甜度")).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("完成条件")).toBeNull();
    expect(screen.queryByText("步骤时间线")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "关闭 Ninka Agent" }),
    );
    await user.click(
      screen.getByRole("button", { name: "打开 Ninka Agent" }),
    );

    expect((await screen.findAllByText("请估算当前配方甜度")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("已记录当前研发问题。")).toBeTruthy();
  });
});
