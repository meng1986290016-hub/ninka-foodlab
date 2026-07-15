import { describe, expect, it } from "vitest";
import { calculateNutrition } from "../src/index.js";

describe("calculateNutrition", () => {
  it("calculates totals and per-100g values using finished mass", () => {
    const result = calculateNutrition({
      components: [
        {
          id: "soy",
          name: "大豆粉",
          massGrams: "20",
          nutrientsPer100g: { protein: "40", sugar: "10" },
        },
        {
          id: "water",
          name: "水",
          massGrams: "80",
          nutrientsPer100g: { protein: "0", sugar: "0" },
        },
      ],
      finishedMassGrams: "90",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.basis).toBe("finished-mass");
    expect(result.value.nutrients.protein).toMatchObject({
      totalKnownAmount: "8",
      per100gKnownAmount: "8.888888888888888888888888888888888888889",
      status: "complete",
      completenessRatio: "1",
    });
  });

  it("keeps unknown distinct from confirmed zero", () => {
    const result = calculateNutrition({
      components: [
        {
          id: "a",
          name: "原料A",
          massGrams: "60",
          nutrientsPer100g: { sugar: null },
        },
        {
          id: "b",
          name: "原料B",
          massGrams: "40",
          nutrientsPer100g: { sugar: "0" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nutrients.sugar).toEqual({
      totalKnownAmount: "0",
      per100gKnownAmount: "0",
      status: "partial",
      completenessRatio: "0.4",
      missingComponentIds: ["a"],
    });
  });

  it("uses input mass when finished mass is absent", () => {
    const result = calculateNutrition({
      components: [{
        id: "a",
        name: "原料A",
        massGrams: "50",
        nutrientsPer100g: { protein: "10" },
      }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.basis).toBe("input-mass");
  });

  it("rejects duplicate formula component IDs", () => {
    const result = calculateNutrition({
      components: [
        {
          id: "same",
          name: "原料A",
          massGrams: "10",
          nutrientsPer100g: { protein: "1" },
        },
        {
          id: "same",
          name: "原料B",
          massGrams: "20",
          nutrientsPer100g: { protein: "2" },
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      issues: [{
        code: "duplicate-id",
        itemId: "same",
        severity: "error",
        message: "营养计算项目 ID 不能重复",
      }],
    });
  });
});
