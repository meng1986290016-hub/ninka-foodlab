import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface IngredientSnapshot {
  id: string;
  name: string;
  nutrientsPer100g: Record<string, DecimalString | null>;
  pricePerKg: DecimalString | null;
}

export type RecipeItem =
  | {
      kind: "ingredient";
      ingredient: IngredientSnapshot;
      massGrams: DecimalString;
    }
  | {
      kind: "recipe";
      recipeVersionId: string;
      massGrams: DecimalString;
    };

export interface RecipeVersionNode {
  id: string;
  outputMassGrams: DecimalString;
  items: RecipeItem[];
}

export interface FlattenedIngredient {
  ingredient: IngredientSnapshot;
  massGrams: DecimalString;
  sourcePath: string[];
}

export function flattenRecipeVersion(
  rootVersionId: string,
  graph: Record<string, RecipeVersionNode>,
): CalcResult<FlattenedIngredient[]> {
  const visit = (
    versionId: string,
    scale: Decimal,
    path: string[],
  ): CalcResult<FlattenedIngredient[]> => {
    if (path.includes(versionId)) {
      const cycle = [...path, versionId];
      return fail({
        code: "recipe-cycle",
        itemId: versionId,
        severity: "error",
        message: "检测到配方循环引用: " + cycle.join(" -> "),
      });
    }

    const node = graph[versionId];
    if (node === undefined) {
      return fail({
        code: "missing-recipe-version",
        itemId: versionId,
        severity: "error",
        message: "找不到被引用的配方版本: " + versionId,
      });
    }

    const outputMass = parsePositive(node.outputMassGrams, "outputMassGrams");
    if (!outputMass.ok) return outputMass;
    const nextPath = [...path, versionId];
    const leaves: FlattenedIngredient[] = [];

    for (const item of node.items) {
      const mass = parseNonNegative(item.massGrams, "massGrams");
      if (!mass.ok) return mass;
      if (item.kind === "ingredient") {
        leaves.push({
          ingredient: item.ingredient,
          massGrams: decimalString(mass.value.mul(scale)),
          sourcePath: nextPath,
        });
        continue;
      }

      const childNode = graph[item.recipeVersionId];
      if (childNode === undefined) {
        return fail({
          code: "missing-recipe-version",
          itemId: item.recipeVersionId,
          severity: "error",
          message: "找不到被引用的配方版本: " + item.recipeVersionId,
        });
      }
      const childOutputMass = parsePositive(
        childNode.outputMassGrams,
        "outputMassGrams",
      );
      if (!childOutputMass.ok) return childOutputMass;
      const childScale = scale.mul(mass.value).div(childOutputMass.value);
      const child = visit(item.recipeVersionId, childScale, nextPath);
      if (!child.ok) return child;
      leaves.push(...child.value);
    }

    return ok(leaves);
  };

  return visit(rootVersionId, new Decimal(1), []);
}
