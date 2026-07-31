import { describe, expect, it } from "vitest";
import {
  calculateNutritionLabel,
  type NutritionLabelSourceValue,
} from "../src/index.js";

function value(
  nutrientCode: string,
  amount: string | null,
  unit: string,
  sourceKind: NutritionLabelSourceValue["sourceKind"] = "recipe_estimate",
  completeness: NutritionLabelSourceValue["completeness"] = "complete",
): NutritionLabelSourceValue {
  return {
    nutrientCode,
    value: amount,
    unit,
    sourceKind,
    sourceReference: "recipe-version-1",
    observedAt: null,
    completeness,
  };
}

describe("calculateNutritionLabel", () => {
  it("calculates a 2011 1+4 label with energy and NRV percentages", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2011",
      basis: { kind: "per_100g", quantity: "100", unit: "g" },
      sourceValues: [
        value("protein", "5.04", "g"),
        value("fat", "3", "g"),
        value("carbohydrate", "10", "g"),
        value("sodium", "100.4", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up",
    });

    expect(result.publishable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.rows.map((row) => row.nutrientCode)).toEqual([
      "energy",
      "protein",
      "fat",
      "carbohydrate",
      "sodium",
    ]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        nutrientCode: "energy",
        rawValue: "366.68",
        declaredValue: "367",
        nrvPercent: "4",
      }),
      expect.objectContaining({
        nutrientCode: "protein",
        declaredValue: "5.0",
        nrvPercent: "8",
      }),
      expect.objectContaining({
        nutrientCode: "fat",
        declaredValue: "3.0",
        nrvPercent: "5",
      }),
      expect.objectContaining({
        nutrientCode: "carbohydrate",
        declaredValue: "10.0",
        nrvPercent: "3",
      }),
      expect.objectContaining({
        nutrientCode: "sodium",
        declaredValue: "100",
        nrvPercent: "5",
      }),
    ]);
  });

  it("adds the 2025 mandatory rows, fiber energy and required notice", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2025",
      basis: { kind: "per_100g", quantity: "100", unit: "g" },
      sourceValues: [
        value("protein", "5", "g", "lab_result"),
        value("fat", "3", "g", "lab_result"),
        value("saturated_fat", "1.2", "g", "lab_result"),
        value("carbohydrate", "10", "g", "lab_result"),
        value("sugars", "4", "g", "lab_result"),
        value("dietary_fiber", "2", "g", "lab_result"),
        value("sodium", "100", "mg", "lab_result"),
      ],
      optionalNutrientCodes: ["dietary_fiber"],
      roundingMode: "half_up",
    });

    expect(result.publishable).toBe(true);
    expect(result.requiredNotice).toBe(
      "儿童青少年应避免过量摄入盐油糖",
    );
    expect(result.rows.map((row) => row.nutrientCode)).toEqual([
      "energy",
      "protein",
      "fat",
      "saturated_fat",
      "carbohydrate",
      "sugars",
      "sodium",
      "dietary_fiber",
    ]);
    expect(
      result.rows.find((row) => row.nutrientCode === "energy"),
    ).toMatchObject({ rawValue: "382", declaredValue: "382" });
    expect(
      result.rows.find((row) => row.nutrientCode === "sugars"),
    ).toMatchObject({ declaredValue: "4.0", nrvPercent: null });
  });

  it("keeps confirmed zero while blocking unknown or partial required data", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2025",
      basis: { kind: "per_100g", quantity: "100", unit: "g" },
      sourceValues: [
        value("protein", "0", "g"),
        value("fat", "0", "g"),
        value("saturated_fat", null, "g"),
        value("carbohydrate", "10", "g", "recipe_estimate", "partial"),
        value("sugars", "0", "g"),
        value("sodium", "0", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up",
    });

    expect(result.publishable).toBe(false);
    expect(
      result.rows.find((row) => row.nutrientCode === "sugars"),
    ).toMatchObject({ rawValue: "0", declaredValue: "0.0" });
    expect(
      result.rows.find((row) => row.nutrientCode === "saturated_fat"),
    ).toMatchObject({ rawValue: null, declaredValue: null });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required_nutrient_unknown",
          nutrientCode: "saturated_fat",
          severity: "error",
        }),
        expect.objectContaining({
          code: "incomplete_source",
          nutrientCode: "carbohydrate",
          severity: "error",
        }),
      ]),
    );
  });

  it("applies zero thresholds before rounding", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2011",
      basis: { kind: "per_100g", quantity: "100", unit: "g" },
      sourceValues: [
        value("protein", "0.5", "g"),
        value("fat", "0.5001", "g"),
        value("carbohydrate", "0.5", "g"),
        value("sodium", "5.1", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up",
    });

    expect(
      result.rows.find((row) => row.nutrientCode === "protein"),
    ).toMatchObject({ declaredValue: "0.0", nrvPercent: "0" });
    expect(
      result.rows.find((row) => row.nutrientCode === "fat"),
    ).toMatchObject({ declaredValue: "0.5", nrvPercent: "1" });
    expect(
      result.rows.find((row) => row.nutrientCode === "carbohydrate"),
    ).toMatchObject({ declaredValue: "0.0", nrvPercent: "0" });
    expect(
      result.rows.find((row) => row.nutrientCode === "sodium"),
    ).toMatchObject({ declaredValue: "5", nrvPercent: "0" });
  });

  it("checks per-serving zero thresholds against the per-100g value", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2011",
      basis: {
        kind: "per_serving",
        quantity: "20",
        unit: "g",
        servingDescription: "每份 20g",
      },
      sourceValues: [
        value("protein", "0.4", "g"),
        value("fat", "0.2", "g"),
        value("carbohydrate", "2", "g"),
        value("sodium", "1.1", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up",
    });

    expect(
      result.rows.find((row) => row.nutrientCode === "protein"),
    ).toMatchObject({ declaredValue: "0.4" });
    expect(
      result.rows.find((row) => row.nutrientCode === "sodium"),
    ).toMatchObject({ declaredValue: "1" });
  });

  it("blocks invalid units, negative values and unsupported basis shapes", () => {
    const result = calculateNutritionLabel({
      rulePackId: "gb-28050-2011",
      basis: { kind: "per_100g", quantity: "100", unit: "mL" },
      sourceValues: [
        value("protein", "-1", "g"),
        value("fat", "3", "mg"),
        value("carbohydrate", "10", "g"),
        value("sodium", "100", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up",
    });

    expect(result.publishable).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_basis" }),
        expect.objectContaining({
          code: "invalid_value",
          nutrientCode: "protein",
        }),
        expect.objectContaining({
          code: "unit_mismatch",
          nutrientCode: "fat",
        }),
      ]),
    );
  });

  it("is byte-for-byte deterministic for the same input", () => {
    const input = {
      rulePackId: "gb-28050-2011" as const,
      basis: {
        kind: "per_100g" as const,
        quantity: "100",
        unit: "g" as const,
      },
      sourceValues: [
        value("protein", "5", "g"),
        value("fat", "3", "g"),
        value("carbohydrate", "10", "g"),
        value("sodium", "100", "mg"),
      ],
      optionalNutrientCodes: [],
      roundingMode: "half_up" as const,
    };

    expect(JSON.stringify(calculateNutritionLabel(input))).toBe(
      JSON.stringify(calculateNutritionLabel(input)),
    );
  });
});
