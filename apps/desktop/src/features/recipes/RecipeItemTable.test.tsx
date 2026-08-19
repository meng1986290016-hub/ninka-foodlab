import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  RecipeCalculationIssue,
  RecipeDraftItem,
} from "../../api/recipe-types";
import { RecipeItemTable } from "./RecipeItemTable";

const materialNeedItem: RecipeDraftItem = {
  id: "item-cocoa",
  position: 0,
  kind: "material_need",
  materialNeedId: "need-cocoa",
  amount: "0.04",
  unit: "kg",
  locked: true,
  autoFill: false,
  materialNeed: {
    id: "need-cocoa",
    proposalId: "proposal-1",
    recipeId: "recipe-1",
    materialName: "可可粉（碱化）",
    purpose: "形成巧克力风味与色泽",
    desiredSpecification: "食品级，需确认脂肪含量及碱化程度",
    missingReason: "当前原料库没有可用的具体供应商版本",
    suggestedAmount: "0.04",
    suggestedUnit: "kg",
    status: "open",
    resolvedIngredientVariantId: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  },
};

const ingredientItem: RecipeDraftItem = {
  id: "item-milk-powder",
  position: 0,
  kind: "ingredient",
  ingredientVariantId: "variant-milk-powder",
  materialName: "脱脂乳粉",
  amount: "100",
  unit: "g",
  locked: false,
  autoFill: false,
  ingredientVariant: {
    id: "variant-milk-powder",
    materialGroupId: "group-milk-powder",
    supplierId: "supplier-a",
    supplierName: "供应商 A",
    modelOrSpecification: "25 kg",
    internalCode: null,
    currentPrice: "20",
    priceUnit: "kg",
    densityGPerMl: null,
    source: "标签图片",
    researchNotes: "",
    nutrition: {
      basis: "per_100g",
      values: [{ nutrientDefinitionId: "lactose", value: null }],
    },
    allergens: { contains: [], mayContain: [] },
    sourceAttachments: [],
    completeness: { percent: 80, missingFields: ["乳糖"] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archivedAt: null,
  },
};

function issue(
  overrides: Partial<RecipeCalculationIssue>,
): RecipeCalculationIssue {
  return {
    code: "material_need_unresolved",
    severity: "warning",
    message: "该原料尚未关联供应商版本，营养与成本暂按缺失数据处理",
    field: "materialNeedId",
    itemId: materialNeedItem.id,
    ...overrides,
  };
}

function renderTable(issues: RecipeCalculationIssue[]) {
  render(
    <RecipeItemTable
      issues={issues}
      items={[materialNeedItem]}
      missingData={{}}
      versionUpgrades={{}}
      onAdd={vi.fn()}
      onAmountChange={vi.fn()}
      onMove={vi.fn()}
      onRemove={vi.fn()}
      onReplaceMaterialNeed={vi.fn()}
      onUnitChange={vi.fn()}
      onUpgradeVersion={vi.fn()}
    />,
  );
}

describe("RecipeItemTable issue placement", () => {
  it("calculates percentages from the actual input total", () => {
    renderTable([]);

    expect(screen.getByText("100.00%")).not.toBeNull();
    expect(screen.queryByText("锁定")).toBeNull();
    expect(screen.queryByText("补足")).toBeNull();
  });

  it("opens read-only nutrition and gap details from distinct controls", async () => {
    const user = userEvent.setup();
    const onViewNutrition = vi.fn();
    const onViewGaps = vi.fn();
    render(
      <RecipeItemTable
        issues={[]}
        items={[ingredientItem]}
        missingData={{ [ingredientItem.id]: ["乳糖"] }}
        versionUpgrades={{}}
        onAdd={vi.fn()}
        onAmountChange={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onReplaceMaterialNeed={vi.fn()}
        onUnitChange={vi.fn()}
        onUpgradeVersion={vi.fn()}
        onViewGaps={onViewGaps}
        onViewNutrition={onViewNutrition}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "查看脱脂乳粉的营养信息" }),
    );
    expect(onViewNutrition).toHaveBeenCalledWith(ingredientItem);

    await user.click(screen.getByRole("button", { name: "80%" }));
    expect(onViewGaps).toHaveBeenCalledWith(ingredientItem);
  });

  it("does not offer nutrition details for an unresolved material need", () => {
    const onViewNutrition = vi.fn();
    render(
      <RecipeItemTable
        issues={[]}
        items={[materialNeedItem]}
        missingData={{}}
        versionUpgrades={{}}
        onAdd={vi.fn()}
        onAmountChange={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onReplaceMaterialNeed={vi.fn()}
        onUnitChange={vi.fn()}
        onUpgradeVersion={vi.fn()}
        onViewNutrition={onViewNutrition}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /查看可可粉/ }),
    ).toBeNull();
  });

  it("keeps supplier-version warnings inside the row data cell", () => {
    renderTable([issue({})]);

    const warning = screen.getByText(
      "该原料尚未关联供应商版本，营养与成本暂按缺失数据处理",
    );
    expect(warning.closest("td")?.classList.contains("recipe-data-column"))
      .toBe(true);
    expect(
      screen
        .getByRole("textbox", { name: "可可粉（碱化）用量" })
        .parentElement?.contains(warning),
    ).toBe(false);
  });

  it("keeps amount validation errors inside the amount cell", () => {
    renderTable([
      issue({
        code: "negative_value",
        severity: "error",
        message: "数值不能小于 0",
        field: "amount",
      }),
    ]);

    const error = screen.getByText("数值不能小于 0");
    const amount = screen.getByRole("textbox", {
      name: "可可粉（碱化）用量",
    });
    expect(error.closest("td")).toBe(amount.closest("td"));
    expect(amount.getAttribute("aria-invalid")).toBe("true");
  });
});
