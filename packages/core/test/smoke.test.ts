import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "../src/index.js";

describe("@food-rd/core", () => {
  it("exposes a versioned public entrypoint", () => {
    expect(CORE_VERSION).toBe("0.1.0");
  });
});
