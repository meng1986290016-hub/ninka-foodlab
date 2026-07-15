import { describe, expect, it } from "vitest";
import { toGrams } from "../src/index.js";

describe("toGrams", () => {
  it.each([
    [{ value: "2500", unit: "mg" as const }, undefined, "2.5"],
    [{ value: "2.5", unit: "g" as const }, undefined, "2.5"],
    [{ value: "1.2", unit: "kg" as const }, undefined, "1200"],
    [{ value: "500", unit: "mL" as const }, "1.03", "515"],
    [{ value: "2", unit: "L" as const }, "0.9", "1800"],
  ])("converts %o to grams", (quantity, density, expected) => {
    const result = toGrams(quantity, density);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it("requires density for volume", () => {
    expect(toGrams({ value: "10", unit: "mL" })).toEqual({
      ok: false,
      issues: [{
        code: "missing-density",
        field: "densityGPerMl",
        severity: "error",
        message: "体积换算需要填写大于 0 的密度",
      }],
    });
  });

  it("rejects a negative quantity", () => {
    const result = toGrams({ value: "-1", unit: "g" });
    expect(result.ok).toBe(false);
  });
});
