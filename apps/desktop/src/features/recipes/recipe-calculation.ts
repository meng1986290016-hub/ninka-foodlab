import {
  calculateRecipe,
  evaluateTarget,
  flattenRecipeVersion,
  toGrams,
  type CalculationIssue as CoreCalculationIssue,
  type IngredientSnapshot as CoreIngredientSnapshot,
  type RecipeVersionNode,
} from "@food-rd/core";
import Decimal from "decimal.js";

import type { IngredientVariant, NutrientDefinition } from "../../api/types";
import type {
  RecipeAllergenSummary,
  RecipeCalculation,
  RecipeCalculationIssue,
  RecipeDraft,
  RecipeDraftIngredientItem,
  RecipeIngredientSnapshot,
  RecipeTarget,
  RecipeTargetEvaluation,
  RecipeVersion,
  RecipeVersionItemSnapshot,
} from "../../api/recipe-types";
import { recipeVersionOutputMass } from "../../api/recipe-output-mass";

export interface RecipeCalculationRequest {
  draft: RecipeDraft;
  referencedVersions: RecipeVersion[];
  nutrientDefinitions: NutrientDefinition[];
  calculatedAt: string;
}

export interface RecipeCalculationValue {
  calculation: RecipeCalculation;
  versionItems: RecipeVersionItemSnapshot[];
}

export type RecipeCalculationResult =
  | {
      ok: true;
      value: RecipeCalculationValue;
      warnings: RecipeCalculationIssue[];
    }
  | {
      ok: false;
      issues: RecipeCalculationIssue[];
    };

interface AllergenSource {
  contains: string[];
  mayContain: string[];
  sourceItemId: string;
}

interface GraphContext {
  graph: Record<string, RecipeVersionNode>;
  allergensByIngredientId: Map<string, AllergenSource>;
  nutrientUnits: Map<string, string>;
  sourceItemByIngredientId: Map<string, string>;
  builtInNutrientIds: Set<string>;
  calculationWarnings: RecipeCalculationIssue[];
}

interface ConvertedIngredient {
  core: CoreIngredientSnapshot;
  snapshot: RecipeIngredientSnapshot;
}

const ROOT_VERSION_ID = "__draft_root__";
const RETIRED_NUTRIENT_DEFINITION_IDS = new Set(["theoretical_sweetness"]);

