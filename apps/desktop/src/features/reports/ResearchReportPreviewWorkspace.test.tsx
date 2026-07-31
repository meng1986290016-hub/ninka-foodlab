import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import type { NutritionLabelVersion } from "../../api/nutrition-label-types";
import type { RecipeVersion } from "../../api/recipe-types";
import type { ResearchReportFilePicker } from "../../api/research-report-file-picker";
import type { ResearchReportRecordInput } from "../../api/research-report-types";
import { ResearchReportPreviewWorkspace } from "./ResearchReportPreviewWorkspace";

function fixture() {
  const recipeVersion = {
    id: "recipe-version-report",
    recipeId: "recipe-report",
    versionNumber: 2,
    sourceDraftId: "recipe-draft-report",
    basedOnVersionId: "recipe-version-1",
    createdAt: "2026-07-31T06:20:00.000Z",
    snapshot: {
      schemaVersion: 1,
      recipe: {
        id: "recipe-report",
        name: "原味高蛋白酸奶",
        code: "PF-002",
        tags: [],
        kind: "formula",
      },
      targetBatchGrams: "1000",
      finishedMassGrams: "960",
      servingMassGrams: null,
      packageCount: null,
      items: [
        {
          id: "item-milk",
          position: 0,
          kind: "ingredient",
          amount: "85",
          unit: "g",
          massGrams: "85",
          locked: false,
          autoFill: false,
          ingredient: {
            ingredientVariantId: "variant-milk",
            materialGroupId: "material-milk",
            materialName: "脱脂乳粉",
            supplierId: "supplier-a",
            supplierName: "供应商 A",
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
            ingredientUpdatedAt: "2026-07-30T00:00:00.000Z",
          },
        },
      ],
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: "发酵温度 42℃。",
      calculation: {
        inputMassGrams: "1000",
        basisMassGrams: "960",
        basis: "finished_mass",
        yieldPercent: "96",
        nutrients: [],
        cost: {
          rawMaterialTotal: "2.6775",
          packagingTotal: "0",
          additionalTotal: "0",
          batchTotal: "2.6775",
          perKg: "2.7890625",
          per100g: "0.27890625",
          perServing: null,
          perPackage: null,
          status: "complete",
          missingItemIds: [],
          breakdown: [
            {
              id: "item-milk",
              name: "脱脂乳粉",
              category: "ingredient",
              amount: "2.6775",
            },
          ],
        },
        targets: [],
        allergens: {
          contains: ["乳及乳制品"],
          mayContain: [],
          sourceItemIds: {},
        },
        completeness: { percent: 100, missingFields: [] },
        calculatedAt: "2026-07-31T06:20:00.000Z",
      },
    },
  } satisfies RecipeVersion;
  const nutritionLabelVersion = {
    id: "label-version-report",
    labelId: "label-report",
    versionNumber: 1,
    sourceDraftId: "label-draft-report",
    recipeVersionId: recipeVersion.id,
    rulePackId: "gb-28050-2011",
    rulePackRevision: "2011.1",
    createdAt: "2026-07-31T06:25:00.000Z",
    snapshot: {
      schemaVersion: 1,
      id: "label-version-report",
      labelId: "label-report",
      labelVersionNumber: 1,
      recipeId: recipeVersion.recipeId,
      recipeVersionId: recipeVersion.id,
      rulePack: {
        id: "gb-28050-2011",
        revision: "2011.1",
        standardCode: "GB 28050-2011",
        publishedOn: "2011-10-12",
        effectiveFrom: "2013-01-01",
        officialSourceUrl: "https://www.nhc.gov.cn/example",
      },
      basis: { kind: "per_100g", quantity: "100", unit: "g" },
      sourceValues: [],
      rows: [
        {
          nutrientCode: "protein",
          name: "蛋白质",
          unit: "g",
          rawValue: "8.64",
          declaredValue: "8.6",
          nrvPercent: "14",
          sourceKind: "manual_confirmation",
          sourceReference: "人工复核记录",
        },
      ],
      issues: [],
      publishable: true,
      requiredNotice: null,
      generatedAt: "2026-07-31T06:25:00.000Z",
    },
  } satisfies NutritionLabelVersion;
  return { recipeVersion, nutritionLabelVersion };
}

function createApi() {
  const createResearchReport = vi.fn(
    async (input: ResearchReportRecordInput) => ({
      id: input.document.id,
      recipeVersionId: input.document.provenance.recipeVersionId,
      nutritionLabelVersionId:
        input.document.provenance.nutritionLabelVersionId,
      document: input.document,
      svg: input.svg,
      createdAt: "2026-07-31T06:31:00.000Z",
    }),
  );
  const exportResearchReport = vi.fn(async () => undefined);
  return {
    api: {
      createResearchReport,
      exportResearchReport,
    } as unknown as DesktopApi,
    createResearchReport,
    exportResearchReport,
  };
}

