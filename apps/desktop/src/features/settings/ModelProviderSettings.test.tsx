import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import { ModelProviderSettings } from "./ModelProviderSettings";

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

function createApi() {
  return new BrowserDemoApi({
    storage: new MemoryStorage(),
    now: () => "2026-07-30T10:00:00.000Z",
  });
}

describe("ModelProviderSettings", () => {
  it("shows one custom card and preserves both compatible protocol configurations", async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<ModelProviderSettings api={api} />);

    const customDisclosure = await screen.findByRole("button", {
      name: /自定义模型服务/,
      expanded: false,
    });
    await user.click(customDisclosure);

    expect(screen.getAllByText("自定义模型服务")).toHaveLength(1);
    const openaiTab = screen.getByRole("button", { name: "OpenAI 兼容" });
    const anthropicTab = screen.getByRole("button", { name: "Anthropic 兼容" });
    expect(openaiTab).toBeTruthy();
    expect(anthropicTab).toBeTruthy();

    const endpoint = screen.getByLabelText("Endpoint");
    await user.type(endpoint, "https://openai-compatible.example/v1");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() =>
      expect(screen.getByText("配置已保存")).toBeTruthy(),
    );

    await user.click(anthropicTab);
    const anthropicEndpoint = screen.getByLabelText("Endpoint");
    await user.type(anthropicEndpoint, "https://anthropic-compatible.example");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() =>
      expect(screen.getByText("配置已保存")).toBeTruthy(),
    );

    expect(
      await api.getAgentCustomProviderSubconfig("openai_compatible"),
    ).toMatchObject({
      endpoint: "https://openai-compatible.example/v1",
    });
    expect(
      await api.getAgentCustomProviderSubconfig("anthropic_messages"),
    ).toMatchObject({
      endpoint: "https://anthropic-compatible.example",
    });
  }, 15_000);

  it("switches one active provider without losing the previous model choice", async () => {
    const api = createApi();
    const providers = await api.listAgentProviderConfigs();
    for (const id of ["openai", "deepseek"]) {
      const provider = providers.find((item) => item.id === id)!;
      await api.saveAgentProviderConfig({
        ...provider,
        model: id === "openai" ? "gpt-initial" : "deepseek-v4-pro",
        enabled: false,
      });
      await api.setAgentProviderSecret({
        providerId: id,
        apiKey: `${id}-test-key`,
      });
    }
    const user = userEvent.setup();
    render(<ModelProviderSettings api={api} />);

    const openaiCard = (await screen.findByText("OpenAI")).closest("article")!;
    await user.click(
      within(openaiCard).getByRole("button", { expanded: false }),
    );
    const modelInput = within(openaiCard).getByLabelText("模型");
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-user-selected");
    await user.click(within(openaiCard).getByRole("button", { name: "保存配置" }));
    await waitFor(() =>
      expect(within(openaiCard).getByText("配置已保存")).toBeTruthy(),
    );
    await user.click(
      within(openaiCard).getByRole("button", { name: "启用 OpenAI" }),
    );

    const deepSeekCard = screen.getByText("DeepSeek").closest("article")!;
    await user.click(
      within(deepSeekCard).getByRole("button", { name: "启用 DeepSeek" }),
    );

    await waitFor(async () => {
      const current = await api.listAgentProviderConfigs();
      expect(current.find((item) => item.id === "deepseek")?.enabled).toBe(true);
      expect(current.find((item) => item.id === "openai")?.model).toBe(
        "gpt-user-selected",
      );
    });
  }, 15_000);
});
