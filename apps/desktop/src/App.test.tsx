import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "./api/browser-demo-api";
import { App } from "./App";

describe("App navigation", () => {
  it("opens model settings and the real recipe workbench", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App api={new BrowserDemoApi({ storage: window.localStorage })} />);

    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("heading", { name: "Ninka Agent" })).toBeTruthy();
    expect(await screen.findByText("Agent 服务启动失败")).toBeTruthy();
    expect(screen.queryByText(/Node|npm|@deepseek-ai\/dsh/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "LLM 模型" }));
    expect(screen.getByRole("heading", { name: "LLM 模型" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "数据管理" }));
    expect(screen.getByRole("heading", { name: "数据管理" })).toBeTruthy();
    expect(
      screen.getByText("浏览器演示模式不执行真实本机备份"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "配方库" }));
    expect(await screen.findByRole("heading", { name: "配方库" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "新建配方" }));
    await user.type(
      screen.getByRole("textbox", { name: "产品名称" }),
      "导航测试配方",
    );
    await user.click(
      screen.getByRole("button", { name: "创建并进入工作台" }),
    );
    expect(
      await screen.findByRole("heading", { name: "配方工作台" }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("导航测试配方")).toBeTruthy();
  });

  it("opens the exact ingredient editor and returns to refreshed nutrition", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App api={new BrowserDemoApi({ storage: window.localStorage })} />);

    await user.click(screen.getByRole("button", { name: "配方库" }));
    await user.click(await screen.findByRole("button", { name: "新建配方" }));
    await user.type(
      screen.getByRole("textbox", { name: "产品名称" }),
      "缺口返回测试",
    );
    await user.click(
      screen.getByRole("button", { name: "创建并进入工作台" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "添加原料或半成品" }),
    );
    const picker = await screen.findByRole("dialog", {
      name: "添加原料或半成品",
    });
    await user.click(
      within(picker).getByRole("radio", { name: /选择脱脂乳粉/ }),
    );
    await user.click(
      within(picker).getByRole("button", { name: "添加所选原料" }),
    );
    const nutritionButton = await screen.findByRole("button", {
      name: "查看脱脂乳粉的营养信息",
    });
    const itemRow = nutritionButton.closest("tr")!;
    await user.click(within(itemRow).getByRole("button", { name: /%/ }));
    const gaps = await screen.findByRole("dialog", { name: "缺口返回测试" });
    await user.click(
      within(gaps).getAllByRole("button", { name: "去原料库补充" })[0]!,
    );

    const editor = await screen.findByRole("dialog", {
      name: "编辑供应商版本",
    });
    expect(screen.getByRole("heading", { name: "原料库" })).toBeTruthy();
    expect(within(editor).getByText("脱脂乳粉")).toBeTruthy();
    await user.click(
      within(editor).getByRole("button", { name: "保存供应商版本" }),
    );

    expect(
      await screen.findByRole("heading", { name: "配方工作台" }),
    ).toBeTruthy();
    const nutrition = await screen.findByRole("dialog", { name: "脱脂乳粉" });
    expect(within(nutrition).getByText("营养信息")).toBeTruthy();
    expect(within(nutrition).queryByRole("textbox")).toBeNull();
  });
});