describe("ResearchReportPreviewWorkspace", () => {
  it("renders a deterministic SVG report and its fixed source versions", () => {
    const { recipeVersion, nutritionLabelVersion } = fixture();
    const { api } = createApi();

    render(
      <ResearchReportPreviewWorkspace
        api={api}
        createId={() => "report-fixed"}
        now={() => "2026-07-31T06:30:00.000Z"}
        nutritionLabelVersion={nutritionLabelVersion}
        onBack={() => undefined}
        recipeVersion={recipeVersion}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "研发报告预览" }),
    ).toBeTruthy();
    expect(screen.getByText("原味高蛋白酸奶 · 配方 V2 · 标签 V1")).toBeTruthy();
    const preview = screen.getByRole("img", {
      name: "食品研发报告 SVG 预览",
    }) as HTMLImageElement;
    expect(decodeURIComponent(preview.src)).toContain("<svg");
    expect(screen.getByText("配方正式版本")).toBeTruthy();
    expect(screen.getByText("营养标签正式版本")).toBeTruthy();
    expect(screen.getByText("2011.1")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "导出报告" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("saves the exact document and SVG once, then marks the record immutable", async () => {
    const { recipeVersion, nutritionLabelVersion } = fixture();
    const { api, createResearchReport } = createApi();
    const user = userEvent.setup();

    render(
      <ResearchReportPreviewWorkspace
        api={api}
        createId={() => "report-fixed"}
        now={() => "2026-07-31T06:30:00.000Z"}
        nutritionLabelVersion={nutritionLabelVersion}
        onBack={() => undefined}
        recipeVersion={recipeVersion}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "保存报告记录" }),
    );

    await waitFor(() => expect(createResearchReport).toHaveBeenCalledTimes(1));
    expect(createResearchReport).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          id: "report-fixed",
          generatedAt: "2026-07-31T06:30:00.000Z",
          provenance: {
            recipeVersionId: recipeVersion.id,
            nutritionLabelVersionId: nutritionLabelVersion.id,
            generatedBy: "food-rd-studio",
          },
        }),
        svg: expect.stringMatching(/^<svg/),
      }),
    );
    expect(await screen.findByText("已保存")).toBeTruthy();
    expect(screen.getByText("记录保存后不可修改或删除。")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "报告记录已保存",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("uses the system print flow without changing the saved document", async () => {
    const { recipeVersion, nutritionLabelVersion } = fixture();
    const { api } = createApi();
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(
      <ResearchReportPreviewWorkspace
        api={api}
        createId={() => "report-fixed"}
        now={() => "2026-07-31T06:30:00.000Z"}
        nutritionLabelVersion={nutritionLabelVersion}
        onBack={() => undefined}
        recipeVersion={recipeVersion}
      />,
    );

    await user.click(screen.getByRole("button", { name: "打印" }));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("saves an immutable record before exporting a structured JSON snapshot", async () => {
    const { recipeVersion, nutritionLabelVersion } = fixture();
    const { api, createResearchReport, exportResearchReport } = createApi();
    const filePicker: ResearchReportFilePicker = {
      pickDestination: vi.fn(async () => "/tmp/原味高蛋白酸奶.json"),
    };
    const user = userEvent.setup();

    render(
      <ResearchReportPreviewWorkspace
        api={api}
        createId={() => "report-fixed"}
        filePicker={filePicker}
        now={() => "2026-07-31T06:30:00.000Z"}
        nutritionLabelVersion={nutritionLabelVersion}
        onBack={() => undefined}
        recipeVersion={recipeVersion}
      />,
    );

    await user.click(screen.getByRole("button", { name: "导出报告" }));
    await user.click(screen.getByRole("menuitem", { name: /JSON 快照/ }));

    await waitFor(() => expect(exportResearchReport).toHaveBeenCalledTimes(1));
    expect(createResearchReport).toHaveBeenCalledTimes(1);
    expect(filePicker.pickDestination).toHaveBeenCalledWith(
      "json",
      "原味高蛋白酸奶-研发报告-V2",
    );
    expect(exportResearchReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "report-fixed",
        format: "json",
        destinationPath: "/tmp/原味高蛋白酸奶.json",
        fileName: "原味高蛋白酸奶-研发报告-V2.json",
        documentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        bytesBase64: expect.any(String),
      }),
    );
    expect(await screen.findByText("JSON 快照 已导出")).toBeTruthy();
  });
});
