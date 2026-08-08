import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  Recipe,
  RecipeCalculation,
  RecipeVersion,
} from "../../api/recipe-types";
import { SampleSheetWorkspace } from "./SampleSheetWorkspace";

const recipe: Recipe = {
  id: "ice-cream",
  name: "巧克力冰淇淋",
  code: null,
  tags: [],
  kind: "formula",
  currentDraftId: null,
  latestVersionNumber: 3,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
  archivedAt: null,
};

const calculation: RecipeCalculation = {
  inputMassGrams: "1000",
  basisMassGrams: "1000",
  basis: "finished_mass",
  yieldPercent: "100",
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
  allergens: { contains: [], mayContain: [], sourceItemIds: {} },
  completeness: { percent: 100, missingFields: [] },
  calculatedAt: "2026-08-02T08:00:00.000Z",
};

const version: RecipeVersion = {
  id: "ice-cream-v3",
  recipeId: recipe.id,
  versionNumber: 3,
  sourceDraftId: "draft-3",
  basedOnVersionId: null,
  createdAt: "2026-08-02T08:00:00.000Z",
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
    finishedMassGrams: "1000",
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: "milk",
        position: 0,
        kind: "ingredient",
        amount: "700",
        unit: "g",
        massGrams: "700",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "milk-a",
          materialGroupId: "milk-group",
          materialName: "脱脂乳粉",
          supplierId: "supplier-a",
          supplierName: "供应商 A",
          modelOrSpecification: "25kg袋装",
          densityGPerMl: null,
          nutrientsPer100g: {},
          nutrientUnits: {},
          pricePerKg: "31.5",
          allergens: { contains: [], mayContain: [], sourceItemIds: {} },
          source: "规格书",
          ingredientUpdatedAt: "2026-08-01T08:00:00.000Z",
        },
      },
      {
        id: "water",
        position: 1,
        kind: "ingredient",
        amount: "300",
        unit: "mL",
        massGrams: "300",
        locked: false,
        autoFill: false,
        ingredient: {
          ingredientVariantId: "water",
          materialGroupId: "water-group",
          materialName: "饮用水",
          supplierId: "supplier-water",
          supplierName: "实验室",
          modelOrSpecification: "纯化水",
          densityGPerMl: "1",
          nutrientsPer100g: {},
          nutrientUnits: {},
          pricePerKg: null,
          allergens: { contains: [], mayContain: [], sourceItemIds: {} },
          source: "实验室",
          ingredientUpdatedAt: "2026-08-01T08:00:00.000Z",
        },
      },
    ],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation,
  },
};

function createApi() {
  return {
    getRecipe: vi.fn(async () => recipe),
    getRecipeDraft: vi.fn(async () => null),
    listRecipeVersions: vi.fn(async () => [version]),
    getRecipeVersion: vi.fn(async () => version),
    exportSampleSheet: vi.fn(async () => undefined),
  } as unknown as DesktopApi;
}

describe("SampleSheetWorkspace", () => {
  it("calculates a formal version, prints, and exports the same simplified sheet", async () => {
    const api = createApi();
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const filePicker = {
      pickDestination: vi.fn(async () => "/tmp/巧克力冰淇淋打样配料单.xlsx"),
    };
    render(
      <SampleSheetWorkspace
        api={api}
        filePicker={filePicker}
        launch={{
          origin: "library",
          recipeId: recipe.id,
          initialVersionId: version.id,
        }}
        now={() => new Date("2026-08-02T08:00:00.000Z")}
        onBack={() => undefined}
      />,
    );

    expect(await screen.findByRole("heading", { name: "打样配料单" })).toBeTruthy();
    const table = await screen.findByRole("table", { name: "网页打样配料清单" });
    expect(within(table).getByText("脱脂乳粉")).toBeTruthy();
    expect(within(table).getByText("供应商 A · 25kg袋装")).toBeTruthy();
    expect(within(table).getByText("350.0 g")).toBeTruthy();
    expect(within(table).getByText("150.0 mL")).toBeTruthy();
    expect(within(table).queryByText("实际称量")).toBeNull();

    await user.click(screen.getByRole("button", { name: "打印" }));
    expect(print).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "导出 Excel" }));
    await waitFor(() => expect(api.exportSampleSheet).toHaveBeenCalledTimes(1));
    const request = vi.mocked(api.exportSampleSheet).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      destinationPath: "/tmp/巧克力冰淇淋打样配料单.xlsx",
      fileName: "巧克力冰淇淋-主配方-V3 正式版本-打样配料单.xlsx",
    });
    expect(request?.bytesBase64.length).toBeGreaterThan(100);
    print.mockRestore();
  });

  it("switches between finished-output and planned-input calculations", async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(
      <SampleSheetWorkspace
        api={api}
        launch={{
          origin: "library",
          recipeId: recipe.id,
          initialVersionId: version.id,
        }}
        onBack={() => undefined}
      />,
    );
    const table = await screen.findByRole("table", { name: "网页打样配料清单" });
    expect(within(table).getByText("350.0 g")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "计划投料量" }));
    const target = screen.getByRole("textbox", { name: "打样量" });
    await user.clear(target);
    await user.type(target, "250");
    await waitFor(() => {
      const updatedTable = screen.getByRole("table", { name: "网页打样配料清单" });
      expect(within(updatedTable).getByText("175.0 g")).toBeTruthy();
    });
  });
});
