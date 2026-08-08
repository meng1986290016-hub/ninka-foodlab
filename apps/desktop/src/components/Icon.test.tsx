import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the shared 24px-grid icon language with the selected stroke", () => {
    const { container } = render(<Icon name="recipe-workbench" size={24} />);
    const icon = container.querySelector('[data-icon="recipe-workbench"]');
    const glyph = icon?.querySelector("svg");

    expect(icon?.getAttribute("style")).toContain("width: 24px");
    expect(glyph?.getAttribute("stroke-width")).toBe("1.75");
  });

  it("adds the Ninka seed signature only to branded semantic icons", () => {
    const { container, rerender } = render(
      <Icon name="ingredient-library" size={20} />,
    );

    expect(container.querySelector('[data-signature="true"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="icon-signature"]')).toBeTruthy();

    rerender(<Icon name="trash" size={20} />);
    expect(container.querySelector('[data-signature="true"]')).toBeNull();
  });

  it("allows dense placements to suppress the brand signature", () => {
    const { container } = render(
      <Icon name="database" signature={false} size={16} />,
    );

    expect(container.querySelector('[data-testid="icon-signature"]')).toBeNull();
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
