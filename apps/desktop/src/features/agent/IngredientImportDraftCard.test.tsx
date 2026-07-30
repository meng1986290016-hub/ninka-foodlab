import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  it("shows independent supplier cards and requests an explicit merge target", async () => {
    const drafts = [draft("draft-a", "供应商A"), draft("draft-b", "供应商B")];
    const onMerge = vi.fn();
    const user = userEvent.setup();
    render(
      <IngredientImportDraftList
        busy={false}
        drafts={drafts}
        onDiscard={() => {}}
        onMerge={onMerge}
        onOpen={() => {}}
        onOpenImported={() => {}}
        onRetry={() => {}}
        onSplit={() => {}}
        unassignedAttachmentCount={1}
      />,
    );

    expect(screen.getAllByText("脱脂乳粉")).toHaveLength(2);
    expect(screen.getByText("来源：供应商A-规格书.pdf")).toBeTruthy();
    expect(screen.getByText(/还有 1 份资料未归入任何草稿/)).toBeTruthy();
    const firstCard = screen.getByText("供应商A · SMP-01").closest("article")!;
    await user.click(within(firstCard).getByRole("button", { name: "合并" }));
    const secondCard = screen.getByText("供应商B · SMP-01").closest("article")!;
    await user.click(
      within(secondCard).getByRole("button", { name: "合并到这里" }),
    );

    expect(onMerge).toHaveBeenCalledWith(drafts[0], drafts[1]);
  });
});
