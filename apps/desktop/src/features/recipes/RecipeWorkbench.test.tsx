import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type {
  RecipeCalculation,
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
    createId: () => `workbench-${++sequence}`,
    now: () => "2026-07-31T02:00:00.000Z",
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
    calculatedAt: "2026-07-31T02:00:00.000Z",
  };
}

async function addIngredient(
  user: ReturnType<typeof userEvent.setup>,
  materialName: string,
) {
  await user.click(
    screen.getByRole("button", { name: "添加原料或半成品" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "添加原料或半成品",
  });
  await user.click(
    within(dialog).getByRole("radio", {
      name: new RegExp(`选择${materialName}`),
    }),
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "添加所选原料",
    }),
  );
}

describe("RecipeWorkbench", () => {
  it("does not create an unnamed recipe when no recipe is selected", async () => {
    const api = createApi();
    render(<RecipeWorkbench api={api} />);

    expect(
      await screen.findByRole("heading", { name: "配方工作台" }),
    ).toBeTruthy();
    expect(
      screen.getByText("没有找到要打开的配方，请返回配方库重新选择。"),
    ).toBeTruthy();
    expect(await api.listRecipes()).toEqual([]);
  });

  it("saves the current draft before returning to the recipe library", async () => {
    const api = createApi();
    const first = await api.createRecipe({
      name: "第一份配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<RecipeWorkbench api={api} onBack={onBack} recipeId={first.id} />);

    await screen.findByDisplayValue("第一份配方");
    await user.type(
      screen.getByRole("textbox", { name: "研发备注" }),
      "当前草稿已记录",
    );
    await user.click(
      screen.getByRole("button", { name: "返回配方库" }),
    );

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(await api.listRecipes()).toHaveLength(1);
    expect(await api.getRecipeDraft(first.id)).toMatchObject({
      markdownNotes: "当前草稿已记录",
    });
  });

  it("marks a recipe as semi-finished so it can be referenced later", async () => {
    const api = createApi();
    const recipe = await api.createRecipe({
      name: "基础糖浆",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} recipeId={recipe.id} />);

    await screen.findByDisplayValue("基础糖浆");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "配方类型" }),
      "semi_finished",
    );

    await waitFor(async () => {
      expect(await api.getRecipe(recipe.id)).toMatchObject({
        kind: "semi_finished",
      });
    });
    expect(
      screen.getByText("已设为半成品；保存正式版本后可加入其他配方"),
    ).toBeTruthy();
  });

  it("opens Agent with the current unsaved workbench draft as context", async () => {
    const api = createApi();
    const recipe = await api.createRecipe({
      name: "Agent 诊断配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    const onOpenAgent = vi.fn();
    const onAgentContextChange = vi.fn();
    render(
      <RecipeWorkbench
        api={api}
        onAgentContextChange={onAgentContextChange}
        onOpenAgent={onOpenAgent}
        recipeId={recipe.id}
      />,
    );

    await screen.findByDisplayValue("Agent 诊断配方");
    await addIngredient(user, "脱脂乳粉");
    const amount = await screen.findByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    await user.clear(amount);
    await user.type(amount, "88");
    await user.click(screen.getByRole("button", { name: "Agent 诊断" }));

    expect(onOpenAgent).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const context = onAgentContextChange.mock.calls.at(-1)?.[0];
      expect(context).toMatchObject({
        recipe: { id: recipe.id },
        draft: {
          items: [expect.objectContaining({ amount: "88" })],
        },
      });
    });
  });

  it("adds a concrete supplier variant, edits its amount and locks it", async () => {
    const api = createApi();
    const recipe = await api.createRecipe({
      name: "原味高蛋白酸奶",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);

    await screen.findByDisplayValue("原味高蛋白酸奶");
    await addIngredient(user, "脱脂乳粉");

    const amount = await screen.findByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    await user.clear(amount);
    await user.type(amount, "85");
    const lock = screen.getByRole("button", {
      name: "锁定脱脂乳粉",
    });
    await user.click(lock);
    expect(lock.getAttribute("aria-pressed")).toBe("true");

    await waitFor(
      async () => {
        expect(await api.getRecipeDraft(recipe.id)).toMatchObject({
          items: [
            expect.objectContaining({
              kind: "ingredient",
              materialName: "脱脂乳粉",
              amount: "85",
              unit: "g",
              locked: true,
            }),
          ],
        });
      },
      { timeout: 1800 },
    );
    expect(screen.getByText("草稿已自动保存")).toBeTruthy();
  });

  it("reorders and removes formula rows without changing their supplier identity", async () => {
    const api = createApi();
    const recipe = await api.createRecipe({
      name: "顺序测试配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("顺序测试配方");

    await addIngredient(user, "脱脂乳粉");
    await addIngredient(user, "白砂糖");
    await user.click(
      screen.getByRole("button", { name: "上移白砂糖" }),
    );

    const rows = screen
      .getAllByRole("row")
      .filter((row) => row.getAttribute("data-recipe-item") === "true");
    expect(rows[0]?.textContent).toContain("白砂糖");
    expect(rows[1]?.textContent).toContain("脱脂乳粉");

    await user.click(
      screen.getByRole("button", { name: "删除白砂糖" }),
    );
    expect(
      screen.queryByRole("row", { name: /白砂糖/ }),
    ).toBeNull();

    await waitFor(
      async () => {
        expect(await api.getRecipeDraft(recipe.id)).toMatchObject({
          items: [
            expect.objectContaining({
              materialName: "脱脂乳粉",
              position: 0,
            }),
          ],
        });
      },
      { timeout: 1800 },
    );
  });

  it("adds an explicit immutable semi-finished version", async () => {
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
    const snapshot: RecipeVersionSnapshot = {
      schemaVersion: 1,
      recipe: {
        id: syrup.id,
        name: syrup.name,
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
    const version = await api.createRecipeVersion({
      recipeId: syrup.id,
      sourceDraftId: syrupDraft.id,
      basedOnVersionId: null,
      snapshot,
      dependencyVersionIds: [],
    });
    const formula = await api.createRecipe({
      name: "含糖浆饮品",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("含糖浆饮品");

    await user.click(
      screen.getByRole("button", { name: "添加原料或半成品" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "添加原料或半成品",
    });
    await user.click(
      within(dialog).getByRole("tab", { name: "半成品版本" }),
    );
    await user.click(
      within(dialog).getByRole("radio", {
        name: "选择糖浆 V1",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "添加所选半成品",
      }),
    );

    expect(
      await screen.findByRole("row", { name: /糖浆.*V1/ }),
    ).toBeTruthy();
    await waitFor(
      async () => {
        expect(await api.getRecipeDraft(formula.id)).toMatchObject({
          items: [
            expect.objectContaining({
              kind: "recipe_version",
              recipeVersionId: version.id,
            }),
          ],
        });
      },
      { timeout: 1800 },
    );
  });

  it("keeps invalid text visible and closes the picker with Escape", async () => {
    const api = createApi();
    await api.createRecipe({
      name: "输入校验配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("输入校验配方");
    await addIngredient(user, "脱脂乳粉");

    const amount = screen.getByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    await user.clear(amount);
    await user.type(amount, "2..5");
    expect((amount as HTMLInputElement).value).toBe("2..5");
    expect(
      await screen.findByText("请输入有效数字"),
    ).toBeTruthy();
    expect(
      screen.getByText("存在无效输入，已保留本地草稿"),
    ).toBeTruthy();

    const addButton = screen.getByRole("button", {
      name: "添加原料或半成品",
    });
    await user.click(addButton);
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "数据" }),
      "complete",
    );
    expect(
      within(dialog).getByText("没有符合条件的供应商原料。"),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(addButton);
  });

  it("keeps a designated item automatically filled to the target", async () => {
    const api = createApi();
    await api.createRecipe({
      name: "自动补足配方",
      code: null,
      tags: [],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("自动补足配方");
    await addIngredient(user, "脱脂乳粉");
    await addIngredient(user, "白砂糖");

    const milkAmount = screen.getByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    const sugarAmount = screen.getByRole("textbox", {
      name: "白砂糖用量",
    });
    await user.clear(milkAmount);
    await user.type(milkAmount, "200");
    await user.click(
      screen.getByRole("button", { name: "设白砂糖为补足" }),
    );
    expect((sugarAmount as HTMLInputElement).value).toBe("800");

    await user.clear(milkAmount);
    await user.type(milkAmount, "250");
    expect((sugarAmount as HTMLInputElement).value).toBe("750");

    const currentInputTotal = screen.getByLabelText("当前投料合计");
    expect(currentInputTotal.tagName).toBe("OUTPUT");
    expect(currentInputTotal.textContent).toContain("由下方配方用量自动汇总");
    expect(
      screen.queryByRole("button", { name: "按比例调整" }),
    ).toBeNull();
  });
});
