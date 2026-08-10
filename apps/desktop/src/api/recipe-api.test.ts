import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import type {
  RecipeCalculation,
  RecipeDraftSaveInput,
  RecipeInput,
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

function calculation(protein: string, batchTotal: string): RecipeCalculation {
  return {
    inputMassGrams: "1000",
    basisMassGrams: "1000",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [
      {
        nutrientDefinitionId: "protein",
        name: "蛋白质",
        unit: "g",
        totalKnownAmount: protein,
        per100gKnownAmount: protein,
        status: "complete",
        completenessRatio: "1",
        missingItemIds: [],
      },
    ],
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
    calculatedAt: "2026-07-30T10:00:00.000Z",
  };
}

function draftInput(
  recipeId: string,
  targetBatchGrams: string,
  protein: string,
  notes: string,
): RecipeDraftSaveInput {
  return {
    recipeId,
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams,
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: notes,
    calculation: calculation(protein, protein),
    calculationIssues: [],
  };
}

function snapshot(
  recipe: { id: string; name: string },
  targetBatchGrams: string,
  protein: string,
  notes: string,
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      code: null,
      tags: [],
      kind: "formula",
    },
    targetBatchGrams,
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: notes,
    calculation: calculation(protein, protein),
  };
}

describe("recipe desktop API", () => {
  it("maps every native recipe command with camel-case payloads", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);
    const recipeInput: RecipeInput = {
      name: "低糖乳饮料",
      code: null,
      tags: [],
      kind: "formula",
    };
    const saveDraftInput = draftInput(
      "recipe-1",
      "1000",
      "3.2",
      "第一次小试",
    );
    const versionInput: RecipeVersionCreateInput = {
      recipeId: "recipe-1",
      sourceDraftId: "draft-1",
      basedOnVersionId: null,
      snapshot: snapshot(
        { id: "recipe-1", name: "低糖乳饮料" },
        "1000",
        "3.2",
        "第一次小试",
      ),
      dependencyVersionIds: [],
    };

    await api.listRecipes();
    await api.getRecipe("recipe-1");
    await api.createRecipe(recipeInput);
    await api.createRecipeAlternative({
      sourceVersionId: "version-1",
      schemeName: "供应商 B 可可粉版本",
      schemeStatus: "researching",
    });
    await api.updateRecipe("recipe-1", recipeInput);
    await api.updateRecipeScheme("recipe-1", {
      schemeName: "主配方",
      schemeStatus: "current",
    });
    await api.getRecipeDraft("recipe-1");
    await api.saveRecipeDraft(saveDraftInput);
    await api.listRecipeVersions("recipe-1");
    await api.getRecipeVersion("version-1");
    await api.createRecipeVersion(versionInput);
    await api.copyRecipeVersionToDraft("version-1");
    await api.compareRecipeVersions("version-1", "version-2");
    await api.archiveRecipe("recipe-1");
    await api.restoreRecipe("recipe-1");
    await api.deleteDraftRecipe("recipe-1");
    await api.deleteRecipeVersion("version-1");
    await api.permanentlyDeleteRecipe("recipe-1", "低糖乳饮料");

    expect(invoke.mock.calls).toEqual([
      ["list_recipes", undefined],
      ["get_recipe", { id: "recipe-1" }],
      ["create_recipe", { input: recipeInput }],
      [
        "create_recipe_alternative",
        {
          input: {
            sourceVersionId: "version-1",
            schemeName: "供应商 B 可可粉版本",
            schemeStatus: "researching",
          },
        },
      ],
      ["update_recipe", { id: "recipe-1", input: recipeInput }],
      [
        "update_recipe_scheme",
        {
          id: "recipe-1",
          input: { schemeName: "主配方", schemeStatus: "current" },
        },
      ],
      ["get_recipe_draft", { recipeId: "recipe-1" }],
      ["save_recipe_draft", { input: saveDraftInput }],
      ["list_recipe_versions", { recipeId: "recipe-1" }],
      ["get_recipe_version", { id: "version-1" }],
      ["create_recipe_version", { input: versionInput }],
      ["copy_recipe_version_to_draft", { versionId: "version-1" }],
      [
        "compare_recipe_versions",
        { beforeVersionId: "version-1", afterVersionId: "version-2" },
      ],
      ["archive_recipe", { id: "recipe-1" }],
      ["restore_recipe", { id: "recipe-1" }],
      ["delete_draft_recipe", { id: "recipe-1" }],
      ["delete_recipe_version", { id: "version-1" }],
      [
        "permanently_delete_recipe",
        { id: "recipe-1", confirmationName: "低糖乳饮料" },
      ],
    ]);
  });

  it("restores an archived browser recipe without changing its versions", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    let minute = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `restore-id-${++sequence}`,
      now: () => `2026-08-02T10:${String(minute++).padStart(2, "0")}:00.000Z`,
    });
    const created = await api.createRecipe({
      name: "待恢复配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const draft = await api.saveRecipeDraft(
      draftInput(created.id, "1000", "0", ""),
    );
    const savedVersion = await api.createRecipeVersion({
      recipeId: created.id,
      sourceDraftId: draft.id,
      basedOnVersionId: null,
      snapshot: snapshot(created, "1000", "0", ""),
      dependencyVersionIds: [],
    });

    await api.archiveRecipe(created.id);
    expect((await api.getRecipe(created.id)).archivedAt).not.toBeNull();
    await api.restoreRecipe(created.id);

    const restored = await api.getRecipe(created.id);
    expect(restored.archivedAt).toBeNull();
    expect((await api.listRecipeVersions(created.id)).map((item) => item.id)).toEqual([
      savedVersion.id,
    ]);
  });

  it("deletes active draft recipes but rejects recipes with formal versions", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `draft-delete-id-${++sequence}`,
      now: () => "2026-08-03T09:00:00.000Z",
    });

    const emptyRecipe = await api.createRecipe({
      name: "尚未开始配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    await api.deleteDraftRecipe(emptyRecipe.id);
    await expect(api.getRecipe(emptyRecipe.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const draftRecipe = await api.createRecipe({
      name: "只有工作草稿",
      code: null,
      tags: [],
      kind: "formula",
    });
    await api.saveRecipeDraft(draftInput(draftRecipe.id, "1000", "0", ""));
    await api.deleteDraftRecipe(draftRecipe.id);
    expect(
      (await api.listRecipes()).some(
        (entry) => entry.recipe.id === draftRecipe.id,
      ),
    ).toBe(false);

    const versionedRecipe = await api.createRecipe({
      name: "已有正式版本",
      code: null,
      tags: [],
      kind: "formula",
    });
    const draft = await api.saveRecipeDraft(
      draftInput(versionedRecipe.id, "1000", "0", ""),
    );
    await api.createRecipeVersion({
      recipeId: versionedRecipe.id,
      sourceDraftId: draft.id,
      basedOnVersionId: null,
      snapshot: snapshot(versionedRecipe, "1000", "0", ""),
      dependencyVersionIds: [],
    });
    await expect(
      api.deleteDraftRecipe(versionedRecipe.id),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("permanently deletes confirmed archived recipes and never reuses version numbers", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `delete-id-${++sequence}`,
      now: () => "2026-08-03T10:00:00.000Z",
    });
    const created = await api.createRecipe({
      name: "待删除配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const draft = await api.saveRecipeDraft(
      draftInput(created.id, "1000", "0", ""),
    );
    const first = await api.createRecipeVersion({
      recipeId: created.id,
      sourceDraftId: draft.id,
      basedOnVersionId: null,
      snapshot: snapshot(created, "1000", "0", ""),
      dependencyVersionIds: [],
    });
    await api.copyRecipeVersionToDraft(first.id);

    await api.deleteRecipeVersion(first.id);
    expect((await api.getRecipeDraft(created.id))?.basedOnVersionId).toBeNull();
    const second = await api.createRecipeVersion({
      recipeId: created.id,
      sourceDraftId: draft.id,
      basedOnVersionId: null,
      snapshot: snapshot(created, "1000", "0", ""),
      dependencyVersionIds: [],
    });
    expect(second.versionNumber).toBe(2);

    await expect(
      api.permanentlyDeleteRecipe(created.id, created.name),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await api.archiveRecipe(created.id);
    await expect(
      api.permanentlyDeleteRecipe(created.id, "名称错误"),
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    await api.permanentlyDeleteRecipe(created.id, created.name);
    expect(
      (await api.listRecipes()).some(
        (entry) => entry.recipe.id === created.id,
      ),
    ).toBe(false);
  });

  it("creates a custom-named alternative recipe with its own draft and status", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `alternative-id-${++sequence}`,
      now: () => "2026-08-02T11:00:00.000Z",
    });
    const primary = await api.createRecipe({
      name: "巧克力冰淇淋",
      code: null,
      tags: [],
      kind: "formula",
    });
    const primaryDraft = await api.saveRecipeDraft(
      draftInput(primary.id, "1000", "3.2", "主配方"),
    );
    const primaryVersion = await api.createRecipeVersion({
      recipeId: primary.id,
      sourceDraftId: primaryDraft.id,
      basedOnVersionId: null,
      snapshot: snapshot(primary, "1000", "3.2", "主配方"),
      dependencyVersionIds: [],
    });

    const alternative = await api.createRecipeAlternative({
      sourceVersionId: primaryVersion.id,
      schemeName: "供应商 B 可可粉版本",
      schemeStatus: "researching",
    });
    const alternativeDraft = await api.getRecipeDraft(alternative.id);

    expect(alternative).toMatchObject({
      name: "巧克力冰淇淋",
      productId: primary.id,
      schemeName: "供应商 B 可可粉版本",
      schemeStatus: "researching",
      latestVersionNumber: null,
    });
    expect(alternativeDraft).toMatchObject({
      recipeId: alternative.id,
      basedOnVersionId: null,
      targetBatchGrams: "1000",
      markdownNotes: "主配方",
    });

    await api.updateRecipeScheme(alternative.id, {
      schemeName: "供应商 B 可可粉正式替代",
      schemeStatus: "current",
    });
    expect(await api.getRecipe(alternative.id)).toMatchObject({
      schemeName: "供应商 B 可可粉正式替代",
      schemeStatus: "current",
    });
    expect(await api.getRecipe(primary.id)).toMatchObject({
      schemeStatus: "approved",
    });
  });

  it("persists drafts and immutable versions in browser schema v8", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `recipe-id-${++sequence}`,
      now: () => "2026-07-30T10:00:00.000Z",
    });
    const recipe = await api.createRecipe({
      name: "低糖乳饮料",
      code: null,
      tags: [],
      kind: "formula",
    });
    const firstDraft = await api.saveRecipeDraft(
      draftInput(recipe.id, "1000", "3.2", "第一次小试"),
    );
    const firstVersion = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: firstDraft.id,
      basedOnVersionId: null,
      snapshot: snapshot(recipe, "1000", "3.2", "第一次小试"),
      dependencyVersionIds: [],
    });
    const secondDraftInput = draftInput(
      recipe.id,
      "1200",
      "3.6",
      "第二次小试",
    );
    secondDraftInput.basedOnVersionId = firstVersion.id;
    const secondDraft = await api.saveRecipeDraft(secondDraftInput);
    const secondVersion = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: secondDraft.id,
      basedOnVersionId: firstVersion.id,
      snapshot: snapshot(recipe, "1200", "3.6", "第二次小试"),
      dependencyVersionIds: [],
    });

    const reopened = new BrowserDemoApi({ storage });
    const summaries = await reopened.listRecipes();
    const comparison = await reopened.compareRecipeVersions(
      firstVersion.id,
      secondVersion.id,
    );
    const copied = await reopened.copyRecipeVersionToDraft(firstVersion.id);

    expect(JSON.parse(storage.getItem("food-rd.browser-demo.v8") ?? "{}"))
      .toMatchObject({
        schemaVersion: 8,
        recipes: {
          [recipe.id]: { name: "低糖乳饮料", latestVersionNumber: 2 },
        },
      });
    expect(summaries[0]?.latestVersion?.versionNumber).toBe(2);
    expect(comparison.notesChanged).toBe(true);
    expect(comparison.nutritionChanges).toEqual([
      expect.objectContaining({
        key: "protein",
        before: "3.2",
        after: "3.6",
      }),
    ]);
    expect(copied).toMatchObject({
      id: firstDraft.id,
      basedOnVersionId: firstVersion.id,
      targetBatchGrams: "1000",
      markdownNotes: "第一次小试",
    });
  });

  it("upgrades existing browser v4 data without losing Agent records", async () => {
    const storage = new MemoryStorage();
    const original = new BrowserDemoApi({
      storage,
      createId: () => "conversation-before-v5",
      now: () => "2026-07-30T10:30:00.000Z",
    });
    await original.createAgentConversation("升级前的研发对话");
    const v8 = JSON.parse(
      storage.getItem("food-rd.browser-demo.v8") ?? "{}",
    ) as Record<string, unknown>;
    const v4 = { ...v8 };
    delete v4.recipes;
    delete v4.recipeDrafts;
    delete v4.recipeVersions;
    delete v4.recipeVersionDependencies;
    storage.clear();
    storage.setItem(
      "food-rd.browser-demo.v4",
      JSON.stringify({ ...v4, schemaVersion: 4 }),
    );

    const migrated = new BrowserDemoApi({ storage });

    expect(await migrated.listAgentConversations()).toEqual([
      expect.objectContaining({
        id: "conversation-before-v5",
        title: "升级前的研发对话",
      }),
    ]);
    expect(await migrated.listRecipes()).toEqual([]);
    expect(
      JSON.parse(storage.getItem("food-rd.browser-demo.v8") ?? "{}"),
    ).toMatchObject({
      schemaVersion: 8,
      recipes: {},
      recipeDrafts: {},
      recipeVersions: {},
      recipeVersionDependencies: {},
      nutritionLabels: {},
      nutritionLabelDrafts: {},
      nutritionLabelVersions: {},
      researchReports: {},
    });
  });

  it("protects a recipe when an immutable version is referenced", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `dependency-id-${++sequence}`,
      now: () => "2026-07-30T11:00:00.000Z",
    });
    const base = await api.createRecipe({
      name: "果酱半成品",
      code: null,
      tags: [],
      kind: "semi_finished",
    });
    const baseDraft = await api.saveRecipeDraft(
      draftInput(base.id, "1000", "0", ""),
    );
    const baseVersion = await api.createRecipeVersion({
      recipeId: base.id,
      sourceDraftId: baseDraft.id,
      basedOnVersionId: null,
      snapshot: {
        ...snapshot(base, "1000", "0", ""),
        recipe: { ...snapshot(base, "1000", "0", "").recipe, kind: "semi_finished" },
      },
      dependencyVersionIds: [],
    });
    const finished = await api.createRecipe({
      name: "草莓酸奶",
      code: null,
      tags: [],
      kind: "formula",
    });
    const finishedDraft = await api.saveRecipeDraft(
      draftInput(finished.id, "1000", "3.0", ""),
    );
    await api.createRecipeVersion({
      recipeId: finished.id,
      sourceDraftId: finishedDraft.id,
      basedOnVersionId: null,
      snapshot: snapshot(finished, "1000", "3.0", ""),
      dependencyVersionIds: [baseVersion.id],
    });

    await expect(api.archiveRecipe(base.id)).rejects.toMatchObject({
      code: "reference_conflict",
    });
  });

  it("rejects direct and indirect recipe cycles in browser storage", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `cycle-id-${++sequence}`,
      now: () => "2026-07-30T11:30:00.000Z",
    });
    const base = await api.createRecipe({
      name: "基础糖浆",
      code: null,
      tags: [],
      kind: "semi_finished",
    });
    const baseDraft = await api.saveRecipeDraft(
      draftInput(base.id, "1000", "0", ""),
    );
    const baseSnapshot = snapshot(base, "1000", "0", "");
    baseSnapshot.recipe.kind = "semi_finished";
    const baseV1 = await api.createRecipeVersion({
      recipeId: base.id,
      sourceDraftId: baseDraft.id,
      basedOnVersionId: null,
      snapshot: baseSnapshot,
      dependencyVersionIds: [],
    });

    await expect(
      api.createRecipeVersion({
        recipeId: base.id,
        sourceDraftId: baseDraft.id,
        basedOnVersionId: null,
        snapshot: baseSnapshot,
        dependencyVersionIds: [baseV1.id],
      }),
    ).rejects.toMatchObject({ code: "recipe_cycle" });

    const filling = await api.createRecipe({
      name: "复合夹心",
      code: null,
      tags: [],
      kind: "semi_finished",
    });
    const fillingDraft = await api.saveRecipeDraft(
      draftInput(filling.id, "1000", "0", ""),
    );
    const fillingSnapshot = snapshot(filling, "1000", "0", "");
    fillingSnapshot.recipe.kind = "semi_finished";
    const fillingV1 = await api.createRecipeVersion({
      recipeId: filling.id,
      sourceDraftId: fillingDraft.id,
      basedOnVersionId: null,
      snapshot: fillingSnapshot,
      dependencyVersionIds: [baseV1.id],
    });

    await expect(
      api.createRecipeVersion({
        recipeId: base.id,
        sourceDraftId: baseDraft.id,
        basedOnVersionId: null,
        snapshot: baseSnapshot,
        dependencyVersionIds: [fillingV1.id],
      }),
    ).rejects.toMatchObject({ code: "recipe_cycle" });
    expect(await api.listRecipeVersions(base.id)).toHaveLength(1);
  });

  it("keeps unknown nutrition distinct from confirmed zero in comparisons", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `zero-id-${++sequence}`,
      now: () => "2026-07-30T12:00:00.000Z",
    });
    const recipe = await api.createRecipe({
      name: "营养零值测试",
      code: null,
      tags: [],
      kind: "formula",
    });
    const unknownDraftInput = draftInput(recipe.id, "1000", "0", "");
    const unknownCalculation = calculation("0", "0");
    const unknownNutrient = unknownCalculation.nutrients[0];
    if (!unknownNutrient) throw new Error("missing nutrient fixture");
    unknownNutrient.status = "unknown";
    unknownDraftInput.calculation = unknownCalculation;
    const unknownDraft = await api.saveRecipeDraft(unknownDraftInput);
    const unknownSnapshot = snapshot(recipe, "1000", "0", "");
    const unknownSnapshotNutrient =
      unknownSnapshot.calculation.nutrients[0];
    if (!unknownSnapshotNutrient) throw new Error("missing nutrient fixture");
    unknownSnapshotNutrient.status = "unknown";
    const first = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: unknownDraft.id,
      basedOnVersionId: null,
      snapshot: unknownSnapshot,
      dependencyVersionIds: [],
    });

    const confirmedDraftInput = draftInput(recipe.id, "1000", "0", "");
    confirmedDraftInput.basedOnVersionId = first.id;
    const confirmedDraft = await api.saveRecipeDraft(confirmedDraftInput);
    const second = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: confirmedDraft.id,
      basedOnVersionId: first.id,
      snapshot: snapshot(recipe, "1000", "0", ""),
      dependencyVersionIds: [],
    });

    expect(
      (await api.compareRecipeVersions(first.id, second.id)).nutritionChanges,
    ).toEqual([
      expect.objectContaining({
        key: "protein",
        before: null,
        after: "0",
      }),
    ]);
  });

  it("describes supplier and target changes with both frozen values", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `comparison-id-${++sequence}`,
      now: () => "2026-07-30T13:00:00.000Z",
    });
    const recipe = await api.createRecipe({
      name: "供应商比较酸奶",
      code: null,
      tags: [],
      kind: "formula",
    });
    const draft = await api.saveRecipeDraft(
      draftInput(recipe.id, "1000", "3.2", "第一版"),
    );
    const beforeSnapshot = snapshot(
      recipe,
      "1000",
      "3.2",
      "第一版",
    );
    beforeSnapshot.items = [
      {
        id: "milk",
        position: 0,
        kind: "ingredient",
        amount: "300",
        unit: "g",
        massGrams: "300",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "milk-a",
          materialGroupId: "milk-group",
          materialName: "脱脂乳粉",
          supplierId: "supplier-a",
          supplierName: "乳业 A",
          modelOrSpecification: "低热型",
          densityGPerMl: null,
          nutrientsPer100g: {},
          nutrientUnits: {},
          pricePerKg: "30",
          allergens: {
            contains: ["乳及乳制品"],
            mayContain: [],
            sourceItemIds: {},
          },
          source: "A 规格书",
          ingredientUpdatedAt: "2026-07-29T00:00:00.000Z",
        },
      },
    ];
    beforeSnapshot.targets = [
      {
        id: "protein-target",
        metric: {
          kind: "nutrition_per_100g",
          nutrientDefinitionId: "protein",
          nutrientName: "蛋白质",
          unit: "g",
        },
        minimum: "3",
        maximum: null,
      },
    ];
    beforeSnapshot.calculation.targets = [
      {
        targetId: "protein-target",
        status: "met",
        observed: "3.2",
        deltaToMinimum: "0.2",
        deltaToMaximum: null,
      },
    ];
    const first = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: draft.id,
      basedOnVersionId: null,
      snapshot: beforeSnapshot,
      dependencyVersionIds: [],
    });

    const nextDraftInput = draftInput(
      recipe.id,
      "1000",
      "3.8",
      "第二版",
    );
    nextDraftInput.basedOnVersionId = first.id;
    const nextDraft = await api.saveRecipeDraft(nextDraftInput);
    const afterSnapshot = structuredClone(beforeSnapshot);
    afterSnapshot.markdownNotes = "第二版";
    const afterItem = afterSnapshot.items[0];
    if (!afterItem || afterItem.kind !== "ingredient") {
      throw new Error("missing comparison item");
    }
    afterItem.amount = "280";
    afterItem.massGrams = "280";
    afterItem.ingredient.ingredientVariantId = "milk-b";
    afterItem.ingredient.supplierId = "supplier-b";
    afterItem.ingredient.supplierName = "乳业 B";
    afterItem.ingredient.modelOrSpecification = "中热型";
    afterSnapshot.targets[0]!.minimum = "3.5";
    afterSnapshot.calculation.targets[0] = {
      targetId: "protein-target",
      status: "met",
      observed: "3.80000000000000000000",
      deltaToMinimum: "0.3",
      deltaToMaximum: null,
    };
    const second = await api.createRecipeVersion({
      recipeId: recipe.id,
      sourceDraftId: nextDraft.id,
      basedOnVersionId: first.id,
      snapshot: afterSnapshot,
      dependencyVersionIds: [],
    });

    const compared = await api.compareRecipeVersions(
      first.id,
      second.id,
    );
    expect(compared.itemChanges).toEqual([
      expect.objectContaining({
        kind: "reference_changed",
        beforeLabel: "脱脂乳粉 · 乳业 A · 低热型",
        afterLabel: "脱脂乳粉 · 乳业 B · 中热型",
        beforeAmountGrams: "300",
        afterAmountGrams: "280",
      }),
    ]);
    expect(compared.targetChanges).toEqual([
      expect.objectContaining({
        label: "蛋白质（每 100g）",
        unit: "g",
        before: "≥ 3 g · 实际 3.2 · 已达到",
        after: "≥ 3.5 g · 实际 3.8 · 已达到",
      }),
    ]);
    expect(compared.notesChanged).toBe(true);
  });
});
