import { describe, expect, it } from "vitest";
import {
  getNutritionLabelRulePack,
  listNutritionLabelRulePacks,
  recommendNutritionLabelRulePack,
} from "../src/index.js";

describe("GB 28050 nutrition label rule packs", () => {
  it("keeps the 2011 mandatory 1+4 order and NRV metadata", () => {
    const pack = getNutritionLabelRulePack("gb-28050-2011");

    expect(pack).toMatchObject({
      id: "gb-28050-2011",
      revision: "2011.1",
      standardCode: "GB 28050-2011",
      effectiveFrom: "2013-01-01",
      mandatoryNutrientCodes: [
        "energy",
        "protein",
        "fat",
        "carbohydrate",
        "sodium",
      ],
      requiredNotice: null,
    });
    expect(
      pack.nutrients
        .filter((nutrient) => nutrient.required)
        .map((nutrient) => [
          nutrient.nutrientCode,
          nutrient.unit,
          nutrient.nrv,
        ]),
    ).toEqual([
      ["energy", "kJ", "8400"],
      ["protein", "g", "60"],
      ["fat", "g", "60"],
      ["carbohydrate", "g", "300"],
      ["sodium", "mg", "2000"],
    ]);
  });

  it("adds saturated fat, sugars and the required notice in 2025", () => {
    const pack = getNutritionLabelRulePack("gb-28050-2025");

    expect(pack).toMatchObject({
      id: "gb-28050-2025",
      revision: "2025.1",
      standardCode: "GB 28050-2025",
      effectiveFrom: "2027-03-16",
      supersedes: "gb-28050-2011",
      mayEarlyAdopt: true,
      mandatoryNutrientCodes: [
        "energy",
        "protein",
        "fat",
        "saturated_fat",
        "carbohydrate",
        "sugars",
        "sodium",
      ],
      requiredNotice: "儿童青少年应避免过量摄入盐油糖",
    });
    expect(
      pack.nutrients.find(
        (nutrient) => nutrient.nutrientCode === "saturated_fat",
      ),
    ).toMatchObject({ required: true, unit: "g", nrv: "20" });
    expect(
      pack.nutrients.find((nutrient) => nutrient.nutrientCode === "sugars"),
    ).toMatchObject({ required: true, unit: "g", nrv: null });
  });

  it("recommends by calendar date without removing the old rule pack", () => {
    expect(recommendNutritionLabelRulePack("2027-03-15")).toEqual({
      asOfDate: "2027-03-15",
      recommendedRulePackId: "gb-28050-2011",
      availableRulePackIds: ["gb-28050-2011", "gb-28050-2025"],
      earlyAdoptionRulePackIds: ["gb-28050-2025"],
    });
    expect(recommendNutritionLabelRulePack("2027-03-16")).toEqual({
      asOfDate: "2027-03-16",
      recommendedRulePackId: "gb-28050-2025",
      availableRulePackIds: ["gb-28050-2011", "gb-28050-2025"],
      earlyAdoptionRulePackIds: [],
    });
    expect(getNutritionLabelRulePack("gb-28050-2011").id).toBe(
      "gb-28050-2011",
    );
  });

  it("rejects ambiguous or impossible dates", () => {
    expect(() => recommendNutritionLabelRulePack("2027-3-16")).toThrow(
      "日期必须使用 YYYY-MM-DD",
    );
    expect(() => recommendNutritionLabelRulePack("2027-02-30")).toThrow(
      "日期不是有效的公历日期",
    );
  });

  it("exposes deeply frozen rule pack revisions", () => {
    const packs = listNutritionLabelRulePacks();
    const pack = packs[0]!;

    expect(Object.isFrozen(packs)).toBe(true);
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.mandatoryNutrientCodes)).toBe(true);
    expect(Object.isFrozen(pack.nutrients)).toBe(true);
    expect(Object.isFrozen(pack.nutrients[0])).toBe(true);
  });
});
