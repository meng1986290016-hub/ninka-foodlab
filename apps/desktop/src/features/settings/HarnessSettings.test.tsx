import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  AgentModelDirectory,
  AgentRuntimeHealth,
  AgentRuntimeSettingsMethod,
} from "../../api/agent-harness-types";
import { BrowserDemoApi } from "../../api/browser-demo-api";
import { HarnessSettings } from "./HarnessSettings";

class ModelSettingsApi extends BrowserDemoApi {
  startCount = 0;
  discoverCount = 0;
  providerTestCount = 0;
  savedSecret = "";
  private ready = false;
  private credentialConfigured = false;

  override async getHarnessHealth(): Promise<AgentRuntimeHealth> {
    return {
      status: this.ready ? "ready" : "idle",
      lastError: null,
      reinstallRequired: false,
    };
  }

  override async startHarness(): Promise<AgentRuntimeHealth> {
    this.startCount += 1;
    this.ready = true;
    return this.getHarnessHealth();
  }

  override async getAgentModelDirectory(): Promise<AgentModelDirectory> {
    return {
      current: { provider: "deepseek-official", model: "deepseek-chat" },
      routable: this.credentialConfigured,
      hasUsableProvider: this.credentialConfigured,
      currentUsable: this.credentialConfigured,
      groups: [{
        provider: "deepseek-official",
        displayName: "DeepSeek",
        models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      }],
      failures: [],
    };
  }

  override async agentRuntimeSettingsCall<T>(
    method: AgentRuntimeSettingsMethod,
    payload: unknown,
  ): Promise<T> {
    if (method === "llm.providers") {
      return { providers: [{
        provider: "deepseek-official",
        displayName: "DeepSeek",
        settingsNs: "llm-deepseek",
        settingsPath: [],
        active: true,
      }] } as T;
    }
    if (method === "settings.describe") {
      const profile = {
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseURL: "https://api.deepseek.com",
        models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      };
      return {
        writable: true,
        namespaces: [{
          ns: "llm-deepseek",
          revision: "r1",
          value: profile,
          user: {},
          base: profile,
        }],
      } as T;
    }
    if (method === "credentials.describe") {
      return { credentials: {
        DEEPSEEK_API_KEY: {
          configured: this.credentialConfigured,
          writable: true,
        },
      } } as T;
    }
    if (method === "credentials.set") {
      const request = payload as { value: string };
      this.savedSecret = request.value;
      this.credentialConfigured = true;
      return {} as T;
    }
    if (method === "llm.discoverModels") {
      this.discoverCount += 1;
      return { models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }] } as T;
    }
    if (method === "settings.mutate") return { revision: "r2", user: {} } as T;
    return {} as T;
  }

  override async saveAgentProviderProfile(
    input: import("../../api/agent-harness-types").AgentProviderProfileSaveRequest,
  ) {
    this.savedSecret = input.credentialValue ?? "";
    this.credentialConfigured = Boolean(input.credentialValue);
    return { revision: "r2", user: {} };
  }

  override async testAgentProviderConnection() {
    this.providerTestCount += 1;
    return { ok: true };
  }

}

describe("Ninka Agent native model settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("lazy-starts, keeps keys write-only, and tests only after an explicit click", async () => {
    const api = new ModelSettingsApi({ storage: window.localStorage });
    const user = userEvent.setup();
    render(<HarnessSettings api={api} section="models" />);

    expect(await screen.findByText("先选择并配置一个模型 Provider")).toBeTruthy();
    expect(api.startCount).toBe(1);
    expect(api.discoverCount).toBe(0);
    expect(screen.queryByText(/DeepSeek Harness|@deepseek-ai\/dsh|安装 Node/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "配置" }));
    const secret = "sk-foodlab-write-only-test";
    await user.type(screen.getByLabelText("API Key"), secret);
    expect(screen.queryByText(secret)).toBeNull();
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText("请先保存 API Key，再用已保存的密钥测试连接")).toBeTruthy();
    expect(api.discoverCount).toBe(0);
    expect(api.providerTestCount).toBe(0);
    expect(api.savedSecret).toBe("");

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.savedSecret).toBe(secret));
    expect(screen.queryByText(secret)).toBeNull();
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText(/已使用保存的 API Key 完成最小模型请求/)).toBeTruthy();
    expect(api.providerTestCount).toBe(1);
  });

  it("keeps appearance available when the Agent service cannot start", async () => {
    class UnavailableRuntimeApi extends ModelSettingsApi {
      override async getHarnessHealth(): Promise<AgentRuntimeHealth> {
        throw new Error("runtime unavailable");
      }

      override async startHarness(): Promise<AgentRuntimeHealth> {
        throw new Error("runtime unavailable");
      }
    }

    const user = userEvent.setup();
    render(<HarnessSettings api={new UnavailableRuntimeApi({ storage: window.localStorage })} section="general" />);

    const theme = screen.getByRole("combobox", { name: "界面外观" });
    await user.selectOptions(theme, "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("foodlab.theme.v1")).toBe("dark");
  });

  it("does not expose the retired ChatGPT subscription route", async () => {
    const api = new ModelSettingsApi({ storage: window.localStorage });
    render(<HarnessSettings api={api} section="models" />);

    expect(await screen.findByText("DeepSeek")).toBeTruthy();
    expect(screen.queryByText(/ChatGPT 订阅|登录 ChatGPT/)).toBeNull();
  });
});
