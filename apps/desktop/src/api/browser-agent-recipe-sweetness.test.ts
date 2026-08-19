import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentRecipeProposalPayload } from "./agent-recipe-types";
import { evaluateBrowserAgentRecipe } from "./browser-agent-recipe";
import type { MaterialGroup, NutrientDefinition } from "./types";

interface SweetnessParityFixture {
  ingredientMassGrams: string;
  otherMassGrams: string;
  relativeFactor: string;
  expectedTotalSucroseEquivalentGrams: string;
  expectedPer100gSucroseEquivalent: string;
}

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../test-fixtures/sweetness-parity.json"),
    "utf8",
  ),
) as SweetnessParityFixture;

const definitions: NutrientDefinition[] = [
  {
    id: "protein",
    code: "protein",
    name: "蛋白质",
    unit: "g",
    builtIn: true,
    sortOrder: 0,
    category: "nutrition",
    archivedAt: null,
  },
  {
    id: "theoretical_sweetness",
    code: "theoretical_sweetness",
    name: "理论甜度（蔗糖=1）",
    unit: "倍",
    builtIn: true,
    sortOrder: 1000,
    category: "research",
    archivedAt: null,
  },
];

const groups: MaterialGroup[] = [
  {
    id: "material-sucrose",
    name: "蔗糖溶液",
    categoryId: null,
    categoryName: null,
    variants: [
      {
        id: "variant-sucrose",
        materialGroupId: "material-sucrose",
        supplierId: "supplier-a",
        supplierName: "供应商A",
        modelOrSpecification: "10%",
        internalCode: null,
        currentPrice: "1",
        priceUnit: "kg",
        densityGPerMl: null,
        source: "共享算例",
        researchNotes: "",
        nutrition: {
          basis: "per_100g",
          values: [
            { nutrientDefinitionId: "protein", value: "0" },
            {
              nutrientDefinitionId: "theoretical_sweetness",
              value: fixture.relativeFactor,
            },
          ],
        },
        allergens: { contains: [], mayContain: [] },
        sourceAttachments: [],
        completeness: { percent: 100, missingFields: [] },
        createdAt: "2026-08-10T00:00:00Z",
        updatedAt: "2026-08-10T00:00:00Z",
        archivedAt: null,
      },
    ],
    createdAt: "2026-08-10T00:00:00Z",
    updatedAt: "2026-08-10T00:00:00Z",
    archivedAt: null,
  },
];

function payload(): AgentRecipeProposalPayload {
  return {
    productName: "共享甜度算例",
    recipeKind: "formula",
    mode: "goal_design",
    finishedMassGrams: null,
    yieldAssumption: "assumed_100_percent",
    items: [
      {
        id: "sweet",
        position: 0,
        kind: "ingredient",
        amount: fixture.ingredientMassGrams,
        unit: "g",
        estimatedMinimum: null,
        estimatedMaximum: null,
        confidence: "high",
        ingredientVariantId: "variant-sucrose",
        ingredientUpdatedAt: "2026-08-10T00:00:00Z",
        materialName: "蔗糖溶液",
        supplierName: "供应商A",
        modelOrSpecification: "10%",
        selectionReason: "共享算例",
      },
      {
        id: "other",
        position: 1,
        kind: "material_need",
        amount: fixture.otherMassGrams,
        unit: "g",
        estimatedMinimum: null,
        estimatedMaximum: null,
        confidence: "high",
        materialName: "其他原料",
        purpose: "补足批量",
        desiredSpecification: "",
        missingReason: "共享算例",
      },
    ],
    requirements: [],
    assumptions: [],
    warnings: [],
    markdownNotes: "",
  };
}

describe("browser Agent sweetness parity", () => {
  it("matches the shared deterministic fixture", () => {
    const result = evaluateBrowserAgentRecipe(
      payload(),
      groups,
      definitions,
      "2026-08-10T00:00:00Z",
    );

    expect(result.evaluation.calculation.sweetness).toMatchObject({
      totalSucroseEquivalentGrams:
        fixture.expectedTotalSucroseEquivalentGrams,
      per100gSucroseEquivalent: fixture.expectedPer100gSucroseEquivalent,
      status: "complete",
    });
  });
});
