import { describe, expect, it } from "vitest";
import { calculateRecipe } from "../src/index.js";

describe("calculateRecipe", () => {
  it("calculates a parent recipe through a semi-finished version", () => {
    const result = calculateRecipe({
      rootVersionId: "drink",
      graph: {
        syrup: {
          id: "syrup",
          outputMassGrams: "100",
          items: [{
            kind: "ingredient",
            massGrams: "20",
            ingredient: {
              id: "sugar",
              name: "白砂糖",
              nutrientsPer100g: { sugar: "100" },
              pricePerKg: "8",
            },
          }],
        },
        drink: {
          id: "drink",
          outputMassGrams: "1000",
          items: [{
            kind: "recipe",
            recipeVersionId: "syrup",
            massGrams: "500",
          }],
        },
      },
      finishedMassGrams: "500",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nutrition.nutrients.sugar).toMatchObject({
      totalKnownAmount: "100",
      per100gKnownAmount: "20",
      status: "complete",
    });
    expect(result.value.cost).toMatchObject({
      rawMaterialTotal: "0.8",
      perKg: "1.6",
      status: "complete",
    });
  });
});
