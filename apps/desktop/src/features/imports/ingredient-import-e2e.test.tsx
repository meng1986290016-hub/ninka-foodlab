import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import {
  BROWSER_V2_KEY,
  builtInNutrients,
} from "../../api/browser-schema";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { IngredientImportCommitResult } from "../../api/import-types";
import { IngredientImportDrawer } from "./IngredientImportDrawer";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function emptyStorage() {
  const storage = new MemoryStorage();
  storage.setItem(
    BROWSER_V2_KEY,
    JSON.stringify({
      schemaVersion: 2,
      categories: [],
      suppliers: [],
      materialGroups: [],
      nutrientDefinitions: builtInNutrients(),
      settings: {},
      drafts: {},
    }),
  );
  return storage;
}

function importPicker(): ImportFilePicker {
  return {
    pickSources: vi.fn().mockResolvedValue([
      { kind: "browser_demo", value: "supplier-a.csv", mediaType: "text/csv" },
      { kind: "browser_demo", value: "supplier-b.csv", mediaType: "text/csv" },
      { kind: "browser_demo", value: "supplier-c.csv", mediaType: "text/csv" },
    ]),
    pickDestination: vi.fn().mockResolvedValue(null),
  };
}

describe("ingredient import UI acceptance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reviews three sources, discards one, and saves two supplier variants", async () => {
    let nextId = 0;
    const api = new BrowserDemoApi({
      storage: emptyStorage(),
      createId: () => `e2e-${++nextId}`,
      now: () => "2026-07-19T12:00:00.000Z",
    });
    const onCommitted = vi.fn<(result: IngredientImportCommitResult) => void>();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { container } = render(
      <IngredientImportDrawer
        api={api}
        filePicker={importPicker()}
        onClose={vi.fn()}
        onCommitted={onCommitted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "选择原料资料" }));
    await screen.findByText("supplier-a.csv");
    const cards = [...container.querySelectorAll("details")];
    expect(cards).toHaveLength(3);

    for (const [index, card] of cards.entries()) {
      const cardUi = within(card);
      await user.click(cardUi.getByText(`supplier-${String.fromCharCode(97 + index)}`));
      const materialName = cardUi.getByLabelText("原料名称");
      const category = cardUi.getByLabelText("分类");
      const supplier = cardUi.getByLabelText("供应商");
      await user.clear(materialName);
      await user.type(materialName, "脱脂乳粉");
      await user.clear(category);
      await user.type(category, "乳制品");
      await user.clear(supplier);
      await user.type(supplier, `供应商${String.fromCharCode(65 + index)}`);
    }

    const firstCard = within(cards[0]!);
    await user.type(firstCard.getByLabelText("脂肪（g）"), "0");
    await user.type(firstCard.getByLabelText("所含过敏原"), "乳及乳制品");
    await user.tab();
    await user.type(firstCard.getByLabelText("可能含有的过敏原"), "大豆");
    await user.tab();

    await user.click(within(cards[2]!).getByRole("button", { name: "忽略这一条" }));
    await waitFor(async () => {
      const jobs = await api.listIngredientImportDrafts("e2e-1");
      expect(jobs.filter((draft) => draft.status === "discarded")).toHaveLength(1);
    });
    await user.click(screen.getByRole("button", { name: "确认导入全部" }));

    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const result = onCommitted.mock.calls[0]![0];
    expect(result.variants).toHaveLength(2);
    expect(result.variants.map((variant) => variant.supplierName).sort()).toEqual([
      "供应商A",
      "供应商B",
    ]);
    expect(result.attachmentCount).toBe(2);

    const groups = await api.listMaterialGroups("");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("脱脂乳粉");
    expect(groups[0]!.variants).toHaveLength(2);
    const supplierA = groups[0]!.variants.find(
      (variant) => variant.supplierName === "供应商A",
    )!;
    expect(
      supplierA.nutrition.values.find(
        (value) => value.nutrientDefinitionId === "protein",
      )!.value,
    ).toBeNull();
    expect(
      supplierA.nutrition.values.find(
        (value) => value.nutrientDefinitionId === "fat",
      )!.value,
    ).toBe("0");
    expect(supplierA.allergens).toEqual({
      contains: ["乳及乳制品"],
      mayContain: ["大豆"],
    });
    expect(await api.cleanupOrphanAttachments()).toBe(1);
    const cleanedDrafts = await api.listIngredientImportDrafts("e2e-1");
    expect(
      cleanedDrafts.find((draft) => draft.status === "discarded")!.attachments,
    ).toEqual([]);
  });
});
