import type {
  NutritionLabelRowSourceKind,
  NutritionLabelRulePackId,
} from "./nutrition-label.js";

export const RESEARCH_REPORT_SCHEMA_VERSION = 1 as const;

export type ResearchReportRecipeKind = "formula" | "semi_finished";
export type ResearchReportIngredientKind =
  | "ingredient"
  | "recipe_version";
export type ResearchReportCostStatus =
  | "complete"
  | "partial"
  | "unknown";
export type ResearchReportTargetStatus =
  | "met"
  | "below"
  | "above"
  | "unknown";

export interface ResearchReportRecipe {
  id: string;
  name: string;
  code: string | null;
  kind: ResearchReportRecipeKind;
  versionId: string;
  versionNumber: number;
  versionCreatedAt: string;
  targetBatchGrams: string;
  finishedMassGrams: string | null;
  yieldPercent: string | null;
  completenessPercent: number;
}

export interface ResearchReportIngredient {
  id: string;
  position: number;
  kind: ResearchReportIngredientKind;
  name: string;
  supplierName: string | null;
  specification: string | null;
  referencedVersion: string | null;
  amount: string;
  unit: string;
  massGrams: string;
  percent: string;
  cost: string | null;
}

export interface ResearchReportNutritionRowInput {
  nutrientCode: string;
  name: string;
  declaredValue: string | null;
  unit: string;
  nrvPercent: string | null;
  sourceKind: NutritionLabelRowSourceKind;
  sourceReference: string | null;
}

export interface ResearchReportNutritionRow
  extends ResearchReportNutritionRowInput {
  sourceLabel: "配方估算" | "检测值" | "人工确认";
}

export interface ResearchReportNutritionInput {
  labelVersionId: string;
  labelVersionNumber: number;
  standardCode: string;
  rulePackId: NutritionLabelRulePackId;
  rulePackRevision: string;
  officialSourceUrl: string;
  basisLabel: string;
  requiredNotice: string | null;
  rows: ResearchReportNutritionRowInput[];
}

export interface ResearchReportNutrition
  extends Omit<ResearchReportNutritionInput, "rows"> {
  rows: ResearchReportNutritionRow[];
}

export interface ResearchReportCost {
  rawMaterialTotal: string | null;
  packagingTotal: string | null;
  additionalTotal: string | null;
  batchTotal: string | null;
  perKg: string | null;
  per100g: string | null;
  perServing: string | null;
  perPackage: string | null;
  status: ResearchReportCostStatus;
}

export interface ResearchReportTarget {
  id: string;
  label: string;
  criterion: string;
  actual: string | null;
  status: ResearchReportTargetStatus;
}

export interface ResearchReportAllergens {
  contains: string[];
  mayContain: string[];
}

export interface ResearchReportProvenance {
  recipeVersionId: string;
  nutritionLabelVersionId: string;
  generatedBy: string;
}

export interface ResearchReportDocumentInput {
  id: string;
  title: string;
  generatedAt: string;
  recipe: ResearchReportRecipe;
  ingredients: ResearchReportIngredient[];
  nutrition: ResearchReportNutritionInput;
  cost: ResearchReportCost;
  targets: ResearchReportTarget[];
  allergens: ResearchReportAllergens;
  notes: string;
  provenance: ResearchReportProvenance;
}

export interface ResearchReportDocument
  extends Omit<ResearchReportDocumentInput, "nutrition"> {
  schemaVersion: typeof RESEARCH_REPORT_SCHEMA_VERSION;
  nutrition: ResearchReportNutrition;
}

export function createResearchReportDocument(
  input: ResearchReportDocumentInput,
): Readonly<ResearchReportDocument> {
  assertRequiredText(input.id, "报告 ID");
  assertRequiredText(input.title, "报告标题");
  assertRequiredText(input.recipe.id, "配方 ID");
  assertRequiredText(input.recipe.versionId, "配方版本 ID");
  assertRequiredText(
    input.nutrition.labelVersionId,
    "营养标签版本 ID",
  );
  assertRequiredText(input.nutrition.rulePackRevision, "规则包修订号");
  assertIsoTimestamp(input.generatedAt, "报告生成时间");

  if (!Number.isInteger(input.recipe.versionNumber) || input.recipe.versionNumber < 1) {
    throw new Error("配方版本号必须是正整数");
  }
  if (
    !Number.isInteger(input.nutrition.labelVersionNumber) ||
    input.nutrition.labelVersionNumber < 1
  ) {
    throw new Error("营养标签版本号必须是正整数");
  }

  const document: ResearchReportDocument = {
    schemaVersion: RESEARCH_REPORT_SCHEMA_VERSION,
    id: input.id,
    title: input.title,
    generatedAt: input.generatedAt,
    recipe: { ...input.recipe },
    ingredients: [...input.ingredients]
      .sort((left, right) => left.position - right.position)
      .map((ingredient) => ({ ...ingredient })),
    nutrition: {
      ...input.nutrition,
      rows: input.nutrition.rows.map((row) => ({
        ...row,
        sourceLabel: sourceLabel(row.sourceKind),
      })),
    },
    cost: { ...input.cost },
    targets: input.targets.map((target) => ({ ...target })),
    allergens: {
      contains: [...input.allergens.contains],
      mayContain: [...input.allergens.mayContain],
    },
    notes: input.notes,
    provenance: { ...input.provenance },
  };
  return deepFreeze(document);
}

export function researchReportSourceLabel(
  sourceKind: NutritionLabelRowSourceKind,
) {
  return sourceLabel(sourceKind);
}

function sourceLabel(
  sourceKind: NutritionLabelRowSourceKind,
): ResearchReportNutritionRow["sourceLabel"] {
  if (sourceKind === "lab_result") return "检测值";
  if (sourceKind === "manual_confirmation") return "人工确认";
  return "配方估算";
}

function assertRequiredText(value: string, field: string) {
  if (value.trim() === "") throw new Error(`${field}不能为空`);
}

function assertIsoTimestamp(value: string, field: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field}必须是有效的 ISO 时间`);
  }
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
