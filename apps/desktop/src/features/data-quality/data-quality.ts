import Decimal from "decimal.js";
import { toGrams } from "@food-rd/core";

import { recipeVersionOutputMass } from "../../api/recipe-output-mass";
import type {
  RecipeCalculation,
  RecipeDraft,
  RecipeIngredientSnapshot,
  RecipeVersion,
} from "../../api/recipe-types";
import type {
  IngredientVariant,
  NutrientDefinition,
} from "../../api/types";

export type DataGapCategory =
  | "nutrition"
  | "cost"
  | "density"
  | "source"
  | "material"
  | "version";

export type DataGapState = "missing" | "needs_verification";

export interface SourcePathNode {
  id: string;
  kind: "recipe" | "version" | "ingredient" | "material_need";
  label: string;
}

export interface DataGapEntry {
  id: string;
  category: DataGapCategory;
  state: DataGapState;
  fieldId: string | null;
  fieldName: string;
  reason: string;
  path: SourcePathNode[];
  massGrams: string | null;
  ingredientVariantId: string | null;
  materialGroupId: string | null;
  editable: boolean;
}

export interface NutrientCoverage {
  nutrientDefinitionId: string;
  name: string;
  unit: string;
  category: "nutrition";
  status: "complete" | "partial" | "unknown";
  ratio: number;
  knownMassGrams: string | null;
  trackedMassGrams: string | null;
}

export interface DataGapReport {
  title: string;
  completenessPercent: number | null;
  entries: DataGapEntry[];
  nutrientCoverage: NutrientCoverage[];
}

export type NutritionDetailRowState =
  | "known"
  | "confirmed_zero"
  | "partial"
  | "unknown";

export interface NutritionDetailRow {
  nutrientDefinitionId: string;
  name: string;
  unit: string;
  value: string | null;
  category: "nutrition";
  status: NutritionDetailRowState;
  completenessRatio: number | null;
}

export interface NutritionDetail {
  title: string;
  subtitle: string;
  basisLabel: string;
  sourceLabel: string;
  updatedAt: string;
  completenessPercent: number | null;
  rows: NutritionDetailRow[];
  note: string | null;
}

interface LeafSource {
  occurrenceId: string;
  path: SourcePathNode[];
  massGrams: Decimal | null;
  nutrients: Record<string, string | null>;
  pricePerKg: string | null;
  source: string;
  densityGPerMl: string | null;
  conversionBlocked: boolean;
  ingredientVariantId: string;
  materialGroupId: string;
  editable: boolean;
}

interface CollectionResult {
  leaves: LeafSource[];
  entries: DataGapEntry[];
}

