import {
  calculateCost,
  type AdditionalCostInput,
  type CostSummary,
  type PackagingCostInput,
} from "./cost.js";
import type { DecimalString } from "./decimal.js";
import {
  calculateNutrition,
  type NutritionSummary,
} from "./nutrition.js";
import {
  flattenRecipeVersion,
  type RecipeVersionNode,
} from "./recipe-graph.js";
import { ok, type CalcResult } from "./result.js";

export interface RecipeCalculationInput {
  rootVersionId: string;
  graph: Record<string, RecipeVersionNode>;
  finishedMassGrams?: DecimalString;
  servingMassGrams?: DecimalString;
  packageCount?: DecimalString;
  packaging?: PackagingCostInput[];
  additional?: AdditionalCostInput[];
}

export interface RecipeCalculation {
  nutrition: NutritionSummary;
  cost: CostSummary;
}

export function calculateRecipe(
  input: RecipeCalculationInput,
): CalcResult<RecipeCalculation> {
  const flattened = flattenRecipeVersion(input.rootVersionId, input.graph);
  if (!flattened.ok) return flattened;

  const nutrition = calculateNutrition({
    components: flattened.value.map((leaf, index) => ({
      id: leaf.ingredient.id + ":" + index,
      name: leaf.ingredient.name,
      massGrams: leaf.massGrams,
      nutrientsPer100g: leaf.ingredient.nutrientsPer100g,
    })),
    ...(input.finishedMassGrams === undefined
      ? {}
      : { finishedMassGrams: input.finishedMassGrams }),
  });
  if (!nutrition.ok) return nutrition;

  const cost = calculateCost({
    components: flattened.value.map((leaf, index) => ({
      id: leaf.ingredient.id + ":" + index,
      name: leaf.ingredient.name,
      massGrams: leaf.massGrams,
      pricePerKg: leaf.ingredient.pricePerKg,
    })),
    ...(input.finishedMassGrams === undefined
      ? {}
      : { finishedMassGrams: input.finishedMassGrams }),
    ...(input.servingMassGrams === undefined
      ? {}
      : { servingMassGrams: input.servingMassGrams }),
    ...(input.packageCount === undefined
      ? {}
      : { packageCount: input.packageCount }),
    ...(input.packaging === undefined ? {} : { packaging: input.packaging }),
    ...(input.additional === undefined ? {} : { additional: input.additional }),
  });
  if (!cost.ok) return cost;

  return ok({
    nutrition: nutrition.value,
    cost: cost.value,
  }, [...nutrition.warnings, ...cost.warnings]);
}
