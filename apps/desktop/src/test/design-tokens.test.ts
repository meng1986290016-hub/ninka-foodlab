import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(resolve("src/styles/tokens.css"), "utf8");

function block(pattern: RegExp) {
  const source = tokenSource.match(pattern)?.[1];
  if (!source) throw new Error(`Missing token block: ${pattern}`);
  return source;
}

function token(source: string, name: string) {
  const value = source.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing hexadecimal token: ${name}`);
  return value;
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const [red = 0, green = 0, blue = 0] = linear;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

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

  it.each([
    ["light", block(/:root\s*{([^}]+)}/)],
    ["dark", block(/:root\[data-theme="dark"\]\s*{([^}]+)}/)],
  ])("keeps %s theme text, controls and actions legible", (_name, source) => {
    expect(contrast(token(source, "ink"), token(source, "canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(source, "ink-muted"), token(source, "canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(source, "placeholder"), token(source, "canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(source, "control-border"), token(source, "canvas"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(source, "on-accent"), token(source, "accent"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(source, "notice-ink"), token(source, "notice-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(source, "disabled-ink"), token(source, "disabled-surface"))).toBeGreaterThanOrEqual(3);
  });
});