export function buildDraftDataGapReport(input: {
  draft: RecipeDraft;
  recipeName: string;
  calculation: RecipeCalculation | null;
  nutrientDefinitions: NutrientDefinition[];
  referencedVersions: RecipeVersion[];
}): DataGapReport {
  const versionById = new Map(
    input.referencedVersions.map((version) => [version.id, version]),
  );
  const rootPath: SourcePathNode[] = [
    { id: input.draft.recipeId, kind: "recipe", label: input.recipeName },
  ];
  const collection: CollectionResult = { leaves: [], entries: [] };

  for (const item of input.draft.items) {
    if (item.kind === "material_need") {
      collection.entries.push({
        id: `material:${item.id}`,
        category: "material",
        state: "missing",
        fieldId: null,
        fieldName: "真实供应商原料",
        reason: item.materialNeed.missingReason || "尚未关联供应商版本",
        path: [
          ...rootPath,
          {
            id: item.id,
            kind: "material_need",
            label: item.materialNeed.materialName,
          },
        ],
        massGrams: massForDraftItem(item.amount, item.unit, null),
        ingredientVariantId: null,
        materialGroupId: null,
        editable: false,
      });
      continue;
    }

    if (item.kind === "ingredient") {
      const variant = item.ingredientVariant;
      const mass = massForDraftItem(
        item.amount,
        item.unit,
        variant.densityGPerMl,
      );
      const path = [
        ...rootPath,
        ingredientPathNode(
          item.id,
          item.materialName,
          variant.supplierName,
          variant.modelOrSpecification,
        ),
      ];
      collection.leaves.push({
        occurrenceId: item.id,
        path,
        massGrams: safeDecimal(mass),
        nutrients: Object.fromEntries(
          variant.nutrition.values.map((value) => [
            value.nutrientDefinitionId,
            value.value,
          ]),
        ),
        pricePerKg: currentPricePerKg(variant),
        source: variant.source,
        densityGPerMl: variant.densityGPerMl,
        conversionBlocked:
          variant.nutrition.basis === "per_100ml" &&
          variant.densityGPerMl === null,
        ingredientVariantId: variant.id,
        materialGroupId: variant.materialGroupId,
        editable: true,
      });
      if (
        variant.densityGPerMl === null &&
        (variant.nutrition.basis === "per_100ml" ||
          item.unit === "mL" ||
          item.unit === "L")
      ) {
        collection.entries.push(
          leafGap({
            id: `density:${item.id}`,
            category: "density",
            fieldId: "densityGPerMl",
            fieldName: "密度",
            reason: "缺少密度，无法完成体积与质量换算",
            path,
            massGrams: mass,
            variant,
            editable: true,
          }),
        );
      }
      continue;
    }

    const mass = safeDecimal(massForDraftItem(item.amount, item.unit, null));
    const child = versionById.get(item.recipeVersionId);
    const referencePath = [
      ...rootPath,
      {
        id: item.id,
        kind: "version" as const,
        label: `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`,
      },
    ];
    if (child === undefined) {
      collection.entries.push(
        versionGap(item.id, referencePath, "下级版本无法读取"),
      );
      continue;
    }
    const outputMass = safeDecimal(recipeVersionOutputMass(child.snapshot));
    if (mass === null || outputMass === null || !outputMass.gt(0)) {
      collection.entries.push(
        versionGap(item.id, referencePath, "下级版本缺少有效产出重量"),
      );
      continue;
    }
    collectVersionLeaves(
      child,
      versionById,
      mass.div(outputMass),
      referencePath,
      [],
      collection,
    );
  }

  return reportFromCollection(
    input.recipeName,
    input.calculation,
    input.nutrientDefinitions,
    collection,
  );
}

export function buildVersionDataGapReport(input: {
  rootVersion: RecipeVersion;
  referencedVersions: RecipeVersion[];
}): DataGapReport {
  const versionById = new Map(
    [input.rootVersion, ...input.referencedVersions].map((version) => [
      version.id,
      version,
    ]),
  );
  const collection: CollectionResult = { leaves: [], entries: [] };
  const rootPath: SourcePathNode[] = [
    {
      id: input.rootVersion.id,
      kind: "version",
      label: `${input.rootVersion.snapshot.recipe.name} V${input.rootVersion.versionNumber}`,
    },
  ];
  collectVersionLeaves(
    input.rootVersion,
    versionById,
    new Decimal(1),
    rootPath,
    [],
    collection,
  );
  const definitions = input.rootVersion.snapshot.calculation.nutrients
    .filter(
      (nutrient) => (nutrient.category ?? "nutrition") === "nutrition",
    )
    .map((nutrient, index) => ({
        id: nutrient.nutrientDefinitionId,
        code: nutrient.nutrientDefinitionId,
        name: nutrient.name,
        unit: nutrient.unit,
        builtIn: true,
        sortOrder: index,
        category: "nutrition",
        archivedAt: null,
      }) satisfies NutrientDefinition,
    );
  return reportFromCollection(
    `${input.rootVersion.snapshot.recipe.name} V${input.rootVersion.versionNumber}`,
    input.rootVersion.snapshot.calculation,
    definitions,
    collection,
  );
}

