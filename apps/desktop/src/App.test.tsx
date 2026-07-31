import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "食品研发 Agent" })).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "启用食品研发 Agent" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: "LLM 模型" }));
    expect(screen.getByRole("heading", { name: "LLM 模型" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "数据管理" }));
    expect(screen.getByRole("heading", { name: "数据管理" })).toBeTruthy();
    expect(
      screen.getByText("浏览器演示模式不执行真实本机备份"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "配方工作台" }));
    expect(screen.getByRole("heading", { name: "配方工作台" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "新建配方" }),
    ).toBeTruthy();
  });
});
