import Decimal from "decimal.js";

import type { ResearchReportDocument } from "./research-report.js";

export const RESEARCH_REPORT_EXPORT_SCHEMA_VERSION = 1 as const;

export type ResearchReportExportFormat = "png" | "pdf" | "xlsx" | "json";

export interface ResearchReportJsonEnvelope {
  schemaVersion: typeof RESEARCH_REPORT_EXPORT_SCHEMA_VERSION;
  kind: "food-rd-research-report";
  reportId: string;
  generatedAt: string;
  rulePack: {
    id: string;
    revision: string;
    standardCode: string;
  };
  snapshotHash: string;
  document: ResearchReportDocument;
}

const encoder = new TextEncoder();

export async function researchReportDocumentHash(
  document: Readonly<ResearchReportDocument>,
) {
  const bytes = encoder.encode(canonicalJson(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

export async function createResearchReportJsonExport(
  document: Readonly<ResearchReportDocument>,
): Promise<Uint8Array> {
  const envelope: ResearchReportJsonEnvelope = {
    schemaVersion: RESEARCH_REPORT_EXPORT_SCHEMA_VERSION,
    kind: "food-rd-research-report",
    reportId: document.id,
    generatedAt: document.generatedAt,
    rulePack: {
      id: document.nutrition.rulePackId,
      revision: document.nutrition.rulePackRevision,
      standardCode: document.nutrition.standardCode,
    },
    snapshotHash: await researchReportDocumentHash(document),
    document: document as ResearchReportDocument,
  };
  return encoder.encode(`${JSON.stringify(envelope, null, 2)}\n`);
}

export function createResearchReportXlsxExport(
  document: Readonly<ResearchReportDocument>,
): Uint8Array {
  const sheets = reportSheets(document);
  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      text: contentTypesXml(sheets.length),
    },
    { name: "_rels/.rels", text: rootRelationshipsXml() },
    { name: "xl/workbook.xml", text: workbookXml(sheets) },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: workbookRelationshipsXml(sheets.length),
    },
    { name: "xl/styles.xml", text: stylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      text: worksheetXml(sheet.rows),
    })),
  ];
  return createStoredZip(entries);
}