export function buildVariantDataGapReport(
  materialName: string,
  variant: IngredientVariant,
  definitions: NutrientDefinition[],
): DataGapReport {
  const detail = createVariantNutritionDetail(
    materialName,
    variant,
    definitions,
  );
  const path = [
    ingredientPathNode(
      variant.id,
      materialName,
      variant.supplierName,
      variant.modelOrSpecification,
    ),
  ];
  const entries: DataGapEntry[] = [];
  for (const missing of variant.completeness.missingFields) {
    const definition = definitions.find((item) => item.name === missing);
    const category: DataGapCategory =
      missing === "当前含税价"
        ? "cost"
        : missing === "密度"
          ? "density"
          : missing === "数据来源"
            ? "source"
            : "nutrition";
    entries.push({
      id: `${variant.id}:${definition?.id ?? missing}`,
      category,
      state: category === "source" ? "needs_verification" : "missing",
      fieldId: definition?.id ?? null,
      fieldName: missing,
      reason:
        category === "source"
          ? "已有数据未记录来源，需核实其依据"
          : `${missing}尚未录入`,
      path,
      massGrams: null,
      ingredientVariantId: variant.id,
      materialGroupId: variant.materialGroupId,
      editable: true,
    });
  }
  return {
    title: detail.title,
    completenessPercent: variant.completeness.percent,
    entries,
    nutrientCoverage: [],
  };
}

export function buildCalculationDataGapReport(
  title: string,
  calculation: RecipeCalculation,
  itemNames: ReadonlyMap<string, string>,
): DataGapReport {
  const entries: DataGapEntry[] = [];
  const root: SourcePathNode = { id: title, kind: "recipe", label: title };
  for (const nutrient of calculation.nutrients) {
    for (const itemId of nutrient.missingItemIds) {
      entries.push({
        id: `nutrition:${nutrient.nutrientDefinitionId}:${itemId}`,
        category: "nutrition",
        state: "missing",
        fieldId: nutrient.nutrientDefinitionId,
        fieldName: nutrient.name,
        reason: `${nutrient.name}尚未录入`,
        path: [
          root,
          {
            id: itemId,
            kind: "ingredient",
            label: itemNames.get(itemId) ?? "未识别原料",
          },
        ],
        massGrams: null,
        ingredientVariantId: null,
        materialGroupId: null,
        editable: false,
      });
    }
  }
  for (const itemId of calculation.cost.missingItemIds) {
    entries.push({
      id: `cost:${itemId}`,
      category: "cost",
      state: "missing",
      fieldId: "pricePerKg",
      fieldName: "当前含税价",
      reason: "缺少可用价格，成本结果仅为部分估算",
      path: [
        root,
        {
          id: itemId,
          kind: "ingredient",
          label: itemNames.get(itemId) ?? "未识别原料",
        },
      ],
      massGrams: null,
      ingredientVariantId: null,
      materialGroupId: null,
      editable: false,
    });
  }
  return {
    title,
    completenessPercent: calculation.completeness.percent,
    entries,
    nutrientCoverage: calculation.nutrients.map((nutrient) => ({
      nutrientDefinitionId: nutrient.nutrientDefinitionId,
      name: nutrient.name,
      unit: nutrient.unit,
      category: "nutrition",
      status: nutrient.status,
      ratio: ratioNumber(nutrient.completenessRatio),
      knownMassGrams: null,
      trackedMassGrams: null,
    })),
  };
}

