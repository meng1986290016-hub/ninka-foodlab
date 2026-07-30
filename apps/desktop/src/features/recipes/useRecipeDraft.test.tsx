import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  RecipeCalculation,
  RecipeDraft,
  RecipeDraftSaveInput,
} from "../../api/recipe-types";
import type { DraftRecord } from "../../api/types";
import type { RecipeCalculationResult } from "./recipe-calculation";
import {
  RECIPE_EDITOR_DRAFT_KIND,
  RECIPE_EDITOR_DRAFT_VERSION,
  useRecipeDraft,
} from "./useRecipeDraft";

function calculation(protein = "34"): RecipeCalculation {
  return {
    inputMassGrams: "100",
    basisMassGrams: "100",
    basis: "input_mass",
    yieldPercent: null,
    nutrients: [
      {
        nutrientDefinitionId: "protein",
        name: "蛋白质",
        unit: "g",
        totalKnownAmount: protein,
        per100gKnownAmount: protein,
        status: "complete",
        completenessRatio: "1",
        missingItemIds: [],
      },
    ],
    cost: {
      rawMaterialTotal: "3.15",
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal: "3.15",
      perKg: "31.5",
      per100g: "3.15",
      perServing: null,
      perPackage: null,
      status: "complete",
      missingItemIds: [],
      breakdown: [],
    },
    targets: [],
    allergens: {
      contains: ["乳"],
      mayContain: [],
      sourceItemIds: { 乳: ["item-milk"] },
    },
    completeness: { percent: 100, missingFields: [] },
    calculatedAt: "2026-07-30T04:00:00.000Z",
  };
}

function recipeDraft(
  overrides: Partial<RecipeDraft> = {},
): RecipeDraft {
  return {
    id: "draft-1",
    recipeId: "recipe-1",
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "100",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [
      {
        id: "item-milk",
        position: 0,
        kind: "ingredient",
        ingredientVariantId: "variant-milk",
        materialName: "脱脂乳粉",
        ingredientVariant: {
          id: "variant-milk",
          materialGroupId: "material-milk",
          supplierId: "supplier-a",
          supplierName: "供应商A",
          modelOrSpecification: "低热型",
          internalCode: null,
          currentPrice: "31.5",
          priceUnit: "kg",
          densityGPerMl: null,
          source: "供应商规格书",
          researchNotes: "",
          nutrition: {
            basis: "per_100g",
            values: [
              { nutrientDefinitionId: "protein", value: "34" },
            ],
          },
          allergens: { contains: ["乳"], mayContain: [] },
          sourceAttachments: [],
          completeness: { percent: 100, missingFields: [] },
          createdAt: "2026-07-30T01:00:00.000Z",
          updatedAt: "2026-07-30T02:00:00.000Z",
          archivedAt: null,
        },
        amount: "100",
        unit: "g",
        locked: false,
        autoFill: false,
      },
    ],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: calculation(),
    calculationIssues: [],
    createdAt: "2026-07-30T03:00:00.000Z",
    updatedAt: "2026-07-30T03:00:00.000Z",
    ...overrides,
  };
}

function materialize(input: RecipeDraftSaveInput): RecipeDraft {
  const source = recipeDraft();
  return {
    ...source,
    ...input,
    items: input.items.map((item) => {
      const current = source.items.find((value) => value.id === item.id);
      if (current === undefined) {
        throw new Error("test fixture cannot materialize an unknown item");
      }
      if (item.kind === "ingredient" && current.kind === "ingredient") {
        return { ...current, ...item, kind: "ingredient" };
      }
      if (
        item.kind === "recipe_version" &&
        current.kind === "recipe_version"
      ) {
        return { ...current, ...item, kind: "recipe_version" };
      }
      throw new Error("test fixture item kind changed");
    }),
    updatedAt: "2026-07-30T05:00:00.000Z",
  };
}

function draftRecord<T>(
  payload: T,
  payloadVersion = RECIPE_EDITOR_DRAFT_VERSION,
): DraftRecord<T> {
  return {
    kind: RECIPE_EDITOR_DRAFT_KIND,
    key: "recipe-1",
    payloadVersion,
    payload,
    updatedAt: "2026-07-30T05:00:00.000Z",
  };
}

