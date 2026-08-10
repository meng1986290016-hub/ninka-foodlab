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
  yogurtVersions[0]!.snapshot.markdownNotes =
    "发酵温度 42℃，口感更顺滑。";
  yogurtVersions[1]!.snapshot.markdownNotes =
    "发酵温度 40℃，酸感偏弱。";
  const base = recipe("base", "乳基底", {
    kind: "semi_finished",
    tags: ["基底"],
    latestVersionNumber: 1,
  });
  const baseVersions = [version(base, 1, "18.1235")];
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
    createRecipeAlternative: vi.fn(async (input) =>
      recipe("yogurt-supplier-b", yogurt.name, {
        productId: yogurt.id,
        schemeName: input.schemeName,
        schemeStatus: input.schemeStatus,
        currentDraftId: "draft-yogurt-supplier-b",
      }),
    ),
    updateRecipeScheme: vi.fn(async (id, input) => {
      const found = summaries.find((item) => item.recipe.id === id);
      if (!found) throw new Error("找不到配方");
      found.recipe.schemeName = input.schemeName;
      found.recipe.schemeStatus = input.schemeStatus;
      return found.recipe;
    }),
    archiveRecipe: vi.fn(async (id: string) => {
      const found = summaries.find((item) => item.recipe.id === id);
      if (found) {
        found.recipe.archivedAt = "2026-07-31T09:00:00.000Z";
      }
    }),
    restoreRecipe: vi.fn(async (id: string) => {
      const found = summaries.find((item) => item.recipe.id === id);
      if (found) {
        found.recipe.archivedAt = null;
        found.recipe.updatedAt = "2026-07-31T10:00:00.000Z";
      }
    }),
    deleteRecipeVersion: vi.fn(async (id: string) => {
      const found = allVersions.find((item) => item.id === id);
      if (!found) throw new Error("找不到版本");
      const recipeVersions = versionsByRecipe.get(found.recipeId) ?? [];
      const index = recipeVersions.findIndex((item) => item.id === id);
      if (index >= 0) recipeVersions.splice(index, 1);
      const allIndex = allVersions.findIndex((item) => item.id === id);
      if (allIndex >= 0) allVersions.splice(allIndex, 1);
      const foundSummary = summaries.find(
        (item) => item.recipe.id === found.recipeId,
      );
      if (foundSummary) {
        foundSummary.recipe.latestVersionNumber =
          recipeVersions[0]?.versionNumber ?? null;
        foundSummary.latestVersion = recipeVersions[0]
          ? summary(foundSummary.recipe, recipeVersions).latestVersion
          : null;
      }
    }),
    deleteDraftRecipe: vi.fn(async (id: string) => {
      const recipeVersions = versionsByRecipe.get(id) ?? [];
      if (recipeVersions.length > 0) {
        throw new Error("该配方已有正式版本，不能按工作草稿删除");
      }
      const index = summaries.findIndex((item) => item.recipe.id === id);
      if (index < 0) throw new Error("找不到配方");
      summaries.splice(index, 1);
      versionsByRecipe.delete(id);
    }),
    permanentlyDeleteRecipe: vi.fn(
      async (id: string, confirmationName: string) => {
        const index = summaries.findIndex((item) => item.recipe.id === id);
        const found = summaries[index];
        if (!found || found.recipe.name !== confirmationName) {
          throw new Error("输入的配方名称不一致");
        }
        summaries.splice(index, 1);
        versionsByRecipe.delete(id);
      },
    ),
    compareRecipeVersions: vi.fn(async () => ({
      before: {
        id: yogurtVersions[1]!.id,
        recipeId: yogurt.id,
        recipeName: yogurt.name,
        versionNumber: 1,
        outputMassGrams: "1000",
        createdAt: yogurtVersions[1]!.createdAt,
      },
      after: {
        id: yogurtVersions[0]!.id,
        recipeId: yogurt.id,
        recipeName: yogurt.name,
        versionNumber: 2,
        outputMassGrams: "1000",
        createdAt: yogurtVersions[0]!.createdAt,
      },
      itemChanges: [
        {
          kind: "reference_changed",
          itemKey: "milk",
          label: "脱脂乳粉 · 乳业 B · 中热型",
          beforeLabel: "脱脂乳粉 · 乳业 A · 低热型",
          afterLabel: "脱脂乳粉 · 乳业 B · 中热型",
          beforeAmountGrams: "300",
          afterAmountGrams: "280",
        },
      ],
      nutritionChanges: [
        {
          key: "protein",
          label: "蛋白质",
          unit: "g",
          before: null,
          after: "0",
        },
      ],
      costChanges: [
        {
          key: "batchTotal",
          label: "整批成本",
          unit: "CNY",
          before: "30",
          after: "42",
        },
      ],
      targetChanges: [
        {
          key: "target-cost",
          label: "每 100g 成本",
          unit: "CNY",
          before: "≤ 3 元 · 实际 3 · 已达到",
          after: "≤ 4.2 元 · 实际 4.2 · 已达到",
        },
      ],
      allergenChanges: [
        {
          key: "mayContain",
          label: "可能含有",
          unit: null,
          before: "",
          after: "大豆",
        },
      ],
      notesChanged: true,
    })),
  } as unknown as DesktopApi;
  return { api, yogurt, yogurtVersions, base };
}