export function createVariantNutritionDetail(
  materialName: string,
  variant: IngredientVariant,
  definitions: NutrientDefinition[],
): NutritionDetail {
  const values = new Map(
    variant.nutrition.values.map((value) => [
      value.nutrientDefinitionId,
      value.value,
    ]),
  );
  const visible = definitions
    .filter(
      (definition) =>
        definition.category === "nutrition" &&
        (definition.builtIn || values.has(definition.id)),
    )
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
  return {
    title: materialName,
    subtitle: [variant.supplierName, variant.modelOrSpecification]
      .filter(Boolean)
      .join(" · "),
    basisLabel:
      variant.nutrition.basis === "per_100ml" ? "每 100 mL" : "每 100 g",
    sourceLabel: variant.source.trim() || "未记录（来源待核实）",
    updatedAt: variant.updatedAt,
    completenessPercent: variant.completeness.percent,
    rows: visible.map((definition) => {
      const value = values.get(definition.id) ?? null;
      return {
        nutrientDefinitionId: definition.id,
        name: definition.name,
        unit: definition.unit,
        value,
        category: "nutrition",
        status: value === null ? "unknown" : isZero(value) ? "confirmed_zero" : "known",
        completenessRatio: value === null ? 0 : 1,
      };
    }),
    note:
      variant.source.trim() === ""
        ? "已有数值仍参与当前计算，但由于未记录数据来源，需要进一步核实。"
        : null,
  };
}

export function createVersionNutritionDetail(
  version: RecipeVersion,
): NutritionDetail {
  return {
    title: version.snapshot.recipe.name,
    subtitle: `半成品正式版本 V${version.versionNumber}`,
    basisLabel: "每 100 g",
    sourceLabel: "正式版本冻结快照",
    updatedAt: version.createdAt,
    completenessPercent: version.snapshot.calculation.completeness.percent,
    rows: version.snapshot.calculation.nutrients
      .filter(
        (nutrient) => (nutrient.category ?? "nutrition") === "nutrition",
      )
      .map((nutrient) => ({
        nutrientDefinitionId: nutrient.nutrientDefinitionId,
        name: nutrient.name,
        unit: nutrient.unit,
        value:
          nutrient.status === "unknown" ? null : nutrient.per100gKnownAmount,
        category: "nutrition",
        status:
          nutrient.status === "unknown"
            ? "unknown"
            : nutrient.status === "partial"
              ? "partial"
              : isZero(nutrient.per100gKnownAmount)
                ? "confirmed_zero"
                : "known",
        completenessRatio: ratioNumber(nutrient.completenessRatio),
      })),
    note: "该信息来自绑定的正式版本；原料库后续修改不会回写本快照。",
  };
}

export function createSnapshotIngredientNutritionDetail(
  ingredient: RecipeIngredientSnapshot,
  nutrientNames: Map<string, { name: string; category: "nutrition" }>,
  versionCreatedAt: string,
): NutritionDetail {
  return {
    title: ingredient.materialName || "未知原料",
    subtitle: [ingredient.supplierName || "供应商未记录", ingredient.modelOrSpecification]
      .filter(Boolean)
      .join(" · "),
    basisLabel: "每 100 g",
    sourceLabel: ingredient.source.trim() || "未记录（来源待核实）",
    updatedAt: ingredient.ingredientUpdatedAt || versionCreatedAt,
    completenessPercent: null,
    rows: Object.entries(ingredient.nutrientsPer100g)
      .filter(([id]) => nutrientNames.has(id))
      .map(([id, value]) => ({
        nutrientDefinitionId: id,
        name: nutrientNames.get(id)?.name ?? id,
        unit: ingredient.nutrientUnits[id] ?? "",
        value,
        category: "nutrition",
        status:
          value === null
            ? "unknown"
            : isZero(value)
              ? "confirmed_zero"
              : "known",
        completenessRatio: value === null ? 0 : 1,
      })),
    note: "该信息来自历史正式版本快照，仅用于查看。",
  };
}

