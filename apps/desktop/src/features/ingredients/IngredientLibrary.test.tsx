import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import { builtInNutrients } from "../../api/browser-schema";
import { App } from "../../App";

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

function emptyV2Storage() {
  const storage = new MemoryStorage();
  storage.setItem(
    "food-rd.browser-demo.v2",
    JSON.stringify({
      schemaVersion: 2,
      categories: [],
      suppliers: [],
      materialGroups: [],
      nutrientDefinitions: builtInNutrients(),
      settings: {},
      drafts: {},
    }),
  );
  return storage;
}

async function seedSupplierVariants(api: BrowserDemoApi) {
  const category = await api.createCategory("乳制品");
  const suppliers = await Promise.all([
    api.createSupplier("供应商A"),
    api.createSupplier("供应商B"),
    api.createSupplier("供应商C"),
  ]);
  const group = await api.createMaterialGroup({
    name: "脱脂乳粉",
    categoryId: category.id,
  });
  const variants = [
    {
      supplier: suppliers[0]!,
      model: "干燥脱脂乳粉",
      price: "31.50",
      notes: "奶香浓郁，溶解性好。",
    },
    {
      supplier: suppliers[1]!,
      model: "乳益康 MD-300",
      price: "32.20",
      notes: "溶解速度快，口感清爽。",
    },
    {
      supplier: suppliers[2]!,
      model: "DailySkim DF-80",
      price: "33.00",
      notes: "乳味较淡，适合成本敏感配方。",
    },
  ];
  for (const item of variants) {
    await api.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: item.supplier.id,
      modelOrSpecification: item.model,
      internalCode: null,
      currentPrice: item.price,
      priceUnit: "kg",
      densityGPerMl: null,
      source: "供应商规格书",
      researchNotes: item.notes,
      nutrition: {
        basis: "per_100g",
        values: builtInNutrients().map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: definition.id === "protein" ? "34.0" : null,
        })),
      },
    });
  }
  const sugarGroup = await api.createMaterialGroup({
    name: "白砂糖",
    categoryId: null,
  });
  await api.saveIngredientVariant({
    materialGroupId: sugarGroup.id,
    supplierId: suppliers[0]!.id,
    modelOrSpecification: "一级白砂糖",
    internalCode: null,
    currentPrice: "6.80",
    priceUnit: "kg",
    densityGPerMl: null,
    source: "供应商规格书",
    researchNotes: "常用甜味原料",
    nutrition: { basis: "per_100g", values: [] },
  });
  return group;
}

describe("ingredient library supplier hierarchy", () => {
  let api: BrowserDemoApi;

  beforeEach(async () => {
    let nextId = 0;
    api = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `created-${++nextId}`,
      now: () => "2026-07-16T02:00:00.000Z",
    });
    await seedSupplierVariants(api);
  });

  it("expands a common material to show supplier-specific rows", async () => {
    const user = userEvent.setup();
    render(<App api={api} />);

    await screen.findByText("脱脂乳粉");
    expect(screen.queryByText("供应商A")).toBeNull();
    await user.click(screen.getByRole("button", { name: "展开 脱脂乳粉" }));

    expect(await screen.findByText("供应商A")).not.toBeNull();
    expect(screen.getByText("供应商B")).not.toBeNull();
    expect(screen.getByText("供应商C")).not.toBeNull();
    expect(screen.getByText("3 家供应商")).not.toBeNull();
  });

  it("searches supplier, model and research notes", async () => {
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findByText("脱脂乳粉");

    const search = screen.getByRole("searchbox", { name: "搜索原料" });
    await user.type(search, "DailySkim");
    await waitFor(() => expect(screen.queryByText("白砂糖")).toBeNull());
    expect(await screen.findByText("脱脂乳粉")).not.toBeNull();

    await user.clear(search);
    await user.type(search, "溶解性好");
    await waitFor(() => expect(screen.queryByText("白砂糖")).toBeNull());
    expect(await screen.findByText("脱脂乳粉")).not.toBeNull();
  });

  it("shows update dates only on supplier variants", async () => {
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findByText("脱脂乳粉");

    const groupRow = screen.getByRole("row", { name: /脱脂乳粉/ });
    expect(within(groupRow).queryByText("2026/07/16")).toBeNull();

    await user.click(within(groupRow).getByRole("button", { name: "展开 脱脂乳粉" }));
    const supplierRow = screen.getByRole("row", { name: /供应商A/ });
    expect(within(supplierRow).getByText("2026/07/16")).not.toBeNull();
  });
});
