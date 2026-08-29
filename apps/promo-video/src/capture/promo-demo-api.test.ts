import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { calculateRecipeDraft } from "../../../desktop/src/features/recipes/recipe-calculation";
import { createPromoDemoApi } from "./promo-demo-api";

describe("PromoDemoApi", () => {
  it("只建立六项合成原料和待复核演示提案", async () => {
    const { api } = await createPromoDemoApi("result");

    expect(await api.listMaterialGroups()).toHaveLength(6);
    expect((await api.getAgentModelDirectory()).groups[0]?.displayName).toBe(
      "演示模型",
    );
    expect(await api.listHarnessArtifacts()).toEqual([
      expect.objectContaining({
        title: "低糖可可饮品（演示）",
        status: "needs_review",
      }),
    ]);
  });

  it("把可可粉从 28g 调为 32g 后重新计算质量、成本和营养", async () => {
    const { api, recipeId } = await createPromoDemoApi("input");
    const draft = await api.getRecipeDraft(recipeId);
    if (draft === null || draft.calculation === null) {
      throw new Error("演示配方草稿或初始计算缺失");
    }

    const definitions = await api.listNutrientDefinitions();
    const adjusted = {
      ...draft,
      items: draft.items.map((item) =>
        item.kind === "ingredient" && item.materialName === "可可粉"
          ? { ...item, amount: "32" }
          : item,
      ),
    };
    const result = calculateRecipeDraft({
      draft: adjusted,
      referencedVersions: [],
      nutrientDefinitions: definitions,
      calculatedAt: "2026-08-24T09:31:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calculation.inputMassGrams).toBe("1004");
    expect(
      new Decimal(result.value.calculation.cost.batchTotal).greaterThan(
        draft.calculation.cost.batchTotal,
      ),
    ).toBe(true);
    const beforeFat = draft.calculation.nutrients.find(
      (item) => item.nutrientDefinitionId === "fat",
    );
    const afterFat = result.value.calculation.nutrients.find(
      (item) => item.nutrientDefinitionId === "fat",
    );
    expect(
      new Decimal(afterFat?.per100gKnownAmount ?? 0).greaterThan(
        beforeFat?.per100gKnownAmount ?? 0,
      ),
    ).toBe(true);
  });

  it("为 v0.2 宣传片保留同一会话中的能力介绍和配方提案", async () => {
    const { api } = await createPromoDemoApi("v02-result");
    const view = await api.getAgentConversationView();

    expect(view.activeTurns).toHaveLength(2);
    expect(view.activeTurns[0]?.userContent).toBe("你能帮我干些什么？");
    expect(view.activeTurns[1]?.userContent).toBe(
      "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。",
    );
    expect(
      view.activeTurns[1]?.contentBlocks.find(
        (block) => block.type === "table",
      ),
    ).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([
          ["饮用水", "894 g"],
          ["复配稳定剂", "1 g"],
          ["合计", "1000 g"],
        ]),
      }),
    );
  });
});
