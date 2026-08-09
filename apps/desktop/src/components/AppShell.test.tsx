import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("keeps compact navigation named and lets desktop users collapse it", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(
      <AppShell
        activePage="recipe-library"
        agentOpen={false}
        agentPanel={null}
        databaseStatus={null}
        onNavigate={onNavigate}
        onToggleAgent={() => undefined}
      >
        <div>页面内容</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("img", { name: "Ninka FoodLab 品牌标志" }),
    ).toBeTruthy();
    expect(screen.getByText("Ninka FoodLab")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "原料库" }));
    expect(onNavigate).toHaveBeenCalledWith("ingredients");

    await user.click(screen.getByRole("button", { name: "收起导航" }));
    expect(container.querySelector(".app-shell")?.className).toContain(
      "is-sidebar-collapsed",
    );
    expect(screen.getByRole("button", { name: "展开导航" })).toBeTruthy();
    expect(
      container.querySelector(
        '.is-sidebar-collapsed [data-icon="ingredient-library"]',
      ),
    ).toBeTruthy();
  });

  it("keeps the underlying shell layout state unchanged when Agent opens", async () => {
    const user = userEvent.setup();
    const onToggleAgent = vi.fn();
    const renderShell = (agentOpen: boolean) => (
      <AppShell
        activePage="ingredients"
        agentOpen={agentOpen}
        agentPanel={
          agentOpen ? <aside aria-label="食品研发 Agent">Agent 内容</aside> : null
        }
        databaseStatus={null}
        onNavigate={() => undefined}
        onToggleAgent={onToggleAgent}
      >
        <div>页面内容</div>
      </AppShell>
    );
    const { container, rerender } = render(renderShell(false));
    const shell = container.querySelector(".app-shell");
    const expandedShellClass = shell?.className;

    rerender(renderShell(true));

    expect(shell?.className).toBe(expandedShellClass);
    expect(
      screen.getByRole("complementary", { name: "食品研发 Agent" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "隐藏食品研发 Agent 面板" })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: "收起导航" }));
    expect(shell?.className).toContain("is-sidebar-collapsed");

    rerender(renderShell(false));

    expect(shell?.className).toContain("is-sidebar-collapsed");
    expect(screen.queryByRole("complementary", { name: "食品研发 Agent" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "打开食品研发 Agent" }));
    expect(onToggleAgent).toHaveBeenCalledTimes(1);
  });
});
