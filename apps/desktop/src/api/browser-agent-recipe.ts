import Decimal from "decimal.js";

import type {
  AgentRecipeProposalEvaluation,
  AgentRecipeProposalPayload,
} from "./agent-recipe-types";
import type {
  MaterialGroup,
  NutrientDefinition,
} from "./types";
import { DesktopApiError } from "./types";

export function evaluateBrowserAgentRecipe(
  input: AgentRecipeProposalPayload,
  groups: MaterialGroup[],
  definitions: NutrientDefinition[],
  now: string,
): {
  payload: AgentRecipeProposalPayload;
  evaluation: AgentRecipeProposalEvaluation;
} {
  const payload = structuredClone(input);
  if (!payload.productName.trim()) {
    throw new DesktopApiError("invalid_input", "请填写产品名称");
  }
  if (payload.finishedMassGrams !== null) positive(payload.finishedMassGrams);
  if (payload.items.length === 0) {
    throw new DesktopApiError("invalid_input", "配方提案至少需要一项原料");
  }

  const variantRecords = groups.flatMap((group) =>
    group.variants.map((variant) => ({ group, variant })),
  );
  const totalMass = payload.items.reduce(
    (sum, item) => sum.add(mass(item.amount, item.unit)),
    new Decimal(0),
  );
  const basis = payload.finishedMassGrams === null
    ? totalMass
    : positive(payload.finishedMassGrams);
  let knownCost = new Decimal(0);
  const missingCostIds: string[] = [];
  const staleItemIds: string[] = [];
  const issues: Array<Record<string, unknown>> = [];
  const contains: string[] = [];
  const mayContain: string[] = [];

  const nutrientTotals = new Map<string, Decimal>();
  const nutrientKnownMass = new Map<string, Decimal>();
  const nutrientTrackedMass = new Map<string, Decimal>();
  const nutrientMissing = new Map<string, string[]>();
  const trackedNutrientIds = new Set(
    definitions.filter((definition) => definition.builtIn).map((definition) => definition.id),
  );
  let sweetnessTotal = new Decimal(0);
  let sweetnessConfigured = 0;
  let sweetnessKnown = 0;
  const sweetnessMissing: string[] = [];

  for (const item of payload.items) {
    const itemMass = mass(item.amount, item.unit);
    if (item.kind === "material_need") {
      missingCostIds.push(item.id);
      for (const definition of definitions.filter((value) => value.builtIn)) {
        pushMap(nutrientMissing, definition.id, item.id);
        nutrientTrackedMass.set(
          definition.id,
          (nutrientTrackedMass.get(definition.id) ?? new Decimal(0)).add(itemMass),
        );
      }
      continue;
    }
    const record = variantRecords.find(
      ({ variant }) => variant.id === item.ingredientVariantId,
    );
    if (!record) {
      throw new DesktopApiError("missing_reference", "找不到提案中的供应商原料版本");
    }
    const { group, variant } = record;
    item.materialName = group.name;
    item.supplierName = variant.supplierName;
    item.modelOrSpecification = variant.modelOrSpecification;
    item.ingredientUpdatedAt = variant.updatedAt;
    if (variant.archivedAt !== null) staleItemIds.push(item.id);
    const density = optionalPositive(variant.densityGPerMl);
    const provided = new Map(
      variant.nutrition.values.map((value) => [
        value.nutrientDefinitionId,
        value.value,
      ]),
    );
    for (const definition of definitions.filter(
      (value) => value.builtIn || provided.has(value.id),
    )) {
      trackedNutrientIds.add(definition.id);
      nutrientTrackedMass.set(
        definition.id,
        (nutrientTrackedMass.get(definition.id) ?? new Decimal(0)).add(itemMass),
      );
      const source = provided.get(definition.id) ?? null;
      const value = source === null
        ? null
        : new Decimal(source);
      const per100g = value === null
        ? null
        : variant.nutrition.basis === "per_100g"
          ? value
          : density === null
            ? null
            : value.div(density);
      if (per100g === null) {
        pushMap(nutrientMissing, definition.id, item.id);
      } else {
        nutrientTotals.set(
          definition.id,
          (nutrientTotals.get(definition.id) ?? new Decimal(0)).add(
            per100g.mul(itemMass).div(100),
          ),
        );
        nutrientKnownMass.set(
          definition.id,
          (nutrientKnownMass.get(definition.id) ?? new Decimal(0)).add(itemMass),
        );
      }
    }
    const price = pricePerKg(
      variant.currentPrice,
      variant.priceUnit,
      density,
    );
    if (price === null) missingCostIds.push(item.id);
    else knownCost = knownCost.add(price.mul(itemMass).div(1000));
    for (const allergen of variant.allergens?.contains ?? []) {
      if (!contains.includes(allergen)) contains.push(allergen);
    }
    for (const allergen of variant.allergens?.mayContain ?? []) {
      if (!contains.includes(allergen) && !mayContain.includes(allergen)) {
        mayContain.push(allergen);
      }
    }
    if (variant.nutrition.basis === "per_100ml" && density === null) {
      issues.push({
        code: "missing_density",
        severity: "warning",
        message: "原料按每100mL记录营养，但缺少密度",
        field: "densityGPerMl",
        itemId: item.id,
      });
    }
    if (variant.sweetness) {
      sweetnessConfigured += 1;
      const content = variant.sweetness.content === null
        ? null
        : new Decimal(variant.sweetness.content);
      const factor = variant.sweetness.relativeFactor === null
        ? null
        : new Decimal(variant.sweetness.relativeFactor);
      const contentPer100g =
        content === null || factor === null
          ? null
          : variant.sweetness.basis === "w_w_percent"
            ? content
            : density === null
              ? null
              : content.div(density);
      if (contentPer100g === null || factor === null) {
        sweetnessMissing.push(item.id);
      } else {
        sweetnessTotal = sweetnessTotal.add(
          contentPer100g.mul(factor).mul(itemMass).div(100),
        );
        sweetnessKnown += 1;
      }
    }
  }

  const nutrients = definitions
    .filter((definition) => trackedNutrientIds.has(definition.id))
    .map((definition) => {
    const total = nutrientTotals.get(definition.id) ?? new Decimal(0);
    const knownMass = nutrientKnownMass.get(definition.id) ?? new Decimal(0);
    const missingItemIds = nutrientMissing.get(definition.id) ?? [];
    return {
      nutrientDefinitionId: definition.id,
      name: definition.name,
      unit: definition.unit,
      totalKnownAmount: decimal(total),
      per100gKnownAmount: decimal(
        basis.isZero() ? new Decimal(0) : total.mul(100).div(basis),
      ),
      status: (knownMass.isZero()
        ? "unknown"
        : missingItemIds.length === 0
          ? "complete"
          : "partial") as "unknown" | "complete" | "partial",
      completenessRatio: decimal(
        (nutrientTrackedMass.get(definition.id) ?? new Decimal(0)).isZero()
          ? new Decimal(0)
          : knownMass.div(nutrientTrackedMass.get(definition.id)!),
      ),
      missingItemIds,
      category: definition.category,
    };
  });
  for (const itemId of missingCostIds) {
    issues.push({
      code: "missing_price",
      severity: "warning",
      message: "原料缺少价格，成本结果为部分估算",
      field: "currentPrice",
      itemId,
    });
  }
  const builtInIds = new Set(
    definitions.filter((definition) => definition.builtIn).map((definition) => definition.id),
  );
  const ratios = nutrients
    .filter((item) => builtInIds.has(item.nutrientDefinitionId))
    .map((item) => new Decimal(item.completenessRatio));
  const completeness = ratios.length === 0
    ? 0
    : new Decimal(ratios.reduce((sum, value) => sum.add(value), new Decimal(0)))
        .div(ratios.length)
        .mul(100)
        .round()
        .toNumber();
  const calculation = {
    inputMassGrams: decimal(totalMass),
    basisMassGrams: decimal(basis),
    basis: payload.finishedMassGrams === null ? "input_mass" as const : "finished_mass" as const,
    yieldPercent: payload.finishedMassGrams === null || totalMass.isZero()
      ? null
      : decimal(basis.mul(100).div(totalMass)),
    nutrients,
    sweetness:
      sweetnessConfigured === 0
        ? null
        : {
            totalSucroseEquivalentGrams: decimal(sweetnessTotal),
            per100gSucroseEquivalent: decimal(
              basis.isZero()
                ? new Decimal(0)
                : sweetnessTotal.mul(100).div(basis),
            ),
            status:
              sweetnessMissing.length === 0
                ? ("complete" as const)
                : sweetnessKnown === 0
                  ? ("unknown" as const)
                  : ("partial" as const),
            missingItemIds: sweetnessMissing,
          },
    cost: {
      rawMaterialTotal: decimal(knownCost),
      packagingTotal: "0",
      additionalTotal: "0",
      batchTotal: decimal(knownCost),
      perKg: decimal(basis.isZero() ? new Decimal(0) : knownCost.mul(1000).div(basis)),
      per100g: decimal(basis.isZero() ? new Decimal(0) : knownCost.mul(100).div(basis)),
      perServing: null,
      perPackage: null,
      status: missingCostIds.length === 0 ? "complete" as const : "partial" as const,
      missingItemIds: missingCostIds,
      breakdown: [],
    },
    targets: [],
    allergens: { contains, mayContain, sourceItemIds: {} },
    completeness: {
      percent: completeness,
      missingFields: [...new Set(issues.map((issue) => String(issue.field)))],
    },
    calculatedAt: now,
  };
  const nutrientMap = new Map(
    nutrients.map((nutrient) => [nutrient.nutrientDefinitionId, nutrient]),
  );
  return {
    payload,
    evaluation: {
      calculation,
      requirementStatuses: payload.requirements.map((requirement) => {
        const observed = requirement.nutrientDefinitionId === null
          ? null
          : nutrientMap.get(requirement.nutrientDefinitionId)?.per100gKnownAmount ?? null;
        return {
          name: requirement.name,
          unit: requirement.unit,
          observed,
          status: requirementStatus(
            observed,
            requirement.minimum,
            requirement.maximum,
          ),
        };
      }),
      staleItemIds,
      ...({ issues } as object),
    },
  };
}

