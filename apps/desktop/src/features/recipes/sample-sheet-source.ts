import {
  toGrams,
  type SamplingItem,
  type SamplingRecipeNode,
} from "@food-rd/core";
import Decimal from "decimal.js";

import type {
  Recipe,
  RecipeDraft,
  RecipeVersion,
} from "../../api/recipe-types";
import { recipeVersionOutputMass } from "../../api/recipe-output-mass";

export type SampleSheetLaunch =
  | {
      origin: "workbench";
      recipe: Recipe;
      draft: RecipeDraft;
      referencedVersions: RecipeVersion[];
    }
  | {
      origin: "library";
      recipeId: string;
      initialVersionId: string | null;
    };

export type SamplingSourceBuildResult =
  | {
      ok: true;
      source: SamplingRecipeNode;
      referencedRecipes: Record<string, SamplingRecipeNode>;
    }
  | { ok: false; message: string };

export function buildSamplingSourceFromDraft(
  recipe: Recipe,
  draft: RecipeDraft,
  referencedVersions: RecipeVersion[],
): SamplingSourceBuildResult {
  const items: SamplingItem[] = [];
  for (const item of draft.items) {
    if (item.kind === "material_need") {
      return {
        ok: false,
        message: `${item.materialNeed.materialName} 仍是待补充原料，请先关联并替换为真实供应商版本`,
      };
    }
    const density =
      item.kind === "ingredient"
        ? item.ingredientVariant.densityGPerMl ?? undefined
        : undefined;
    const converted = toGrams(
      { value: item.amount, unit: item.unit },
      density,
    );
    if (!converted.ok) {
      const label =
        item.kind === "ingredient"
          ? item.materialName
          : `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`;
      return {
        ok: false,
        message: `${label} 无法折算为质量，请检查单位或密度`,
      };
    }
    items.push(
      item.kind === "ingredient"
        ? {
            id: item.id,
            position: item.position,
            kind: "ingredient",
            amount: item.amount,
            unit: item.unit,
            massGrams: converted.value,
            ingredient: {
              id: item.ingredientVariantId,
              name: item.materialName,
              supplierName: item.ingredientVariant.supplierName,
              specification:
                item.ingredientVariant.modelOrSpecification || null,
            },
          }
        : {
            id: item.id,
            position: item.position,
            kind: "recipe_version",
            amount: item.amount,
            unit: item.unit,
            massGrams: converted.value,
            recipeVersionId: item.recipeVersionId,
            recipeName: item.recipeVersion.recipeName,
            versionNumber: item.recipeVersion.versionNumber,
          },
    );
  }
  return {
    ok: true,
    source: {
      id: `draft:${recipe.id}`,
      name: recipe.name,
      versionLabel: "当前工作台草稿",
      finishedMassGrams: draft.finishedMassGrams,
      outputMassGrams:
        draft.finishedMassGrams ?? sumItemMasses(items),
      items,
    },
    referencedRecipes: nodesById(referencedVersions),
  };
}

export function buildSamplingSourceFromVersion(
  version: RecipeVersion,
  referencedVersions: RecipeVersion[],
): SamplingSourceBuildResult {
  return {
    ok: true,
    source: versionNode(version),
    referencedRecipes: nodesById(referencedVersions),
  };
}

function nodesById(versions: RecipeVersion[]) {
  return Object.fromEntries(
    versions.map((version) => [version.id, versionNode(version)]),
  );
}

function versionNode(version: RecipeVersion): SamplingRecipeNode {
  return {
    id: version.id,
    name: version.snapshot.recipe.name,
    versionLabel: `V${version.versionNumber} 正式版本`,
    finishedMassGrams: version.snapshot.finishedMassGrams,
    outputMassGrams: recipeVersionOutputMass(version.snapshot),
    items: version.snapshot.items.map((item) =>
      item.kind === "ingredient"
        ? {
            id: item.id,
            position: item.position,
            kind: "ingredient" as const,
            amount: item.amount,
            unit: item.unit,
            massGrams: item.massGrams,
            ingredient: {
              id: item.ingredient.ingredientVariantId,
              name: item.ingredient.materialName,
              supplierName: item.ingredient.supplierName,
              specification:
                item.ingredient.modelOrSpecification || null,
            },
          }
        : {
            id: item.id,
            position: item.position,
            kind: "recipe_version" as const,
            amount: item.amount,
            unit: item.unit,
            massGrams: item.massGrams,
            recipeVersionId: item.recipeVersion.id,
            recipeName: item.recipeVersion.recipeName,
            versionNumber: item.recipeVersion.versionNumber,
          },
    ),
  };
}

function sumItemMasses(items: SamplingItem[]) {
  return items
    .reduce(
      (total, item) => total.add(item.massGrams),
      new Decimal(0),
    )
    .toString();
}
