import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import type {
  NutritionLabelDraftSaveInput,
  NutritionLabelInput,
} from "./nutrition-label-types";
import type {
  RecipeDraftSaveInput,
  RecipeVersionCreateInput,
  RecipeVersionSnapshot,
} from "./recipe-types";
import { TauriDesktopApi } from "./tauri-desktop-api";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function recipeCalculation() {
  return {
    inputMassGrams: "1000",
    basisMassGrams: "1000",
    basis: "input_mass" as const,
    yieldPercent: null,
    nutrients: [],
    cost: {
      rawMaterialTotal: "0",
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal: "0",
      perKg: "0",
      per100g: "0",
      perServing: null,
      perPackage: null,
      status: "complete" as const,
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: { contains: [], mayContain: [], sourceItemIds: {} },
    completeness: { percent: 100, missingFields: [] },
    calculatedAt: "2026-07-31T09:00:00.000Z",
  };
}

function recipeDraft(recipeId: string): RecipeDraftSaveInput {
  return {
    recipeId,
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
    calculation: recipeCalculation(),
    calculationIssues: [],
  };
}

function recipeSnapshot(
  recipeId: string,
  recipeName: string,
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: recipeId,
      name: recipeName,
      code: null,
      tags: [],
      kind: "formula",
    },
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: recipeCalculation(),
  };
}

function validDraft(
  labelId: string,
  recipeVersionId: string,
): NutritionLabelDraftSaveInput {
  return {
    labelId,
    recipeVersionId,
    rulePackId: "gb-28050-2011",
    basis: { kind: "per_100g", quantity: "100", unit: "g" },
    sourceValues: [
      {
        nutrientCode: "protein",
        value: "5.04",
        unit: "g",
        sourceKind: "recipe_estimate",
        sourceReference: recipeVersionId,
        observedAt: null,
        completeness: "complete",
      },
      {
        nutrientCode: "fat",
        value: "3",
        unit: "g",
        sourceKind: "recipe_estimate",
        sourceReference: recipeVersionId,
        observedAt: null,
        completeness: "complete",
      },
      {
        nutrientCode: "carbohydrate",
        value: "10",
        unit: "g",
        sourceKind: "recipe_estimate",
        sourceReference: recipeVersionId,
        observedAt: null,
        completeness: "complete",
      },
      {
        nutrientCode: "sodium",
        value: "100.4",
        unit: "mg",
        sourceKind: "recipe_estimate",
        sourceReference: recipeVersionId,
        observedAt: null,
        completeness: "complete",
      },
    ],
    optionalNutrientCodes: [],
    roundingMode: "half_up",
  };
}

async function createFormalRecipe(api: BrowserDemoApi) {
  const recipe = await api.createRecipe({
    name: "低糖乳饮料",
    code: null,
    tags: [],
    kind: "formula",
  });
  const draft = await api.saveRecipeDraft(recipeDraft(recipe.id));
  const input: RecipeVersionCreateInput = {
    recipeId: recipe.id,
    sourceDraftId: draft.id,
    basedOnVersionId: null,
    snapshot: recipeSnapshot(recipe.id, recipe.name),
    dependencyVersionIds: [],
  };
  const version = await api.createRecipeVersion(input);
  return { recipe, version };
}

