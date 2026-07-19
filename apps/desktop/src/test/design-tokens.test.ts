import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(resolve("src/styles/tokens.css"), "utf8");

describe("desktop design tokens", () => {
  it("locks the concept's white, slate and leafy-green palette", () => {
    expect(tokenSource).toContain("--color-canvas: #ffffff");
    expect(tokenSource).toContain("--color-sidebar: #f6f8f7");
    expect(tokenSource).toContain("--color-accent: #087a43");
    expect(tokenSource).toContain("--color-warning: #b96a05");
  });

  it("defines compact desktop geometry and motion", () => {
    expect(tokenSource).toContain("--control-height: 42px");
    expect(tokenSource).toContain("--table-row-height: 52px");
    expect(tokenSource).toContain("--drawer-width: 400px");
    expect(tokenSource).toContain("--motion-fast: 140ms");
  });
});
