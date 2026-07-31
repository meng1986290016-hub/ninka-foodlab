import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  Recipe,
  RecipeCalculation,
  RecipeSummary,
  RecipeVersion,
  RecipeVersionSnapshot,
} from "../../api/recipe-types";
import type { MaterialGroup } from "../../api/types";
import { RecipeLibrary } from "./RecipeLibrary";

function calculation(batchTotal: string): RecipeCalculation {
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
        totalKnownAmount: "50",
        per100gKnownAmount: "5",
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
      per100g: `${Number(batchTotal) / 10}`,
      perServing: null,
      perPackage: null,
      status: "complete",
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: {
      contains: ["乳及乳制品"],
      mayContain: [],
      sourceItemIds: {},
    },
    completeness: { percent: 100, missingFields: [] },
    calculatedAt: "2026-07-30T08:00:00.000Z",
  };
}

function snapshot(
  recipe: Recipe,
  batchTotal: string,
): RecipeVersionSnapshot {
  return {
    schemaVersion: 1,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      code: recipe.code,
      tags: recipe.tags,
      kind: recipe.kind,
    },
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: `item-${recipe.id}`,
        position: 0,
        kind: "ingredient",
        amount: "1000",
        unit: "g",
        massGrams: "1000",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "variant-1",
          materialGroupId: "group-1",
          materialName: "脱脂乳粉",
          supplierId: "supplier-1",
          supplierName: "乳业 A",
          modelOrSpecification: "低热型",
          densityGPerMl: null,
          nutrientsPer100g: { protein: "34" },
          nutrientUnits: { protein: "g" },
          pricePerKg: "31.5",
          allergens: {
            contains: ["乳及乳制品"],
            mayContain: [],
            sourceItemIds: {},
          },
          source: "供应商规格书",
          ingredientUpdatedAt: "2026-07-29T08:00:00.000Z",
        },
      },
    ],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "发酵温度保持 42℃。",
    calculation: calculation(batchTotal),
  };
}