describe("nutrition label desktop API", () => {
  it("maps every native label command with camel-case payloads", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);
    const labelInput: NutritionLabelInput = {
      recipeId: "recipe-1",
      name: "营养成分表",
    };
    const draft = validDraft("label-1", "recipe-version-1");

    await api.listNutritionLabels("recipe-1");
    await api.getNutritionLabel("label-1");
    await api.createNutritionLabel(labelInput);
    await api.getNutritionLabelDraft("label-1");
    await api.calculateNutritionLabelPreview(draft);
    await api.saveNutritionLabelDraft(draft);
    await api.listNutritionLabelVersions("label-1");
    await api.getNutritionLabelVersion("label-version-1");
    await api.publishNutritionLabel("label-1");

    expect(invoke.mock.calls).toEqual([
      ["list_nutrition_labels", { recipeId: "recipe-1" }],
      ["get_nutrition_label", { id: "label-1" }],
      ["create_nutrition_label", { input: labelInput }],
      ["get_nutrition_label_draft", { labelId: "label-1" }],
      ["calculate_nutrition_label_preview", { input: draft }],
      ["save_nutrition_label_draft", { input: draft }],
      ["list_nutrition_label_versions", { labelId: "label-1" }],
      ["get_nutrition_label_version", { id: "label-version-1" }],
      ["publish_nutrition_label", { labelId: "label-1" }],
    ]);
  });

  it("migrates v5 browser state and publishes a server-calculated immutable snapshot", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `label-api-id-${++sequence}`,
      now: () => "2026-07-31T09:00:00.000Z",
    });
    const { recipe, version: recipeVersion } = await createFormalRecipe(api);
    const v6 = JSON.parse(
      storage.getItem("food-rd.browser-demo.v8") ?? "{}",
    ) as Record<string, unknown>;
    storage.clear();
    storage.setItem(
      "food-rd.browser-demo.v5",
      JSON.stringify({
        ...v6,
        schemaVersion: 5,
        nutritionLabels: undefined,
        nutritionLabelDrafts: undefined,
        nutritionLabelVersions: undefined,
      }),
    );

    const migrated = new BrowserDemoApi({
      storage,
      createId: () => `label-api-id-${++sequence}`,
      now: () => "2026-07-31T09:00:00.000Z",
    });
    const label = await migrated.createNutritionLabel({
      recipeId: recipe.id,
      name: "营养成分表",
    });
    const draft = await migrated.saveNutritionLabelDraft(
      validDraft(label.id, recipeVersion.id),
    );
    const published = await migrated.publishNutritionLabel(label.id);
    const reopened = new BrowserDemoApi({ storage });

    expect(draft.calculation).toMatchObject({
      publishable: true,
      rows: expect.arrayContaining([
        expect.objectContaining({
          nutrientCode: "energy",
          declaredValue: "367",
        }),
      ]),
    });
    expect(published).toMatchObject({
      labelId: label.id,
      versionNumber: 1,
      recipeVersionId: recipeVersion.id,
      rulePackId: "gb-28050-2011",
      rulePackRevision: "2011.1",
      snapshot: {
        id: published.id,
        labelVersionNumber: 1,
        recipeId: recipe.id,
        recipeVersionId: recipeVersion.id,
        publishable: true,
      },
    });
    expect(await reopened.getNutritionLabelVersion(published.id)).toEqual(
      published,
    );
    expect(
      JSON.parse(storage.getItem("food-rd.browser-demo.v8") ?? "{}"),
    ).toMatchObject({
      schemaVersion: 8,
      nutritionLabels: {
        [label.id]: { latestVersionNumber: 1 },
      },
      nutritionLabelDrafts: {
        [label.id]: { id: draft.id },
      },
      nutritionLabelVersions: {
        [published.id]: { versionNumber: 1 },
      },
      researchReports: {},
    });
  });

  it("blocks publishing unknown required values without consuming V1", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `label-api-id-${++sequence}`,
      now: () => "2026-07-31T09:00:00.000Z",
    });
    const { recipe, version: recipeVersion } = await createFormalRecipe(api);
    const label = await api.createNutritionLabel({
      recipeId: recipe.id,
      name: "营养成分表",
    });
    const incomplete = validDraft(label.id, recipeVersion.id);
    incomplete.sourceValues.find(
      (value) => value.nutrientCode === "sodium",
    )!.value = null;
    await api.saveNutritionLabelDraft(incomplete);

    await expect(api.publishNutritionLabel(label.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    expect(await api.listNutritionLabelVersions(label.id)).toEqual([]);

    await api.saveNutritionLabelDraft(validDraft(label.id, recipeVersion.id));
    const published = await api.publishNutritionLabel(label.id);
    expect(published.versionNumber).toBe(1);
  });
});
