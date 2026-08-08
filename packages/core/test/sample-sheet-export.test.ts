import { describe, expect, it } from "vitest";

import { createSampleSheetXlsxExport } from "../src/index.js";

describe("createSampleSheetXlsxExport", () => {
  it("creates a one-sheet landscape workbook with safe text and blank operation columns", () => {
    const bytes = createSampleSheetXlsxExport({
      recipeName: "巧克力冰淇淋",
      sourceLabel: "V3 正式版本",
      basisLabel: "期望成品量",
      targetAmountLabel: "500.0 g",
      generatedDate: "2026-08-02",
      rows: [
        {
          name: "=危险原料",
          supplierAndSpecification: "供应商 A · 25kg袋装",
          requiredAmount: "35.00 g",
        },
      ],
    });
    const text = new TextDecoder().decode(bytes);

    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("orientation=\"landscape\"");
    expect(text).toContain("实际称量");
    expect(text).toContain("备注");
    expect(text).toContain("&apos;=危险原料");
    expect(text).not.toContain("<f>");
    expect(text).not.toContain("<f ");
  });
});
