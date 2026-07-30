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
    expect(storage.getItem("food-rd.browser-demo.v4")).not.toContain(
      "browser-test-secret",
    );
  });
});
