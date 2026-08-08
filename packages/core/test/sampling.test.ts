import { describe, expect, it } from "vitest";

import {
  calculateSamplingSheet,
  formatSamplingAmount,
  type SamplingRecipeNode,
} from "../src/index.js";

const base: SamplingRecipeNode = {
  id: "root",
  name: "冰淇淋",
  versionLabel: "V3",
  finishedMassGrams: "950",
  outputMassGrams: "950",
  items: [
    {
      id: "milk",
      position: 0,
      kind: "ingredient",
      amount: "700",
      unit: "g",
      massGrams: "700",
      ingredient: {
        id: "milk-a",
        name: "脱脂乳粉",
        supplierName: "供应商 A",
        specification: "25kg袋装",
      },
    },
    {
      id: "water",
      position: 1,
      kind: "ingredient",
      amount: "300",
      unit: "mL",
      massGrams: "300",
      ingredient: {
        id: "water",
        name: "饮用水",
        supplierName: null,
        specification: null,
      },
    },
  ],
};

describe("calculateSamplingSheet", () => {
  it("scales by expected finished output while preserving item units", () => {
    const result = calculateSamplingSheet({
      source: base,
      referencedRecipes: {},
      basis: "finished_output",
      hierarchy: "direct",
      targetAmount: "475",
      targetUnit: "g",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scaleFactor).toBe("0.5");
    expect(result.value.expectedInputMassGrams).toBe("500");
    expect(result.value.yieldPercent).toBe("95");
    expect(result.value.lines).toMatchObject([
      { name: "脱脂乳粉", amount: "350", unit: "g", massGrams: "350" },
      { name: "饮用水", amount: "150", unit: "mL", massGrams: "150" },
    ]);
  });

  it("scales by planned input and supports kg targets", () => {
    const result = calculateSamplingSheet({
      source: base,
      referencedRecipes: {},
      basis: "planned_input",
      hierarchy: "direct",
      targetAmount: "2",
      targetUnit: "kg",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scaleFactor).toBe("2");
    expect(result.value.expectedInputMassGrams).toBe("2000");
    expect(result.value.expectedFinishedMassGrams).toBe("1900");
  });

  it("requires a finished weight for output-based sampling", () => {
    const result = calculateSamplingSheet({
      source: { ...base, finishedMassGrams: null },
      referencedRecipes: {},
      basis: "finished_output",
      hierarchy: "direct",
      targetAmount: "100",
      targetUnit: "g",
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ field: "sourceFinishedMassGrams" }],
    });
  });

  it("expands semi-finished versions and retains their source path", () => {
    const chocolate: SamplingRecipeNode = {
      id: "chocolate-v2",
      name: "巧克力基底",
      versionLabel: "V2",
      finishedMassGrams: "200",
      outputMassGrams: "200",
      items: [
        {
          id: "cocoa",
          position: 0,
          kind: "ingredient",
          amount: "40",
          unit: "g",
          massGrams: "40",
          ingredient: {
            id: "cocoa-a",
            name: "可可粉",
            supplierName: "供应商 C",
            specification: "碱化",
          },
        },
      ],
    };
    const root: SamplingRecipeNode = {
      ...base,
      items: [
        {
          id: "base-item",
          position: 0,
          kind: "recipe_version",
          amount: "100",
          unit: "g",
          massGrams: "100",
          recipeVersionId: chocolate.id,
          recipeName: chocolate.name,
          versionNumber: 2,
        },
      ],
      finishedMassGrams: "100",
      outputMassGrams: "100",
    };
    const result = calculateSamplingSheet({
      source: root,
      referencedRecipes: { [chocolate.id]: chocolate },
      basis: "planned_input",
      hierarchy: "expanded",
      targetAmount: "50",
      targetUnit: "g",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines).toMatchObject([
      {
        name: "可可粉",
        amount: "10",
        massGrams: "10",
        sourcePath: ["巧克力基底 V2"],
      },
    ]);
  });

  it("reports missing and circular semi-finished references", () => {
    const referencedItem = {
      id: "nested",
      position: 0,
      kind: "recipe_version" as const,
      amount: "100",
      unit: "g" as const,
      massGrams: "100",
      recipeVersionId: "child",
      recipeName: "子配方",
      versionNumber: 1,
    };
    const source = { ...base, items: [referencedItem] };
    const missing = calculateSamplingSheet({
      source,
      referencedRecipes: {},
      basis: "planned_input",
      hierarchy: "expanded",
      targetAmount: "100",
      targetUnit: "g",
    });
    expect(missing).toMatchObject({
      ok: false,
      issues: [{ code: "missing-recipe-version" }],
    });

    const child: SamplingRecipeNode = {
      id: "child",
      name: "子配方",
      versionLabel: "V1",
      finishedMassGrams: "100",
      outputMassGrams: "100",
      items: [{ ...referencedItem, recipeVersionId: "root", recipeName: "冰淇淋" }],
    };
    const circular = calculateSamplingSheet({
      source,
      referencedRecipes: { child, root: source },
      basis: "planned_input",
      hierarchy: "expanded",
      targetAmount: "100",
      targetUnit: "g",
    });
    expect(circular).toMatchObject({
      ok: false,
      issues: [{ code: "recipe-cycle" }],
    });
  });
});

describe("formatSamplingAmount", () => {
  it("uses practical laboratory units and precision", () => {
    expect(formatSamplingAmount("0.45", "kg").label).toBe("450.0 g");
    expect(formatSamplingAmount("1.23456", "kg").label).toBe("1.235 kg");
    expect(formatSamplingAmount("35", "g").label).toBe("35.00 g");
    expect(formatSamplingAmount("0.125", "g").label).toBe("125 mg");
    expect(formatSamplingAmount("0.1254", "mL").label).toBe("0.125 mL");
  });
});
