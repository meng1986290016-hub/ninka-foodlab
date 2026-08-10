import { describe, expect, it } from "vitest";

import type {
  IngredientVariant,
  MaterialGroup,
} from "../../api/types";
import type {
  RecipeCalculation,
  RecipeVersion,
  RecipeVersionSnapshot,
} from "../../api/recipe-types";
import { calculateRecipeAtCurrentPrices } from "./recipe-current-price";

function calculation(batchTotal: string): RecipeCalculation {
  return {
    inputMassGrams: "100",
    basisMassGrams: "100",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [],
    cost: {
      rawMaterialTotal: batchTotal,
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal,
      perKg: batchTotal,
      per100g: batchTotal,
      perServing: null,
      perPackage: null,
      status: "complete",
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: {
      contains: [],
      mayContain: [],
      sourceItemIds: {},
    },
    completeness: { percent: 100, missingFields: [] },
    calculatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function ingredientVariant(
  price: string | null,
  overrides: Partial<IngredientVariant> = {},
): IngredientVariant {
  return {
    id: "variant-1",
    materialGroupId: "group-1",
    supplierId: "supplier-1",
    supplierName: "乳业 A",
    modelOrSpecification: "低热型",
    internalCode: null,
    currentPrice: price,
    priceUnit: "kg",
    densityGPerMl: null,
    source: "供应商规格书",
    researchNotes: "",
    nutrition: { basis: "per_100g", values: [] },
    allergens: { contains: [], mayContain: [] },
    sourceAttachments: [],
    completeness: { percent: 100, missingFields: [] },
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function groups(variant: IngredientVariant): MaterialGroup[] {
  return [
    {
      id: "group-1",
      name: "脱脂乳粉",
      categoryId: null,
      categoryName: null,
      variants: [variant],
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
      archivedAt: null,
    },
  ];
}

function ingredientSnapshot(
  batchTotal = "3.45",
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: "recipe-1",
      name: "酸奶",
      code: null,
      tags: [],
      kind: "formula",
    },
    targetBatchGrams: "100",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: "item-1",
        position: 0,
        kind: "ingredient",
        amount: "100",
        unit: "g",
        massGrams: "100",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "variant-1",
          materialGroupId: "group-1",
          materialName: "脱脂乳粉",
          supplierId: "supplier-1",
          supplierName: "乳业 A",
          modelOrSpecification: "低热型",
          densityGPerMl: null,
          nutrientsPer100g: {},
          nutrientUnits: {},
          pricePerKg: "31.5",
          allergens: {
            contains: [],
            mayContain: [],
            sourceItemIds: {},
          },
          source: "供应商规格书",
          ingredientUpdatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    ],
    packagingCosts: [
      { id: "pack-1", name: "酸奶杯", quantity: "1", unitCost: "0.3" },
    ],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: calculation(batchTotal),
  };
}

function version(
  id: string,
  recipeId: string,
  snapshot: RecipeVersionSnapshot,
): RecipeVersion {
  return {
    id,
    recipeId,
    versionNumber: 1,
    sourceDraftId: `draft-${id}`,
    basedOnVersionId: null,
    snapshot,
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

describe("recipe current price recalculation", () => {
  it("uses current supplier prices without changing the frozen total", () => {
    const root = version(
      "version-1",
      "recipe-1",
      ingredientSnapshot(),
    );
    const result = calculateRecipeAtCurrentPrices({
      rootVersion: root,
      referencedVersions: [],
      materialGroups: groups(ingredientVariant("99")),
    });

    expect(result).toMatchObject({
      frozenBatchTotal: "3.45",
      currentRawMaterialTotal: "9.9",
      currentPackagingTotal: "0.3",
      currentBatchTotal: "10.2",
      currentPer100g: "10.2",
      difference: "6.75",
      status: "complete",
      missingIngredients: [],
    });
    expect(root.snapshot.calculation.cost.batchTotal).toBe("3.45");
  });

  it("marks volume prices without density as incomplete", () => {
    const root = version(
      "version-1",
      "recipe-1",
      ingredientSnapshot(),
    );
    const result = calculateRecipeAtCurrentPrices({
      rootVersion: root,
      referencedVersions: [],
      materialGroups: groups(
        ingredientVariant("8", {
          priceUnit: "L",
          densityGPerMl: null,
        }),
      ),
    });

    expect(result.status).toBe("partial");
    expect(result.missingIngredients).toEqual([
      "脱脂乳粉 · 乳业 A",
    ]);
    expect(result.currentBatchTotal).toBe("0.3");
  });

  it("scales nested semi-finished ingredients and supplemental costs", () => {
    const childSnapshot = ingredientSnapshot("2");
    childSnapshot.recipe = {
      ...childSnapshot.recipe,
      id: "recipe-child",
      name: "乳基底",
      kind: "semi_finished",
    };
    childSnapshot.targetBatchGrams = "1";
    childSnapshot.packagingCosts[0]!.unitCost = "1";
    const child = version(
      "version-child",
      "recipe-child",
      childSnapshot,
    );
    const rootSnapshot: RecipeVersionSnapshot = {
      ...ingredientSnapshot("1.5"),
      items: [
        {
          id: "child-item",
          position: 0,
          kind: "recipe_version",
          amount: "50",
          unit: "g",
          massGrams: "50",
          locked: false,
          autoFill: false,
          recipeVersion: {
            id: child.id,
            recipeId: child.recipeId,
            recipeName: "乳基底",
            versionNumber: 1,
            outputMassGrams: "100",
            createdAt: child.createdAt,
          },
        },
      ],
      packagingCosts: [],
      additionalCosts: [
        { id: "energy", name: "能耗", amount: "0.5" },
      ],
    };
    const root = version("version-root", "recipe-1", rootSnapshot);
    const result = calculateRecipeAtCurrentPrices({
      rootVersion: root,
      referencedVersions: [child],
      materialGroups: groups(ingredientVariant("10")),
    });

    expect(result).toMatchObject({
      currentRawMaterialTotal: "0.5",
      currentPackagingTotal: "0.5",
      currentAdditionalTotal: "0.5",
      currentBatchTotal: "1.5",
      status: "complete",
    });
  });
});
