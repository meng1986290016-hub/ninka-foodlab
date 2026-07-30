import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type {
  RecipeCalculation,
  RecipeDraftSaveInput,
  RecipeVersionSnapshot,
} from "../../api/recipe-types";
import { RecipeWorkbench } from "./RecipeWorkbench";

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

function createApi() {
  let sequence = 0;
  return new BrowserDemoApi({
    storage: new MemoryStorage(),
    createId: () => `version-ui-${++sequence}`,
    now: () => "2026-07-31T04:00:00.000Z",
  });
}

function emptyCalculation(): RecipeCalculation {
  return {
    inputMassGrams: "100",
    basisMassGrams: "100",
    basis: "input_mass",
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
    calculatedAt: "2026-07-31T04:00:00.000Z",
  };
}

function versionSnapshot(
  recipe: { id: string; name: string },
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      code: null,
      tags: [],
      kind: "semi_finished",
    },
    targetBatchGrams: "100",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: emptyCalculation(),
  };
}

async function addMilkPowder(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole("button", { name: "添加原料或半成品" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "添加原料或半成品",
  });
  await user.click(
    within(dialog).getByRole("radio", {
      name: /选择脱脂乳粉/,
    }),
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "添加所选原料",
    }),
  );
}

describe("RecipeWorkbench formal versions", () => {
  it("shows a human confirmation, saves an immutable snapshot and continues in a based-on draft", async () => {
    const api = createApi();
    const formula = await api.createRecipe({
      name: "高蛋白酸奶",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("高蛋白酸奶");
    await addMilkPowder(user);
    const amount = screen.getByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    await user.clear(amount);
    await user.type(amount, "100");

    await user.click(
      screen.getByRole("button", { name: "保存为正式版本" }),
    );
    const confirmation = await screen.findByRole("dialog", {
      name: "确认保存正式版本",
    });
    expect(
      within(confirmation).getByRole("heading", {
        name: "确认保存 V1",
      }),
    ).toBeTruthy();
    expect(within(confirmation).getByText("1 项")).toBeTruthy();
    expect(
      within(confirmation).getByText("数据完整度"),
    ).toBeTruthy();
    await user.click(
      within(confirmation).getByRole("button", {
        name: "确认保存 V1",
      }),
    );

    await waitFor(async () => {
      expect(await api.listRecipeVersions(formula.id)).toHaveLength(1);
    });
    const version = (await api.listRecipeVersions(formula.id))[0]!;
    expect(version.snapshot.items[0]).toMatchObject({
      kind: "ingredient",
      amount: "100",
      ingredient: {
        materialName: "脱脂乳粉",
        pricePerKg: "31.5",
      },
    });
    expect(await api.getRecipeDraft(formula.id)).toMatchObject({
      basedOnVersionId: version.id,
    });
    expect(
      await screen.findByText(
        "V1 已保存，已生成基于该版本的工作草稿",
      ),
    ).toBeTruthy();

    const groups = await api.listMaterialGroups("脱脂乳粉");
    const source = groups[0]?.variants[0];
    if (source === undefined) throw new Error("missing demo variant");
    await api.saveIngredientVariant({
      id: source.id,
      materialGroupId: source.materialGroupId,
      supplierId: source.supplierId,
      modelOrSpecification: source.modelOrSpecification,
      internalCode: source.internalCode,
      currentPrice: "99",
      priceUnit: source.priceUnit,
      densityGPerMl: source.densityGPerMl,
      source: source.source,
      researchNotes: source.researchNotes,
      nutrition: source.nutrition,
      allergens: source.allergens,
      duplicateConfirmed: true,
    });
    expect((await api.getRecipeVersion(version.id)).snapshot.items[0])
      .toMatchObject({
        kind: "ingredient",
        ingredient: { pricePerKg: "31.5" },
      });
  });

  it("keeps an incomplete draft editable and explains every blocking issue", async () => {
    const api = createApi();
    await api.createRecipe({
      name: "待完善配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("待完善配方");

    await user.click(
      screen.getByRole("button", { name: "保存为正式版本" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "正式版本保存检查",
    });
    expect(
      within(dialog).getByText("至少添加一种原料或半成品"),
    ).toBeTruthy();
    expect(await api.listRecipeVersions(
      (await api.listRecipes())[0]!.recipe.id,
    )).toHaveLength(0);
  });

  it("offers an explicit upgrade when a referenced semi-finished recipe has a newer formal version", async () => {
    const api = createApi();
    const syrup = await api.createRecipe({
      name: "糖浆",
      code: null,
      tags: [],
      kind: "semi_finished",
    });
    const syrupDraft = await api.saveRecipeDraft({
      recipeId: syrup.id,
      basedOnVersionId: null,
      source: "manual",
      targetBatchGrams: "100",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
      calculation: emptyCalculation(),
      calculationIssues: [],
    });
    const syrupV1 = await api.createRecipeVersion({
      recipeId: syrup.id,
      sourceDraftId: syrupDraft.id,
      basedOnVersionId: null,
      snapshot: versionSnapshot(syrup),
      dependencyVersionIds: [],
    });
    const syrupV2 = await api.createRecipeVersion({
      recipeId: syrup.id,
      sourceDraftId: syrupDraft.id,
      basedOnVersionId: syrupV1.id,
      snapshot: versionSnapshot(syrup),
      dependencyVersionIds: [],
    });
    const formula = await api.createRecipe({
      name: "糖浆饮料",
      code: null,
      tags: [],
      kind: "formula",
    });
    const formulaDraft: RecipeDraftSaveInput = {
      recipeId: formula.id,
      basedOnVersionId: null,
      source: "manual",
      targetBatchGrams: "100",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [
        {
          id: "syrup-item",
          position: 0,
          kind: "recipe_version",
          recipeVersionId: syrupV1.id,
          amount: "100",
          unit: "g",
          locked: false,
          autoFill: false,
        },
      ],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
      calculation: emptyCalculation(),
      calculationIssues: [],
    };
    await api.saveRecipeDraft(formulaDraft);
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("糖浆饮料");

    const upgrade = await screen.findByRole("button", {
      name: "将糖浆升级到 V2",
    });
    await user.click(upgrade);
    expect(
      await screen.findByText("糖浆 已升级到 V2"),
    ).toBeTruthy();
    await waitFor(
      async () => {
        expect(await api.getRecipeDraft(formula.id)).toMatchObject({
          items: [
            expect.objectContaining({
              recipeVersionId: syrupV2.id,
            }),
          ],
        });
      },
      { timeout: 1800 },
    );
  });
});
