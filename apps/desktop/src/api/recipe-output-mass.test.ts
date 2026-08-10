import { describe, expect, it } from "vitest";

import type { RecipeVersionSnapshot } from "./recipe-types";
import { recipeVersionOutputMass } from "./recipe-output-mass";

function snapshot(
  overrides: Partial<RecipeVersionSnapshot> = {},
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: "semi-finished",
      name: "糖粉预混料",
      code: null,
      tags: [],
      kind: "semi_finished",
    },
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: {
      inputMassGrams: "100000",
      basisMassGrams: "100000",
      basis: "input_mass",
      yieldPercent: null,
      nutrients: [],
      cost: {
        rawMaterialTotal: "0",
        packagingTotal: "0",
        additionalTotal: "0",
        batchTotal: "0",
        perKg: "0",
        per100g: "0",
        perServing: null,
        perPackage: null,
        status: "complete",
        missingItemIds: [],
        breakdown: [],
      },
      targets: [],
      allergens: { contains: [], mayContain: [], sourceItemIds: {} },
      completeness: { percent: 100, missingFields: [] },
      calculatedAt: "2026-08-10T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("recipeVersionOutputMass", () => {
  it("uses measured finished mass before every fallback", () => {
    expect(
      recipeVersionOutputMass(snapshot({ finishedMassGrams: "850" })),
    ).toBe("850");
  });

  it("uses actual input mass when finished mass is not recorded", () => {
    expect(recipeVersionOutputMass(snapshot())).toBe("100000");
  });
});
