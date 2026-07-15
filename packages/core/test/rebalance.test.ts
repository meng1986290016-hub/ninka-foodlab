import { describe, expect, it } from "vitest";
import { rebalanceFormula } from "../src/index.js";

describe("rebalanceFormula", () => {
  it("fills the designated ingredient to the target total", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "100",
      items: [
        { id: "sugar", amountGrams: "10", locked: true },
        { id: "flavor", amountGrams: "1", locked: true },
        { id: "water", amountGrams: "0", locked: false },
      ],
      mode: { type: "auto-fill", itemId: "water" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([
      { id: "sugar", amountGrams: "10", locked: true },
      { id: "flavor", amountGrams: "1", locked: true },
      { id: "water", amountGrams: "89", locked: false },
    ]);
  });

  it("scales unlocked ingredients proportionally", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "100",
      items: [
        { id: "fixed", amountGrams: "20", locked: true },
        { id: "a", amountGrams: "30", locked: false },
        { id: "b", amountGrams: "10", locked: false },
      ],
      mode: { type: "proportional" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((item) => item.amountGrams))
        .toEqual(["20", "60", "20"]);
    }
  });

  it("rejects locked mass above the target", () => {
    const result = rebalanceFormula({
      targetTotalGrams: "10",
      items: [{ id: "fixed", amountGrams: "11", locked: true }],
      mode: { type: "proportional" },
    });
    expect(result.ok).toBe(false);
  });
});
