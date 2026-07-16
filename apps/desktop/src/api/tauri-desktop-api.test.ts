import { describe, expect, it, vi } from "vitest";

import { TauriDesktopApi } from "./tauri-desktop-api";

describe("TauriDesktopApi", () => {
  it("uses the grouped material list command contract", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const api = new TauriDesktopApi(invoke);

    await api.listMaterialGroups("乳粉");

    expect(invoke).toHaveBeenCalledWith("list_material_groups", {
      query: "乳粉",
    });
  });

  it("saves a supplier variant without a client-controlled update date", async () => {
    const invoke = vi.fn().mockResolvedValue({ id: "variant-1" });
    const api = new TauriDesktopApi(invoke);
    const input = {
      materialGroupId: "material-1",
      supplierId: "supplier-1",
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: "31.50",
      priceUnit: "kg" as const,
      densityGPerMl: null,
      source: "供应商规格书",
      researchNotes: "溶解性好",
      nutrition: {
        basis: "per_100g" as const,
        values: [{ nutrientDefinitionId: "protein", value: "34.0" }],
      },
    };

    await api.saveIngredientVariant(input);

    expect(invoke).toHaveBeenCalledWith("save_ingredient_variant", { input });
    expect(invoke.mock.calls[0]?.[1]?.input).not.toHaveProperty("updatedAt");
  });

  it("uses the stable list command contract", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const api = new TauriDesktopApi(invoke);

    await api.listIngredients({ query: "乳粉" });

    expect(invoke).toHaveBeenCalledWith("list_ingredients", {
      request: { query: "乳粉" },
    });
  });

  it("uses the stable create command contract", async () => {
    const invoke = vi.fn().mockResolvedValue({ id: "ingredient-1" });
    const api = new TauriDesktopApi(invoke);
    const input = {
      name: "白砂糖",
      internalCode: "RM-0001",
      category: "甜味原料",
      tags: [],
      notes: "",
      densityGPerMl: null,
      currentPrice: "6.80",
      priceUnit: "kg" as const,
      priceUpdatedAt: "2026-07-16",
      source: "供应商规格书",
      sourceDate: "2026-07-10",
    };

    await api.createIngredient(input);

    expect(invoke).toHaveBeenCalledWith("create_ingredient", { input });
  });
});
