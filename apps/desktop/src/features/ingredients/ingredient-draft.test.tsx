import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type {
  IngredientVariantInput,
  MaterialGroup,
  Supplier,
} from "../../api/types";
import { VariantEditor } from "./VariantEditor";

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

function draftInput(group: MaterialGroup, supplier: Supplier): IngredientVariantInput {
  return {
    materialGroupId: group.id,
    supplierId: supplier.id,
    modelOrSpecification: "草稿型号",
    internalCode: null,
    currentPrice: "32.80",
    priceUnit: "kg",
    densityGPerMl: null,
    source: "供应商规格书",
    researchNotes: "尚未完成的研发记录",
    nutrition: { basis: "per_100g", values: [] },
  };
}

describe("supplier variant draft recovery", () => {
  let api: BrowserDemoApi;
  let group: MaterialGroup;
  let supplier: Supplier;

  beforeEach(async () => {
    let sequence = 0;
    api = new BrowserDemoApi({
      storage: new MemoryStorage(),
      createId: () => `draft-${++sequence}`,
      now: () => "2026-07-17T04:00:00.000Z",
    });
    supplier = await api.createSupplier("供应商A");
    group = await api.createMaterialGroup({
      name: "草稿测试乳粉",
      categoryId: null,
    });
  });

  function renderEditor() {
    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={null}
      />,
    );
  }

  it("does not apply a v1 flat ingredient draft to the v2 variant editor", async () => {
    await api.saveDraft("ingredient-editor", "new", 1, {
      input: { name: "旧版草稿", internalCode: "RM-OLD" },
    });

    renderEditor();

    expect(
      screen.queryByText("发现未完成的供应商版本草稿"),
    ).toBeNull();
    expect(
      (screen.getByRole("combobox", { name: "供应商" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("restores a v2 draft only after confirmation and clears it after commit", async () => {
    const key = `new:${group.id}`;
    await api.saveDraft("ingredient-variant-editor", key, 2, {
      input: draftInput(group, supplier),
    });
    const user = userEvent.setup();

    renderEditor();
    const supplierInput = screen.getByRole("combobox", { name: "供应商" });
    expect((supplierInput as HTMLInputElement).value).toBe("");
    await user.click(await screen.findByRole("button", { name: "恢复草稿" }));

    await waitFor(() =>
      expect((supplierInput as HTMLInputElement).value).toBe("供应商A"),
    );
    expect(
      (screen.getByLabelText("型号/规格") as HTMLInputElement).value,
    ).toBe("草稿型号");

    await user.click(
      screen.getByRole("button", { name: "保存供应商版本" }),
    );
    await waitFor(async () =>
      expect(await api.getDraft("ingredient-variant-editor", key)).toBeNull(),
    );
  });

  it("autosaves changed supplier fields and leaves the draft when closed", async () => {
    const key = `new:${group.id}`;
    const user = userEvent.setup();
    const onCancel = () => undefined;

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={onCancel}
        onSaved={() => undefined}
        variant={null}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "供应商" }));
    await user.click(await screen.findByRole("option", { name: "供应商A" }));
    await user.type(screen.getByLabelText("型号/规格"), "待定型号");

    await waitFor(
      async () => {
        const draft = await api.getDraft<{ input: IngredientVariantInput }>(
          "ingredient-variant-editor",
          key,
        );
        expect(draft?.payload.input.modelOrSpecification).toBe("待定型号");
      },
      { timeout: 1800 },
    );
    expect(screen.getByText("草稿已自动保存")).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "关闭供应商版本编辑器" }),
    );
    expect(await api.getDraft("ingredient-variant-editor", key)).not.toBeNull();
  });

  it("lets the user discard a recovered variant draft", async () => {
    const key = `new:${group.id}`;
    await api.saveDraft("ingredient-variant-editor", key, 2, {
      input: draftInput(group, supplier),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "丢弃草稿" }));

    expect(await api.getDraft("ingredient-variant-editor", key)).toBeNull();
    expect(
      screen.queryByText("发现未完成的供应商版本草稿"),
    ).toBeNull();
  });
});
