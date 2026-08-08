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
});
