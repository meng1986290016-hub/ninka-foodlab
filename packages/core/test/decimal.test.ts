import { describe, expect, it } from "vitest";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
} from "../src/index.js";

describe("decimal primitives", () => {
  it("normalizes decimal strings without binary floating-point artifacts", () => {
    const result = parseNonNegative("0.1000", "amount");
    expect(result.ok).toBe(true);
    if (result.ok) expect(decimalString(result.value)).toBe("0.1");
  });

  it("rejects non-numeric values", () => {
    const result = parseNonNegative("abc", "amount");
    expect(result).toEqual({
      ok: false,
      issues: [{
        code: "invalid-number",
        field: "amount",
        severity: "error",
        message: "amount 必须是有效数字",
      }],
    });
  });

  it("distinguishes non-negative and positive validation", () => {
    expect(parseNonNegative("0", "amount").ok).toBe(true);
    expect(parsePositive("0", "density")).toEqual({
      ok: false,
      issues: [{
        code: "non-positive-value",
        field: "density",
        severity: "error",
        message: "density 必须大于 0",
      }],
    });
  });
});
