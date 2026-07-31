import { describe, expect, it } from "vitest";

import type { NutritionLabelVersion } from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import { buildResearchReportDocument } from "./research-report-document";

const recipeVersion = {
  id: "recipe-version-1",
  recipeId: "recipe-yogurt",
  versionNumber: 1,
  sourceDraftId: "draft-1",
  basedOnVersionId: null,
  createdAt: "2026-07-31T06:20:00.000Z",
  snapshot: {
    schemaVersion: 1,
    recipe: {
      id: "recipe-yogurt",
      name: "原味高蛋白酸奶",
      code: null,
      tags: [],
      kind: "formula",
    },
    targetBatchGrams: "1000",
    finishedMassGrams: "960",
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: "item-milk",
        position: 0,
        kind: "ingredient",
        amount: "85",
        unit: "g",
        massGrams: "85",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "variant-milk",
          materialGroupId: "material-milk",
          materialName: "脱脂乳粉",
          supplierId: "supplier-a",
          supplierName: "供应商 A",
          modelOrSpecification: "低热型",
          densityGPerMl: null,
          nutrientsPer100g: { protein: "34" },
          nutrientUnits: { protein: "g" },
          pricePerKg: "31.5",
          allergens: {
            contains: ["乳及乳制品"],
            mayContain: [],
            sourceItemIds: {},
          },
          source: "供应商规格书",
          ingredientUpdatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    ],
    packagingCosts: [],
    additionalCosts: [],
    targets: [
      {
        id: "target-protein",
        metric: {
          kind: "nutrition_per_100g",
          nutrientDefinitionId: "protein",
          nutrientName: "蛋白质",
          unit: "g",
        },
        minimum: "8",
        maximum: null,
      },
    ],
    markdownNotes: "发酵温度 42℃。",
    calculation: {
      inputMassGrams: "1000",
      basisMassGrams: "960",
      basis: "finished_mass",
      yieldPercent: "96",
      nutrients: [],
      cost: {
        rawMaterialTotal: "2.6775",
        packagingTotal: "0",
        additionalTotal: "0",
        batchTotal: "2.6775",
        perKg: "2.7890625",
        per100g: "0.27890625",
        perServing: null,
        perPackage: null,
        status: "complete",
        missingItemIds: [],
        breakdown: [
          {
            id: "item-milk",
            name: "脱脂乳粉",
            category: "ingredient",
            amount: "2.6775",
          },
        ],
      },
      targets: [
        {
          targetId: "target-protein",
          status: "met",
          observed: "8.6",
          deltaToMinimum: "0.6",
          deltaToMaximum: null,
        },
      ],
      allergens: {
        contains: ["乳及乳制品"],
        mayContain: [],
        sourceItemIds: {},
      },
      completeness: { percent: 100, missingFields: [] },
      calculatedAt: "2026-07-31T06:20:00.000Z",
    },
  },
} satisfies RecipeVersion;

const labelVersion = {
  id: "label-version-1",
  labelId: "label-yogurt",
  versionNumber: 1,
  sourceDraftId: "label-draft-1",
  recipeVersionId: recipeVersion.id,
  rulePackId: "gb-28050-2011",
  rulePackRevision: "2011.1",
  createdAt: "2026-07-31T06:25:00.000Z",
  snapshot: {
    schemaVersion: 1,
    id: "label-version-1",
    labelId: "label-yogurt",
    labelVersionNumber: 1,
    recipeId: recipeVersion.recipeId,
    recipeVersionId: recipeVersion.id,
    rulePack: {
      id: "gb-28050-2011",
      revision: "2011.1",
      standardCode: "GB 28050-2011",
      publishedOn: "2011-10-12",
      effectiveFrom: "2013-01-01",
      officialSourceUrl: "https://www.nhc.gov.cn/example",
    },
    basis: { kind: "per_100g", quantity: "100", unit: "g" },
    sourceValues: [],
    rows: [
      {
        nutrientCode: "protein",
        name: "蛋白质",
        unit: "g",
        rawValue: "8.64",
        declaredValue: "8.6",
        nrvPercent: "14",
        sourceKind: "manual_confirmation",
        sourceReference: "人工复核记录",
      },
    ],
    issues: [],
    publishable: true,
    requiredNotice: null,
    generatedAt: "2026-07-31T06:25:00.000Z",
  },
} satisfies NutritionLabelVersion;

describe("buildResearchReportDocument", () => {
  it("maps one frozen recipe and label version into the shared report model", () => {
    const document = buildResearchReportDocument({
      id: "report-1",
      generatedAt: "2026-07-31T06:30:00.000Z",
      recipeVersion,
      nutritionLabelVersion: labelVersion,
    });

    expect(document.recipe.name).toBe("原味高蛋白酸奶");
    expect(document.ingredients[0]).toEqual(
      expect.objectContaining({
        name: "脱脂乳粉",
        supplierName: "供应商 A",
        specification: "低热型",
        percent: "8.5",
        cost: "2.6775",
      }),
    );
    expect(document.nutrition.rows[0]).toEqual(
      expect.objectContaining({
        declaredValue: "8.6",
        sourceLabel: "人工确认",
      }),
    );
    expect(document.targets[0]).toEqual({
      id: "target-protein",
      label: "蛋白质",
      criterion: "≥ 8 g/100g",
      actual: "8.6 g/100g",
      status: "met",
    });
    expect(document.provenance.nutritionLabelVersionId).toBe(
      "label-version-1",
    );
  });

  it("rejects a label version that belongs to another recipe version", () => {
    expect(() =>
      buildResearchReportDocument({
        id: "report-invalid",
        generatedAt: "2026-07-31T06:30:00.000Z",
        recipeVersion,
        nutritionLabelVersion: {
          ...labelVersion,
          recipeVersionId: "other-version",
        },
      }),
    ).toThrow("营养标签版本与配方版本不一致");
  });
});
