import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import type { MaterialGroup } from "../../api/types";
import { VariantEditor } from "./VariantEditor";

function createApi() {
  let sequence = 0;
  return new BrowserDemoApi({
    storage: window.localStorage,
    createId: () => `variant-${++sequence}`,
    now: () => "2026-07-17T03:00:00.000Z",
  });
}

async function getMilkGroup(api: BrowserDemoApi) {
  const groups = await api.listMaterialGroups("脱脂乳粉");
  return groups[0] as MaterialGroup;
}

async function selectSupplier(
  user: ReturnType<typeof userEvent.setup>,
  name = "演示供应商",
) {
  await user.click(screen.getByRole("combobox", { name: "供应商" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("VariantEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps internal code optional and hides it under more fields", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    await api.createSupplier("供应商A");
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={onSaved}
        variant={null}
      />,
    );

    expect(screen.queryByLabelText("内部编号")).toBeNull();
    await user.click(screen.getByRole("button", { name: "更多字段" }));
    expect(screen.getByLabelText("内部编号")).not.toBeNull();
    await selectSupplier(user, "供应商A");
    await user.click(
      screen.getByRole("button", { name: "保存供应商版本" }),
    );

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("preserves blank as unknown and typed zero as confirmed zero", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    const save = vi.spyOn(api, "saveIngredientVariant");
    const user = userEvent.setup();

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={null}
      />,
    );

    await selectSupplier(user);
    await user.click(screen.getByRole("tab", { name: "营养成分" }));
    await user.type(await screen.findByLabelText("蛋白质（g）"), "0");
    await user.click(
      screen.getByRole("button", { name: "保存供应商版本" }),
    );

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        nutrition: expect.objectContaining({
          values: expect.arrayContaining([
            expect.objectContaining({
              nutrientDefinitionId: "protein",
              value: "0",
            }),
            expect.objectContaining({
              nutrientDefinitionId: "fat",
              value: null,
            }),
          ]),
        }),
      }),
    );
  });

  it("shows the existing update date as read-only text", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    const variant = group.variants[0];
    if (variant === undefined) throw new Error("missing demo variant");

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={variant}
      />,
    );

    expect(screen.getByText("最新更新日期")).not.toBeNull();
    expect(screen.queryByLabelText("最新更新日期")).toBeNull();
    expect(screen.getByText("2026/07/13 16:45")).not.toBeNull();
  });

  it("warns about volume-basis conversion and can add a custom nutrient", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    const user = userEvent.setup();

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={null}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "营养成分" }));
    await user.selectOptions(
      screen.getByLabelText("营养数据基准"),
      "per_100ml",
    );
    expect(
      screen.getByText("可以保存原始数据，但无法换算为质量基准。"),
    ).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "新建全局模板" }),
    );
    await user.type(screen.getByLabelText("含量项名称"), "乳糖");
    await user.type(screen.getByLabelText("单位"), "g");
    await user.click(screen.getByRole("button", { name: "创建并选择" }));

    expect(await screen.findByLabelText("乳糖（g）")).not.toBeNull();
    expect(await api.listNutrientDefinitions()).toContainEqual(
      expect.objectContaining({ name: "乳糖", unit: "g" }),
    );
  });

  it("does not auto-attach a global template and allows explicit reuse", async () => {
    const api = createApi();
    await api.createNutrientDefinition("乳糖", "g", "nutrition");
    const group = await getMilkGroup(api);
    const user = userEvent.setup();

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={null}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "营养成分" }));
    expect(screen.queryByLabelText("乳糖（g）")).toBeNull();
    const panel = screen.getByRole("tabpanel");
    await user.selectOptions(
      within(panel).getByLabelText("选择模板"),
      within(panel).getByRole("option", { name: "乳糖（g）" }),
    );
    await user.click(
      within(panel).getByRole("button", { name: "添加" }),
    );
    expect(screen.getByLabelText("乳糖（g）")).toBeTruthy();
  });

  it("does not offer the retired research metrics tab", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={null}
      />,
    );

    expect(screen.queryByRole("tab", { name: "研发指标" })).toBeNull();
  });

  it("edits allergens and shows linked source attachments without local paths", async () => {
    const api = createApi();
    const group = await getMilkGroup(api);
    const base = group.variants[0];
    if (base === undefined) throw new Error("missing demo variant");
    const variant = {
      ...base,
      allergens: { contains: ["乳"], mayContain: ["大豆"] },
      sourceAttachments: [
        {
          id: "attachment-1",
          originalName: "供应商规格书.pdf",
          mediaType: "application/pdf",
          byteSize: 2048,
          sha256: "private-hash",
          createdAt: "2026-07-19T10:00:00.000Z",
        },
      ],
    };
    const save = vi.spyOn(api, "saveIngredientVariant");
    const user = userEvent.setup();

    render(
      <VariantEditor
        api={api}
        group={group}
        onCancel={() => undefined}
        onSaved={() => undefined}
        variant={variant}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "营养成分" }));

    expect(screen.getByText("供应商规格书.pdf")).not.toBeNull();
    expect(screen.queryByText("private-hash")).toBeNull();
    const mayContain = screen.getByLabelText("可能含有的过敏原");
    await user.clear(mayContain);
    await user.type(mayContain, "花生、坚果");
    await user.click(screen.getByRole("button", { name: "保存供应商版本" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        allergens: { contains: ["乳"], mayContain: ["花生", "坚果"] },
      }),
    );
  });
});
