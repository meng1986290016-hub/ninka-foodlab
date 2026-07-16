import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import { DesktopApiError } from "../../api/types";
import { CategoryCombobox } from "./CategoryCombobox";
import { MaterialGroupEditor } from "./MaterialGroupEditor";
import { SupplierCombobox } from "./SupplierCombobox";

function createApi() {
  let sequence = 0;
  return new BrowserDemoApi({
    storage: window.localStorage,
    createId: () => `reference-${++sequence}`,
    now: () => "2026-07-17T01:00:00.000Z",
  });
}

describe("ingredient reference comboboxes", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and selects a custom category from the category control", async () => {
    const api = createApi();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CategoryCombobox api={api} onChange={onChange} value={null} />,
    );

    await user.type(screen.getByRole("combobox", { name: "分类" }), " 蛋白原料 ");
    await user.click(
      screen.getByRole("button", { name: "创建分类 蛋白原料" }),
    );

    expect(onChange).toHaveBeenCalledWith("reference-1");
    expect(await api.listCategories()).toContainEqual(
      expect.objectContaining({ name: "蛋白原料" }),
    );
  });

  it("filters suppliers and supports keyboard selection without creating text", async () => {
    const api = createApi();
    const first = await api.createSupplier("华东乳业");
    await api.createSupplier("华南乳业");
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SupplierCombobox api={api} onChange={onChange} value={null} />,
    );

    const input = screen.getByRole("combobox", { name: "供应商" });
    await user.type(input, "华东");
    expect(await screen.findByRole("option", { name: "华东乳业" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "华南乳业" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(first.id);
  });

  it("creates and selects a supplier only from the explicit create action", async () => {
    const api = createApi();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SupplierCombobox api={api} onChange={onChange} value={null} />,
    );

    await user.type(
      screen.getByRole("combobox", { name: "供应商" }),
      "新希望乳业",
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "创建供应商 新希望乳业" }),
    );

    expect(onChange).toHaveBeenCalledWith("reference-1");
    expect(await api.listSuppliers()).toContainEqual(
      expect.objectContaining({ name: "新希望乳业" }),
    );
  });

  it("closes on Escape and surfaces duplicate-name failures inline", async () => {
    const api = createApi();
    vi.spyOn(api, "createSupplier").mockRejectedValue(
      new DesktopApiError("duplicate_name", "名称已存在"),
    );
    const user = userEvent.setup();

    render(
      <SupplierCombobox api={api} onChange={() => undefined} value={null} />,
    );

    const input = screen.getByRole("combobox", { name: "供应商" });
    await user.type(input, "待创建供应商");
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("button", { name: "创建供应商 待创建供应商" }),
    ).toBeNull();

    await user.type(input, "待创建供应商");
    await user.click(
      await screen.findByRole("button", {
        name: "创建供应商 待创建供应商",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "供应商名称已存在，请从列表中选择",
    );
  });

  it("keeps the material group editor limited to common material fields", async () => {
    const api = createApi();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MaterialGroupEditor api={api} onCancel={() => undefined} onSave={onSave} />,
    );

    expect(screen.getByLabelText("原料名称")).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "分类" })).not.toBeNull();
    expect(screen.queryByLabelText("供应商")).toBeNull();
    expect(screen.queryByLabelText("内部编号")).toBeNull();
    expect(screen.queryByLabelText("研发备注")).toBeNull();
    expect(screen.queryByLabelText("营养成分")).toBeNull();

    await user.type(screen.getByLabelText("原料名称"), " 脱脂乳粉 ");
    await user.click(screen.getByRole("button", { name: "保存通用原料" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "脱脂乳粉",
      categoryId: null,
    });
  });
});