function mockApi(overrides: Record<string, unknown> = {}) {
  const api = {
    getRecipeDraft: vi.fn(async () => recipeDraft()),
    saveRecipeDraft: vi.fn(async (input: RecipeDraftSaveInput) =>
      materialize(input),
    ),
    copyRecipeVersionToDraft: vi.fn(async () =>
      recipeDraft({ basedOnVersionId: "version-1" }),
    ),
    getDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async (kind, key, payloadVersion, payload) => ({
      kind,
      key,
      payloadVersion,
      payload,
      updatedAt: "2026-07-30T05:00:00.000Z",
    })),
    clearDraft: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as DesktopApi;
  return api;
}

function successfulCalculation(
  draft: RecipeDraft,
): RecipeCalculationResult {
  const amount = draft.items[0]?.amount ?? "0";
  return {
    ok: true,
    value: {
      calculation: calculation(
        amount === "200" ? "68" : "34",
      ),
      versionItems: [],
    },
    warnings: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("recipe draft state and autosave", () => {
  it("restores the local editor payload after restart, including invalid user text", async () => {
    const restorable = recipeDraft({
      items: [
        {
          ...recipeDraft().items[0]!,
          amount: "12..5",
        },
      ],
    });
    const api = mockApi({
      getDraft: vi.fn(async () =>
        draftRecord({ draft: restorable }),
      ),
    });

    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1", {
        calculate: successfulCalculation,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.draft.items[0]?.amount).toBe("12..5");
    expect(result.current.draft.calculation).toEqual(calculation());
    expect(result.current.draft.calculationIssues).toEqual([
      expect.objectContaining({
        code: "invalid_number",
        field: "amount",
        itemId: "item-milk",
      }),
    ]);
  });

  it("keeps invalid amount text out of calculation and preserves the last valid result", async () => {
    const calculate = vi.fn(successfulCalculation);
    const api = mockApi();
    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1", { calculate }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    calculate.mockClear();

    act(() => {
      result.current.dispatch({
        type: "set_items",
        items: [
          {
            ...result.current.draft.items[0]!,
            amount: "200",
          },
        ],
      });
    });
    await waitFor(() =>
      expect(
        result.current.draft.calculation?.nutrients[0]
          ?.totalKnownAmount,
      ).toBe("68"),
    );
    const callsAfterValidEdit = calculate.mock.calls.length;

    act(() => {
      result.current.dispatch({
        type: "set_items",
        items: [
          {
            ...result.current.draft.items[0]!,
            amount: "2..0",
          },
        ],
      });
    });
    await waitFor(() =>
      expect(result.current.draft.calculationIssues[0]?.code).toBe(
        "invalid_number",
      ),
    );

    expect(result.current.draft.items[0]?.amount).toBe("2..0");
    expect(
      result.current.draft.calculation?.nutrients[0]
        ?.totalKnownAmount,
    ).toBe("68");
    expect(calculate).toHaveBeenCalledTimes(callsAfterValidEdit);

    await act(async () => {
      await result.current.saveNow();
    });
    expect(api.saveDraft).toHaveBeenCalledWith(
      RECIPE_EDITOR_DRAFT_KIND,
      "recipe-1",
      RECIPE_EDITOR_DRAFT_VERSION,
      expect.objectContaining({
        draft: expect.objectContaining({
          items: [
            expect.objectContaining({ amount: "2..0" }),
          ],
        }),
      }),
    );
    expect(api.saveRecipeDraft).not.toHaveBeenCalled();
  });

  it("keeps the last valid result when deterministic calculation reports a domain error", async () => {
    const calculate = vi.fn(
      (draft: RecipeDraft): RecipeCalculationResult => {
        if (draft.items[0]?.amount === "150") {
          return {
            ok: false,
            issues: [
              {
                code: "missing_density",
                severity: "error",
                message: "体积换算需要密度",
                field: "densityGPerMl",
                itemId: "item-milk",
              },
            ],
          };
        }
        return successfulCalculation(draft);
      },
    );
    const api = mockApi();
    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1", { calculate }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.dispatch({
        type: "set_items",
        items: [
          {
            ...result.current.draft.items[0]!,
            amount: "200",
          },
        ],
      });
    });
    await waitFor(() =>
      expect(
        result.current.draft.calculation?.nutrients[0]
          ?.totalKnownAmount,
      ).toBe("68"),
    );

    act(() => {
      result.current.dispatch({
        type: "set_items",
        items: [
          {
            ...result.current.draft.items[0]!,
            amount: "150",
          },
        ],
      });
    });
    await waitFor(() =>
      expect(result.current.draft.calculationIssues[0]?.code).toBe(
        "missing_density",
      ),
    );
    expect(
      result.current.draft.calculation?.nutrients[0]
        ?.totalKnownAmount,
    ).toBe("68");

    await act(async () => {
      await result.current.saveNow();
    });
    expect(api.saveRecipeDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        calculation: expect.objectContaining({
          nutrients: [
            expect.objectContaining({ totalKnownAmount: "68" }),
          ],
        }),
        calculationIssues: [
          expect.objectContaining({ code: "missing_density" }),
        ],
      }),
    );
  });

  it("debounces edits and serializes saves so an older response cannot win", async () => {
    vi.useFakeTimers();
    let resolveFirst:
      | ((value: DraftRecord<unknown>) => void)
      | undefined;
    const firstSave = new Promise<DraftRecord<unknown>>((resolve) => {
      resolveFirst = resolve;
    });
    let saveCount = 0;
    const saveDraft = vi.fn(
      async (
        kind: string,
        key: string,
        payloadVersion: number,
        payload: unknown,
      ) => {
        saveCount += 1;
        if (saveCount === 1) return firstSave;
        return draftRecord(payload, payloadVersion);
      },
    );
    const api = mockApi({ saveDraft });
    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1", { debounceMs: 500 }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.dispatch({
        type: "patch",
        patch: { markdownNotes: "第一次修改" },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.dispatch({
        type: "patch",
        patch: { markdownNotes: "第二次修改" },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(
        draftRecord(
          (saveDraft.mock.calls[0] as unknown[])[3],
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(
      (
        (saveDraft.mock.calls[1] as unknown[])[3] as {
          draft: RecipeDraft;
        }
      ).draft.markdownNotes,
    ).toBe("第二次修改");
    expect(
      (api.saveRecipeDraft as ReturnType<typeof vi.fn>).mock.calls.map(
        ([input]) => (input as RecipeDraftSaveInput).markdownNotes,
      ),
    ).toEqual(["第一次修改", "第二次修改"]);
  });

  it("flushes the latest editor text when the workbench closes before the debounce delay", async () => {
    const api = mockApi();
    const { result, unmount } = renderHook(() =>
      useRecipeDraft(api, "recipe-1", { debounceMs: 60_000 }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.dispatch({
        type: "patch",
        patch: { markdownNotes: "关闭前刚写下的实验记录" },
      });
    });
    unmount();

    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenCalledWith(
        RECIPE_EDITOR_DRAFT_KIND,
        "recipe-1",
        RECIPE_EDITOR_DRAFT_VERSION,
        expect.objectContaining({
          draft: expect.objectContaining({
            markdownNotes: "关闭前刚写下的实验记录",
          }),
        }),
      ),
    );
  });

  it("copies an immutable version into a fresh draft and keeps its source version", async () => {
    const copied = recipeDraft({
      id: "draft-copy",
      basedOnVersionId: "version-1",
      markdownNotes: "从 V1 继续研发",
    });
    const api = mockApi({
      copyRecipeVersionToDraft: vi.fn(async () => copied),
    });
    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.copyFromVersion("version-1");
    });

    expect(api.copyRecipeVersionToDraft).toHaveBeenCalledWith(
      "version-1",
    );
    expect(api.clearDraft).toHaveBeenCalledWith(
      RECIPE_EDITOR_DRAFT_KIND,
      "recipe-1",
    );
    expect(result.current.draft.id).toBe("draft-copy");
    expect(result.current.draft.basedOnVersionId).toBe("version-1");
    expect(result.current.draft.markdownNotes).toBe("从 V1 继续研发");
  });

  it("clears the working draft and persists the empty state", async () => {
    const api = mockApi();
    const { result } = renderHook(() =>
      useRecipeDraft(api, "recipe-1"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.clear();
    });
    expect(result.current.draft.items).toEqual([]);
    expect(result.current.draft.basedOnVersionId).toBeNull();
    expect(result.current.draft.markdownNotes).toBe("");

    await act(async () => {
      await result.current.saveNow();
    });
    expect(api.saveRecipeDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        basedOnVersionId: null,
        items: [],
        markdownNotes: "",
      }),
    );
  });
});
