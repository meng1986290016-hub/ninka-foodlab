import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../../App";
import { BrowserAgentEventSource } from "../../api/agent-event-source";
import type { AgentRun, AgentRunRequest } from "../../api/agent-types";
import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { ImportFileReference } from "../../api/import-types";
import { AgentPanel } from "./AgentPanel";

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

describe("AgentPanel", () => {
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
});
