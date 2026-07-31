import type { DecimalString } from "./decimal.js";

export const NUTRITION_LABEL_CONTRACT_VERSION = 1 as const;

export const CHINA_NUTRITION_LABEL_RULE_PACK_IDS = [
  "gb-28050-2011",
  "gb-28050-2025",
] as const;

export type NutritionLabelRulePackId =
  (typeof CHINA_NUTRITION_LABEL_RULE_PACK_IDS)[number];

export function isNutritionLabelRulePackId(
  value: string,
): value is NutritionLabelRulePackId {
  return (CHINA_NUTRITION_LABEL_RULE_PACK_IDS as readonly string[]).includes(
    value,
  );
}

export const NUTRITION_LABEL_VALUE_SOURCE_KINDS = [
  "recipe_estimate",
  "lab_result",
  "manual_confirmation",
] as const;

export type NutritionLabelValueSourceKind =
  (typeof NUTRITION_LABEL_VALUE_SOURCE_KINDS)[number];

export type NutritionLabelBasisKind =
  | "per_100g"
  | "per_100ml"
  | "per_serving";

export interface NutritionLabelBasis {
  kind: NutritionLabelBasisKind;
  quantity: DecimalString;
  unit: "g" | "mL";
  servingDescription?: string | null;
}

export interface NutritionLabelRulePackReference {
  id: NutritionLabelRulePackId;
  revision: string;
  standardCode: "GB 28050-2011" | "GB 28050-2025";
  publishedOn: string;
  effectiveFrom: string;
  officialSourceUrl: string;
}

export interface NutritionLabelNutrientRule {
  nutrientCode: string;
  name: string;
  unit: string;
  order: number;
  required: boolean;
  nrv: DecimalString | null;
  roundingInterval: DecimalString;
  zeroThreshold: DecimalString;
}

export interface NutritionLabelRulePack
  extends NutritionLabelRulePackReference {
  name: string;
  supersedes: NutritionLabelRulePackId | null;
  mayEarlyAdopt: boolean;
  mandatoryNutrientCodes: readonly string[];
  nutrients: readonly NutritionLabelNutrientRule[];
  requiredNotice: string | null;
}

export interface NutritionLabelSourceValue {
  nutrientCode: string;
  value: DecimalString | null;
  unit: string;
  sourceKind: NutritionLabelValueSourceKind;
  sourceReference: string | null;
  observedAt: string | null;
  completeness?: "complete" | "partial" | "unknown";
}

export type NutritionLabelRowSourceKind =
  | NutritionLabelValueSourceKind
  | "derived_calculation";

export interface NutritionLabelRowSnapshot {
  nutrientCode: string;
  name: string;
  unit: string;
  rawValue: DecimalString | null;
  declaredValue: DecimalString | null;
  nrvPercent: DecimalString | null;
  sourceKind: NutritionLabelRowSourceKind;
  sourceReference: string | null;
}

export type NutritionLabelIssueSeverity = "warning" | "error";

export type NutritionLabelIssueCode =
  | "required_nutrient_unknown"
  | "unit_mismatch"
  | "invalid_value"
  | "incomplete_source"
  | "unsupported_basis"
  | "rule_pack_not_found"
  | "duplicate_nutrient"
  | "unsupported_nutrient";

export interface NutritionLabelIssue {
  code: NutritionLabelIssueCode;
  severity: NutritionLabelIssueSeverity;
  nutrientCode?: string;
  message: string;
}

export interface NutritionLabelDraftInput {
  labelId: string;
  recipeId: string;
  recipeVersionId: string;
  rulePackId: NutritionLabelRulePackId;
  basis: NutritionLabelBasis;
  sourceValues: NutritionLabelSourceValue[];
}

export type NutritionLabelRoundingMode = "half_up" | "half_even";

export interface NutritionLabelCalculationInput {
  rulePackId: NutritionLabelRulePackId;
  basis: NutritionLabelBasis;
  sourceValues: NutritionLabelSourceValue[];
  optionalNutrientCodes: string[];
  roundingMode: NutritionLabelRoundingMode;
}

export interface NutritionLabelCalculation {
  rulePack: NutritionLabelRulePackReference;
  basis: NutritionLabelBasis;
  roundingMode: NutritionLabelRoundingMode;
  rows: NutritionLabelRowSnapshot[];
  issues: NutritionLabelIssue[];
  publishable: boolean;
  requiredNotice: string | null;
}

export interface NutritionLabelSnapshot {
  schemaVersion: typeof NUTRITION_LABEL_CONTRACT_VERSION;
  id: string;
  labelId: string;
  labelVersionNumber: number;
  recipeId: string;
  recipeVersionId: string;
  rulePack: NutritionLabelRulePackReference;
  basis: NutritionLabelBasis;
  sourceValues: NutritionLabelSourceValue[];
  rows: NutritionLabelRowSnapshot[];
  issues: NutritionLabelIssue[];
  publishable: boolean;
  requiredNotice: string | null;
  generatedAt: string;
}