describe("RecipeLibrary", () => {
  it("reloads cached rows when returning from the recipe workbench", async () => {
    const { api, yogurt, yogurtVersions } = createApi();
    const view = render(
      <RecipeLibrary
        api={api}
        onOpenDraft={() => undefined}
        refreshToken={0}
      />,
    );
    const table = await screen.findByRole("table");
    expect(within(table).getByText("V2")).toBeTruthy();

    yogurtVersions.unshift(version(yogurt, 3, "55"));
    view.rerender(
      <RecipeLibrary
        api={api}
        onOpenDraft={() => undefined}
        refreshToken={1}
      />,
    );

    expect(await within(table).findByText("V3")).toBeTruthy();
    expect(within(table).getByText("¥55.00")).toBeTruthy();
  });

  it("marks products whose source ingredients changed and shows the current estimate", async () => {
    const { api } = createApi();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("高蛋白酸奶").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("原料数据有更新")).toBeTruthy();
    expect(within(row!).getByText("当前估算 ¥99.00")).toBeTruthy();
    expect(within(row!).getByText("¥42.00")).toBeTruthy();
  });

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
    expect(within(table).getByText("¥18.12")).toBeTruthy();

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
      (await within(inspector).findAllByText("¥42.00")).length,
    ).toBeGreaterThan(0);
    expect(
      within(inspector).getByText("发酵温度 42℃，口感更顺滑。"),
    ).toBeTruthy();
    expect(within(inspector).getByText("乳业 A · 低热型")).toBeTruthy();

    await user.click(
      within(inspector).getByRole("button", { name: /V1/ }),
    );
    expect(
      (await within(inspector).findAllByText("¥30.00")).length,
    ).toBeGreaterThan(0);
    expect(within(inspector).queryByText("¥42.00")).toBeNull();
  });

  it("labels recipes without formal versions as work drafts in the list and inspector", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "版本状态" }),
    ).toBeTruthy();
    const draftName = within(table).getByText("燕麦试验配方");
    const row = draftName.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("工作草稿")).toBeTruthy();

    await user.click(row!);
    const inspector = await screen.findByLabelText("燕麦试验配方版本详情");
    expect(within(inspector).getAllByText("工作草稿").length).toBeGreaterThan(1);
    expect(
      within(inspector).getByRole("button", { name: "删除工作草稿" }),
    ).toBeTruthy();
  });

  it("permanently deletes a work draft after one confirmation without name input", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("燕麦试验配方").closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!);
    await user.click(
      screen.getByRole("button", { name: "删除工作草稿" }),
    );

    const dialog = screen.getByRole("dialog", { name: "删除工作草稿？" });
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "永久删除工作草稿" }),
    );

    await waitFor(() => {
      expect(api.deleteDraftRecipe).toHaveBeenCalledWith("draft-only");
    });
    expect(await screen.findByText("“燕麦试验配方”工作草稿已永久删除")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByText("燕麦试验配方")).toBeNull();
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

  it("creates a custom-named alternative recipe from the selected formal version", async () => {
    const { api, yogurtVersions } = createApi();
    const onOpenDraft = vi.fn();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={onOpenDraft} />);

    await user.click(
      await screen.findByRole("button", { name: "创建替代配方" }),
    );
    const dialog = screen.getByRole("dialog", { name: "创建替代配方" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "替代配方名称" }),
      "供应商 B 可可粉版本",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "创建并进入工作台" }),
    );

    await waitFor(() => {
      expect(api.createRecipeAlternative).toHaveBeenCalledWith({
        sourceVersionId: yogurtVersions[0]!.id,
        schemeName: "供应商 B 可可粉版本",
        schemeStatus: "researching",
      });
      expect(onOpenDraft).toHaveBeenCalledWith("yogurt-supplier-b");
    });
  });

  it("opens the selected formal version in the nutrition label workspace", async () => {
    const { api, yogurtVersions } = createApi();
    const onOpenNutritionLabel = vi.fn();
    const user = userEvent.setup();
    render(
      <RecipeLibrary
        api={api}
        onOpenDraft={() => undefined}
        onOpenNutritionLabel={onOpenNutritionLabel}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "生成营养标签",
      }),
    );
    expect(onOpenNutritionLabel).toHaveBeenCalledWith(
      "yogurt",
      yogurtVersions[0]!.id,
    );
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
    expect(within(comparison).getByText("¥99.00")).toBeTruthy();
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

  it("separates active and archived recipes and restores an archived recipe", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    expect(await screen.findByText("高蛋白酸奶")).toBeTruthy();
    expect(screen.queryByText("旧版布丁")).toBeNull();
    await user.click(await screen.findByRole("tab", { name: /归档库/ }));
    expect((await screen.findAllByText("旧版布丁")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "取消归档" }));

    await waitFor(() => {
      expect(api.restoreRecipe).toHaveBeenCalledWith("archived");
      expect(
        screen.getByRole("tab", { name: /研发中/ }).getAttribute("aria-selected"),
      ).toBe("true");
    });
    expect((await screen.findAllByText("旧版布丁")).length).toBeGreaterThan(0);
  });

  it("opens recipe details from the row and exposes a close action for narrow layouts", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    const table = await screen.findByRole("table");
    const identity = await within(table).findByText("高蛋白酸奶");
    const row = identity.closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!);

    const inspector = screen.getByLabelText("高蛋白酸奶版本详情");
    expect(inspector.className).toContain("is-narrow-open");
    await user.click(screen.getByRole("button", { name: "关闭配方详情" }));
    expect(inspector.className).not.toContain("is-narrow-open");
  });

  it("deletes one formal version after an irreversible-action confirmation", async () => {
    const { api, yogurtVersions } = createApi();
    const selectedVersionId = yogurtVersions[0]!.id;
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(
      await screen.findByRole("button", { name: "删除此版本" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "删除正式版本 V2？",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "永久删除版本" }),
    );

    await waitFor(() => {
      expect(api.deleteRecipeVersion).toHaveBeenCalledWith(
        selectedVersionId,
      );
    });
    expect(await screen.findByText("正式版本 V2 已永久删除")).toBeTruthy();
  });

  it("requires the archived recipe name before permanent deletion", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(await screen.findByRole("tab", { name: /归档库/ }));
    await screen.findByLabelText("旧版布丁版本详情");
    await user.click(
      screen.getByRole("button", { name: "永久删除配方" }),
    );
    const dialog = screen.getByRole("dialog", { name: "永久删除配方" });
    const confirmButton = within(dialog).getByRole("button", {
      name: "确认永久删除",
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    await user.type(
      within(dialog).getByRole("textbox", { name: "输入配方名称确认" }),
      "旧版布丁",
    );
    expect(confirmButton.disabled).toBe(false);
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.permanentlyDeleteRecipe).toHaveBeenCalledWith(
        "archived",
        "旧版布丁",
      );
    });
    expect(await screen.findByText("“旧版布丁”已永久删除")).toBeTruthy();
  });

  it("opens the selected version as a sampling source", async () => {
    const { api, yogurtVersions } = createApi();
    const onOpenSampleSheet = vi.fn();
    const user = userEvent.setup();
    render(
      <RecipeLibrary
        api={api}
        onOpenDraft={() => undefined}
        onOpenSampleSheet={onOpenSampleSheet}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "我要打样" }));
    expect(onOpenSampleSheet).toHaveBeenCalledWith(
      "yogurt",
      yogurtVersions[0]!.id,
    );
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

  it("compares supplier, amount, nutrition, cost, target, allergen and notes changes", async () => {
    const { api, yogurtVersions } = createApi();
    const user = userEvent.setup();
    render(<RecipeLibrary api={api} onOpenDraft={() => undefined} />);

    await user.click(
      await screen.findByRole("button", { name: "比较版本" }),
    );
    const panel = await screen.findByLabelText("高蛋白酸奶版本比较");
    await within(panel).findByText("共 6 项变化");

    expect(
      (
        within(panel).getByRole("combobox", {
          name: "基准版本",
        }) as HTMLSelectElement
      ).value,
    ).toBe(yogurtVersions[1]!.id);
    expect(
      (
        within(panel).getByRole("combobox", {
          name: "对比版本",
        }) as HTMLSelectElement
      ).value,
    ).toBe(yogurtVersions[0]!.id);
    expect(
      within(panel).getByText("脱脂乳粉 · 乳业 A · 低热型"),
    ).toBeTruthy();
    expect(
      within(panel).getByText("脱脂乳粉 · 乳业 B · 中热型"),
    ).toBeTruthy();
    expect(within(panel).getByText("来源变化")).toBeTruthy();
    expect(within(panel).getByText("未知 → 0 g")).toBeTruthy();
    expect(within(panel).getByText("+¥12")).toBeTruthy();
    expect(
      within(panel).getByText("发酵温度 40℃，酸感偏弱。"),
    ).toBeTruthy();
    expect(
      within(panel).getByText("发酵温度 42℃，口感更顺滑。"),
    ).toBeTruthy();

    await user.click(
      within(panel).getByRole("button", { name: "关闭版本比较" }),
    );
    expect(
      await screen.findByLabelText("高蛋白酸奶版本详情"),
    ).toBeTruthy();
  });
});
