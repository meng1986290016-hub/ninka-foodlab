import { describe, expect, it } from "vitest";

import type {
  RecipeDraftIngredientItem,
  RecipeDraftItem,
} from "../../api/recipe-types";
import type { IngredientVariant } from "../../api/types";
import { rebalanceDraftItems } from "./recipe-rebalance";

function ingredient(
  id: string,
  amount: string,
  options: {
    locked?: boolean;
    unit?: RecipeDraftIngredientItem["unit"];
    densityGPerMl?: string | null;
  } = {},
): RecipeDraftIngredientItem {
  const variant: IngredientVariant = {
    id: `variant-${id}`,
    materialGroupId: `group-${id}`,
    supplierId: `supplier-${id}`,
    supplierName: "测试供应商",
    modelOrSpecification: "",
    internalCode: null,
    currentPrice: "10",
    priceUnit: "kg",
    densityGPerMl: options.densityGPerMl ?? null,
    source: "",
    researchNotes: "",
    nutrition: { basis: "per_100g", values: [] },
    allergens: { contains: [], mayContain: [] },
    sourceAttachments: [],
    completeness: { percent: 100, missingFields: [] },
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    archivedAt: null,
  };
  return {
    id,
    position: 0,
    kind: "ingredient",
    ingredientVariantId: variant.id,
    materialName: id,
    ingredientVariant: variant,
    amount,
    unit: options.unit ?? "g",
    locked: options.locked ?? false,
    autoFill: false,
  };
}

describe("rebalanceDraftItems", () => {
  it("keeps locked amounts and scales only unlocked items", () => {
    const items: RecipeDraftItem[] = [
      ingredient("fixed", "0.2", { locked: true, unit: "kg" }),
      ingredient("a", "0.3", { unit: "kg" }),
      ingredient("b", "0.1", { unit: "kg" }),
    ];

    const result = rebalanceDraftItems(
      items,
      "1000",
      { type: "proportional" },
    );

    expect(result).toEqual({
      ok: true,
      items: [
        expect.objectContaining({ id: "fixed", amount: "0.2" }),
        expect.objectContaining({ id: "a", amount: "0.6" }),
        expect.objectContaining({ id: "b", amount: "0.2" }),
      ],
    });
  });

  it("fills one unlocked item to the exact target", () => {
    const items: RecipeDraftItem[] = [
      ingredient("sugar", "10", { locked: true }),
      ingredient("flavour", "1", { locked: true }),
      ingredient("water", "0"),
    ];

    const result = rebalanceDraftItems(
      items,
      "100",
      { type: "auto-fill", itemId: "water" },
    );

    expect(result).toEqual({
      ok: true,
      items: [
        expect.objectContaining({ id: "sugar", amount: "10" }),
        expect.objectContaining({ id: "flavour", amount: "1" }),
        expect.objectContaining({ id: "water", amount: "89" }),
      ],
    });
  });

  it("converts volume amounts with density and restores their original unit", () => {
    const items: RecipeDraftItem[] = [
      ingredient("juice", "100", {
        unit: "mL",
        densityGPerMl: "1.2",
      }),
    ];

    const result = rebalanceDraftItems(
      items,
      "240",
      { type: "proportional" },
    );

    expect(result).toEqual({
      ok: true,
      items: [
        expect.objectContaining({
          id: "juice",
          amount: "200",
          unit: "mL",
        }),
      ],
    });
  });

  it("returns a concrete error without mutating the input", () => {
    const items: RecipeDraftItem[] = [
      ingredient("fixed", "80", { locked: true }),
      ingredient("other", "20"),
    ];
    const before = structuredClone(items);

    const result = rebalanceDraftItems(
      items,
      "50",
      { type: "proportional" },
    );

    expect(result).toEqual({
      ok: false,
      message: "已锁定原料总量超过目标批量",
    });
    expect(items).toEqual(before);
  });

  it("rejects a locked auto-fill item", () => {
    const items: RecipeDraftItem[] = [
      ingredient("fixed", "20", { locked: true }),
      ingredient("other", "10"),
    ];

    const result = rebalanceDraftItems(
      items,
      "100",
      { type: "auto-fill", itemId: "fixed" },
    );

    expect(result).toEqual({
      ok: false,
      message: "自动补足项必须存在且不能被锁定",
    });
  });

  it("rejects proportional scaling when unlocked items have a zero basis", () => {
    const items: RecipeDraftItem[] = [
      ingredient("fixed", "20", { locked: true }),
      ingredient("empty", "0"),
    ];

    const result = rebalanceDraftItems(
      items,
      "100",
      { type: "proportional" },
    );

    expect(result).toEqual({
      ok: false,
      message: "没有可按比例调整的未锁定原料",
    });
  });

  it("rejects negative amounts without normalizing them away", () => {
    const items: RecipeDraftItem[] = [
      ingredient("negative", "-1"),
    ];

    const result = rebalanceDraftItems(
      items,
      "100",
      { type: "proportional" },
    );

    expect(result).toEqual({
      ok: false,
      message: "原料用量不能小于 0",
    });
    expect(items[0]?.amount).toBe("-1");
  });
});
