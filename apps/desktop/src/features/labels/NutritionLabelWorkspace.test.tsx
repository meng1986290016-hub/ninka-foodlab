import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { calculateNutritionLabel } from "@food-rd/core";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  NutritionLabel,
  NutritionLabelDraft,
  NutritionLabelDraftSaveInput,
  NutritionLabelVersion,
} from "../../api/nutrition-label-types";
import type {
  Recipe,
  RecipeCalculation,
  RecipeVersion,
} from "../../api/recipe-types";
import { NutritionLabelWorkspace } from "./NutritionLabelWorkspace";

function calculation(sodium: string | null = "62"): RecipeCalculation {
  const nutrient = (
    nutrientDefinitionId: string,
    name: string,
    unit: string,
    value: string | null,
  ) => ({
    nutrientDefinitionId,
    name,
    unit,
    totalKnownAmount: value ?? "0",
    per100gKnownAmount: value ?? "0",
    status: value === null ? ("unknown" as const) : ("complete" as const),
    completenessRatio: value === null ? "0" : "1",
    missingItemIds: value === null ? ["missing-source"] : [],
  });
  return {
    inputMassGrams: "1000",
    basisMassGrams: "1000",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [
      nutrient("protein", "蛋白质", "g", "8.64"),
      nutrient("fat", "脂肪", "g", "0.82"),
      nutrient("carbohydrate", "碳水化合物", "g", "9.36"),
      nutrient("sodium", "钠", "mg", sodium),
    ],
    cost: {
      rawMaterialTotal: "20",
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal: "20",
      perKg: "20",
      per100g: "2",
      perServing: null,
      perPackage: null,
      status: "complete",
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: { contains: ["乳"], mayContain: [], sourceItemIds: {} },
    completeness: { percent: sodium === null ? 80 : 100, missingFields: [] },
    calculatedAt: "2026-07-31T09:00:00.000Z",
  };
}

function fixture(sodium: string | null = "62") {
  const recipe: Recipe = {
    id: "recipe-yogurt",
    name: "原味高蛋白酸奶",
    code: null,
    tags: [],
    kind: "formula",
    currentDraftId: "recipe-draft",
    latestVersionNumber: 2,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-31T09:00:00.000Z",
    archivedAt: null,
  };
  const recipeVersion: RecipeVersion = {
    id: "recipe-version-2",
    recipeId: recipe.id,
    versionNumber: 2,
    sourceDraftId: "recipe-draft",
    basedOnVersionId: "recipe-version-1",
    snapshot: {
      schemaVersion: 1,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        code: null,
        tags: [],
        kind: "formula",
      },
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      servingMassGrams: null,
      packageCount: null,
      items: [],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "",
      calculation: calculation(sodium),
    },
    createdAt: "2026-07-31T09:00:00.000Z",
  };
  const label: NutritionLabel = {
    id: "label-yogurt",
    recipeId: recipe.id,
    name: "营养成分表",
    currentDraftId: null,
    latestVersionNumber: null,
    createdAt: "2026-07-31T09:00:00.000Z",
    updatedAt: "2026-07-31T09:00:00.000Z",
    archivedAt: null,
  };
  return { recipe, recipeVersion, label };
}

function createApi(sodium: string | null = "62") {
  const { recipe, recipeVersion, label } = fixture(sodium);
  let savedDraft: NutritionLabelDraft | null = null;
  const api = {
    getRecipe: vi.fn(async () => recipe),
    getRecipeVersion: vi.fn(async () => recipeVersion),
    listNutritionLabels: vi.fn(async () => [label]),
    createNutritionLabel: vi.fn(async () => label),
    getNutritionLabelDraft: vi.fn(async () => savedDraft),
    calculateNutritionLabelPreview: vi.fn(
      async (input: NutritionLabelDraftSaveInput) =>
        calculateNutritionLabel(input),
    ),
    saveNutritionLabelDraft: vi.fn(
      async (input: NutritionLabelDraftSaveInput) => {
        savedDraft = {
          ...input,
          id: "label-draft",
          calculation: calculateNutritionLabel(input),
          createdAt: "2026-07-31T09:00:00.000Z",
          updatedAt: "2026-07-31T09:00:00.000Z",
        };
        return savedDraft;
      },
    ),
    listNutritionLabelVersions: vi.fn(async () => []),
    publishNutritionLabel: vi.fn(async () => {
      const calculationResult = savedDraft!.calculation;
      return {
        id: "label-version-1",
        labelId: label.id,
        versionNumber: 1,
        sourceDraftId: savedDraft!.id,
        recipeVersionId: recipeVersion.id,
        rulePackId: calculationResult.rulePack.id,
        rulePackRevision: calculationResult.rulePack.revision,
        snapshot: {
          schemaVersion: 1,
          id: "label-version-1",
          labelId: label.id,
          labelVersionNumber: 1,
          recipeId: recipe.id,
          recipeVersionId: recipeVersion.id,
          rulePack: calculationResult.rulePack,
          basis: calculationResult.basis,
          sourceValues: savedDraft!.sourceValues,
          rows: calculationResult.rows,
          issues: calculationResult.issues,
          publishable: true,
          requiredNotice: calculationResult.requiredNotice,
          generatedAt: "2026-07-31T09:00:00.000Z",
        },
        createdAt: "2026-07-31T09:00:00.000Z",
      } satisfies NutritionLabelVersion;
    }),
  } as unknown as DesktopApi;
  return { api, recipe, recipeVersion, label };
}

