import { describe, expect, it, vi } from "vitest";

import { TauriDesktopApi } from "./tauri-desktop-api";
import { DesktopApiError } from "./types";

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

  it("maps comparison and versioned drafts to camel-case payloads", async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const api = new TauriDesktopApi(invoke);

    await api.compareIngredientVariants("material-1", ["variant-1", "variant-2"]);
    await api.saveDraft("ingredient-variant-editor", "new:material-1", 2, {
      currentPrice: "31.50",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "compare_ingredient_variants", {
      materialGroupId: "material-1",
      variantIds: ["variant-1", "variant-2"],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "save_draft", {
      kind: "ingredient-variant-editor",
      key: "new:material-1",
      payloadVersion: 2,
      payload: { currentPrice: "31.50" },
    });
  });

  it("maps structured native failures without exposing storage details", async () => {
    const invoke = vi.fn().mockRejectedValue({
      code: "storage_failure",
      message: "数据库操作失败",
      field: null,
    });
    const api = new TauriDesktopApi(invoke);

    const failure = await api.listCategories().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DesktopApiError);
    expect(failure).toMatchObject({
      code: "storage_failure",
      message: "数据库操作失败",
    });
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
