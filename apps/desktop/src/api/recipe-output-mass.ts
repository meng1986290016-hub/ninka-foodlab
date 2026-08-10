import type {
  RecipeCalculation,
  RecipeDecimal,
  RecipeVersionSnapshot,
} from "./recipe-types";

type OutputMassSnapshot = Pick<
  RecipeVersionSnapshot,
  "finishedMassGrams"
> & {
  calculation: Pick<RecipeCalculation, "inputMassGrams">;
};

/**
 * A semi-finished version yields its measured finished mass when available.
 * Without a measured yield, mass is conserved and the actual input total is
 * the calculation-safe fallback.
 */
export function recipeVersionOutputMass(
  snapshot: OutputMassSnapshot,
): RecipeDecimal {
  return (
    snapshot.finishedMassGrams ??
    snapshot.calculation.inputMassGrams
  );
}
