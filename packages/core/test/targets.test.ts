import { describe, expect, it } from "vitest";
import { evaluateTarget } from "../src/index.js";

describe("evaluateTarget", () => {
  it("evaluates a range and reports signed deltas", () => {
    expect(evaluateTarget("8", {
      id: "protein",
      metricCode: "protein.per100g",
      minimum: "10",
      maximum: "15",
    })).toEqual({
      ok: true,
      value: {
        targetId: "protein",
        status: "below",
        observed: "8",
        deltaToMinimum: "-2",
        deltaToMaximum: "-7",
      },
      warnings: [],
    });
  });

  it("reports met when a value is inside the range", () => {
    const result = evaluateTarget("12", {
      id: "protein",
      metricCode: "protein.per100g",
      minimum: "10",
      maximum: "15",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("met");
  });

  it("returns unknown when the observed metric is unavailable", () => {
    const result = evaluateTarget(null, {
      id: "cost",
      metricCode: "cost.perKg",
      maximum: "20",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("unknown");
  });
});
