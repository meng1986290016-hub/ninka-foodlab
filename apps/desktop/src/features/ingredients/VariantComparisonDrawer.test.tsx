import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { BrowserDemoApi } from "../../api/browser-demo-api";

describe("supplier variant comparison", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("compares selected variants only within one common material", async () => {
    let sequence = 0;
    const api = new BrowserDemoApi({
      storage: window.localStorage,
      createId: () => `comparison-${++sequence}`,
      now: () => "2026-07-17T05:00:00.000Z",
    });
    const group = (await api.listMaterialGroups("脱脂乳粉"))[0];
    if (group === undefined) throw new Error("missing demo group");
    const supplier = await api.createSupplier("供应商B");
    await api.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: "乳益康 MD-300",
      internalCode: null,
      currentPrice: null,
      priceUnit: "kg",
      densityGPerMl: null,
      source: "",
      researchNotes: "溶解速度快",
      nutrition: {
        basis: "per_100g",
        values: [{ nutrientDefinitionId: "protein", value: null }],
      },
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findByText("脱脂乳粉");

    await user.click(screen.getByRole("button", { name: "展开 脱脂乳粉" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: "选择 脱脂乳粉 · 演示供应商 进行比较",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "选择 脱脂乳粉 · 供应商B 进行比较",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "比较 2 个供应商版本" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "供应商版本比较" }),
    ).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "演示供应商" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "供应商B" })).not.toBeNull();
    expect(screen.getAllByRole("cell", { name: "未知" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "新建原料" }));
    expect(
      screen.queryByRole("dialog", { name: "供应商版本比较" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "新建通用原料" })).not.toBeNull();
  });

  it("asks before replacing a selection from another material group", async () => {
    const api = new BrowserDemoApi({ storage: window.localStorage });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findByText("脱脂乳粉");

    await user.click(screen.getByRole("button", { name: "展开 脱脂乳粉" }));
    await user.click(screen.getByRole("button", { name: "展开 白砂糖" }));
    const milk = screen.getByRole("checkbox", {
      name: "选择 脱脂乳粉 · 演示供应商 进行比较",
    });
    const sugar = screen.getByRole("checkbox", {
      name: "选择 白砂糖 · 演示供应商 进行比较",
    });
    await user.click(milk);
    await user.click(sugar);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect((milk as HTMLInputElement).checked).toBe(false);
    expect((sugar as HTMLInputElement).checked).toBe(true);
  });
});
