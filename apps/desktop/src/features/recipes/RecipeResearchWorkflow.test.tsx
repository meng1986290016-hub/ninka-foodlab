import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BrowserDemoApi } from "../../api/browser-demo-api";
import { RecipeWorkbench } from "./RecipeWorkbench";

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

async function addIngredient(
  user: ReturnType<typeof userEvent.setup>,
  materialName: string,
) {
  await user.click(
    screen.getByRole("button", { name: "添加原料或半成品" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "添加原料或半成品",
  });
  await user.click(
    within(dialog).getByRole("radio", {
      name: new RegExp(`选择${materialName}`),
    }),
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "添加所选原料",
    }),
  );
}

async function saveFormalVersion(
  user: ReturnType<typeof userEvent.setup>,
  versionNumber: number,
) {
  await user.click(
    screen.getByRole("button", { name: "保存为正式版本" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "确认保存正式版本",
  });
  await user.click(
    within(dialog).getByRole("button", {
      name: `确认保存 V${versionNumber}`,
    }),
  );
}

describe("complete recipe research workflow", () => {
  it("persists selection, locking, auto-fill, two versions and their differences across restart", async () => {
    const storage = new MemoryStorage();
    let sequence = 0;
    let minute = 0;
    const api = new BrowserDemoApi({
      storage,
      createId: () => `workflow-${++sequence}`,
      now: () =>
        `2026-07-31T06:${String(minute++).padStart(2, "0")}:00.000Z`,
    });
    const groups = await api.listMaterialGroups();
    const milkGroup = groups.find((group) => group.name === "脱脂乳粉");
    const milk = milkGroup?.variants[0];
    if (!milkGroup || !milk) throw new Error("missing milk fixture");
    const definitions = await api.listNutrientDefinitions();
    await api.saveIngredientVariant({
      id: milk.id,
      materialGroupId: milkGroup.id,
      supplierId: milk.supplierId,
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: "31.5",
      priceUnit: "kg",
      densityGPerMl: null,
      source: "供应商营养规格书",
      researchNotes: "",
      nutrition: {
        basis: "per_100g",
        values: definitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: definition.code === "protein" ? "34" : "0",
        })),
      },
      allergens: {
        contains: ["乳及乳制品"],
        mayContain: [],
      },
    });
    const recipe = await api.createRecipe({
      name: "闭环验证酸奶",
      code: "LOOP-01",
      tags: ["闭环验收"],
      kind: "formula",
    });
    const user = userEvent.setup();
    render(<RecipeWorkbench api={api} recipeId={recipe.id} />);
    await screen.findByDisplayValue("闭环验证酸奶");

    await addIngredient(user, "脱脂乳粉");
    await addIngredient(user, "白砂糖");
    const milkAmount = screen.getByRole("textbox", {
      name: "脱脂乳粉用量",
    });
    const sugarAmount = screen.getByRole("textbox", {
      name: "白砂糖用量",
    });
    await user.clear(milkAmount);
    await user.type(milkAmount, "200");
    await user.click(
      screen.getByRole("button", { name: "锁定脱脂乳粉" }),
    );
    await user.click(
      screen.getByRole("button", { name: "设白砂糖为补足" }),
    );
    expect((sugarAmount as HTMLInputElement).value).toBe("800");

    const notes = screen.getByRole("textbox", { name: "研发备注" });
    await user.type(notes, "V1：乳味适中，甜感略高。");
    await saveFormalVersion(user, 1);
    await screen.findByText(
      "V1 已保存，已生成基于该版本的工作草稿",
    );

    await user.clear(milkAmount);
    await user.type(milkAmount, "250");
    expect((sugarAmount as HTMLInputElement).value).toBe("750");
    await user.clear(notes);
    await user.type(notes, "V2：提高乳粉，甜感更平衡。");
    await saveFormalVersion(user, 2);
    await screen.findByText(
      "V2 已保存，已生成基于该版本的工作草稿",
    );

    const versions = await api.listRecipeVersions(recipe.id);
    expect(versions).toHaveLength(2);
    const comparison = await api.compareRecipeVersions(
      versions[1]!.id,
      versions[0]!.id,
    );
    expect(comparison.itemChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "amount_changed",
          label: expect.stringContaining("脱脂乳粉"),
          beforeAmountGrams: "200",
          afterAmountGrams: "250",
        }),
        expect.objectContaining({
          kind: "amount_changed",
          label: expect.stringContaining("白砂糖"),
          beforeAmountGrams: "800",
          afterAmountGrams: "750",
        }),
      ]),
    );
    expect(comparison.nutritionChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.any(String),
          label: "蛋白质",
        }),
      ]),
    );
    expect(comparison.costChanges.length).toBeGreaterThan(0);
    expect(comparison.targetChanges).toEqual([]);
    expect(comparison.notesChanged).toBe(true);

    const reopened = new BrowserDemoApi({ storage });
    expect(await reopened.listRecipeVersions(recipe.id)).toHaveLength(2);
    expect(await reopened.getRecipeDraft(recipe.id)).toMatchObject({
      basedOnVersionId: versions[0]!.id,
      items: [
        expect.objectContaining({
          materialName: "脱脂乳粉",
          amount: "250",
          locked: true,
        }),
        expect.objectContaining({
          materialName: "白砂糖",
          amount: "750",
          autoFill: true,
        }),
      ],
      markdownNotes: "V2：提高乳粉，甜感更平衡。",
    });
    await waitFor(async () => {
      expect(
        await reopened.compareRecipeVersions(
          versions[1]!.id,
          versions[0]!.id,
        ),
      ).toEqual(comparison);
    });
  }, 15_000);
});