function mass(amount: string, unit: "g" | "kg") {
  const value = nonNegative(amount);
  return unit === "kg" ? value.mul(1000) : value;
}

function positive(value: string) {
  const parsed = new Decimal(value);
  if (!parsed.isPositive()) {
    throw new DesktopApiError("invalid_decimal", "数值必须大于零");
  }
  return parsed;
}

function nonNegative(value: string) {
  const parsed = new Decimal(value);
  if (parsed.isNegative()) {
    throw new DesktopApiError("invalid_decimal", "数值不能小于零");
  }
  return parsed;
}

function optionalPositive(value: string | null) {
  if (value === null) return null;
  const parsed = new Decimal(value);
  return parsed.isPositive() ? parsed : null;
}

function pricePerKg(
  value: string | null,
  unit: "kg" | "g" | "L" | "mL",
  density: Decimal | null,
) {
  if (value === null) return null;
  const price = nonNegative(value);
  if (unit === "kg") return price;
  if (unit === "g") return price.mul(1000);
  if (density === null) return null;
  return unit === "L" ? price.div(density) : price.mul(1000).div(density);
}

function requirementStatus(
  observed: string | null,
  minimum: string | null,
  maximum: string | null,
) {
  if (observed === null) return "unknown" as const;
  const value = new Decimal(observed);
  if (minimum !== null && value.lt(minimum)) return "below" as const;
  if (maximum !== null && value.gt(maximum)) return "above" as const;
  return "met" as const;
}

function pushMap(map: Map<string, string[]>, key: string, value: string) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function decimal(value: Decimal) {
  return value.toDecimalPlaces(12).toString();
}
