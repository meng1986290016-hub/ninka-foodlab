import { describe, expect, it } from "vitest";

import type {
  RecipeCalculation,
  RecipeDraft,
  RecipeVersion,
} from "../../api/recipe-types";
import type {
  IngredientVariant,
  NutrientDefinition,
} from "../../api/types";
import {
  buildDraftDataGapReport,
  buildVersionDataGapReport,
  createVariantNutritionDetail,
} from "./data-quality";

const definitions: NutrientDefinition[] = [
  {
    id: "lactose",
    code: "lactose",
    name: "乳糖",
    unit: "g",
    builtIn: true,
    sortOrder: 1,
    category: "nutrition",
    archivedAt: null,
  },
];

describe("data quality diagnostics", () => {
  it("keeps confirmed zero separate from unknown and calculates mass coverage", () => {
    const known = variant("known", "0", "标签图片");
    const unknown = variant("unknown", null, "");
    const calculation = recipeCalculation("partial", "0.5", 50);
    const draft = {
      id: "draft-1",
      recipeId: "recipe-1",
      items: [
        draftIngredient("item-known", "脱脂乳粉", known, "100"),
        draftIngredient("item-unknown", "乳清粉", unknown, "100", 1),
      ],
      calculation,
    } as RecipeDraft;

    const report = buildDraftDataGapReport({
      draft,
      recipeName: "测试配方",
      calculation,
      nutrientDefinitions: definitions,
      referencedVersions: [],
    });

    expect(report.nutrientCoverage[0]).toMatchObject({
      name: "乳糖",
      ratio: 0.5,
      knownMassGrams: "100",
      trackedMassGrams: "200",
    });
    expect(report.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: "乳糖",
          state: "missing",
          editable: true,
          path: expect.arrayContaining([
            expect.objectContaining({ label: expect.stringContaining("乳清粉") }),
          ]),
        }),
        expect.objectContaining({
          fieldName: "数据来源",
          state: "needs_verification",
        }),
      ]),
    );

    const knownDetail = createVariantNutritionDetail(
      "脱脂乳粉",
      known,
      definitions,
    );
    const unknownDetail = createVariantNutritionDetail(
      "乳清粉",
      unknown,
      definitions,
    );
    expect(knownDetail.rows[0]?.status).toBe("confirmed_zero");
    expect(unknownDetail.rows[0]?.status).toBe("unknown");
  });

  it("preserves every repeated nested path to a missing final ingredient", () => {
    const child = version({
      id: "child-v1",
      name: "糖浆",
      versionNumber: 1,
      items: [snapshotIngredient("leaf", "乳清粉", null)],
      calculation: recipeCalculation("unknown", "0", 0),
    });
    const root = version({
      id: "root-v1",
      name: "成品",
      versionNumber: 2,
      items: [
        snapshotReference("ref-a", child, "100"),
        snapshotReference("ref-b", child, "200"),
      ],
      calculation: recipeCalculation("unknown", "0", 0),
    });

    const report = buildVersionDataGapReport({
      rootVersion: root,
      referencedVersions: [child],
    });
    const lactoseGaps = report.entries.filter(
      (entry) => entry.fieldId === "lactose",
    );

    expect(lactoseGaps).toHaveLength(2);
    expect(new Set(lactoseGaps.map((entry) => entry.id)).size).toBe(2);
    expect(lactoseGaps.every((entry) => entry.editable === false)).toBe(true);
    expect(
      lactoseGaps.every((entry) =>
        entry.path.some((node) => node.label === "糖浆 V1"),
      ),
    ).toBe(true);
  });

  it("degrades safely when a referenced historical version is unavailable", () => {
    const missingChild = version({
      id: "missing-v1",
      name: "不可用半成品",
      versionNumber: 1,
      items: [],
      calculation: recipeCalculation("complete", "1", 100),
    });
    const root = version({
      id: "root-v1",
      name: "成品",
      versionNumber: 1,
      items: [snapshotReference("ref", missingChild, "100")],
      calculation: recipeCalculation("unknown", "0", 0),
    });
    const report = buildVersionDataGapReport({
      rootVersion: root,
      referencedVersions: [],
    });
    expect(report.entries).toContainEqual(
      expect.objectContaining({
        category: "version",
        reason: "下级版本无法读取",
      }),
    );
  });
});

