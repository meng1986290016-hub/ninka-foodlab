import { describe, expect, it } from "vitest";
import { flattenRecipeVersion } from "../src/index.js";

const sugar = {
  id: "sugar",
  name: "白砂糖",
  nutrientsPer100g: { sugar: "100" },
  pricePerKg: "8",
};

describe("flattenRecipeVersion", () => {
  it("scales nested ingredients by the referenced output mass", () => {
    const result = flattenRecipeVersion("drink-v1", {
      "syrup-v1": {
        id: "syrup-v1",
        outputMassGrams: "100",
        items: [
          { kind: "ingredient", ingredient: sugar, massGrams: "20" },
        ],
      },
      "drink-v1": {
        id: "drink-v1",
        outputMassGrams: "1000",
        items: [
          { kind: "recipe", recipeVersionId: "syrup-v1", massGrams: "50" },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([{
      ingredient: sugar,
      massGrams: "10",
      sourcePath: ["drink-v1", "syrup-v1"],
    }]);
  });

  it("rejects indirect cycles", () => {
    const result = flattenRecipeVersion("a", {
      a: {
        id: "a",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "b", massGrams: "50" }],
      },
      b: {
        id: "b",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "a", massGrams: "50" }],
      },
    });
    expect(result).toEqual({
      ok: false,
      issues: [{
        code: "recipe-cycle",
        itemId: "a",
        severity: "error",
        message: "检测到配方循环引用: a -> b -> a",
      }],
    });
  });

  it("rejects a missing referenced version", () => {
    const result = flattenRecipeVersion("a", {
      a: {
        id: "a",
        outputMassGrams: "100",
        items: [{ kind: "recipe", recipeVersionId: "missing", massGrams: "1" }],
      },
    });
    expect(result.ok).toBe(false);
  });
});
