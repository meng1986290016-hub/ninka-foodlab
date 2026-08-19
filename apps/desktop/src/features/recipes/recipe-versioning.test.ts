import { describe, expect, it } from "vitest";

import type {
  Recipe,
  RecipeCalculation,
  RecipeDraft,
  RecipeVersionItemSnapshot,
} from "../../api/recipe-types";
import type { RecipeCalculationResult } from "./recipe-calculation";
import { prepareRecipeVersion } from "./recipe-versioning";

function recipe(): Recipe {
  return {
    id: "recipe-1",
    name: "草莓酸奶",
    code: null,
    tags: [],
    kind: "formula",
    currentDraftId: "draft-1",
    latestVersionNumber: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    archivedAt: null,
  };
}

function calculation(
  completeness = 100,
): RecipeCalculation {
  return {
    inputMassGrams: "100",
    basisMassGrams: "100",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [],
    cost: {
      rawMaterialTotal: "1.5",
      packagingTotal: "0.3",
      additionalTotal: "0",
      batchTotal: "1.8",
      perKg: "18",
      per100g: "1.8",
      perServing: null,
      perPackage: null,
      status: completeness === 100 ? "complete" : "partial",
      missingItemIds: completeness === 100 ? [] : ["item-1"],
      breakdown: [],
    },
    targets: [],
    allergens: {
      contains: ["乳"],
      mayContain: [],
      sourceItemIds: { 乳: ["item-1"] },
    },
    completeness: {
      percent: completeness,
      missingFields:
        completeness === 100 ? [] : ["item-1.currentPrice"],
    },
    calculatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function ingredientSnapshot(): RecipeVersionItemSnapshot {
  return {
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
      nutrientsPer100g: { protein: "34" },
      nutrientUnits: { protein: "g" },
      pricePerKg: "31.5",
      allergens: {
        contains: ["乳"],
        mayContain: [],
        sourceItemIds: { 乳: ["item-1"] },
      },
      source: "供应商规格书",
      ingredientUpdatedAt: "2026-07-30T00:00:00.000Z",
    },
  };
}

function draft(amount = "100"): RecipeDraft {
  return {
    id: "draft-1",
    recipeId: "recipe-1",
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "100",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: "item-1",
        position: 0,
        kind: "ingredient",
        ingredientVariantId: "variant-1",
        materialName: "脱脂乳粉",
        ingredientVariant: {
          id: "variant-1",
          materialGroupId: "group-1",
          internalCode: null,
          supplierId: "supplier-1",
          supplierName: "乳业 A",
          modelOrSpecification: "低热型",
          researchNotes: "",
          densityGPerMl: null,
          currentPrice: "31.5",
          priceUnit: "kg",
          source: "供应商规格书",
          nutrition: {
            basis: "per_100g",
            values: [
              {
                nutrientDefinitionId: "protein",
                value: "34",
              },
            ],
          },
          allergens: { contains: ["乳"], mayContain: [] },
          sourceAttachments: [],
          completeness: { percent: 100, missingFields: [] },
          createdAt: "2026-07-30T00:00:00.000Z",
          updatedAt: "2026-07-30T00:00:00.000Z",
          archivedAt: null,
        },
        amount,
        unit: "g",
        locked: false,
        autoFill: false,
      },
    ],
    packagingCosts: [
      { id: "pack-1", name: "酸奶杯", quantity: "1", unitCost: "0.3" },
    ],
    additionalCosts: [],
    targets: [],
    markdownNotes: "首轮小试",
    calculation: calculation(),
    calculationIssues: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function successfulResult(
  completeness = 100,
): RecipeCalculationResult {
  return {
    ok: true,
    value: {
      calculation: calculation(completeness),
      versionItems: [ingredientSnapshot()],
    },
    warnings: [],
  };
}

describe("recipe formal version preparation", () => {
  it("blocks empty names, zero amounts and calculation errors", () => {
    const invalidDraft = draft("0");
    const result = prepareRecipeVersion({
      recipe: recipe(),
      recipeName: " ",
      draft: invalidDraft,
      sourceDraftId: invalidDraft.id,
      calculation: {
        ok: false,
        issues: [
          {
            code: "missing_density",
            severity: "error",
            message: "液体单位换算需要密度",
            field: "densityGPerMl",
            itemId: "item-1",
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { field: "配方名称", message: "请填写配方名称" },
        {
          field: "脱脂乳粉",
          message: "正式版本中的用量必须大于 0",
        },
        { field: "配方项目", message: "液体单位换算需要密度" },
      ]),
    });
  });

  it("freezes ingredient nutrition, price, costs and notes in the snapshot", () => {
    const workingDraft = draft();
    const result = prepareRecipeVersion({
      recipe: recipe(),
      recipeName: "草莓酸奶",
      draft: workingDraft,
      sourceDraftId: workingDraft.id,
      calculation: successfulResult(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    workingDraft.packagingCosts[0]!.name = "新包装";
    workingDraft.markdownNotes = "后续调整";
    const draftItem = workingDraft.items[0];
    if (draftItem?.kind === "ingredient") {
      draftItem.ingredientVariant.currentPrice = "99";
    }

    const item = result.value.input.snapshot.items[0];
    expect(item?.kind).toBe("ingredient");
    if (item?.kind !== "ingredient") return;
    expect(item.ingredient.pricePerKg).toBe("31.5");
    expect(item.ingredient.nutrientsPer100g).toEqual({ protein: "34" });
    expect(result.value.input.snapshot.packagingCosts[0]?.name).toBe(
      "酸奶杯",
    );
    expect(result.value.input.snapshot.markdownNotes).toBe("首轮小试");
  });

  it("allows a partial calculation only after surfacing a confirmation warning", () => {
    const workingDraft = draft();
    const result = prepareRecipeVersion({
      recipe: recipe(),
      recipeName: "草莓酸奶",
      draft: workingDraft,
      sourceDraftId: workingDraft.id,
      calculation: successfulResult(82),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.map((warning) => warning.message)).toEqual([
      "当前数据完整度为 82%，版本会保留未知项",
      "当前成本为部分估算，版本会保留缺失价格",
    ]);
  });

  it("blocks a version whose finished mass exceeds the actual input total", () => {
    const workingDraft = draft();
    workingDraft.finishedMassGrams = "100.000000000000000001";

    const blocked = prepareRecipeVersion({
      recipe: recipe(),
      recipeName: "草莓酸奶",
      draft: workingDraft,
      sourceDraftId: workingDraft.id,
      calculation: successfulResult(),
    });

    expect(blocked).toEqual({
      ok: false,
      issues: [
        {
          field: "出成重量",
          message: "出成重量不能大于投料合计",
        },
      ],
    });

    workingDraft.finishedMassGrams = "100.000000000000000000";
    expect(
      prepareRecipeVersion({
        recipe: recipe(),
        recipeName: "草莓酸奶",
        draft: workingDraft,
        sourceDraftId: workingDraft.id,
        calculation: successfulResult(),
      }).ok,
    ).toBe(true);
  });
});
