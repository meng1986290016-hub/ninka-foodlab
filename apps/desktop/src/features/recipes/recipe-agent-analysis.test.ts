import { describe, expect, it } from "vitest";

import type {
  Recipe,
  RecipeDraft,
  RecipeDraftIngredientItem,
} from "../../api/recipe-types";
import type {
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import {
  analyzeIngredientSubstitution,
  diagnoseRecipeDraft,
} from "./recipe-agent-analysis";

const nutrientDefinitions: NutrientDefinition[] = [
  {
    id: "protein",
    code: "protein",
    name: "蛋白质",
    unit: "g",
    builtIn: true,
    sortOrder: 0,
  },
];

const recipe: Recipe = {
  id: "recipe-1",
  name: "高蛋白冰淇淋",
  code: null,
  tags: [],
  kind: "formula",
  currentDraftId: "draft-1",
  latestVersionNumber: null,
  createdAt: "2026-08-03T01:00:00.000Z",
  updatedAt: "2026-08-03T01:00:00.000Z",
  archivedAt: null,
};

function variant(
  id: string,
  supplierName: string,
  price: string,
  protein: string,
  allergens = { contains: ["乳"], mayContain: [] as string[] },
): IngredientVariant {
  return {
    id,
    materialGroupId: "milk-powder",
    supplierId: `supplier-${id}`,
    supplierName,
    modelOrSpecification: `${supplierName}规格`,
    internalCode: null,
    currentPrice: price,
    priceUnit: "kg",
    densityGPerMl: null,
    source: "规格书",
    researchNotes: "",
    nutrition: {
      basis: "per_100g",
      values: [{ nutrientDefinitionId: "protein", value: protein }],
    },
    allergens,
    sourceAttachments: [],
    completeness: { percent: 100, missingFields: [] },
    createdAt: "2026-08-03T01:00:00.000Z",
    updatedAt: "2026-08-03T01:00:00.000Z",
    archivedAt: null,
  };
}

function draft(source: IngredientVariant): RecipeDraft {
  const item: RecipeDraftIngredientItem = {
    id: "item-milk",
    position: 0,
    kind: "ingredient",
    ingredientVariantId: source.id,
    materialName: "脱脂乳粉",
    ingredientVariant: source,
    amount: "100",
    unit: "g",
    locked: false,
    autoFill: false,
  };
  return {
    id: "draft-1",
    recipeId: recipe.id,
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "100",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [item],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: null,
    calculationIssues: [],
    createdAt: "2026-08-03T01:00:00.000Z",
    updatedAt: "2026-08-03T01:00:00.000Z",
  };
}

describe("recipe agent deterministic analysis", () => {
  it("diagnoses the missing finished mass and identifies the leading cost item", () => {
    const result = diagnoseRecipeDraft({
      recipe,
      draft: draft(variant("source", "供应商A", "31.5", "34")),
      referencedVersions: [],
      nutrientDefinitions,
    });

    expect(result.status).toBe("attention");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "finished_mass_missing" }),
      ]),
    );
    expect(result.topCostContributors[0]).toMatchObject({
      name: "脱脂乳粉 · 供应商A",
      percent: "100.0",
    });
  });

  it("recalculates the whole formula before showing a supplier substitution", () => {
    const source = variant("source", "供应商A", "31.5", "34");
    const candidate = variant(
      "candidate",
      "供应商B",
      "25",
      "30",
      { contains: ["乳"], mayContain: ["大豆"] },
    );
    const group: MaterialGroup = {
      id: "milk-powder",
      name: "脱脂乳粉",
      categoryId: null,
      categoryName: null,
      variants: [source, candidate],
      createdAt: "2026-08-03T01:00:00.000Z",
      updatedAt: "2026-08-03T01:00:00.000Z",
      archivedAt: null,
    };

    const result = analyzeIngredientSubstitution({
      recipe,
      draft: draft(source),
      referencedVersions: [],
      nutrientDefinitions,
      itemId: "item-milk",
      group,
      variant: candidate,
    });

    expect(result.batchCostDifference).toBe("-0.65");
    expect(result.before.cost.batchTotal).toBe("3.15");
    expect(result.after.cost.batchTotal).toBe("2.5");
    expect(result.nutrientDifferences[0]).toMatchObject({
      name: "蛋白质",
      before: "34",
      after: "30",
      difference: "-4",
    });
    expect(result.mayContainAdded).toEqual(["大豆"]);
  });
});
