import { describe, expect, it } from "vitest";

import {
  createResearchReportDocument,
  createResearchReportJsonExport,
  createResearchReportPdfFromJpeg,
  createResearchReportXlsxExport,
} from "../src/index.js";

const document = createResearchReportDocument({
  id: "report-export-1",
  title: "食品研发报告",
  generatedAt: "2026-07-31T09:00:00.000Z",
  recipe: {
    id: "recipe-export",
    name: "导出测试酸奶",
    code: "PF-EXPORT",
    kind: "formula",
    versionId: "recipe-version-export",
    versionNumber: 2,
    versionCreatedAt: "2026-07-31T08:50:00.000Z",
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
      supplierName: "=WEBSERVICE(\"https://example.test\")",
      specification: "低热型",
      referencedVersion: null,
      amount: "85",
      unit: "g",
      massGrams: "85",
      percent: "8.5",
      cost: "2.6775",
    },
  ],
  nutrition: {
    labelVersionId: "label-version-export",
    labelVersionNumber: 1,
    standardCode: "GB 28050-2011",
    rulePackId: "gb-28050-2011",
    rulePackRevision: "2011.1",
    officialSourceUrl: "https://www.nhc.gov.cn/example",
    basisLabel: "每100g",
    requiredNotice: null,
    rows: [
      {
        nutrientCode: "protein",
        name: "蛋白质",
        declaredValue: "8.6",
        unit: "g",
        nrvPercent: "14",
        sourceKind: "manual_confirmation",
        sourceReference: "人工复核记录",
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
  allergens: { contains: ["乳及乳制品"], mayContain: [] },
  notes: "发酵温度 42℃。",
  provenance: {
    recipeVersionId: "recipe-version-export",
    nutritionLabelVersionId: "label-version-export",
    generatedBy: "food-rd-studio",
  },
});

describe("research report exports", () => {
  it("writes one versioned JSON envelope with a stable snapshot hash", async () => {
    const first = await createResearchReportJsonExport(document);
    const second = await createResearchReportJsonExport(document);
    const parsed = JSON.parse(new TextDecoder().decode(first));

    expect(second).toEqual(first);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      kind: "food-rd-research-report",
      reportId: "report-export-1",
      rulePack: {
        id: "gb-28050-2011",
        revision: "2011.1",
      },
      document: {
        recipe: { name: "导出测试酸奶" },
        nutrition: {
          rows: [expect.objectContaining({ declaredValue: "8.6" })],
        },
      },
    });
    expect(parsed.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("writes seven readable XLSX worksheets and neutralizes formulas", () => {
    const bytes = createResearchReportXlsxExport(document);
    const entries = readStoredZipEntries(bytes);
    const workbook = decode(entries.get("xl/workbook.xml"));
    const ingredientSheet = decode(
      entries.get("xl/worksheets/sheet2.xml"),
    );

    expect([...entries.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet7.xml",
      ]),
    );
    for (const name of [
      "配方",
      "原料",
      "营养",
      "成本",
      "目标",
      "标签与来源",
      "研发备注",
    ]) {
      expect(workbook).toContain(`name="${name}"`);
    }
    expect(ingredientSheet).toContain("脱脂乳粉");
    expect(ingredientSheet).toContain(
      "&apos;=WEBSERVICE(&quot;https://example.test&quot;)",
    );
    expect(ingredientSheet).not.toContain("<f>");
  });

  it("wraps the browser-rendered JPEG in a deterministic PDF page", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
      0xff, 0xd9,
    ]);
    const pdf = createResearchReportPdfFromJpeg(jpeg, 2480, 2240);
    const text = new TextDecoder("latin1").decode(pdf);

    expect(text.startsWith("%PDF-1.7")).toBe(true);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("startxref");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

function readStoredZipEntries(bytes: Uint8Array) {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (
    offset + 30 <= bytes.length &&
    view.getUint32(offset, true) === 0x04034b50
  ) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}

function decode(value: Uint8Array | undefined) {
  expect(value).toBeDefined();
  return new TextDecoder().decode(value);
}