export function calculateRecipeDraft(
  request: RecipeCalculationRequest,
): RecipeCalculationResult {
  const definitions = new Map(
    request.nutrientDefinitions
      .filter((definition) => !RETIRED_NUTRIENT_DEFINITION_IDS.has(definition.id))
      .map((definition) => [definition.id, definition]),
  );
  const context: GraphContext = {
    graph: {},
    allergensByIngredientId: new Map(),
    nutrientUnits: new Map(
      request.nutrientDefinitions
        .filter((definition) => !RETIRED_NUTRIENT_DEFINITION_IDS.has(definition.id))
        .map((definition) => [definition.id, definition.unit]),
    ),
    sourceItemByIngredientId: new Map(),
    builtInNutrientIds: new Set(
      request.nutrientDefinitions
        .filter(
          (definition) => definition.builtIn && definition.category === "nutrition",
        )
        .map((definition) => definition.id),
    ),
    calculationWarnings: [],
  };

  const referenced = buildReferencedGraph(
    request.referencedVersions,
    context,
  );
  if (!referenced.ok) return referenced;

  const rootItems: RecipeVersionNode["items"] = [];
  const versionItems: RecipeVersionItemSnapshot[] = [];
  const conversionIssues: RecipeCalculationIssue[] = [];
  let rootInputMass = new Decimal(0);

  for (const item of [...request.draft.items].sort(
    (left, right) => left.position - right.position,
  )) {
    const density =
      item.kind === "ingredient"
        ? item.ingredientVariant.densityGPerMl ?? undefined
        : undefined;
    const mass = toGrams(
      { value: item.amount, unit: item.unit },
      density,
    );
    if (!mass.ok) {
      conversionIssues.push(
        ...mass.issues.map((issue) => adaptIssue(issue, item.id)),
      );
      continue;
    }
    rootInputMass = rootInputMass.add(mass.value);

    if (item.kind === "ingredient") {
      const converted = convertCurrentIngredient(
        item,
        definitions,
        context,
      );
      if (!converted.ok) {
        conversionIssues.push(...converted.issues);
        continue;
      }
      rootItems.push({
        kind: "ingredient",
        ingredient: converted.value.core,
        massGrams: mass.value,
      });
      versionItems.push({
        id: item.id,
        position: item.position,
        kind: "ingredient",
        amount: item.amount,
        unit: item.unit,
        massGrams: mass.value,
        locked: false,
        autoFill: false,
        ingredient: converted.value.snapshot,
      });
      continue;
    }

    if (item.kind === "material_need") {
      const ingredientId = `material-need:${item.materialNeedId}`;
      rootItems.push({
        kind: "ingredient",
        ingredient: {
          id: ingredientId,
          name: `${item.materialNeed.materialName}（待补充）`,
          nutrientsPer100g: Object.fromEntries(
            request.nutrientDefinitions
              .filter(
                (definition) =>
                  definition.builtIn && definition.category === "nutrition",
              )
              .map((definition) => [
              definition.id,
              null,
              ]),
          ),
          pricePerKg: null,
        },
        massGrams: mass.value,
      });
      context.sourceItemByIngredientId.set(ingredientId, item.id);
      context.allergensByIngredientId.set(ingredientId, {
        contains: [],
        mayContain: [],
        sourceItemId: item.id,
      });
      conversionIssues.push({
        code: "material_need_unresolved",
        severity: "warning",
        message: "该原料尚未关联供应商版本，营养与成本暂按缺失数据处理",
        field: "materialNeedId",
        itemId: item.id,
      });
      continue;
    }

    rootItems.push({
      kind: "recipe",
      recipeVersionId: item.recipeVersionId,
      massGrams: mass.value,
    });
    versionItems.push({
      id: item.id,
      position: item.position,
      kind: "recipe_version",
      amount: item.amount,
      unit: item.unit,
      massGrams: mass.value,
      locked: false,
      autoFill: false,
      recipeVersion: item.recipeVersion,
    });
  }

  if (conversionIssues.some((issue) => issue.severity === "error")) {
    return { ok: false, issues: conversionIssues };
  }

  const basisMass =
    request.draft.finishedMassGrams ?? decimal(rootInputMass);
  context.graph[ROOT_VERSION_ID] = {
    id: ROOT_VERSION_ID,
    outputMassGrams: basisMass,
    items: rootItems,
  };

  const flattened = flattenRecipeVersion(ROOT_VERSION_ID, context.graph);
  if (!flattened.ok) {
    return {
      ok: false,
      issues: flattened.issues.map((issue) => adaptIssue(issue)),
    };
  }

  const calculated = calculateRecipe({
    rootVersionId: ROOT_VERSION_ID,
    graph: context.graph,
    finishedMassGrams: basisMass,
    ...(request.draft.servingMassGrams === null
      ? {}
      : { servingMassGrams: request.draft.servingMassGrams }),
    ...(request.draft.packageCount === null
      ? {}
      : { packageCount: request.draft.packageCount }),
    packaging: request.draft.packagingCosts,
    additional: request.draft.additionalCosts,
  });
  if (!calculated.ok) {
    return {
      ok: false,
      issues: calculated.issues.map((issue) => adaptIssue(issue)),
    };
  }

  const componentSourceIds = new Map<string, string>();
  flattened.value.forEach((leaf, index) => {
    componentSourceIds.set(
      `${leaf.ingredient.id}:${index}`,
      context.sourceItemByIngredientId.get(leaf.ingredient.id) ??
        leaf.ingredient.id,
    );
  });
  const nutrientDefinitions = collectNutrientDefinitions(
    request.nutrientDefinitions,
    context.nutrientUnits,
  );
  const nutrientEstimates = Object.entries(
    calculated.value.nutrition.nutrients,
  )
    .sort(([left], [right]) =>
      (nutrientDefinitions.get(left)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (nutrientDefinitions.get(right)?.sortOrder ??
          Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right),
    )
    .map(([id, estimate]) => ({
      nutrientDefinitionId: id,
      name: nutrientDefinitions.get(id)?.name ?? id,
      unit:
        nutrientDefinitions.get(id)?.unit ??
        context.nutrientUnits.get(id) ??
        "",
      totalKnownAmount: normalizeDecimal(estimate.totalKnownAmount),
      per100gKnownAmount: normalizeDecimal(estimate.per100gKnownAmount),
      status: estimate.status,
      completenessRatio: normalizeDecimal(estimate.completenessRatio),
      missingItemIds: unique(
        estimate.missingComponentIds.map(
          (componentId) =>
            componentSourceIds.get(componentId) ?? componentId,
        ),
      ),
      category: nutrientDefinitions.get(id)?.category ?? "nutrition",
    }));

  const missingCostItemIds = unique(
    calculated.value.cost.missingComponentIds.map(
      (componentId) => componentSourceIds.get(componentId) ?? componentId,
    ),
  );
  const cost: RecipeCalculation["cost"] = {
    rawMaterialTotal: normalizeDecimal(
      calculated.value.cost.rawMaterialTotal,
    ),
    packagingTotal: normalizeDecimal(
      calculated.value.cost.packagingTotal,
    ),
    additionalTotal: normalizeDecimal(
      calculated.value.cost.additionalTotal,
    ),
    batchTotal: normalizeDecimal(calculated.value.cost.batchTotal),
    perKg: normalizeDecimal(calculated.value.cost.perKg),
    per100g: normalizeDecimal(calculated.value.cost.per100g),
    perServing:
      calculated.value.cost.perServing === null
        ? null
        : normalizeDecimal(calculated.value.cost.perServing),
    perPackage:
      calculated.value.cost.perPackage === null
        ? null
        : normalizeDecimal(calculated.value.cost.perPackage),
    status: calculated.value.cost.status,
    missingItemIds: missingCostItemIds,
    breakdown: calculated.value.cost.breakdown.map((item) => ({
      ...item,
      amount: normalizeDecimal(item.amount),
      id:
        item.category === "ingredient"
          ? componentSourceIds.get(item.id) ?? item.id
          : item.id,
    })),
  };
  const targets = evaluateTargets(
    request.draft.targets,
    nutrientEstimates,
    cost,
  );
  if (!targets.ok) return targets;

  const allergens = summarizeAllergens(
    flattened.value.map((leaf) => ({
      ingredientId: leaf.ingredient.id,
      source:
        context.allergensByIngredientId.get(leaf.ingredient.id) ?? null,
    })),
  );
  const builtInEstimates = nutrientEstimates.filter(
    (estimate) => {
      const definition = definitions.get(estimate.nutrientDefinitionId);
      return definition?.builtIn && definition.category === "nutrition";
    },
  );
  const missingFields = buildMissingFields(
    builtInEstimates,
    missingCostItemIds,
  );
  const completeness = calculateCompleteness(
    builtInEstimates.map((estimate) => estimate.completenessRatio),
    flattened.value.length,
    calculated.value.cost.missingComponentIds.length,
    missingFields,
  );
  const yieldPercent =
    request.draft.finishedMassGrams === null || rootInputMass.isZero()
      ? null
      : decimal(
          new Decimal(request.draft.finishedMassGrams)
            .div(rootInputMass)
            .mul(100),
        );

  const calculation: RecipeCalculation = {
    inputMassGrams: decimal(rootInputMass),
    basisMassGrams: basisMass,
    basis:
      request.draft.finishedMassGrams === null
        ? "input_mass"
        : "finished_mass",
    yieldPercent,
    nutrients: nutrientEstimates,
    cost,
    targets: targets.value,
    allergens,
    completeness,
    calculatedAt: request.calculatedAt,
  };
  const warnings = [
    ...conversionIssues,
    ...context.calculationWarnings,
    ...calculated.warnings.map((issue) => adaptIssue(issue)),
    ...missingCostItemIds.map(
      (itemId): RecipeCalculationIssue => ({
        code: "missing_price",
        severity: "warning",
        message: "原料缺少价格，成本结果为部分估算",
        field: "currentPrice",
        itemId,
      }),
    ),
  ];

  return {
    ok: true,
    value: { calculation, versionItems },
    warnings,
  };
}

function buildReferencedGraph(
  versions: RecipeVersion[],
  context: GraphContext,
): { ok: true } | { ok: false; issues: RecipeCalculationIssue[] } {
  const issues: RecipeCalculationIssue[] = [];
  for (const version of versions) {
    const items: RecipeVersionNode["items"] = [];
    for (const item of version.snapshot.items) {
      if (item.kind === "ingredient") {
        const ingredientId = graphIngredientId(version.id, item.id);
        const nutrientsPer100g = Object.fromEntries(
          unique([
            ...context.builtInNutrientIds,
            ...Object.keys(item.ingredient.nutrientsPer100g).filter(
              (nutrientId) => !RETIRED_NUTRIENT_DEFINITION_IDS.has(nutrientId),
            ),
          ]).map((nutrientId) => [
            nutrientId,
            item.ingredient.nutrientsPer100g[nutrientId] ?? null,
          ]),
        );
        items.push({
          kind: "ingredient",
          ingredient: {
            id: ingredientId,
            name: ingredientLabel(
              item.ingredient.materialName,
              item.ingredient.supplierName,
            ),
            nutrientsPer100g,
            pricePerKg: item.ingredient.pricePerKg,
          },
          massGrams: item.massGrams,
        });
        context.sourceItemByIngredientId.set(ingredientId, item.id);
        context.allergensByIngredientId.set(ingredientId, {
          contains: item.ingredient.allergens.contains,
          mayContain: item.ingredient.allergens.mayContain,
          sourceItemId: item.id,
        });
        for (const [id, unit] of Object.entries(
          item.ingredient.nutrientUnits,
        )) {
          if (RETIRED_NUTRIENT_DEFINITION_IDS.has(id)) continue;
          context.nutrientUnits.set(id, unit);
        }
      } else {
        items.push({
          kind: "recipe",
          recipeVersionId: item.recipeVersion.id,
          massGrams: item.massGrams,
        });
      }
    }
    const outputMassGrams = recipeVersionOutputMass(version.snapshot);
    try {
      if (new Decimal(outputMassGrams).lte(0)) {
        issues.push({
          code: "non_positive_value",
          severity: "error",
          message: "半成品版本产出重量必须大于 0",
          field: "outputMassGrams",
          itemId: version.id,
        });
        continue;
      }
    } catch {
      issues.push({
        code: "invalid_number",
        severity: "error",
        message: "半成品版本产出重量不是有效数字",
        field: "outputMassGrams",
        itemId: version.id,
      });
      continue;
    }
    context.graph[version.id] = {
      id: version.id,
      outputMassGrams,
      items,
    };
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function convertCurrentIngredient(
  item: RecipeDraftIngredientItem,
  definitions: Map<string, NutrientDefinition>,
  context: GraphContext,
):
  | { ok: true; value: ConvertedIngredient }
  | { ok: false; issues: RecipeCalculationIssue[] } {
  const issues: RecipeCalculationIssue[] = [];
  const variant = item.ingredientVariant;
  const nutrientsPer100g: Record<string, string | null> = {};
  const nutrientUnits: Record<string, string> = {};
  const provided = new Map(
    variant.nutrition.values
      .filter(
        (value) =>
          !RETIRED_NUTRIENT_DEFINITION_IDS.has(value.nutrientDefinitionId),
      )
      .map((value) => [value.nutrientDefinitionId, value.value]),
  );
  const nutrientIds = new Set([
    ...[...definitions.values()]
      .filter(
        (definition) => definition.builtIn && definition.category === "nutrition",
      )
      .map((definition) => definition.id),
    ...provided.keys(),
  ]);
  let density: Decimal | null = null;
  if (variant.densityGPerMl !== null) {
    density = positiveDecimal(
      variant.densityGPerMl,
      "densityGPerMl",
      item.id,
      issues,
    );
  }
  const needsNutritionDensity =
    variant.nutrition.basis === "per_100ml" &&
    [...provided.values()].some((value) => value !== null);
  const needsPriceDensity =
    variant.currentPrice !== null &&
    (variant.priceUnit === "L" || variant.priceUnit === "mL");
  if ((needsNutritionDensity || needsPriceDensity) && density === null) {
    if (!issues.some((issue) => issue.code === "missing_density")) {
      issues.push(missingDensityIssue(item.id));
    }
  }

  for (const nutrientId of nutrientIds) {
    const definition = definitions.get(nutrientId);
    const unit = definition?.unit ?? context.nutrientUnits.get(nutrientId) ?? "";
    nutrientUnits[nutrientId] = unit;
    context.nutrientUnits.set(nutrientId, unit);
    const value = provided.get(nutrientId) ?? null;
    if (value === null) {
      nutrientsPer100g[nutrientId] = null;
      continue;
    }
    const parsed = nonNegativeDecimal(
      value,
      nutrientId,
      item.id,
      issues,
    );
    if (parsed === null) {
      nutrientsPer100g[nutrientId] = null;
      continue;
    }
    nutrientsPer100g[nutrientId] =
      variant.nutrition.basis === "per_100g"
        ? decimal(parsed)
        : density === null
          ? null
          : decimal(parsed.div(density));
  }

  const pricePerKg = convertPricePerKg(
    variant,
    density,
    item.id,
    issues,
  );
  if (issues.length > 0) return { ok: false, issues };

  const ingredientId = graphIngredientId(ROOT_VERSION_ID, item.id);
  const variantAllergens = variant.allergens ?? {
    contains: [],
    mayContain: [],
  };
  const allergens: RecipeAllergenSummary = {
    contains: unique(variantAllergens.contains),
    mayContain: unique(variantAllergens.mayContain).filter(
      (name) => !variantAllergens.contains.includes(name),
    ),
    sourceItemIds: Object.fromEntries(
      unique([
        ...variantAllergens.contains,
        ...variantAllergens.mayContain,
      ]).map((name) => [name, [item.id]]),
    ),
  };
  const snapshot: RecipeIngredientSnapshot = {
    ingredientVariantId: variant.id,
    materialGroupId: variant.materialGroupId,
    materialName: item.materialName,
    supplierId: variant.supplierId,
    supplierName: variant.supplierName,
    modelOrSpecification: variant.modelOrSpecification,
    densityGPerMl: variant.densityGPerMl,
    nutrientsPer100g,
    nutrientUnits,
    pricePerKg,
    allergens,
    source: variant.source,
    ingredientUpdatedAt: variant.updatedAt,
  };
  context.sourceItemByIngredientId.set(ingredientId, item.id);
  context.allergensByIngredientId.set(ingredientId, {
    contains: allergens.contains,
    mayContain: allergens.mayContain,
    sourceItemId: item.id,
  });
  return {
    ok: true,
    value: {
      core: {
        id: ingredientId,
        name: ingredientLabel(item.materialName, variant.supplierName),
        nutrientsPer100g,
        pricePerKg,
      },
      snapshot,
    },
  };
}

function convertPricePerKg(
  variant: IngredientVariant,
  density: Decimal | null,
  itemId: string,
  issues: RecipeCalculationIssue[],
): string | null {
  if (variant.currentPrice === null) return null;
  const price = nonNegativeDecimal(
    variant.currentPrice,
    "currentPrice",
    itemId,
    issues,
  );
  if (price === null) return null;
  if (variant.priceUnit === "kg") return decimal(price);
  if (variant.priceUnit === "g") return decimal(price.mul(1000));
  if (density === null) return null;
  return variant.priceUnit === "L"
    ? decimal(price.div(density))
    : decimal(price.mul(1000).div(density));
}

function evaluateTargets(
  targets: RecipeTarget[],
  nutrients: RecipeCalculation["nutrients"],
  cost: RecipeCalculation["cost"],
):
  | { ok: true; value: RecipeTargetEvaluation[] }
  | { ok: false; issues: RecipeCalculationIssue[] } {
  const values: RecipeTargetEvaluation[] = [];
  for (const target of targets) {
    let observed: string | null;
    if (target.metric.kind === "nutrition_per_100g") {
      const nutrientDefinitionId = target.metric.nutrientDefinitionId;
      const nutrient = nutrients.find(
        (value) =>
          value.nutrientDefinitionId === nutrientDefinitionId,
      );
      observed =
        nutrient === undefined || nutrient.status === "unknown"
          ? null
          : nutrient.per100gKnownAmount;
    } else {
      observed = {
        batch: cost.batchTotal,
        per_kg: cost.perKg,
        per_100g: cost.per100g,
        per_serving: cost.perServing,
        per_package: cost.perPackage,
      }[target.metric.basis];
    }
    const result = evaluateTarget(observed, {
      id: target.id,
      metricCode:
        target.metric.kind === "nutrition_per_100g"
          ? target.metric.nutrientDefinitionId
          : target.metric.basis,
      ...(target.minimum === null ? {} : { minimum: target.minimum }),
      ...(target.maximum === null ? {} : { maximum: target.maximum }),
    });
    if (!result.ok) {
      return {
        ok: false,
        issues: result.issues.map((issue) => adaptIssue(issue)),
      };
    }
    values.push({
      ...result.value,
      observed: normalizeNullableDecimal(result.value.observed),
      deltaToMinimum: normalizeNullableDecimal(
        result.value.deltaToMinimum,
      ),
      deltaToMaximum: normalizeNullableDecimal(
        result.value.deltaToMaximum,
      ),
    });
  }
  return { ok: true, value: values };
}

function summarizeAllergens(
  leaves: Array<{
    ingredientId: string;
    source: AllergenSource | null;
  }>,
): RecipeAllergenSummary {
  const contains = new Set<string>();
  const mayContain = new Set<string>();
  const sourceItemIds = new Map<string, string[]>();
  for (const leaf of leaves) {
    if (leaf.source === null) continue;
    for (const name of leaf.source.contains) {
      contains.add(name);
      appendSource(sourceItemIds, name, leaf.source.sourceItemId);
    }
    for (const name of leaf.source.mayContain) {
      mayContain.add(name);
      appendSource(sourceItemIds, name, leaf.source.sourceItemId);
    }
  }
  for (const name of contains) mayContain.delete(name);
  return {
    contains: [...contains],
    mayContain: [...mayContain],
    sourceItemIds: Object.fromEntries(sourceItemIds),
  };
}

function buildMissingFields(
  nutrients: RecipeCalculation["nutrients"],
  missingCostItemIds: string[],
) {
  const values = nutrients.flatMap((nutrient) =>
    nutrient.missingItemIds.map(
      (itemId) => `${nutrient.name}：${itemId}`,
    ),
  );
  values.push(
    ...missingCostItemIds.map((itemId) => `价格：${itemId}`),
  );
  return unique(values);
}

function calculateCompleteness(
  nutrientRatios: string[],
  ingredientCount: number,
  missingPriceCount: number,
  missingFields: string[],
) {
  const priceRatio =
    ingredientCount === 0
      ? new Decimal(0)
      : new Decimal(ingredientCount - missingPriceCount).div(
          ingredientCount,
        );
  const ratios = [
    ...nutrientRatios.map((value) => new Decimal(value)),
    priceRatio,
  ];
  const percent =
    ratios.length === 0
      ? 0
      : new Decimal(ratios.reduce((sum, value) => sum.add(value), new Decimal(0)))
          .div(ratios.length)
          .mul(100)
          .round()
          .toNumber();
  return { percent, missingFields };
}

function collectNutrientDefinitions(
  definitions: NutrientDefinition[],
  units: Map<string, string>,
) {
  const result = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  let nextOrder = definitions.length;
  for (const [id, unit] of units) {
    if (result.has(id)) continue;
    result.set(id, {
      id,
      code: id,
      name: id,
      unit,
      builtIn: false,
      sortOrder: nextOrder++,
      category: "nutrition",
      archivedAt: null,
    });
  }
  return result;
}

function adaptIssue(
  issue: CoreCalculationIssue,
  itemId?: string,
): RecipeCalculationIssue {
  return {
    code: issue.code.replaceAll("-", "_") as RecipeCalculationIssue["code"],
    severity: issue.severity,
    message: issue.message,
    field: issue.field ?? null,
    itemId: itemId ?? issue.itemId ?? null,
  };
}

function nonNegativeDecimal(
  value: string,
  field: string,
  itemId: string,
  issues: RecipeCalculationIssue[],
): Decimal | null {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) throw new Error("not finite");
    if (parsed.isNegative()) {
      issues.push({
        code: "negative_value",
        severity: "error",
        message: "数值不能小于 0",
        field,
        itemId,
      });
      return null;
    }
    return parsed;
  } catch {
    issues.push({
      code: "invalid_number",
      severity: "error",
      message: "请输入有效数字",
      field,
      itemId,
    });
    return null;
  }
}

function positiveDecimal(
  value: string,
  field: string,
  itemId: string,
  issues: RecipeCalculationIssue[],
): Decimal | null {
  const parsed = nonNegativeDecimal(value, field, itemId, issues);
  if (parsed === null) return null;
  if (parsed.lte(0)) {
    issues.push(missingDensityIssue(itemId));
    return null;
  }
  return parsed;
}

function missingDensityIssue(itemId: string): RecipeCalculationIssue {
  return {
    code: "missing_density",
    severity: "error",
    message: "体积换算需要填写大于 0 的密度",
    field: "densityGPerMl",
    itemId,
  };
}

function appendSource(
  values: Map<string, string[]>,
  name: string,
  itemId: string,
) {
  const current = values.get(name) ?? [];
  if (!current.includes(itemId)) current.push(itemId);
  values.set(name, current);
}

function graphIngredientId(versionId: string, itemId: string) {
  return `${versionId}/${itemId}`;
}

function ingredientLabel(materialName: string, supplierName: string) {
  return `${materialName} · ${supplierName}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function decimal(value: Decimal) {
  return value.toSignificantDigits(20).toString();
}

function normalizeDecimal(value: string) {
  return decimal(new Decimal(value));
}

function normalizeNullableDecimal(value: string | null) {
  return value === null ? null : normalizeDecimal(value);
}
