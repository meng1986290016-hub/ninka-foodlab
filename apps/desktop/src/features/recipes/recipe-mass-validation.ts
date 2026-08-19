import Decimal from "decimal.js";

import type { RecipeCalculationIssue } from "../../api/recipe-types";

export const FINISHED_MASS_EXCEEDS_INPUT_MESSAGE =
  "出成重量不能大于投料合计";

export function finishedMassExceedsInput(
  finishedMassGrams: string | null,
  inputMassGrams: string | null | undefined,
) {
  if (finishedMassGrams === null || inputMassGrams == null) return false;
  try {
    const finishedMass = new Decimal(finishedMassGrams);
    const inputMass = new Decimal(inputMassGrams);
    return (
      finishedMass.isFinite() &&
      inputMass.isFinite() &&
      finishedMass.gt(inputMass)
    );
  } catch {
    return false;
  }
}

export function finishedMassLimitIssue(
  finishedMassGrams: string | null,
  inputMassGrams: string | null | undefined,
): RecipeCalculationIssue | null {
  return finishedMassExceedsInput(finishedMassGrams, inputMassGrams)
    ? {
        code: "finished_mass_exceeds_input",
        severity: "error",
        message: FINISHED_MASS_EXCEEDS_INPUT_MESSAGE,
        field: "finishedMassGrams",
        itemId: null,
      }
    : null;
}
