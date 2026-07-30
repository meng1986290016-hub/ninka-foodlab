import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { IngredientImportDraft } from "../../api/import-types";
import type { IngredientVariant } from "../../api/types";
import { ImportedVariantReview } from "./ImportedVariantReview";

const draft: IngredientImportDraft = {
  id: "draft-1",
  jobId: "job-1",
  position: 0,
  status: "needs_review",
  review: {
    materialGroupId: null,
    materialName: "脱脂乳粉",
    categoryId: null,
    categoryName: "乳制品",
    supplierId: null,
    supplierName: "供应商A",
    modelOrSpecification: "SMP-01",
    currentPrice: "31.50",
    priceUnit: "kg",
    densityGPerMl: null,
    nutritionBasis: "per_100g",
    nutrients: [
      { definitionId: "protein", name: "蛋白质", unit: "g", value: "34" },
    ],
    containsAllergens: ["乳"],
    mayContainAllergens: [],
    source: "供应商A-规格书.pdf",
    researchNotes: "",
    duplicateConfirmed: false,
  },
  issues: [],
  attachments: [],
  sourceLinks: [],
  importedVariantId: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-07-30T10:00:00.000Z",
};

const savedVariant: IngredientVariant = {
  id: "variant-1",
  materialGroupId: "group-1",
  supplierId: "supplier-1",
  supplierName: "供应商A",
  modelOrSpecification: "SMP-01",
  internalCode: null,
  currentPrice: "31.50",
  priceUnit: "kg",
  densityGPerMl: null,
  source: "供应商A-规格书.pdf",
  researchNotes: "",
  nutrition: { basis: "per_100g", values: [] },
  allergens: { contains: ["乳"], mayContain: [] },
  sourceAttachments: [],
  completeness: { percent: 80, missingFields: [] },
  createdAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-07-30T10:00:00.000Z",
  archivedAt: null,
};

describe("ImportedVariantReview", () => {
  it("writes the supplier variant only after the user clicks save", async () => {
    window.localStorage.clear();
    const api = new BrowserDemoApi({ storage: window.localStorage });
    const commit = vi
      .spyOn(api, "commitReviewedIngredientImportDraft")
      .mockResolvedValue(savedVariant);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <ImportedVariantReview
        api={api}
        draft={draft}
        onCancel={() => {}}
        onSaved={onSaved}
      />,
    );

    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("内部编号")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "保存供应商版本" }),
    );

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        draft.id,
        expect.objectContaining({
          materialName: "脱脂乳粉",
          supplierName: "供应商A",
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith(savedVariant);
  });
});
