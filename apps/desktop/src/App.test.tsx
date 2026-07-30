import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "./api/browser-demo-api";
import { App } from "./App";

describe("App navigation", () => {
  it("opens model settings and keeps unfinished pages clearly separated", async () => {
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

    await user.click(screen.getByRole("button", { name: "配方工作台" }));
    expect(screen.getByRole("heading", { name: "配方工作台" })).toBeTruthy();
    expect(
      screen.getByText("该功能将在后续阶段开放，当前原料库和设置可正常使用。"),
    ).toBeTruthy();
  });
});
