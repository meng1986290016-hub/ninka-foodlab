import { describe, expect, it } from "vitest";

import type {
  IngredientVariant,
  NutrientDefinition,
} from "../../api/types";
import type {
  RecipeDraft,
  RecipeDraftIngredientItem,
  RecipeVersion,
} from "../../api/recipe-types";
import { calculateRecipeDraft } from "./recipe-calculation";

const nutrients: NutrientDefinition[] = [
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
    id: "sugars",
    code: "sugars",
    name: "糖",
    unit: "g",
    builtIn: true,
    sortOrder: 1,
    category: "nutrition",
    archivedAt: null,
  },
  {
    id: "lactose",
    code: "custom:lactose",
    name: "乳糖",
    unit: "g",
    builtIn: false,
    sortOrder: 2,
    category: "nutrition",
    archivedAt: null,
  },
  {
    id: "polyphenol",
    code: "custom:polyphenol",
    name: "总多酚",
    unit: "mg",
    builtIn: false,
    sortOrder: 3,
    category: "research",
    archivedAt: null,
  },
];

function variant(
  overrides: Partial<IngredientVariant> = {},
): IngredientVariant {
  return {
    id: "variant-milk",
    materialGroupId: "material-milk",
    supplierId: "supplier-a",
    supplierName: "供应商A",
    modelOrSpecification: "低热型",
    internalCode: null,
    currentPrice: "31.5",
    priceUnit: "kg",
    densityGPerMl: null,
    source: "供应商规格书",
    researchNotes: "",
    nutrition: {
      basis: "per_100g",
      values: [
        { nutrientDefinitionId: "protein", value: "34" },
        { nutrientDefinitionId: "sugars", value: "0" },
      ],
    },
    allergens: { contains: ["乳"], mayContain: [] },
    sourceAttachments: [],
    completeness: { percent: 100, missingFields: [] },
    createdAt: "2026-07-30T01:00:00.000Z",
    updatedAt: "2026-07-30T02:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function ingredientItem(
  ingredientVariant: IngredientVariant,
  overrides: Partial<RecipeDraftIngredientItem> = {},
): RecipeDraftIngredientItem {
  return {
    id: `item-${ingredientVariant.id}`,
    position: 0,
    kind: "ingredient",
    ingredientVariantId: ingredientVariant.id,
    materialName: "脱脂乳粉",
    ingredientVariant,
    amount: "100",
    unit: "g",
    locked: false,
    autoFill: false,
    ...overrides,
  };
}

function draft(
  items: RecipeDraft["items"],
  overrides: Partial<RecipeDraft> = {},
): RecipeDraft {
  return {
    id: "draft-1",
    recipeId: "recipe-1",
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items,
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: null,
    calculationIssues: [],
    createdAt: "2026-07-30T03:00:00.000Z",
    updatedAt: "2026-07-30T03:00:00.000Z",
    ...overrides,
  };
}

function calculate(
  recipeDraft: RecipeDraft,
  referencedVersions: RecipeVersion[] = [],
) {
  return calculateRecipeDraft({
    draft: recipeDraft,
    referencedVersions,
    nutrientDefinitions: nutrients,
    calculatedAt: "2026-07-30T04:00:00.000Z",
  });
}

it("treats a legacy ingredient without allergen fields as having no declarations", () => {
  const legacyVariant = variant();
  delete (legacyVariant as Partial<IngredientVariant>).allergens;

  const result = calculate(draft([ingredientItem(legacyVariant)]));

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.calculation.allergens).toEqual({
      contains: [],
      mayContain: [],
      sourceItemIds: {},
    });
  }
});