function variant(id: string, lactose: string | null, source: string) {
  return {
    id,
    materialGroupId: `group-${id}`,
    supplierId: `supplier-${id}`,
    supplierName: `供应商${id}`,
    modelOrSpecification: "25 kg",
    internalCode: null,
    currentPrice: "20",
    priceUnit: "kg",
    densityGPerMl: null,
    source,
    researchNotes: "",
    nutrition: {
      basis: "per_100g",
      values: [{ nutrientDefinitionId: "lactose", value: lactose }],
    },
    allergens: { contains: [], mayContain: [] },
    sourceAttachments: [],
    completeness: {
      percent: lactose === null || source === "" ? 50 : 100,
      missingFields: [
        ...(lactose === null ? ["乳糖"] : []),
        ...(source === "" ? ["数据来源"] : []),
      ],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archivedAt: null,
  } satisfies IngredientVariant;
}

function draftIngredient(
  id: string,
  materialName: string,
  ingredientVariant: IngredientVariant,
  amount: string,
  position = 0,
) {
  return {
    id,
    position,
    amount,
    unit: "g" as const,
    locked: false,
    autoFill: false,
    kind: "ingredient" as const,
    ingredientVariantId: ingredientVariant.id,
    materialName,
    ingredientVariant,
  };
}

function recipeCalculation(
  status: "complete" | "partial" | "unknown",
  ratio: string,
  percent: number,
): RecipeCalculation {
  return {
    inputMassGrams: "200",
    basisMassGrams: "200",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [
      {
        nutrientDefinitionId: "lactose",
        name: "乳糖",
        unit: "g",
        totalKnownAmount: "0",
        per100gKnownAmount: "0",
        status,
        completenessRatio: ratio,
        missingItemIds: status === "complete" ? [] : ["item-unknown"],
        category: "nutrition",
      },
    ],
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
    completeness: { percent, missingFields: [] },
    calculatedAt: "2026-01-03T00:00:00.000Z",
  };
}

function version(input: {
  id: string;
  name: string;
  versionNumber: number;
  items: RecipeVersion["snapshot"]["items"];
  calculation: RecipeCalculation;
}): RecipeVersion {
  return {
    id: input.id,
    recipeId: `recipe-${input.id}`,
    versionNumber: input.versionNumber,
    sourceDraftId: `draft-${input.id}`,
    basedOnVersionId: null,
    snapshot: {
      schemaVersion: 1,
      recipe: {
        id: `recipe-${input.id}`,
        name: input.name,
        code: null,
        tags: [],
        kind: "semi_finished",
      },
      targetBatchGrams: "1000",
      finishedMassGrams: "1000",
      servingMassGrams: null,
      packageCount: null,
      items: input.items,
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
      calculation: input.calculation,
    },
    createdAt: "2026-01-03T00:00:00.000Z",
  };
}

function snapshotIngredient(id: string, name: string, lactose: string | null) {
  return {
    id,
    position: 0,
    amount: "1000",
    unit: "g" as const,
    massGrams: "1000",
    locked: false,
    autoFill: false,
    kind: "ingredient" as const,
    ingredient: {
      ingredientVariantId: `variant-${id}`,
      materialGroupId: `group-${id}`,
      materialName: name,
      supplierId: `supplier-${id}`,
      supplierName: "供应商A",
      modelOrSpecification: "25 kg",
      densityGPerMl: null,
      nutrientsPer100g: { lactose },
      nutrientUnits: { lactose: "g" },
      pricePerKg: "20",
      allergens: { contains: [], mayContain: [], sourceItemIds: {} },
      source: "标签图片",
      ingredientUpdatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function snapshotReference(id: string, child: RecipeVersion, massGrams: string) {
  return {
    id,
    position: 0,
    amount: massGrams,
    unit: "g" as const,
    massGrams,
    locked: false,
    autoFill: false,
    kind: "recipe_version" as const,
    recipeVersion: {
      id: child.id,
      recipeId: child.recipeId,
      recipeName: child.snapshot.recipe.name,
      versionNumber: child.versionNumber,
      outputMassGrams: "1000",
      createdAt: child.createdAt,
    },
  };
}
