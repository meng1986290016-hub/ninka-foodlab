import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type {
  IngredientImportDraft,
  IngredientImportJob,
} from "../../api/import-types";
import { IngredientImportDrawer } from "./IngredientImportDrawer";

const job: IngredientImportJob = {
  id: "job-1",
  sourceKind: "spreadsheet",
  status: "drafts_ready",
  progressCurrent: 1,
  progressTotal: 1,
  errorSummary: null,
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T10:00:00.000Z",
};

function draft(
  id: string,
  supplierName: string,
  issues: IngredientImportDraft["issues"] = [],
): IngredientImportDraft {
  return {
    id,
    jobId: job.id,
    position: Number(id.slice(-1)),
    status: issues.length > 0 ? "needs_review" : "ready",
    review: {
      materialGroupId: null,
      materialName: "脱脂乳粉",
      categoryId: null,
      categoryName: "乳制品",
      supplierId: null,
      supplierName,
      modelOrSpecification: "MD-300",
      currentPrice: "31.50",
      priceUnit: "kg",
      densityGPerMl: null,
      nutritionBasis: "per_100g",
      nutrients: [
        { definitionId: "protein", name: "蛋白质", unit: "g", value: "34.0" },
        { definitionId: "sodium", name: "钠", unit: "mg", value: null },
      ],
      containsAllergens: ["乳"],
      mayContainAllergens: [],
      source: "供应商规格书",
      researchNotes: "",
      duplicateConfirmed: false,
    },
    issues,
    attachments: [
      {
        id: `attachment-${id}`,
        originalName: `${supplierName}.xlsx`,
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 2048,
        sha256: `hash-${id}`,
        createdAt: job.createdAt,
      },
    ],
    sourceLinks: [],
    importedVariantId: null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function setup(drafts: IngredientImportDraft[]) {
  const api = new BrowserDemoApi({ storage: window.localStorage });
  vi.spyOn(api, "createIngredientImportJob").mockResolvedValue(job);
  vi.spyOn(api, "listIngredientImportDrafts").mockResolvedValue(drafts);
  vi.spyOn(api, "updateIngredientImportDraft").mockImplementation(
    async (id, review) => ({ ...drafts.find((item) => item.id === id)!, review }),
  );
  vi.spyOn(api, "commitIngredientImportJob").mockResolvedValue({
    jobId: job.id,
    variants: drafts.map((item) => ({
      id: `variant-${item.id}`,
      materialGroupId: "group-1",
      supplierId: `supplier-${item.id}`,
      supplierName: item.review.supplierName,
      modelOrSpecification: item.review.modelOrSpecification,
      internalCode: null,
      currentPrice: item.review.currentPrice,
      priceUnit: "kg",
      densityGPerMl: null,
      source: item.review.source,
      researchNotes: item.review.researchNotes,
      nutrition: { basis: "per_100g", values: [] },
      allergens: { contains: ["乳"], mayContain: [] },
      sourceAttachments: item.attachments,
      completeness: { percent: 70, missingFields: [] },
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      archivedAt: null,
    })),
    attachmentCount: drafts.length,
  });
  const filePicker: ImportFilePicker = {
    pickSources: vi.fn().mockResolvedValue([
      { kind: "browser_demo", value: "原料批量.xlsx" },
    ]),
    pickDestination: vi.fn().mockResolvedValue(null),
  };
  return { api, filePicker };
}

describe("IngredientImportDrawer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("previews rows and blocks commit while errors remain", async () => {
    const issue = {
      code: "invalid_decimal" as const,
      severity: "error" as const,
      message: "请输入不带单位的非负数值",
      fieldPath: "nutrients.sodium",
      sourceName: "原料批量.xlsx",
      row: 2,
      column: "钠(mg)",
    };
    const { api, filePicker } = setup([draft("draft-1", "供应商A", [issue])]);
    const user = userEvent.setup();

    render(
      <IngredientImportDrawer
        api={api}
        filePicker={filePicker}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "选择原料资料" }));

    expect(await screen.findByText("第 2 行 · 钠(mg)")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "确认导入全部" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("供应商A.xlsx")).not.toBeNull();
  });

  it("imports two supplier rows only after explicit confirmation", async () => {
    const drafts = [draft("draft-1", "供应商A"), draft("draft-2", "供应商B")];
    const { api, filePicker } = setup(drafts);
    const onCommitted = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <IngredientImportDrawer
        api={api}
        filePicker={filePicker}
        onClose={vi.fn()}
        onCommitted={onCommitted}
      />,
    );
    await user.click(screen.getByRole("button", { name: "选择原料资料" }));
    await user.click(await screen.findByRole("button", { name: "确认导入全部" }));

    expect(confirm).toHaveBeenCalledWith("将正式保存 2 个供应商版本，是否继续？");
    expect(api.commitIngredientImportJob).toHaveBeenCalledWith("job-1");
    expect(onCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: expect.arrayContaining([
          expect.objectContaining({ supplierName: "供应商A" }),
          expect.objectContaining({ supplierName: "供应商B" }),
        ]),
      }),
    );
  });

  it("keeps the newest review when save responses arrive out of order", async () => {
    const drafts = [draft("draft-1", "供应商A")];
    const { api, filePicker } = setup(drafts);
    const pending: Array<{
      review: IngredientImportDraft["review"];
      resolve: (value: IngredientImportDraft) => void;
    }> = [];
    vi.mocked(api.updateIngredientImportDraft).mockImplementation(
      (id, review) => new Promise((resolve) => {
        pending.push({
          review,
          resolve: (value) => resolve({ ...value, id }),
        });
      }),
    );
    const user = userEvent.setup();

    render(
      <IngredientImportDrawer
        api={api}
        filePicker={filePicker}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "选择原料资料" }));
    const sodium = await screen.findByRole("textbox", { name: "钠（mg）" });

    fireEvent.change(sodium, { target: { value: "1" } });
    fireEvent.change(sodium, { target: { value: "12" } });
    expect(pending).toHaveLength(2);
    const firstUpdate = pending[0]!;
    const secondUpdate = pending[1]!;
    const originalDraft = drafts[0]!;

    await act(async () => {
      secondUpdate.resolve({ ...originalDraft, review: secondUpdate.review });
    });
    expect((sodium as HTMLInputElement).value).toBe("12");
    await act(async () => {
      firstUpdate.resolve({ ...originalDraft, review: firstUpdate.review });
    });
    expect((sodium as HTMLInputElement).value).toBe("12");
  });
});
