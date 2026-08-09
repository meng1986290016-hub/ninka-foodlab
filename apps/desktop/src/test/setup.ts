import {
  createElement,
  type CanvasHTMLAttributes,
} from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

interface MockThinkingOrbProps
  extends CanvasHTMLAttributes<HTMLCanvasElement> {
  size: number;
  state: string;
  theme: string;
}

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({
    size,
    state,
    theme,
    ...props
  }: MockThinkingOrbProps) =>
    createElement("canvas", {
      ...props,
      "data-orb-size": size,
      "data-orb-state": state,
      "data-orb-theme": theme,
    }),
}));

afterEach(() => {
  cleanup();
});