function collectVersionLeaves(
  version: RecipeVersion,
  versionById: Map<string, RecipeVersion>,
  scale: Decimal,
  path: SourcePathNode[],
  ancestors: string[],
  result: CollectionResult,
) {
  if (ancestors.includes(version.id)) {
    result.entries.push(versionGap(`cycle:${version.id}`, path, "检测到配方循环引用"));
    return;
  }
  const nextAncestors = [...ancestors, version.id];
  for (const item of version.snapshot.items) {
    const itemMass = safeDecimal(item.massGrams)?.mul(scale) ?? null;
    if (item.kind === "ingredient") {
      const ingredient = item.ingredient;
      const leafPath = [
        ...path,
        ingredientPathNode(
          item.id,
          ingredient.materialName || "未知原料",
          ingredient.supplierName || "供应商未记录",
          ingredient.modelOrSpecification,
        ),
      ];
      result.leaves.push({
        occurrenceId: `${path.map((node) => node.id).join("/")}/${item.id}`,
        path: leafPath,
        massGrams: itemMass,
        nutrients: ingredient.nutrientsPer100g,
        pricePerKg: ingredient.pricePerKg,
        source: ingredient.source,
        densityGPerMl: ingredient.densityGPerMl,
        conversionBlocked: false,
        ingredientVariantId: ingredient.ingredientVariantId,
        materialGroupId: ingredient.materialGroupId,
        editable: false,
      });
      continue;
    }
    const child = versionById.get(item.recipeVersion.id);
    const childPath = [
      ...path,
      {
        id: item.id,
        kind: "version" as const,
        label: `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`,
      },
    ];
    if (child === undefined) {
      result.entries.push(versionGap(item.id, childPath, "下级版本无法读取"));
      continue;
    }
    const outputMass = safeDecimal(recipeVersionOutputMass(child.snapshot));
    if (itemMass === null || outputMass === null || !outputMass.gt(0)) {
      result.entries.push(
        versionGap(item.id, childPath, "下级版本缺少有效产出重量"),
      );
      continue;
    }
    collectVersionLeaves(
      child,
      versionById,
      itemMass.div(outputMass),
      childPath,
      nextAncestors,
      result,
    );
  }
}

function reportFromCollection(
  title: string,
  calculation: RecipeCalculation | null,
  definitions: NutrientDefinition[],
  collection: CollectionResult,
): DataGapReport {
  const definitionById = new Map(definitions.map((item) => [item.id, item]));
  const entries = [...collection.entries];

  for (const leaf of collection.leaves) {
    if (leaf.pricePerKg === null) {
      entries.push({
        id: `price:${leaf.occurrenceId}`,
        category: "cost",
        state: "missing",
        fieldId: "pricePerKg",
        fieldName: "当前含税价",
        reason: "缺少可用价格，成本结果仅为部分估算",
        path: leaf.path,
        massGrams: decimalOrNull(leaf.massGrams),
        ingredientVariantId: leaf.ingredientVariantId,
        materialGroupId: leaf.materialGroupId,
        editable: leaf.editable,
      });
    }
    if (leaf.source.trim() === "") {
      entries.push({
        id: `source:${leaf.occurrenceId}`,
        category: "source",
        state: "needs_verification",
        fieldId: "source",
        fieldName: "数据来源",
        reason: "已有数据未记录来源，需核实其依据",
        path: leaf.path,
        massGrams: decimalOrNull(leaf.massGrams),
        ingredientVariantId: leaf.ingredientVariantId,
        materialGroupId: leaf.materialGroupId,
        editable: leaf.editable,
      });
    }
  }

  const coverage = (calculation?.nutrients ?? [])
    .filter((nutrient) => {
      const definition = definitionById.get(nutrient.nutrientDefinitionId);
      return definition !== undefined;
    })
    .map((nutrient) => {
      const trackedMass = collection.leaves.reduce(
        (sum, leaf) =>
          leaf.massGrams === null ? sum : sum.add(leaf.massGrams),
        new Decimal(0),
      );
      const ratio = ratioNumber(nutrient.completenessRatio);
      if (nutrient.status !== "complete") {
        for (const leaf of collection.leaves) {
          const hasField = Object.hasOwn(
            leaf.nutrients,
            nutrient.nutrientDefinitionId,
          );
          const missing =
            leaf.conversionBlocked ||
            !hasField ||
            leaf.nutrients[nutrient.nutrientDefinitionId] == null;
          if (!missing) continue;
          entries.push({
            id: `${nutrient.nutrientDefinitionId}:${leaf.occurrenceId}`,
            category: "nutrition",
            state: "missing",
            fieldId: nutrient.nutrientDefinitionId,
            fieldName: nutrient.name,
            reason: leaf.conversionBlocked
              ? "原料按每100mL记录且缺少密度，无法换算"
              : `${nutrient.name}尚未录入`,
            path: leaf.path,
            massGrams: decimalOrNull(leaf.massGrams),
            ingredientVariantId: leaf.ingredientVariantId,
            materialGroupId: leaf.materialGroupId,
            editable: leaf.editable,
          });
        }
      }
      return {
        nutrientDefinitionId: nutrient.nutrientDefinitionId,
        name: nutrient.name,
        unit: nutrient.unit,
        category: "nutrition",
        status: nutrient.status,
        ratio,
        knownMassGrams:
          trackedMass.gt(0) ? decimalOrNull(trackedMass.mul(ratio)) : null,
        trackedMassGrams: trackedMass.gt(0) ? decimalOrNull(trackedMass) : null,
      } satisfies NutrientCoverage;
    });

  return {
    title,
    completenessPercent: calculation?.completeness.percent ?? null,
    entries,
    nutrientCoverage: coverage,
  };
}

