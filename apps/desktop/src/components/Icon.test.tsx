import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders approved Ninka SVG masters for product semantics", () => {
    const { container } = render(<Icon name="recipe-workbench" size={24} />);
    const icon = container.querySelector('[data-icon="recipe-workbench"]');
    const custom = icon?.querySelector(".icon__custom svg");

    expect(icon?.getAttribute("style")).toContain("width: 24px");
    expect(icon?.getAttribute("data-custom-icon")).toBe("true");
    expect(custom?.querySelector("metadata")?.textContent).toContain(
      "Ninka FoodLab recipe-workbench r02",
    );
    expect(custom?.querySelector('[stroke="#153D36"]')).toBeTruthy();
  });

  it("keeps utility actions in the shared 1.75px icon language", () => {
    const { container, rerender } = render(
      <Icon name="ingredient-library" size={20} />,
    );

    expect(container.querySelector(".icon__custom svg")).toBeTruthy();

    rerender(<Icon name="trash" size={20} />);
    expect(container.querySelector(".icon__custom")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("stroke-width")).toBe(
      "1.75",
    );
  });

  it("stays decorative and does not change a control's accessible name", () => {
    const { container } = render(
      <button type="button">
        <Icon name="report" />
        保存报告
      </button>,
    );
    const icon = container.querySelector('[data-icon="report"]');

    expect(icon?.classList.contains("ninka-icon")).toBe(true);
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("style")).toContain("width: 20px");
    expect(screen.getByRole("button", { name: "保存报告" })).toBeTruthy();
  });
});