describe("NutritionLabelWorkspace", () => {
  it("loads a formal recipe version and renders a calculated 2011 preview", async () => {
    const { api } = createApi();
    render(
      <NutritionLabelWorkspace
        api={api}
        onBack={() => undefined}
        recipeId="recipe-yogurt"
        recipeVersionId="recipe-version-2"
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "营养标签工作台",
      }),
    ).toBeTruthy();
    expect(screen.getByText("原味高蛋白酸奶 · 配方 V2")).toBeTruthy();
    const preview = await screen.findByLabelText("营养成分表预览");
    expect(within(preview).getByText("336 kJ")).toBeTruthy();
    expect(within(preview).getByText("8.6 g")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "发布正式标签",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps recipe estimates visible while saving a manual override and publishing V1", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(
      <NutritionLabelWorkspace
        api={api}
        onBack={() => undefined}
        recipeId="recipe-yogurt"
        recipeVersionId="recipe-version-2"
      />,
    );
    await screen.findByText("8.64 g");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "蛋白质最终来源" }),
      "manual_confirmation",
    );
    const override = screen.getByRole("textbox", {
      name: "蛋白质检测或人工值",
    });
    await user.clear(override);
    await user.type(override, "8.7");
    await user.type(
      screen.getByRole("textbox", { name: "来源参考" }),
      "人工复核记录 R-2026-08",
    );

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => {
      expect(api.saveNutritionLabelDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceValues: expect.arrayContaining([
            expect.objectContaining({
              nutrientCode: "protein",
              value: "8.7",
              sourceKind: "manual_confirmation",
              sourceReference: "人工复核记录 R-2026-08",
            }),
          ]),
        }),
      );
    });

    await user.click(
      screen.getByRole("button", { name: "发布正式标签" }),
    );
    await screen.findByText("已发布正式标签 V1");
    expect(api.publishNutritionLabel).toHaveBeenCalledWith("label-yogurt");

    await user.click(
      screen.getByRole("button", { name: "预览研发报告" }),
    );
    expect(
      await screen.findByRole("heading", { name: "研发报告预览" }),
    ).toBeTruthy();
    expect(screen.getByText("原味高蛋白酸奶 · 配方 V2 · 标签 V1")).toBeTruthy();
  });

  it("switches to the 2025 mandatory rows and shows its required notice", async () => {
    const { api } = createApi();
    const user = userEvent.setup();
    render(
      <NutritionLabelWorkspace
        api={api}
        onBack={() => undefined}
        recipeId="recipe-yogurt"
        recipeVersionId="recipe-version-2"
      />,
    );
    await screen.findByText("数据来源复核");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "营养标签标准" }),
      "gb-28050-2025",
    );

    expect(
      (await screen.findAllByText("饱和脂肪")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("糖").length).toBeGreaterThan(0);
    expect(
      await screen.findByText("儿童青少年应避免过量摄入盐油糖"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布正式标签" }),
    ).toHaveProperty("disabled", true);
  });

  it("allows saving but blocks publishing while a mandatory value is unknown", async () => {
    const { api } = createApi(null);
    const user = userEvent.setup();
    render(
      <NutritionLabelWorkspace
        api={api}
        onBack={() => undefined}
        recipeId="recipe-yogurt"
        recipeVersionId="recipe-version-2"
      />,
    );

    expect(
      await screen.findByText("钠缺少可用于正式标签的数据"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布正式标签" }),
    ).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(api.saveNutritionLabelDraft).toHaveBeenCalled();
    expect(api.publishNutritionLabel).not.toHaveBeenCalled();
  });
});
