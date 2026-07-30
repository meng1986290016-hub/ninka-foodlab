import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  RecipeDraftInput,
  RecipeVersionReferenceItemSnapshot,
  RecipeVersionSnapshot,
} from "./recipe-types";

describe("recipe workspace contract", () => {
  it("requires semi-finished items to reference an explicit immutable version", () => {
    const item: RecipeVersionReferenceItemSnapshot = {
      id: "item-semi",
      position: 1,
      kind: "recipe_version",
      amount: "250",
      unit: "g",
      massGrams: "250",
      locked: false,
      autoFill: false,
      recipeVersion: {
        id: "version-3",
        recipeId: "recipe-filling",
        recipeName: "草莓果酱半成品",
        versionNumber: 3,
        outputMassGrams: "1000",
        createdAt: "2026-07-30T00:00:00.000Z",
      },
    };

    expect(item.recipeVersion.id).toBe("version-3");
    expectTypeOf(item.recipeVersion.versionNumber).toEqualTypeOf<number>();
    expect(item).not.toHaveProperty("latestVersion");
  });

  it("preserves confirmed zero separately from unknown nutrition in snapshots", () => {
    const snapshot: RecipeVersionSnapshot = {
      schemaVersion: 1,
      recipe: {
        id: "recipe-1",
        name: "低糖乳饮料",
        code: null,
        tags: [],
        kind: "formula",
      },
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [
        {
          id: "item-1",
          position: 0,
          kind: "ingredient",
          amount: "1000",
          unit: "g",
          massGrams: "1000",
          locked: false,
          autoFill: true,
          ingredient: {
            ingredientVariantId: "variant-1",
            materialGroupId: "material-1",
            materialName: "脱脂乳粉",
            supplierId: "supplier-1",
            supplierName: "供应商A",
            modelOrSpecification: "SMP-A",
            densityGPerMl: null,
            nutrientsPer100g: {
              protein: "0",
              sodium: null,
            },
            nutrientUnits: {
              protein: "g",
              sodium: "mg",
            },
            pricePerKg: "31.5",
            allergens: {
              contains: ["乳"],
              mayContain: [],
              sourceItemIds: { 乳: ["item-1"] },
            },
            source: "供应商规格书",
            ingredientUpdatedAt: "2026-07-30T00:00:00.000Z",
          },
        },
      ],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
      calculation: {
        inputMassGrams: "1000",
        basisMassGrams: "1000",
        basis: "input_mass",
        yieldPercent: null,
        nutrients: [
          {
            nutrientDefinitionId: "protein",
            name: "蛋白质",
            unit: "g",
            totalKnownAmount: "0",
            per100gKnownAmount: "0",
            status: "complete",
            completenessRatio: "1",
            missingItemIds: [],
          },
          {
            nutrientDefinitionId: "sodium",
            name: "钠",
            unit: "mg",
            totalKnownAmount: "0",
            per100gKnownAmount: "0",
            status: "unknown",
            completenessRatio: "0",
            missingItemIds: ["item-1"],
          },
        ],
        cost: {
          rawMaterialTotal: "31.5",
          packagingTotal: "0",
          additionalTotal: "0",
          batchTotal: "31.5",
          perKg: "31.5",
          per100g: "3.15",
          perServing: null,
          perPackage: null,
          status: "complete",
          missingItemIds: [],
          breakdown: [],
        },
        targets: [],
        allergens: {
          contains: ["乳"],
          mayContain: [],
          sourceItemIds: { 乳: ["item-1"] },
        },
        completeness: { percent: 50, missingFields: ["钠：脱脂乳粉"] },
        calculatedAt: "2026-07-30T00:00:00.000Z",
      },
    };

    const restored = JSON.parse(
      JSON.stringify(snapshot),
    ) as RecipeVersionSnapshot;
    const ingredientItem = restored.items.find(
      (item) => item.kind === "ingredient",
    );
    expect(ingredientItem).toBeDefined();
    if (!ingredientItem || ingredientItem.kind !== "ingredient") {
      throw new Error("fixture mismatch");
    }
    expect(ingredientItem.ingredient.nutrientsPer100g.protein).toBe("0");
    expect(ingredientItem.ingredient.nutrientsPer100g.sodium).toBeNull();
    expect(restored.recipe.code).toBeNull();
  });

  it("keeps recipe number and tags optional at the draft boundary", () => {
    const draft: RecipeDraftInput = {
      recipeId: "recipe-1",
      basedOnVersionId: null,
      source: "manual",
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
    };

    expect(draft.basedOnVersionId).toBeNull();
    expectTypeOf(draft.source).toEqualTypeOf<"manual" | "agent">();
  });
});
