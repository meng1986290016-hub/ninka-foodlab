import { describe, expect, it } from "vitest";

import type {
  IngredientVariant,
  IngredientVariantInput,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import {
  buildVariantComparison,
  calculateCompleteness,
} from "./nutrition-model";

const definitions: NutrientDefinition[] = ([
  ["energy", "能量", "kJ"],
  ["protein", "蛋白质", "g"],
  ["fat", "脂肪", "g"],
  ["saturated_fat", "饱和脂肪", "g"],
  ["carbohydrate", "碳水化合物", "g"],
  ["sugars", "糖", "g"],
  ["dietary_fiber", "膳食纤维", "g"],
  ["sodium", "钠", "mg"],
] as const).map(([id, name, unit], index) => ({
  id,
  code: id,
  name,
  unit,
  builtIn: true,
  sortOrder: index,
  category: "nutrition" as const,
  archivedAt: null,
}));

function inputWith(
  overrides: Partial<IngredientVariantInput> = {},
): IngredientVariantInput {
  return {
    materialGroupId: "milk-powder",
    supplierId: "supplier-a",
    modelOrSpecification: "低热型",
    internalCode: null,
    currentPrice: "31.50",
    priceUnit: "kg",
    densityGPerMl: null,
    source: "供应商规格书",
    researchNotes: "",
    nutrition: {
      basis: "per_100g",
      values: definitions.map((definition) => ({
        nutrientDefinitionId: definition.id,
        value: "1",
      })),
    },
    allergens: { contains: [], mayContain: [] },
    ...overrides,
  };
}

function variant(
  id: string,
  supplierName: string,
  protein: string | null,
): IngredientVariant {
  return {
    ...inputWith({
      supplierId: `supplier-${id}`,
      currentPrice: id === "a" ? "31.50" : null,
      nutrition: {
        basis: "per_100g",
        values: [{ nutrientDefinitionId: "protein", value: protein }],
      },
    }),
    id,
    supplierName,
    completeness: { percent: id === "a" ? 90 : 40, missingFields: [] },
    createdAt: "2026-07-15T01:00:00.000Z",
    updatedAt: `2026-07-${id === "a" ? "15" : "16"}T01:00:00.000Z`,
    archivedAt: null,
    allergens: { contains: [], mayContain: [] },
    sourceAttachments: [],
  };
}

describe("calculateCompleteness", () => {
  it("counts confirmed zero as present and null as missing", () => {
    const result = calculateCompleteness(
      inputWith({
        nutrition: {
          basis: "per_100g",
          values: definitions.map((definition) => ({
            nutrientDefinitionId: definition.id,
            value: definition.id === "fat" ? null : "0",
          })),
        },
      }),
      definitions,
    );

    expect(result.missingFields).toContain("脂肪");
    expect(result.missingFields).not.toContain("蛋白质");
    expect(result.percent).toBe(90);
  });

  it("requires density only for per-100ml source data", () => {
    const volumeResult = calculateCompleteness(
      inputWith({
        densityGPerMl: null,
        nutrition: {
          basis: "per_100ml",
          values: inputWith().nutrition.values,
        },
      }),
      definitions,
    );
    const massResult = calculateCompleteness(
      inputWith({ densityGPerMl: null }),
      definitions,
    );

    expect(volumeResult.missingFields).toContain("密度");
    expect(volumeResult.percent).toBe(91);
    expect(massResult.missingFields).not.toContain("密度");
    expect(massResult.percent).toBe(100);
  });
});

describe("buildVariantComparison", () => {
  it("preserves unknown separately from confirmed zero", () => {
    const group: MaterialGroup = {
      id: "milk-powder",
      name: "脱脂乳粉",
      categoryId: null,
      categoryName: null,
      variants: [variant("a", "供应商A", "0"), variant("b", "供应商B", null)],
      createdAt: "2026-07-15T01:00:00.000Z",
      updatedAt: "2026-07-16T01:00:00.000Z",
      archivedAt: null,
    };

    const comparison = buildVariantComparison(
      group,
      ["a", "b"],
      definitions,
    );
    const protein = comparison.rows.find((row) => row.key === "nutrient:protein");
    const price = comparison.rows.find((row) => row.key === "currentPrice");

    expect(protein?.values).toEqual({ a: "0", b: null });
    expect(price?.values).toEqual({ a: "31.50 元/kg", b: null });
    expect(comparison.variants.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