function recipe(
  id: string,
  name: string,
  overrides: Partial<Recipe> = {},
): Recipe {
  return {
    id,
    name,
    code: null,
    tags: [],
    kind: "formula",
    currentDraftId: `draft-${id}`,
    latestVersionNumber: null,
    createdAt: "2026-07-28T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function version(
  recipeValue: Recipe,
  versionNumber: number,
  batchTotal: string,
): RecipeVersion {
  return {
    id: `${recipeValue.id}-v${versionNumber}`,
    recipeId: recipeValue.id,
    versionNumber,
    sourceDraftId: `draft-${recipeValue.id}`,
    basedOnVersionId:
      versionNumber > 1
        ? `${recipeValue.id}-v${versionNumber - 1}`
        : null,
    snapshot: snapshot(recipeValue, batchTotal),
    createdAt: `2026-07-${String(28 + versionNumber).padStart(
      2,
      "0",
    )}T08:00:00.000Z`,
  };
}

function summary(
  recipeValue: Recipe,
  versions: RecipeVersion[],
  referencedByCount = 0,
): RecipeSummary {
  const latest = versions[0] ?? null;
  return {
    recipe: recipeValue,
    draftUpdatedAt: recipeValue.updatedAt,
    latestVersion: latest
      ? {
          id: latest.id,
          recipeId: latest.recipeId,
          recipeName: recipeValue.name,
          versionNumber: latest.versionNumber,
          outputMassGrams: latest.snapshot.targetBatchGrams,
          createdAt: latest.createdAt,
        }
      : null,
    referencedByCount,
  };
}

function currentMaterials(): MaterialGroup[] {
  return [
    {
      id: "group-1",
      name: "脱脂乳粉",
      categoryId: null,
      categoryName: null,
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-31T08:00:00.000Z",
      archivedAt: null,
      variants: [
        {
          id: "variant-1",
          materialGroupId: "group-1",
          supplierId: "supplier-1",
          supplierName: "乳业 A",
          modelOrSpecification: "低热型",
          internalCode: null,
          currentPrice: "99",
          priceUnit: "kg",
          densityGPerMl: null,
          source: "最新报价",
          researchNotes: "",
          nutrition: { basis: "per_100g", values: [] },
          allergens: { contains: [], mayContain: [] },
          sourceAttachments: [],
          completeness: { percent: 100, missingFields: [] },
          createdAt: "2026-07-01T08:00:00.000Z",
          updatedAt: "2026-07-31T08:00:00.000Z",
          archivedAt: null,
        },
      ],
    },
  ];
}

function createApi() {
  const yogurt = recipe("yogurt", "高蛋白酸奶", {
    code: "HP-01",
    tags: ["乳制品", "稳定版"],
    latestVersionNumber: 2,
  });
  const yogurtVersions = [
    version(yogurt, 2, "42"),
    version(yogurt, 1, "30"),
  ];
  const base = recipe("base", "乳基底", {
    kind: "semi_finished",
    tags: ["基底"],
    latestVersionNumber: 1,
  });
  const baseVersions = [version(base, 1, "18")];
  const draftOnly = recipe("draft-only", "燕麦试验配方", {
    tags: ["小试"],
  });
  const archived = recipe("archived", "旧版布丁", {
    archivedAt: "2026-07-30T08:00:00.000Z",
    latestVersionNumber: 1,
  });
  const archivedVersions = [version(archived, 1, "12")];
  const summaries = [
    summary(yogurt, yogurtVersions),
    summary(base, baseVersions, 2),
    summary(draftOnly, []),
    summary(archived, archivedVersions),
  ];
  const versionsByRecipe = new Map([
    [yogurt.id, yogurtVersions],
    [base.id, baseVersions],
    [draftOnly.id, []],
    [archived.id, archivedVersions],
  ]);
  const allVersions = [
    ...yogurtVersions,
    ...baseVersions,
    ...archivedVersions,
  ];
  const api = {
    listRecipes: vi.fn(async () => summaries),
    listRecipeVersions: vi.fn(
      async (recipeId: string) =>
        versionsByRecipe.get(recipeId) ?? [],
    ),
    getRecipeVersion: vi.fn(async (id: string) => {
      const found = allVersions.find((item) => item.id === id);
      if (!found) throw new Error("找不到版本");
      return found;
    }),
    listMaterialGroups: vi.fn(async () => currentMaterials()),
    copyRecipeVersionToDraft: vi.fn(async () => ({
      id: "copied-draft",
    })),
    archiveRecipe: vi.fn(async (id: string) => {
      const found = summaries.find((item) => item.recipe.id === id);
      if (found) {
        found.recipe.archivedAt = "2026-07-31T09:00:00.000Z";
      }
    }),
  } as unknown as DesktopApi;
  return { api, yogurt, yogurtVersions, base };
}

describe("RecipeLibrary", () => {
  it("searches names, optional codes and tags and filters type and status", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);
    await screen.findByRole("heading", { name: "配方库" });

    const search = screen.getByRole("searchbox", {
      name: "搜索配方",
    });
    const table = screen.getByRole("table");
    await user.type(search, "HP-01");
    expect(within(table).getByText("高蛋白酸奶")).toBeTruthy();
    expect(within(table).queryByText("乳基底")).toBeNull();

    await user.clear(search);
    await user.type(search, "基底");
    expect(within(table).getByText("乳基底")).toBeTruthy();

    await user.clear(search);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "配方类型" }),
      "semi_finished",
    );
    expect(within(table).getByText("乳基底")).toBeTruthy();
    expect(within(table).queryByText("高蛋白酸奶")).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "配方类型" }),
      "all",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "配方状态" }),
      "draft_only",
    );
    expect(within(table).getByText("燕麦试验配方")).toBeTruthy();
    expect(within(table).queryByText("旧版布丁")).toBeNull();
  });

  it("shows the latest frozen snapshot and switches version history", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);
    const inspector = await screen.findByLabelText("高蛋白酸奶版本详情");

    expect(within(inspector).getAllByText("V2").length).toBeGreaterThan(0);
    expect(
      (await within(inspector).findAllByText("¥42")).length,
    ).toBeGreaterThan(0);
    expect(within(inspector).getByText("发酵温度保持 42℃。")).toBeTruthy();
    expect(within(inspector).getByText("乳业 A · 低热型")).toBeTruthy();

    await user.click(
      within(inspector).getByRole("button", { name: /V1/ }),
    );
    expect(
      (await within(inspector).findAllByText("¥30")).length,
    ).toBeGreaterThan(0);
    expect(within(inspector).queryByText("¥42")).toBeNull();
  });

  it("copies the selected immutable version into a workbench draft", async () => {
    const { api, yogurtVersions } = createApi();
    const onOpenDraft = vi.fn();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={onOpenDraft} />);

    await user.click(
      await screen.findByRole("button", { name: "复制为草稿" }),
    );
    await waitFor(() => {
      expect(api.copyRecipeVersionToDraft).toHaveBeenCalledWith(
        yogurtVersions[0]!.id,
      );
      expect(onOpenDraft).toHaveBeenCalledWith("yogurt");
    });
  });

  it("temporarily recalculates with current prices without changing the snapshot", async () => {
    const { api, yogurtVersions } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(
      await screen.findByRole("button", {
        name: "按当前价格重算",
      }),
    );
    const comparison = await screen.findByRole("status");
    expect(within(comparison).getByText("¥99")).toBeTruthy();
    expect(
      within(comparison).getByText(
        "仅用于当前决策，正式版本的冻结快照没有改变。",
      ),
    ).toBeTruthy();
    expect(
      yogurtVersions[0]!.snapshot.calculation.cost.batchTotal,
    ).toBe("42");
  });

  it("archives an unreferenced recipe after confirmation", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(
      await screen.findByRole("button", { name: "归档" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "确认归档配方",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "确认归档" }),
    );
    await waitFor(() => {
      expect(api.archiveRecipe).toHaveBeenCalledWith("yogurt");
    });
  });

  it("protects a recipe that is referenced by formal versions", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(await screen.findByText("乳基底"));
    const inspector = await screen.findByLabelText("乳基底版本详情");
    expect(
      within(inspector).getByText(/被其他正式版本引用 2 次/),
    ).toBeTruthy();
    expect(
      (
        within(inspector).getByRole("button", {
          name: "归档",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(api.archiveRecipe).not.toHaveBeenCalled();
  });
});