export function createResearchReportPdfFromJpeg(
  jpeg: Uint8Array,
  imageWidth: number,
  imageHeight: number,
): Uint8Array {
  if (
    jpeg.length < 4 ||
    jpeg[0] !== 0xff ||
    jpeg[1] !== 0xd8 ||
    jpeg[jpeg.length - 2] !== 0xff ||
    jpeg[jpeg.length - 1] !== 0xd9 ||
    !Number.isInteger(imageWidth) ||
    imageWidth <= 0 ||
    !Number.isInteger(imageHeight) ||
    imageHeight <= 0
  ) {
    throw new Error("PDF 图像数据无效");
  }
  const pageWidth = 595.28;
  const pageHeight = (pageWidth * imageHeight) / imageWidth;
  const width = pdfNumber(pageWidth);
  const height = pdfNumber(pageHeight);
  const content = encoder.encode(
    `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`,
  );
  const objects = [
    ascii("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    ascii("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    ascii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    ),
    concatBytes([
      ascii(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`),
      content,
      ascii("endstream\nendobj\n"),
    ]),
    concatBytes([
      ascii(
        `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      ascii("\nendstream\nendobj\n"),
    ]),
  ];
  const header = concatBytes([
    ascii("%PDF-1.7\n"),
    Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  ]);
  const offsets: number[] = [];
  let cursor = header.length;
  for (const object of objects) {
    offsets.push(cursor);
    cursor += object.length;
  }
  const xrefOffset = cursor;
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.map(
      (offset) => `${offset.toString().padStart(10, "0")} 00000 n `,
    ),
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  return concatBytes([header, ...objects, ascii(xref)]);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

interface ReportSheet {
  name: string;
  rows: string[][];
}

function reportSheets(
  document: Readonly<ResearchReportDocument>,
): ReportSheet[] {
  return [
    {
      name: "配方",
      rows: [
        ["字段", "值"],
        ["报告 ID", document.id],
        ["报告标题", document.title],
        ["生成时间", document.generatedAt],
        ["配方名称", document.recipe.name],
        ["配方编号", document.recipe.code ?? ""],
        ["配方类型", document.recipe.kind],
        ["配方版本", `V${document.recipe.versionNumber}`],
        ["配方版本 ID", document.recipe.versionId],
        ["投料合计(g)", reportInputMassGrams(document)],
        ["出成重量(g)", document.recipe.finishedMassGrams ?? ""],
        ["得率(%)", document.recipe.yieldPercent ?? ""],
        ["数据完整度(%)", String(document.recipe.completenessPercent)],
      ],
    },
    {
      name: "原料",
      rows: [
        [
          "序号",
          "原料",
          "类型",
          "供应商",
          "型号/规格",
          "引用版本",
          "用量",
          "单位",
          "折算质量(g)",
          "占比(%)",
          "成本(元)",
        ],
        ...document.ingredients.map((item, index) => [
          String(index + 1),
          item.name,
          item.kind,
          item.supplierName ?? "",
          item.specification ?? "",
          item.referencedVersion ?? "",
          item.amount,
          item.unit,
          item.massGrams,
          item.percent,
          item.cost ?? "",
        ]),
      ],
    },
    {
      name: "营养",
      rows: [
        ["项目", "标示值", "单位", "NRV%", "来源", "来源参考"],
        ...document.nutrition.rows.map((row) => [
          row.name,
          row.declaredValue ?? "",
          row.unit,
          row.nrvPercent ?? "",
          row.sourceLabel,
          row.sourceReference ?? "",
        ]),
      ],
    },
    {
      name: "成本",
      rows: [
        ["项目", "金额(元)"],
        ["原料成本", document.cost.rawMaterialTotal ?? ""],
        ["包装成本", document.cost.packagingTotal ?? ""],
        ["附加成本", document.cost.additionalTotal ?? ""],
        ["整批成本", document.cost.batchTotal ?? ""],
        ["每 kg", document.cost.perKg ?? ""],
        ["每 100g", document.cost.per100g ?? ""],
        ["每份", document.cost.perServing ?? ""],
        ["每包装", document.cost.perPackage ?? ""],
        ["完整性", document.cost.status],
      ],
    },
    {
      name: "目标",
      rows: [
        ["目标", "判定标准", "实际值", "状态"],
        ...document.targets.map((target) => [
          target.label,
          target.criterion,
          target.actual ?? "",
          target.status,
        ]),
      ],
    },
    {
      name: "标签与来源",
      rows: [
        ["字段", "值"],
        ["营养标签版本", `V${document.nutrition.labelVersionNumber}`],
        ["营养标签版本 ID", document.nutrition.labelVersionId],
        ["适用标准", document.nutrition.standardCode],
        ["规则包 ID", document.nutrition.rulePackId],
        ["规则包修订", document.nutrition.rulePackRevision],
        ["官方来源", document.nutrition.officialSourceUrl],
        ["标示基准", document.nutrition.basisLabel],
        ["必需提示", document.nutrition.requiredNotice ?? ""],
        ["含有过敏原", document.allergens.contains.join("、")],
        ["可能含有过敏原", document.allergens.mayContain.join("、")],
        ["来源配方版本", document.provenance.recipeVersionId],
        ["来源标签版本", document.provenance.nutritionLabelVersionId],
        ["生成器", document.provenance.generatedBy],
      ],
    },
    {
      name: "研发备注",
      rows: [
        ["字段", "内容"],
        ["研发备注", document.notes],
      ],
    },
  ];
}

function worksheetXml(rows: string[][]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
            const safe = escapeXml(safeSpreadsheetText(value));
            return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${safe}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("")}</sheetData></worksheet>`;
}

function workbookXml(sheets: ReportSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("")}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function rootRelationshipsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function contentTypesXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")}</Types>`;
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
}

function safeSpreadsheetText(value: string) {
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

interface ZipEntry {
  name: string;
  text: string;
}

function createStoredZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const central = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, central, end]);
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function reportInputMassGrams(
  document: Readonly<ResearchReportDocument>,
) {
  return document.ingredients
    .reduce(
      (total, ingredient) => total.add(ingredient.massGrams),
      new Decimal(0),
    )
    .toString();
}

function ascii(value: string) {
  return encoder.encode(value);
}

function pdfNumber(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

function hex(bytes: Uint8Array) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
