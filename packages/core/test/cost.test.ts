import { describe, expect, it } from "vitest";
import { calculateCost } from "../src/index.js";

describe("calculateCost", () => {
  it("calculates raw, packaging, additional, and unit costs", () => {
    const result = calculateCost({
      components: [
        { id: "a", name: "原料A", massGrams: "500", pricePerKg: "20" },
        { id: "b", name: "原料B", massGrams: "500", pricePerKg: "10" },
      ],
      finishedMassGrams: "900",
      packaging: [{ id: "bottle", name: "瓶", quantity: "9", unitCost: "0.5" }],
      additional: [{ id: "process", name: "加工费", amount: "3" }],
      servingMassGrams: "100",
      packageCount: "9",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      rawMaterialTotal: "15",
      packagingTotal: "4.5",
      additionalTotal: "3",
      batchTotal: "22.5",
      perKg: "25",
      per100g: "2.5",
      perServing: "2.5",
      perPackage: "2.5",
      status: "complete",
      missingComponentIds: [],
    });
  });

  it("returns a visible partial estimate when a price is unknown", () => {
    const result = calculateCost({
      components: [
        { id: "a", name: "原料A", massGrams: "500", pricePerKg: null },
        { id: "b", name: "原料B", massGrams: "500", pricePerKg: "10" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("partial");
    expect(result.value.rawMaterialTotal).toBe("5");
    expect(result.value.missingComponentIds).toEqual(["a"]);
  });
});
