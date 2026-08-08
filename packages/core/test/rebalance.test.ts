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
});
