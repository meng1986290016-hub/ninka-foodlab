import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IngredientImportDraft } from "../../api/import-types";
import { DraftSourceEvidence } from "./DraftSourceEvidence";

const draft: IngredientImportDraft = {
  id: "draft-evidence",
  jobId: "job-evidence",
  position: 0,
  status: "needs_review",
  review: {
    materialGroupId: null,
    materialName: "脱脂乳粉",
    categoryId: null,
    categoryName: "乳制品",
    supplierId: null,
    supplierName: "供应商 A",
    modelOrSpecification: "SMP-A",
    currentPrice: null,
    priceUnit: "kg",
    densityGPerMl: null,
    nutritionBasis: "per_100g",
    nutrients: [],
    containsAllergens: ["乳"],
    mayContainAllergens: [],
    source: "供应商资料",
    researchNotes: "",
    duplicateConfirmed: false,
  },
  issues: [
    {
      code: "source_conflict",
      severity: "warning",
      message: "不同资料中的价格不一致",
      fieldPath: "currentPrice",
      sourceName: null,
      row: null,
      column: null,
    },
  ],
  attachments: [
    {
      id: "attachment-a",
      originalName: "标签照片.png",
      mediaType: "image/png",
      byteSize: 100,
      sha256: "a",
      createdAt: "2026-08-04T00:00:00.000Z",
    },
    {
      id: "attachment-b",
      originalName: "规格书.pdf",
      mediaType: "application/pdf",
      byteSize: 200,
      sha256: "b",
      createdAt: "2026-08-04T00:00:00.000Z",
    },
  ],
  sourceLinks: [
    {
      fieldPath: "materialName",
      attachmentId: "attachment-a",
      sourceLocator: "标签正面",
      confidence: "high",
    },
    {
      fieldPath: "currentPrice",
      attachmentId: "attachment-a",
      sourceLocator: "报价贴纸",
      confidence: "medium",
    },
    {
      fieldPath: "currentPrice",
      attachmentId: "attachment-b",
      sourceLocator: "第 2 页",
      confidence: "low",
    },
    {
      fieldPath: "nutrients.蛋白质.value",
      attachmentId: "attachment-b",
      sourceLocator: "营养成分表",
      confidence: "low",
    },
  ],
  importedVariantId: null,
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
};

describe("DraftSourceEvidence", () => {
  it("groups field-level sources and highlights conflicting evidence", () => {
    render(<DraftSourceEvidence draft={draft} />);

    expect(screen.getByText("通用原料名称")).toBeTruthy();
    expect(screen.getByText("当前含税价")).toBeTruthy();
    expect(screen.getByText("蛋白质（营养成分）")).toBeTruthy();
    expect(screen.getByText("标签照片.png · 报价贴纸")).toBeTruthy();
    expect(screen.getByText("规格书.pdf · 第 2 页")).toBeTruthy();
    expect(screen.getByText("2 项优先复核")).toBeTruthy();
    expect(screen.getByText("高可信")).toBeTruthy();
    expect(screen.getByText("低可信")).toBeTruthy();
    expect(screen.getByText("来源冲突")).toBeTruthy();
    expect(screen.getByText("来源存在冲突，请以原始资料为准")).toBeTruthy();

    const orderedFields = [
      ...screen
        .getByRole("region", { name: "字段来源依据" })
        .querySelectorAll(".draft-source-evidence__field > strong"),
    ].map((element) => element.textContent);
    expect(orderedFields).toEqual([
      "当前含税价",
      "蛋白质（营养成分）",
      "通用原料名称",
    ]);
  });

  it("warns when the model did not provide field-level source links", () => {
    render(
      <DraftSourceEvidence
        draft={{ ...draft, id: "draft-empty", issues: [], sourceLinks: [] }}
      />,
    );

    expect(
      screen.getByText("Agent 未返回可定位的字段来源，请逐项对照上方原始文件后再保存。"),
    ).toBeTruthy();
  });

  it("keeps older source links reviewable when confidence was not recorded", () => {
    render(
      <DraftSourceEvidence
        draft={{
          ...draft,
          id: "draft-legacy-confidence",
          issues: [],
          sourceLinks: [
            {
              fieldPath: "supplierName",
              attachmentId: "attachment-a",
              sourceLocator: "供应商信息",
              confidence: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("未标注可信度")).toBeTruthy();
    expect(screen.getByText("1 项优先复核")).toBeTruthy();
  });
});
