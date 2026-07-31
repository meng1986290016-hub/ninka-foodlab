import Decimal from "decimal.js";
import {
  decimalString,
  getNutritionLabelRulePack,
  recommendNutritionLabelRulePack,
  type NutritionLabelBasis,
  type NutritionLabelRulePackId,
  type NutritionLabelSourceValue,
} from "@food-rd/core";

import type {
  NutritionLabelDraft,
  NutritionLabelDraftSaveInput,
} from "../../api/nutrition-label-types";
import type {
  RecipeNutrientEstimate,
  RecipeVersion,
} from "../../api/recipe-types";

export function createNutritionLabelDraftInput(
  labelId: string,
  recipeVersion: RecipeVersion,
  existing: NutritionLabelDraft | null,
  today = new Date().toISOString().slice(0, 10),
): NutritionLabelDraftSaveInput {
  if (existing) {
    return {
      labelId,
      recipeVersionId: existing.recipeVersionId,
      rulePackId: existing.rulePackId,
      basis: existing.basis,
      sourceValues: existing.sourceValues,
      optionalNutrientCodes: existing.optionalNutrientCodes,
      roundingMode: existing.roundingMode,
    };
  }
  const rulePackId =
    recommendNutritionLabelRulePack(today).recommendedRulePackId;
  const basis: NutritionLabelBasis = {
    kind: "per_100g",
    quantity: "100",
    unit: "g",
  };
  return {
    labelId,
    recipeVersionId: recipeVersion.id,
    rulePackId,
    basis,
    sourceValues: sourceValuesForRulePack(
      recipeVersion,
      basis,
      rulePackId,
      [],
      [],
    ),
    optionalNutrientCodes: [],
    roundingMode: "half_up",
  };
}

export function reconcileNutritionLabelDraft(
  input: NutritionLabelDraftSaveInput,
  recipeVersion: RecipeVersion,
  changes: Partial<
    Pick<
      NutritionLabelDraftSaveInput,
      "rulePackId" | "basis" | "optionalNutrientCodes"
    >
  >,
): NutritionLabelDraftSaveInput {
  const rulePackId = changes.rulePackId ?? input.rulePackId;
  const basis = changes.basis ?? input.basis;
  const optionalNutrientCodes =
    changes.optionalNutrientCodes ?? input.optionalNutrientCodes;
  return {
    ...input,
    ...changes,
    rulePackId,
    basis,
    optionalNutrientCodes,
    sourceValues: sourceValuesForRulePack(
      recipeVersion,
      basis,
      rulePackId,
      optionalNutrientCodes,
      input.sourceValues,
    ),
  };
}

export function recipeEstimateSource(
  recipeVersion: RecipeVersion,
  nutrientCode: string,
  basis: NutritionLabelBasis,
): NutritionLabelSourceValue {
  const nutrient = recipeVersion.snapshot.calculation.nutrients.find(
    (candidate) => candidate.nutrientDefinitionId === nutrientCode,
  );
  const rule = getNutritionLabelRulePack("gb-28050-2025").nutrients.find(
    (candidate) => candidate.nutrientCode === nutrientCode,
  );
  const unit = nutrient?.unit ?? rule?.unit ?? "g";
  return {
    nutrientCode,
    value: estimateValueAtBasis(nutrient, basis),
    unit,
    sourceKind: "recipe_estimate",
    sourceReference: recipeVersion.id,
    observedAt: recipeVersion.createdAt,
    completeness: nutrient?.status ?? "unknown",
  };
}

function sourceValuesForRulePack(
  recipeVersion: RecipeVersion,
  basis: NutritionLabelBasis,
  rulePackId: NutritionLabelRulePackId,
  optionalNutrientCodes: string[],
  existing: NutritionLabelSourceValue[],
) {
  const pack = getNutritionLabelRulePack(rulePackId);
  const codes = [
    ...pack.mandatoryNutrientCodes.filter((code) => code !== "energy"),
    ...optionalNutrientCodes.filter(
      (code, index, values) =>
        code !== "energy" &&
        values.indexOf(code) === index &&
        !pack.mandatoryNutrientCodes.includes(code),
    ),
  ];
  const existingByCode = new Map(
    existing.map((source) => [source.nutrientCode, source]),
  );
  return codes.map((code) => {
    const current = existingByCode.get(code);
    if (current && current.sourceKind !== "recipe_estimate") {
      return current;
    }
    return recipeEstimateSource(recipeVersion, code, basis);
  });
}

function estimateValueAtBasis(
  nutrient: RecipeNutrientEstimate | undefined,
  basis: NutritionLabelBasis,
) {
  if (!nutrient || nutrient.status === "unknown") return null;
  if (basis.kind === "per_100g") return nutrient.per100gKnownAmount;
  if (basis.kind === "per_100ml") return null;
  try {
    return decimalString(
      new Decimal(nutrient.per100gKnownAmount)
        .mul(basis.quantity)
        .div(100),
    );
  } catch {
    return null;
  }
}