describe("recipe calculation adapter", () => {
  it("freezes the selected supplier nutrition and price into a deterministic snapshot", () => {
    const result = calculate(
      draft([ingredientItem(variant())], {
        targetBatchGrams: "100",
        packagingCosts: [
          { id: "cup", name: "酸奶杯", quantity: "2", unitCost: "0.5" },
        ],
        additionalCosts: [
          { id: "energy", name: "能耗", amount: "0.2" },
        ],
        packageCount: "2",
        servingMassGrams: "25",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calculation.nutrients).toEqual([
      expect.objectContaining({
        nutrientDefinitionId: "protein",
        totalKnownAmount: "34",
        per100gKnownAmount: "34",
        status: "complete",
      }),
      expect.objectContaining({
        nutrientDefinitionId: "sugars",
        totalKnownAmount: "0",
        status: "complete",
      }),
    ]);
    expect(result.value.calculation.cost).toMatchObject({
      rawMaterialTotal: "3.15",
      packagingTotal: "1",
      additionalTotal: "0.2",
      batchTotal: "4.35",
      perKg: "43.5",
      per100g: "4.35",
      perServing: "1.0875",
      perPackage: "2.175",
    });
    expect(result.value.versionItems[0]).toMatchObject({
      kind: "ingredient",
      massGrams: "100",
      ingredient: {
        ingredientVariantId: "variant-milk",
        supplierName: "供应商A",
        pricePerKg: "31.5",
        nutrientsPer100g: { protein: "34", sugars: "0" },
      },
    });
    expect(result.value.calculation.allergens).toEqual({
      contains: ["乳"],
      mayContain: [],
      sourceItemIds: { 乳: ["item-variant-milk"] },
    });
  });

  it("converts volume price and per-100mL nutrition with density", () => {
    const juice = variant({
      id: "variant-juice",
      materialGroupId: "material-juice",
      supplierName: "果汁供应商",
      currentPrice: "12",
      priceUnit: "L",
      densityGPerMl: "1.2",
      nutrition: {
        basis: "per_100ml",
        values: [
          { nutrientDefinitionId: "protein", value: "0" },
          { nutrientDefinitionId: "sugars", value: "10" },
        ],
      },
      allergens: { contains: [], mayContain: [] },
    });
    const result = calculate(
      draft([
        ingredientItem(juice, {
          id: "item-juice",
          materialName: "浓缩果汁",
          amount: "100",
          unit: "mL",
        }),
      ], { targetBatchGrams: "120" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.versionItems[0]).toMatchObject({
      massGrams: "120",
      ingredient: {
        pricePerKg: "10",
        nutrientsPer100g: {
          protein: "0",
          sugars: "8.3333333333333333333",
        },
      },
    });
    expect(result.value.calculation.nutrients[1]).toMatchObject({
      totalKnownAmount: "10",
      per100gKnownAmount: "8.3333333333333333333",
    });
    expect(result.value.calculation.cost.rawMaterialTotal).toBe("1.2");
  });

  it("only aggregates selected custom items and keeps category, unknown and zero distinct", () => {
    const selected = variant({
      id: "variant-selected-custom",
      nutrition: {
        basis: "per_100g",
        values: [
          { nutrientDefinitionId: "protein", value: "34" },
          { nutrientDefinitionId: "sugars", value: "0" },
          { nutrientDefinitionId: "lactose", value: null },
          { nutrientDefinitionId: "polyphenol", value: "0" },
        ],
      },
    });
    const unselected = variant({
      id: "variant-unselected-custom",
      supplierId: "supplier-b",
      supplierName: "供应商B",
    });
    const result = calculate(draft([
      ingredientItem(selected, { id: "item-selected", amount: "50" }),
      ingredientItem(unselected, {
        id: "item-unselected",
        position: 1,
        amount: "50",
      }),
    ]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calculation.nutrients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientDefinitionId: "lactose",
          category: "nutrition",
          status: "unknown",
          missingItemIds: ["item-selected"],
        }),
        expect.objectContaining({
          nutrientDefinitionId: "polyphenol",
          category: "research",
          status: "complete",
          per100gKnownAmount: "0",
          missingItemIds: [],
        }),
      ]),
    );
  });

  it("uses total input or finished mass for theoretical sweetness and reports partial data", () => {
    const sucrose = variant({
      id: "variant-sucrose",
      sweetness: {
        basis: "w_w_percent",
        content: "10",
        relativeFactor: "1",
      },
    });
    const filler = variant({
      id: "variant-filler",
      supplierId: "supplier-b",
      supplierName: "供应商B",
      sweetness: null,
    });
    const inputBasis = calculate(draft([
      ingredientItem(sucrose, { id: "item-sucrose", amount: "100" }),
      ingredientItem(filler, {
        id: "item-filler",
        position: 1,
        amount: "100",
      }),
    ]));
    expect(inputBasis.ok).toBe(true);
    if (inputBasis.ok) {
      expect(inputBasis.value.calculation.sweetness).toMatchObject({
        totalSucroseEquivalentGrams: "10",
        per100gSucroseEquivalent: "5",
        status: "complete",
      });
    }

    const missingDensity = variant({
      id: "variant-high-intensity",
      supplierId: "supplier-c",
      supplierName: "供应商C",
      densityGPerMl: null,
      sweetness: {
        basis: "w_v_per_100ml",
        content: "1",
        relativeFactor: "200",
      },
    });
    const finishedBasis = calculate(draft([
      ingredientItem(sucrose, { id: "item-sucrose", amount: "100" }),
      ingredientItem(missingDensity, {
        id: "item-high-intensity",
        position: 1,
        amount: "10",
      }),
    ], { finishedMassGrams: "100" }));
    expect(finishedBasis.ok).toBe(true);
    if (finishedBasis.ok) {
      expect(finishedBasis.value.calculation.sweetness).toMatchObject({
        totalSucroseEquivalentGrams: "10",
        per100gSucroseEquivalent: "10",
        status: "partial",
        missingItemIds: ["item-high-intensity"],
      });
    }
  });

  it("blocks volume conversion when density is missing", () => {
    const result = calculate(
      draft([
        ingredientItem(variant(), {
          amount: "100",
          unit: "mL",
        }),
      ]),
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "missing_density",
          itemId: "item-variant-milk",
          severity: "error",
        }),
      ],
    });
  });

  it("expands an explicit semi-finished version and detects cycles", () => {
    const syrup: RecipeVersion = {
      id: "syrup-v1",
      recipeId: "recipe-syrup",
      versionNumber: 1,
      sourceDraftId: "draft-syrup",
      basedOnVersionId: null,
      snapshot: {
        schemaVersion: 1,
        recipe: {
          id: "recipe-syrup",
          name: "糖浆",
          code: null,
          tags: [],
          kind: "semi_finished",
        },
        targetBatchGrams: "100",
        finishedMassGrams: "100",
        servingMassGrams: null,
        packageCount: null,
        items: [
          {
            id: "syrup-sugar",
            position: 0,
            kind: "ingredient",
            amount: "20",
            unit: "g",
            massGrams: "20",
            locked: false,
            autoFill: false,
            ingredient: {
              ingredientVariantId: "variant-sugar",
              materialGroupId: "material-sugar",
              materialName: "白砂糖",
              supplierId: "supplier-sugar",
              supplierName: "糖业A",
              modelOrSpecification: "",
              densityGPerMl: null,
              nutrientsPer100g: { sugars: "100" },
              nutrientUnits: { sugars: "g" },
              sweetness: {
                basis: "w_w_percent",
                content: "100",
                relativeFactor: "1",
              },
              pricePerKg: "8",
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
        packagingCosts: [],
        additionalCosts: [],
        targets: [],
        markdownNotes: "",
        calculation: {
          inputMassGrams: "20",
          basisMassGrams: "20",
          basis: "input_mass",
          yieldPercent: null,
          nutrients: [],
          cost: {
            rawMaterialTotal: "0.16",
            packagingTotal: "0",
            additionalTotal: "0",
            batchTotal: "0.16",
            perKg: "8",
            per100g: "0.8",
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
          calculatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
      createdAt: "2026-07-30T00:00:00.000Z",
    };
    const root = draft([
      {
        id: "root-syrup",
        position: 0,
        kind: "recipe_version",
        recipeVersionId: syrup.id,
        recipeVersion: {
          id: syrup.id,
          recipeId: syrup.recipeId,
          recipeName: "糖浆",
          versionNumber: 1,
          outputMassGrams: "100",
          createdAt: syrup.createdAt,
        },
        amount: "500",
        unit: "g",
        locked: false,
        autoFill: false,
      },
    ], { targetBatchGrams: "500" });

    const expanded = calculate(root, [syrup]);
    expect(expanded.ok).toBe(true);
    if (expanded.ok) {
      expect(
        expanded.value.calculation.nutrients.find(
          (nutrient) => nutrient.nutrientDefinitionId === "protein",
        ),
      ).toMatchObject({
        status: "unknown",
        missingItemIds: ["syrup-sugar"],
      });
      expect(
        expanded.value.calculation.nutrients.find(
          (nutrient) => nutrient.nutrientDefinitionId === "sugars",
        ),
      ).toMatchObject({
        totalKnownAmount: "100",
        per100gKnownAmount: "20",
      });
      expect(expanded.value.calculation.cost.rawMaterialTotal).toBe("0.8");
      expect(expanded.value.calculation.sweetness).toMatchObject({
        totalSucroseEquivalentGrams: "100",
        per100gSucroseEquivalent: "20",
        status: "complete",
      });
    }

    const noMeasuredOutput = structuredClone(syrup);
    noMeasuredOutput.id = "powder-premix-v1";
    noMeasuredOutput.recipeId = "recipe-powder-premix";
    noMeasuredOutput.snapshot.recipe = {
      id: "recipe-powder-premix",
      name: "糖粉预混料",
      code: null,
      tags: [],
      kind: "semi_finished",
    };
    noMeasuredOutput.snapshot.targetBatchGrams = "1000";
    noMeasuredOutput.snapshot.finishedMassGrams = null;
    const premixIngredient = noMeasuredOutput.snapshot.items[0];
    if (!premixIngredient || premixIngredient.kind !== "ingredient") {
      throw new Error("missing premix ingredient fixture");
    }
    noMeasuredOutput.snapshot.items[0] = {
      ...premixIngredient,
      amount: "100",
      unit: "kg",
      massGrams: "100000",
    };
    noMeasuredOutput.snapshot.calculation.inputMassGrams = "100000";
    noMeasuredOutput.snapshot.calculation.basisMassGrams = "100000";
    const noMeasuredOutputRoot = structuredClone(root);
    noMeasuredOutputRoot.targetBatchGrams = "290";
    noMeasuredOutputRoot.finishedMassGrams = "290";
    const noMeasuredOutputReference = noMeasuredOutputRoot.items[0];
    if (noMeasuredOutputReference?.kind === "recipe_version") {
      noMeasuredOutputReference.recipeVersionId = noMeasuredOutput.id;
      noMeasuredOutputReference.recipeVersion = {
        id: noMeasuredOutput.id,
        recipeId: noMeasuredOutput.recipeId,
        recipeName: "糖粉预混料",
        versionNumber: 1,
        outputMassGrams: "100000",
        createdAt: noMeasuredOutput.createdAt,
      };
      noMeasuredOutputReference.amount = "290";
    }
    const conserved = calculate(noMeasuredOutputRoot, [noMeasuredOutput]);
    expect(conserved.ok).toBe(true);
    if (conserved.ok) {
      expect(
        conserved.value.calculation.nutrients.find(
          (nutrient) => nutrient.nutrientDefinitionId === "sugars",
        ),
      ).toMatchObject({
        totalKnownAmount: "290",
        per100gKnownAmount: "100",
      });
      expect(conserved.value.calculation.cost.rawMaterialTotal).toBe("2.32");
    }

    const glaze: RecipeVersion = {
      ...structuredClone(syrup),
      id: "glaze-v1",
      recipeId: "recipe-glaze",
      snapshot: {
        ...structuredClone(syrup.snapshot),
        recipe: {
          id: "recipe-glaze",
          name: "糖衣液",
          code: null,
          tags: [],
          kind: "semi_finished",
        },
        items: [
          {
            id: "glaze-syrup",
            position: 0,
            kind: "recipe_version",
            amount: "50",
            unit: "g",
            massGrams: "50",
            locked: false,
            autoFill: false,
            recipeVersion: {
              id: syrup.id,
              recipeId: syrup.recipeId,
              recipeName: "糖浆",
              versionNumber: 1,
              outputMassGrams: "100",
              createdAt: syrup.createdAt,
            },
          },
        ],
      },
    };
    const nestedRoot = structuredClone(root);
    const nestedReference = nestedRoot.items[0];
    if (nestedReference?.kind === "recipe_version") {
      nestedReference.recipeVersionId = glaze.id;
      nestedReference.recipeVersion = {
        id: glaze.id,
        recipeId: glaze.recipeId,
        recipeName: "糖衣液",
        versionNumber: 1,
        outputMassGrams: "100",
        createdAt: glaze.createdAt,
      };
    }
    const nested = calculate(nestedRoot, [syrup, glaze]);
    expect(nested.ok).toBe(true);
    if (nested.ok) {
      expect(
        nested.value.calculation.nutrients.find(
          (nutrient) => nutrient.nutrientDefinitionId === "sugars",
        ),
      ).toMatchObject({
        totalKnownAmount: "50",
        per100gKnownAmount: "10",
      });
      expect(nested.value.calculation.cost.rawMaterialTotal).toBe("0.4");
      expect(nested.value.calculation.sweetness).toMatchObject({
        totalSucroseEquivalentGrams: "50",
        per100gSucroseEquivalent: "10",
      });
    }

    const cyclic = structuredClone(syrup);
    cyclic.snapshot.items = [
      {
        id: "cycle",
        position: 0,
        kind: "recipe_version",
        amount: "10",
        unit: "g",
        massGrams: "10",
        locked: false,
        autoFill: false,
        recipeVersion: {
          id: cyclic.id,
          recipeId: cyclic.recipeId,
          recipeName: "糖浆",
          versionNumber: 1,
          outputMassGrams: "100",
          createdAt: cyclic.createdAt,
        },
      },
    ];
    const cycleResult = calculate(root, [cyclic]);
    expect(cycleResult).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "recipe_cycle",
          itemId: "syrup-v1",
        }),
      ],
    });
  });

  it("preserves unknown separately from zero and reports missing prices", () => {
    const unknown = variant({
      id: "variant-unknown",
      currentPrice: null,
      nutrition: {
        basis: "per_100g",
        values: [{ nutrientDefinitionId: "protein", value: null }],
      },
      allergens: { contains: [], mayContain: ["坚果"] },
    });
    const zero = variant({
      id: "variant-zero",
      supplierId: "supplier-b",
      supplierName: "供应商B",
      nutrition: {
        basis: "per_100g",
        values: [{ nutrientDefinitionId: "protein", value: "0" }],
      },
      allergens: { contains: ["坚果"], mayContain: [] },
    });
    const result = calculate(
      draft([
        ingredientItem(unknown, {
          id: "item-unknown",
          amount: "50",
        }),
        ingredientItem(zero, {
          id: "item-zero",
          position: 1,
          amount: "50",
        }),
      ], { targetBatchGrams: "100" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calculation.nutrients[0]).toMatchObject({
      totalKnownAmount: "0",
      per100gKnownAmount: "0",
      status: "partial",
      completenessRatio: "0.5",
      missingItemIds: ["item-unknown"],
    });
    expect(result.value.calculation.cost).toMatchObject({
      status: "partial",
      missingItemIds: ["item-unknown"],
    });
    expect(result.value.calculation.allergens).toEqual({
      contains: ["坚果"],
      mayContain: [],
      sourceItemIds: { 坚果: ["item-unknown", "item-zero"] },
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "missing_price",
        itemId: "item-unknown",
      }),
    ]);
  });

  it("evaluates nutrition and all supported cost target bases", () => {
    const result = calculate(
      draft([ingredientItem(variant())], {
        targetBatchGrams: "100",
        targets: [
          {
            id: "protein-target",
            metric: {
              kind: "nutrition_per_100g",
              nutrientDefinitionId: "protein",
              nutrientName: "蛋白质",
              unit: "g",
            },
            minimum: "30",
            maximum: "40",
          },
          {
            id: "batch-cost-target",
            metric: {
              kind: "cost",
              basis: "batch",
              unit: "CNY",
            },
            minimum: null,
            maximum: "4",
          },
          {
            id: "kg-cost-target",
            metric: {
              kind: "cost",
              basis: "per_kg",
              unit: "CNY",
            },
            minimum: null,
            maximum: "30",
          },
          {
            id: "100g-cost-target",
            metric: {
              kind: "cost",
              basis: "per_100g",
              unit: "CNY",
            },
            minimum: null,
            maximum: "4",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calculation.targets).toEqual([
      expect.objectContaining({
        targetId: "protein-target",
        status: "met",
        observed: "34",
      }),
      expect.objectContaining({
        targetId: "batch-cost-target",
        status: "met",
        observed: "3.15",
      }),
      expect.objectContaining({
        targetId: "kg-cost-target",
        status: "above",
        observed: "31.5",
      }),
      expect.objectContaining({
        targetId: "100g-cost-target",
        status: "met",
        observed: "3.15",
      }),
    ]);
  });
});
