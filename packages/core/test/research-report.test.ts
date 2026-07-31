import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createResearchReportDocument,
  renderResearchReportSvg,
  type ResearchReportDocumentInput,
} from "../src/index.js";

const input: ResearchReportDocumentInput = {
  id: "report-yogurt-v1",
  title: "食品研发报告",
  generatedAt: "2026-07-31T06:30:00.000Z",
  recipe: {
    id: "recipe-yogurt",
    name: "原味高蛋白酸奶",
    code: null,
    kind: "formula",
    versionId: "recipe-version-1",
    versionNumber: 1,
    versionCreatedAt: "2026-07-31T06:20:00.000Z",
    targetBatchGrams: "1000",
    finishedMassGrams: "960",
    yieldPercent: "96",
    completenessPercent: 100,
  },
  ingredients: [
    {
      id: "item-milk",
      position: 0,
      kind: "ingredient",
      name: "脱脂乳粉",
      supplierName: "演示供应商",
      specification: "低热型",
      referencedVersion: null,
      amount: "85",
      unit: "g",
      massGrams: "85",
      percent: "8.5",
      cost: "2.6775",
    },
    {
      id: "item-base",
      position: 1,
      kind: "recipe_version",
      name: "乳基底",
      supplierName: null,
      specification: null,
      referencedVersion: "V2",
      amount: "915",
      unit: "g",
      massGrams: "915",
      percent: "91.5",
      cost: "28.8225",
    },
  ],
  nutrition: {
    labelVersionId: "label-version-1",
    labelVersionNumber: 1,
    standardCode: "GB 28050-2011",
    rulePackId: "gb-28050-2011",
    rulePackRevision: "2011.1",
    officialSourceUrl:
      "https://www.nhc.gov.cn/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml",
    basisLabel: "每100g",
    requiredNotice: null,
    rows: [
      {
        nutrientCode: "energy",
        name: "能量",
        declaredValue: "336",
        unit: "kJ",
        nrvPercent: "4",
        sourceKind: "derived_calculation",
        sourceReference: null,
      },
      {
        nutrientCode: "protein",
        name: "蛋白质",
        declaredValue: "8.6",
        unit: "g",
        nrvPercent: "14",
        sourceKind: "manual_confirmation",
        sourceReference: "人工复核演示数据",
      },
      {
        nutrientCode: "sodium",
        name: "钠",
        declaredValue: "62",
        unit: "mg",
        nrvPercent: "3",
        sourceKind: "lab_result",
        sourceReference: "检测报告 N2026-0731",
      },
    ],
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
  targets: [
    {
      id: "target-protein",
      label: "蛋白质",
      criterion: "≥ 8 g/100g",
      actual: "8.6 g/100g",
      status: "met",
    },
  ],
  allergens: {
    contains: ["乳及乳制品"],
    mayContain: [],
  },
  notes: "发酵温度 42℃，时间 6–8h。\n口感顺滑，酸感适中。",
  provenance: {
    recipeVersionId: "recipe-version-1",
    nutritionLabelVersionId: "label-version-1",
    generatedBy: "food-rd-studio",
  },
};

describe("research report document", () => {
  it("creates one deeply immutable document with explicit source labels", () => {
    const document = createResearchReportDocument(input);

    expect(document.schemaVersion).toBe(1);
    expect(document.nutrition.rows.map((row) => row.sourceLabel)).toEqual([
      "配方估算",
      "人工确认",
      "检测值",
    ]);
    expect(document.provenance).toEqual({
      recipeVersionId: "recipe-version-1",
      nutritionLabelVersionId: "label-version-1",
      generatedBy: "food-rd-studio",
    });
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.ingredients)).toBe(true);
    expect(Object.isFrozen(document.nutrition.rows[0])).toBe(true);
  });

  it("renders byte-stable SVG without remote resources", () => {
    const document = createResearchReportDocument(input);
    const first = renderResearchReportSvg(document);
    const second = renderResearchReportSvg(document);

    expect(second).toBe(first);
    expect(first).toContain('font-family="PingFang SC, Microsoft YaHei');
    expect(first).toContain("配方组成");
    expect(first).toContain("营养成分与来源");
    expect(first).toContain("人工确认");
    expect(first).toContain("检测值");
    expect(first).toContain("规则包 2011.1");
    expect(first).not.toMatch(/<(?:image|use)[^>]+href=|@import|url\(/);
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      "5cba050fa822cf9410f1982b8ad90eaa9bb6386d1d98f252ab8946dcb79cbc76",
    );
  });

  it("escapes user-controlled text before placing it in SVG", () => {
    const document = createResearchReportDocument({
      ...input,
      notes: "<script>alert('x')</script> & 原始记录",
    });
    const svg = renderResearchReportSvg(document);

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp; 原始记录");
  });
});
