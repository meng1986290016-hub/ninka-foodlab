import Decimal from "decimal.js";

import type {
  IngredientVariant,
  MaterialGroup,
} from "../../api/types";
import type {
  RecipeVersion,
} from "../../api/recipe-types";

export interface RecipeCurrentPriceResult {
  frozenBatchTotal: string;
  currentRawMaterialTotal: string;
  currentPackagingTotal: string;
  currentAdditionalTotal: string;
  currentBatchTotal: string;
  currentPer100g: string;
  difference: string;
  status: "complete" | "partial";
  missingIngredients: string[];
}

export interface RecipeCurrentPriceRequest {
  rootVersion: RecipeVersion;
  referencedVersions: RecipeVersion[];
  materialGroups: MaterialGroup[];
}

export function calculateRecipeAtCurrentPrices(
  request: RecipeCurrentPriceRequest,
): RecipeCurrentPriceResult {
  const variants = new Map<string, IngredientVariant>();
  for (const group of request.materialGroups) {
    for (const variant of group.variants) {
      variants.set(variant.id, variant);
    }
  }
  const versions = new Map(
    [request.rootVersion, ...request.referencedVersions].map(
      (version) => [version.id, version],
    ),
  );
  const totals = {
    raw: new Decimal(0),
    packaging: new Decimal(0),
    additional: new Decimal(0),
  };
  const missing = new Set<string>();

  const visit = (
    version: RecipeVersion,
    scale: Decimal,
    path: string[],
  ) => {
    if (path.includes(version.id)) {
      throw new Error("检测到配方循环引用");
    }
    const nextPath = [...path, version.id];
    for (const cost of version.snapshot.packagingCosts) {
      const quantity = safeDecimal(cost.quantity);
      const unitCost = safeDecimal(cost.unitCost);
      if (quantity !== null && unitCost !== null) {
        totals.packaging = totals.packaging.add(
          quantity.mul(unitCost).mul(scale),
        );
      }
    }
    for (const cost of version.snapshot.additionalCosts) {
      const amount = safeDecimal(cost.amount);
      if (amount !== null) {
        totals.additional = totals.additional.add(amount.mul(scale));
      }
    }

    for (const item of version.snapshot.items) {
      const mass = safeDecimal(item.massGrams);
      if (mass === null) continue;
      if (item.kind === "ingredient") {
        const variant = variants.get(
          item.ingredient.ingredientVariantId,
        );
        const pricePerKg =
          variant === undefined ? null : currentPricePerKg(variant);
        if (pricePerKg === null) {
          missing.add(
            `${item.ingredient.materialName} · ${item.ingredient.supplierName}`,
          );
          continue;
        }
        totals.raw = totals.raw.add(
          mass.mul(scale).div(1000).mul(pricePerKg),
        );
        continue;
      }

      const child = versions.get(item.recipeVersion.id);
      if (child === undefined) {
        missing.add(
          `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`,
        );
        continue;
      }
      const outputMass = versionOutputMass(child);
      if (outputMass === null || outputMass.lte(0)) {
        missing.add(
          `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`,
        );
        continue;
      }
      visit(child, scale.mul(mass).div(outputMass), nextPath);
    }
  };

  visit(request.rootVersion, new Decimal(1), []);
  const batchTotal = totals.raw
    .add(totals.packaging)
    .add(totals.additional);
  const outputMass = versionOutputMass(request.rootVersion);
  const per100g =
    outputMass === null || outputMass.lte(0)
      ? new Decimal(0)
      : batchTotal.div(outputMass).mul(100);
  const frozen =
    safeDecimal(
      request.rootVersion.snapshot.calculation.cost.batchTotal,
    ) ?? new Decimal(0);

  return {
    frozenBatchTotal: decimal(frozen),
    currentRawMaterialTotal: decimal(totals.raw),
    currentPackagingTotal: decimal(totals.packaging),
    currentAdditionalTotal: decimal(totals.additional),
    currentBatchTotal: decimal(batchTotal),
    currentPer100g: decimal(per100g),
    difference: decimal(batchTotal.sub(frozen)),
    status: missing.size === 0 ? "complete" : "partial",
    missingIngredients: [...missing],
  };
}

export async function loadRecipeVersionClosure(
  getVersion: (id: string) => Promise<RecipeVersion>,
  rootVersion: RecipeVersion,
) {
  const versions = new Map<string, RecipeVersion>();
  const pending = rootVersion.snapshot.items.flatMap((item) =>
    item.kind === "recipe_version" ? [item.recipeVersion.id] : [],
  );
  while (pending.length > 0) {
    const versionId = pending.shift();
    if (versionId === undefined || versions.has(versionId)) continue;
    const version = await getVersion(versionId);
    versions.set(version.id, version);
    for (const item of version.snapshot.items) {
      if (
        item.kind === "recipe_version" &&
        !versions.has(item.recipeVersion.id)
      ) {
        pending.push(item.recipeVersion.id);
      }
    }
  }
  return [...versions.values()];
}

function currentPricePerKg(variant: IngredientVariant) {
  const price = safeDecimal(variant.currentPrice);
  if (price === null) return null;
  switch (variant.priceUnit) {
    case "kg":
      return price;
    case "g":
      return price.mul(1000);
    case "L": {
      const density = safeDecimal(variant.densityGPerMl);
      return density === null || density.lte(0)
        ? null
        : price.div(density);
    }
    case "mL": {
      const density = safeDecimal(variant.densityGPerMl);
      return density === null || density.lte(0)
        ? null
        : price.mul(1000).div(density);
    }
  }
}

function versionOutputMass(version: RecipeVersion) {
  return safeDecimal(
    version.snapshot.finishedMassGrams ??
      version.snapshot.targetBatchGrams,
  );
}

function safeDecimal(value: string | null) {
  if (value === null || value.trim() === "") return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function decimal(value: Decimal) {
  return value.toDecimalPlaces(8).toString();
}
