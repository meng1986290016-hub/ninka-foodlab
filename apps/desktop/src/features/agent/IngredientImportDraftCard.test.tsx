import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IngredientImportDraft } from "../../api/import-types";
import { IngredientImportDraftList } from "./IngredientImportDraftList";

function draft(id: string, supplierName: string): IngredientImportDraft {
  return {
    id,
    jobId: "job-1",
    position: 0,
    status: "needs_review",
    review: {
      materialGroupId: null,
      materialName: "脱脂乳粉",
      categoryId: null,
      categoryName: "乳制品",
      supplierId: null,
      supplierName,
      modelOrSpecification: "SMP-01",
      currentPrice: "31.50",
      priceUnit: "kg",
      densityGPerMl: null,
      nutritionBasis: "per_100g",
      nutrients: [
        { definitionId: "protein", name: "蛋白质", unit: "g", value: "34" },
        { definitionId: "sodium", name: "钠", unit: "mg", value: null },
      ],
      containsAllergens: ["乳"],
      mayContainAllergens: [],
      source: "规格书",
      researchNotes: "",
      duplicateConfirmed: false,
    },
    issues: [],
    attachments: [
      {
        id: `attachment-${id}`,
        originalName: `${supplierName}-规格书.pdf`,
        mediaType: "application/pdf",
        byteSize: 2048,
        sha256: `hash-${id}`,
        createdAt: "2026-07-30T10:00:00.000Z",
      },
    ],
    sourceLinks: [],
    importedVariantId: null,
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  };
}

describe("IngredientImportDraftList", () => {
  it("shows independent supplier cards without merge or split actions", () => {
    const drafts = [draft("draft-a", "供应商A"), draft("draft-b", "供应商B")];
    render(
      <IngredientImportDraftList
        busy={false}
        drafts={drafts}
        onDiscard={() => {}}
        onOpen={() => {}}
        onOpenImported={() => {}}
        onRetry={() => {}}
        unassignedAttachmentCount={1}
      />,
    );

    expect(screen.getAllByText("脱脂乳粉")).toHaveLength(2);
    expect(screen.getByText("来源：供应商A-规格书.pdf")).toBeTruthy();
    expect(screen.getByText(/还有 1 份资料未归入任何草稿/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "合并" })).toBeNull();
    expect(screen.queryByRole("button", { name: "拆分" })).toBeNull();
  });
});
