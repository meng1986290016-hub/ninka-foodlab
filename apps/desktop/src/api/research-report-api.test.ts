import {
  createResearchReportDocument,
  researchReportDocumentHash,
  renderResearchReportSvg,
} from "@food-rd/core";
import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import type { NutritionLabelDraftSaveInput } from "./nutrition-label-types";
import type { RecipeDraftSaveInput } from "./recipe-types";
import type {
  ResearchReportExportRequest,
  ResearchReportRecordInput,
} from "./research-report-types";
import { TauriDesktopApi } from "./tauri-desktop-api";

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

function recipeCalculation() {
  return {
    inputMassGrams: "1000",
    basisMassGrams: "1000",
    basis: "input_mass" as const,
    yieldPercent: null,
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
      status: "complete" as const,
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: { contains: [], mayContain: [], sourceItemIds: {} },
    completeness: { percent: 100, missingFields: [] },
    calculatedAt: "2026-07-31T07:00:00.000Z",
  };
}

function recipeDraft(recipeId: string): RecipeDraftSaveInput {
  return {
    recipeId,
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: recipeCalculation(),
    calculationIssues: [],
  };
}

function labelDraft(
  labelId: string,
  recipeVersionId: string,
): NutritionLabelDraftSaveInput {
  return {
    labelId,
    recipeVersionId,
    rulePackId: "gb-28050-2011",
    basis: { kind: "per_100g", quantity: "100", unit: "g" },
    sourceValues: [
      ["protein", "5", "g"],
      ["fat", "3", "g"],
      ["carbohydrate", "10", "g"],
      ["sodium", "100", "mg"],
    ].map(([nutrientCode, value, unit]) => ({
      nutrientCode: nutrientCode!,
      value: value!,
      unit: unit!,
      sourceKind: "manual_confirmation" as const,
      sourceReference: "人工复核",
      observedAt: "2026-07-31",
      completeness: "complete" as const,
    })),
    optionalNutrientCodes: [],
    roundingMode: "half_up",
  };
}

async function createFormalSources(api: BrowserDemoApi) {
  const recipe = await api.createRecipe({
    name: "报告测试酸奶",
    code: null,
    tags: [],
    kind: "formula",
  });
  const draft = await api.saveRecipeDraft(recipeDraft(recipe.id));
  const recipeVersion = await api.createRecipeVersion({
    recipeId: recipe.id,
    sourceDraftId: draft.id,
    basedOnVersionId: null,
    dependencyVersionIds: [],
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
      calculation: recipeCalculation(),
    },
  });
  const label = await api.createNutritionLabel({
    recipeId: recipe.id,
    name: "营养成分表",
  });
  await api.saveNutritionLabelDraft(labelDraft(label.id, recipeVersion.id));
  const labelVersion = await api.publishNutritionLabel(label.id);
  return { recipeVersion, labelVersion };
}

function reportInput(
  recipeVersionId: string,
  labelVersionId: string,
): ResearchReportRecordInput {
  const document = createResearchReportDocument({
    id: "report-record-1",
    title: "食品研发报告",
    generatedAt: "2026-07-31T07:10:00.000Z",
    recipe: {
      id: "recipe-report",
      name: "报告测试酸奶",
      code: null,
      kind: "formula",
      versionId: recipeVersionId,
      versionNumber: 1,
      versionCreatedAt: "2026-07-31T07:00:00.000Z",
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      yieldPercent: null,
      completenessPercent: 100,
    },
    ingredients: [],
    nutrition: {
      labelVersionId,
      labelVersionNumber: 1,
      standardCode: "GB 28050-2011",
      rulePackId: "gb-28050-2011",
      rulePackRevision: "2011.1",
      officialSourceUrl: "https://www.nhc.gov.cn/example",
      basisLabel: "每100g",
      requiredNotice: null,
      rows: [],
    },
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
    },
    targets: [],
    allergens: { contains: [], mayContain: [] },
    notes: "",
    provenance: {
      recipeVersionId,
      nutritionLabelVersionId: labelVersionId,
      generatedBy: "food-rd-studio",
    },
  });
  return { document, svg: renderResearchReportSvg(document) };
}

describe("research report desktop API", () => {
  it("maps native report commands with camel-case payloads", async () => {
    const invoke = vi.fn().mockResolvedValue({});
    const api = new TauriDesktopApi(invoke);
    const input = reportInput("recipe-version-1", "label-version-1");

    await api.createResearchReport(input);
    await api.listResearchReports("recipe-version-1");
    await api.getResearchReport("report-record-1");
    const request: ResearchReportExportRequest = {
      reportId: "report-record-1",
      format: "json",
      destinationPath: "/tmp/report.json",
      fileName: "report.json",
      documentHash: "sha256:example",
      bytesBase64: "e30=",
    };
    await api.exportResearchReport(request);

    expect(invoke.mock.calls).toEqual([
      ["create_research_report", { input }],
      ["list_research_reports", { recipeVersionId: "recipe-version-1" }],
      ["get_research_report", { id: "report-record-1" }],
      ["export_research_report", { request }],
    ]);
  });

  it("downloads validated export bytes in browser mode without exposing a path", async () => {
    const storage = new MemoryStorage();
    const api = new BrowserDemoApi({ storage });
    const { recipeVersion, labelVersion } = await createFormalSources(api);
    const input = reportInput(recipeVersion.id, labelVersion.id);
    const saved = await api.createResearchReport(input);
    const createObjectURL = vi.fn(() => "blob:report-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const request: ResearchReportExportRequest = {
      reportId: saved.id,
      format: "png",
      destinationPath: "/private/path-must-not-be-used/report.png",
      fileName: "酸奶研发报告.png",
      documentHash: await researchReportDocumentHash(saved.document),
      bytesBase64: btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47)),
    };

    await api.exportResearchReport(request);

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image/png" }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report-export");
    await expect(
      api.exportResearchReport({
        ...request,
        documentHash: "sha256:wrong",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    click.mockRestore();
  });

  it("migrates v6 state and keeps immutable report records after reopening", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `report-api-id-${++sequence}`,
      now: () => "2026-07-31T07:10:00.000Z",
    });
    const { recipeVersion, labelVersion } = await createFormalSources(api);
    const v7 = JSON.parse(
      storage.getItem("food-rd.browser-demo.v7") ?? "{}",
    ) as Record<string, unknown>;
    storage.clear();
    storage.setItem(
      "food-rd.browser-demo.v6",
      JSON.stringify({
        ...v7,
        schemaVersion: 6,
        researchReports: undefined,
      }),
    );

    const migrated = new BrowserDemoApi({
      storage,
      createId: () => `report-api-id-${++sequence}`,
      now: () => "2026-07-31T07:10:00.000Z",
    });
    const input = reportInput(recipeVersion.id, labelVersion.id);
    const saved = await migrated.createResearchReport(input);
    const reopened = new BrowserDemoApi({ storage });

    expect(saved.id).toBe(input.document.id);
    expect(
      await reopened.listResearchReports(recipeVersion.id),
    ).toEqual([saved]);
    expect(await reopened.getResearchReport(saved.id)).toEqual(saved);
  });

  it("rejects a document whose provenance does not match its source versions", async () => {
    const storage = new MemoryStorage();
    const api = new BrowserDemoApi({ storage });
    const { recipeVersion, labelVersion } = await createFormalSources(api);
    const input = reportInput(recipeVersion.id, labelVersion.id);

    await expect(
      api.createResearchReport({
        ...input,
        document: {
          ...input.document,
          provenance: {
            ...input.document.provenance,
            nutritionLabelVersionId: "other-label-version",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "missing_reference" });
  });
});
