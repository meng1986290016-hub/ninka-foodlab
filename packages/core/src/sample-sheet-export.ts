export interface SampleSheetExportRow {
  name: string;
  supplierAndSpecification: string;
  requiredAmount: string;
}

export interface SampleSheetExportDocument {
  recipeName: string;
  sourceLabel: string;
  basisLabel: string;
  targetAmountLabel: string;
  generatedDate: string;
  rows: SampleSheetExportRow[];
}

interface Cell {
  value: string;
  style?: number;
}

const encoder = new TextEncoder();

export function createSampleSheetXlsxExport(
  document: Readonly<SampleSheetExportDocument>,
): Uint8Array {
  const rows: Cell[][] = [
    [{ value: `${document.recipeName}打样配料单`, style: 1 }],
    [
      { value: "来源版本", style: 2 },
      { value: document.sourceLabel },
      { value: "计算依据", style: 2 },
      { value: document.basisLabel },
      { value: "打样量", style: 2 },
      { value: document.targetAmountLabel },
    ],
    [
      { value: "生成日期", style: 2 },
      { value: document.generatedDate },
    ],
    [],
    ["序号", "原料 / 半成品", "供应商与规格", "应添加量", "实际称量", "备注"].map(
      (value) => ({ value, style: 2 }),
    ),
    ...document.rows.map((row, index) =>
      [
        String(index + 1),
        row.name,
        row.supplierAndSpecification,
        row.requiredAmount,
        "",
        "",
      ].map((value) => ({ value, style: 3 })),
    ),
  ];
  const lastRow = rows.length;
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", text: contentTypesXml() },
    { name: "_rels/.rels", text: rootRelationshipsXml() },
    { name: "xl/workbook.xml", text: workbookXml(lastRow) },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRelationshipsXml() },
    { name: "xl/styles.xml", text: stylesXml() },
    { name: "xl/worksheets/sheet1.xml", text: worksheetXml(rows) },
  ];
  return createStoredZip(entries);
}

function worksheetXml(rows: Cell[][]) {
  const body = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="30" customHeight="1"' : ""}>${row
          .map((cell, columnIndex) => {
            const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
            const safe = escapeXml(safeSpreadsheetText(cell.value));
            const style = cell.style === undefined ? "" : ` s="${cell.style}"`;
            return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${safe}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="25" customWidth="1"/><col min="3" max="3" width="30" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/><col min="6" max="6" width="26" customWidth="1"/></cols><sheetData>${body}</sheetData><mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function workbookXml(lastRow: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="打样配料单" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'打样配料单'!$A$1:$F$${lastRow}</definedName></definedNames></workbook>`;
}

function workbookRelationshipsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
}

function rootRelationshipsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function contentTypesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="15"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5EE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFB8C7BD"/></left><right style="thin"><color rgb="FFB8C7BD"/></right><top style="thin"><color rgb="FFB8C7BD"/></top><bottom style="thin"><color rgb="FFB8C7BD"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>';
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
