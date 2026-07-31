import { describe, expect, it, vi } from "vitest";

import type { ResearchReportRecord } from "../../api/research-report-types";
import { buildResearchReportExport } from "./research-report-export";

const record = {
  id: "report-export",
  recipeVersionId: "recipe-version-export",
  nutritionLabelVersionId: "label-version-export",
  createdAt: "2026-07-31T09:10:00.000Z",
  svg: '<svg width="1240" height="1120"></svg>',
  document: {
    schemaVersion: 1,
    id: "report-export",
    title: "食品研发报告",
    generatedAt: "2026-07-31T09:00:00.000Z",
    recipe: {
      id: "recipe-export",
      name: "酸奶/测试:*?",
      code: null,
      kind: "formula",
      versionId: "recipe-version-export",
      versionNumber: 2,
      versionCreatedAt: "2026-07-31T08:50:00.000Z",
      targetBatchGrams: "1000",
      finishedMassGrams: null,
      yieldPercent: null,
      completenessPercent: 100,
    },
    ingredients: [],
    nutrition: {
      labelVersionId: "label-version-export",
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
      rawMaterialTotal: "31.5",
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal: "31.5",
      perKg: "31.5",
      per100g: "3.15",
      perServing: null,
      perPackage: null,
      status: "complete",
    },
    targets: [],
    allergens: { contains: [], mayContain: [] },
    notes: "",
    provenance: {
      recipeVersionId: "recipe-version-export",
      nutritionLabelVersionId: "label-version-export",
      generatedBy: "food-rd-studio",
    },
  },
} satisfies ResearchReportRecord;

describe("buildResearchReportExport", () => {
  it("builds JSON and XLSX from the same immutable document without rasterizing", async () => {
    const rasterize = vi.fn();
    const json = await buildResearchReportExport(record, "json", rasterize);
    const xlsx = await buildResearchReportExport(record, "xlsx", rasterize);

    expect(JSON.parse(new TextDecoder().decode(json.bytes))).toMatchObject({
      reportId: record.id,
      document: { cost: { batchTotal: "31.5" } },
    });
    expect([...xlsx.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(json.documentHash).toBe(xlsx.documentHash);
    expect(json.fileName).toBe("酸奶-测试-研发报告-V2.json");
    expect(xlsx.fileName).toBe("酸奶-测试-研发报告-V2.xlsx");
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("uses one SVG raster pass for PNG and wraps its JPEG companion as PDF", async () => {
    const rasterize = vi.fn(async () => ({
      png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      width: 2480,
      height: 2240,
    }));

    const png = await buildResearchReportExport(record, "png", rasterize);
    const pdf = await buildResearchReportExport(record, "pdf", rasterize);

    expect(png.bytes).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    expect(new TextDecoder("latin1").decode(pdf.bytes)).toContain(
      "/Filter /DCTDecode",
    );
    expect(png.documentHash).toBe(pdf.documentHash);
    expect(rasterize).toHaveBeenCalledWith(record.svg);
  });
});