function ingredientPathNode(
  id: string,
  materialName: string,
  supplierName: string,
  specification: string,
): SourcePathNode {
  return {
    id,
    kind: "ingredient",
    label: `${materialName}（${[supplierName, specification].filter(Boolean).join(" · ") || "供应商/规格未记录"}）`,
  };
}

function versionGap(
  id: string,
  path: SourcePathNode[],
  reason: string,
): DataGapEntry {
  return {
    id: `version:${id}:${path.map((node) => node.id).join("/")}`,
    category: "version",
    state: "missing",
    fieldId: null,
    fieldName: "下级版本",
    reason,
    path,
    massGrams: null,
    ingredientVariantId: null,
    materialGroupId: null,
    editable: false,
  };
}

function leafGap(input: {
  id: string;
  category: DataGapCategory;
  fieldId: string;
  fieldName: string;
  reason: string;
  path: SourcePathNode[];
  massGrams: string | null;
  variant: IngredientVariant;
  editable: boolean;
}): DataGapEntry {
  return {
    id: input.id,
    category: input.category,
    state: "missing",
    fieldId: input.fieldId,
    fieldName: input.fieldName,
    reason: input.reason,
    path: input.path,
    massGrams: input.massGrams,
    ingredientVariantId: input.variant.id,
    materialGroupId: input.variant.materialGroupId,
    editable: input.editable,
  };
}

function massForDraftItem(
  amount: string,
  unit: "mg" | "g" | "kg" | "mL" | "L",
  densityGPerMl: string | null,
) {
  const result = toGrams(
    { value: amount, unit },
    densityGPerMl ?? undefined,
  );
  return result.ok ? result.value : null;
}

function currentPricePerKg(variant: IngredientVariant) {
  const price = safeDecimal(variant.currentPrice);
  if (price === null) return null;
  if (variant.priceUnit === "kg") return decimalOrNull(price);
  if (variant.priceUnit === "g") return decimalOrNull(price.mul(1000));
  const density = safeDecimal(variant.densityGPerMl);
  if (density === null || !density.gt(0)) return null;
  return variant.priceUnit === "L"
    ? decimalOrNull(price.div(density))
    : decimalOrNull(price.mul(1000).div(density));
}

function safeDecimal(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function decimalOrNull(value: Decimal | null) {
  return value?.toDecimalPlaces(8).toString() ?? null;
}

function ratioNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function isZero(value: string) {
  try {
    return new Decimal(value).isZero();
  } catch {
    return false;
  }
}
