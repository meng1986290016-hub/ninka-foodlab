import { describe, expect, it } from "vitest";
import {
  CHINA_NUTRITION_LABEL_RULE_PACK_IDS,
  NUTRITION_LABEL_CONTRACT_VERSION,
  NUTRITION_LABEL_VALUE_SOURCE_KINDS,
  isNutritionLabelRulePackId,
  type NutritionLabelSnapshot,
} from "../src/index.js";

describe("nutrition label contract", () => {
  it("uses stable IDs for both GB 28050 rule packs", () => {
    expect(CHINA_NUTRITION_LABEL_RULE_PACK_IDS).toEqual([
      "gb-28050-2011",
      "gb-28050-2025",
    ]);
    expect(isNutritionLabelRulePackId("gb-28050-2011")).toBe(true);
    expect(isNutritionLabelRulePackId("gb-28050-2025")).toBe(true);
    expect(isNutritionLabelRulePackId("latest")).toBe(false);
  });

  it("defines auditable value source kinds", () => {
    expect(NUTRITION_LABEL_VALUE_SOURCE_KINDS).toEqual([
      "recipe_estimate",
      "lab_result",
      "manual_confirmation",
    ]);
  });

  it("round-trips a pinned snapshot without collapsing unknown into zero", () => {
    const snapshot: NutritionLabelSnapshot = {
      schemaVersion: NUTRITION_LABEL_CONTRACT_VERSION,
      id: "label-version-1",
      labelId: "label-1",
      labelVersionNumber: 1,
      recipeId: "recipe-1",
      recipeVersionId: "recipe-version-2",
      rulePack: {
        id: "gb-28050-2025",
        revision: "2025.1",
        standardCode: "GB 28050-2025",
        publishedOn: "2025-03-27",
        effectiveFrom: "2027-03-16",
        officialSourceUrl:
          "https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml",
      },
      basis: {
        kind: "per_100g",
        quantity: "100",
        unit: "g",
      },
      sourceValues: [
        {
          nutrientCode: "saturated_fat",
          value: null,
          unit: "g",
          sourceKind: "recipe_estimate",
          sourceReference: "recipe-version-2",
          observedAt: null,
        },
        {
          nutrientCode: "sugars",
          value: "0",
          unit: "g",
          sourceKind: "lab_result",
          sourceReference: "report-2026-07-31",
          observedAt: "2026-07-31",
        },
      ],
      rows: [
        {
          nutrientCode: "sugars",
          name: "糖",
          unit: "g",
          rawValue: "0",
          declaredValue: "0",
          nrvPercent: null,
          sourceKind: "lab_result",
          sourceReference: "report-2026-07-31",
        },
      ],
      issues: [
        {
          code: "required_nutrient_unknown",
          severity: "error",
          nutrientCode: "saturated_fat",
          message: "饱和脂肪缺少可用于正式标签的数据",
        },
      ],
      publishable: false,
      requiredNotice: "儿童青少年应避免过量摄入盐油糖",
      generatedAt: "2026-07-31T12:00:00Z",
    };

    const restored = JSON.parse(
      JSON.stringify(snapshot),
    ) as NutritionLabelSnapshot;

    expect(restored.rulePack).toEqual(snapshot.rulePack);
    expect(restored.recipeVersionId).toBe("recipe-version-2");
    expect(restored.sourceValues[0]?.value).toBeNull();
    expect(restored.sourceValues[1]?.value).toBe("0");
    expect(restored.publishable).toBe(false);
  });
});
