import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { IngredientVariant } from "../../api/types";
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
    createId: () => `results-${++sequence}`,
    now: () => "2026-07-31T04:00:00.000Z",
  });
}

async function createFormula(api: BrowserDemoApi, name: string) {
  return api.createRecipe({
    name,
    code: null,
    tags: [],
    kind: "formula",
  });
}

async function updateMilk(
  api: BrowserDemoApi,
  overrides: Partial<IngredientVariant> = {},
) {
  const groups = await api.listMaterialGroups();
  const group = groups.find((item) => item.name === "脱脂乳粉");
  const variant = group?.variants[0];
  if (!group || !variant) throw new Error("missing milk seed");
  const definitions = await api.listNutrientDefinitions();
  const values: Record<string, string> = {
    energy: "1510",
    protein: "34",
    fat: "1",
    saturated_fat: "0.6",
    carbohydrate: "52",
    sugars: "52",
    dietary_fiber: "0",
    sodium: "400",
  };
  return api.saveIngredientVariant({
    id: variant.id,
    materialGroupId: group.id,
    supplierId: variant.supplierId,
    modelOrSpecification: "低热型",
    internalCode: null,
    currentPrice:
      overrides.currentPrice === undefined
        ? variant.currentPrice
        : overrides.currentPrice,
    priceUnit: variant.priceUnit,
    densityGPerMl: variant.densityGPerMl,
    source: "演示营养规格书",
    researchNotes: "",
    nutrition:
      overrides.nutrition ?? {
        basis: "per_100g",
        values: definitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: values[definition.code] ?? "0",
        })),
      },
    allergens:
      overrides.allergens ?? {
        contains: ["乳"],
        mayContain: ["大豆"],
      },
  });
}

async function addMilk(user: ReturnType<typeof userEvent.setup>) {
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
  const amount = await screen.findByRole("textbox", {
    name: "脱脂乳粉用量",
  });
  await user.clear(amount);
  await user.type(amount, "100");
  return amount;
}

describe("RecipeWorkbench live results", () => {
  it("shows per-100g and batch nutrition, cost, yield and both allergen classes", async () => {
    const api = createApi();
    await updateMilk(api);
    await createFormula(api, "实时结果配方");
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("实时结果配方");
    await addMilk(user);
    const target = screen.getByRole("textbox", {
      name: "目标批量",
    });
    await user.clear(target);
    await user.type(target, "100");
    const finished = screen.getByRole("textbox", {
      name: "成品重量",
    });
    await user.type(finished, "90");

    const results = screen.getByRole("complementary", {
      name: "实时结果",
    });
    expect(await within(results).findByText("34g")).toBeTruthy();
    expect(
      within(results).getAllByText("3.15 元").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("90%")).toBeTruthy();
    expect(within(results).getByText("含有：乳")).toBeTruthy();
    expect(
      within(results).getByText("可能含有：大豆"),
    ).toBeTruthy();
  });

  it("adds editable packaging and additional costs to the live total", async () => {
    const api = createApi();
    await updateMilk(api);
    await createFormula(api, "成本编辑配方");
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("成本编辑配方");
    await addMilk(user);
    const target = screen.getByRole("textbox", {
      name: "目标批量",
    });
    await user.clear(target);
    await user.type(target, "100");

    await user.click(
      screen.getByRole("button", { name: "添加包材" }),
    );
    const packageName = screen.getByRole("textbox", {
      name: "包材名称",
    });
    await user.clear(packageName);
    await user.type(packageName, "酸奶杯");
    const quantity = screen.getByRole("textbox", {
      name: "酸奶杯数量",
    });
    await user.clear(quantity);
    await user.type(quantity, "4");
    const unitCost = screen.getByRole("textbox", {
      name: "酸奶杯单价",
    });
    await user.clear(unitCost);
    await user.type(unitCost, "0.3");

    await user.click(
      screen.getByRole("button", { name: "添加其他成本" }),
    );
    const otherName = screen.getByRole("textbox", {
      name: "其他成本名称",
    });
    await user.clear(otherName);
    await user.type(otherName, "能耗");
    const otherAmount = screen.getByRole("textbox", {
      name: "能耗金额",
    });
    await user.clear(otherAmount);
    await user.type(otherAmount, "0.8");

    const results = screen.getByRole("complementary", {
      name: "实时结果",
    });
    await waitFor(() => {
      expect(within(results).getByText("1.20 元")).toBeTruthy();
      expect(within(results).getByText("0.80 元")).toBeTruthy();
      expect(
        within(results).getAllByText("5.15 元").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("creates, evaluates, edits and removes nutrition and cost targets", async () => {
    const api = createApi();
    await updateMilk(api);
    await createFormula(api, "目标配方");
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("目标配方");
    await addMilk(user);
    const targetBatch = screen.getByRole("textbox", {
      name: "目标批量",
    });
    await user.clear(targetBatch);
    await user.type(targetBatch, "100");

    await user.click(
      screen.getByRole("button", { name: "添加目标" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "目标指标" }),
      "nutrition:protein",
    );
    await user.type(
      screen.getByRole("textbox", { name: "目标下限" }),
      "30",
    );
    await user.click(
      screen.getByRole("button", { name: "保存目标" }),
    );

    const targetSection = screen.getByRole("region", {
      name: "配方目标",
    });
    expect(
      within(targetSection).getByText("蛋白质（每100g）"),
    ).toBeTruthy();
    expect(within(targetSection).getByText("已达到")).toBeTruthy();

    await user.click(
      within(targetSection).getByRole("button", {
        name: "编辑蛋白质（每100g）目标",
      }),
    );
    const minimum = screen.getByRole("textbox", {
      name: "目标下限",
    });
    await user.clear(minimum);
    await user.type(minimum, "40");
    await user.click(
      screen.getByRole("button", { name: "保存目标" }),
    );
    expect(within(targetSection).getByText("低于目标")).toBeTruthy();

    await user.click(
      within(targetSection).getByRole("button", {
        name: "删除蛋白质（每100g）目标",
      }),
    );
    expect(
      within(targetSection).queryByText("蛋白质（每100g）"),
    ).toBeNull();
  });

  it("locates missing nutrition and price on the responsible ingredient row", async () => {
    const api = createApi();
    const definitions = await api.listNutrientDefinitions();
    await updateMilk(api, {
      currentPrice: null,
      nutrition: {
        basis: "per_100g",
        values: definitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: null,
        })),
      },
      allergens: { contains: [], mayContain: [] },
    });
    await createFormula(api, "缺失数据配方");
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("缺失数据配方");
    await addMilk(user);

    const row = await screen.findByRole("row", {
      name: /脱脂乳粉/,
    });
    expect(within(row).getByText(/缺少：价格/)).toBeTruthy();
    expect(within(row).getByText(/蛋白质/)).toBeTruthy();
  });

  it("autosaves the single Markdown research note", async () => {
    const api = createApi();
    const recipe = await createFormula(api, "备注配方");
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} />);
    await screen.findByDisplayValue("备注配方");
    await user.type(
      screen.getByRole("textbox", { name: "研发备注" }),
      "80℃ 15 秒；酸感偏弱，下轮提高柠檬汁。",
    );

    await waitFor(
      async () => {
        expect(await api.getRecipeDraft(recipe.id)).toMatchObject({
          markdownNotes: "80℃ 15 秒；酸感偏弱，下轮提高柠檬汁。",
        });
      },
      { timeout: 1800 },
    );
    expect(
      screen.getAllByRole("textbox", { name: "研发备注" }),
    ).toHaveLength(1);
  });
});
