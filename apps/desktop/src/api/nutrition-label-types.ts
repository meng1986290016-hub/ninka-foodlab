import type {
  NutritionLabelBasis,
  NutritionLabelCalculation,
  NutritionLabelCalculationInput,
  NutritionLabelRulePackId,
  NutritionLabelSnapshot,
  NutritionLabelSourceValue,
} from "@food-rd/core";

import type { EntityId } from "./types";

export type {
  NutritionLabelBasis,
  NutritionLabelCalculation,
  NutritionLabelRulePackId,
  NutritionLabelSnapshot,
  NutritionLabelSourceValue,
};

export interface NutritionLabelInput {
  recipeId: EntityId;
  name: string;
}

export interface NutritionLabel {
  id: EntityId;
  recipeId: EntityId;
  name: string;
  currentDraftId: EntityId | null;
  latestVersionNumber: number | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface NutritionLabelDraftSaveInput
  extends NutritionLabelCalculationInput {
  labelId: EntityId;
  recipeVersionId: EntityId;
}

export interface NutritionLabelDraft
  extends NutritionLabelDraftSaveInput {
  id: EntityId;
  calculation: NutritionLabelCalculation;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionLabelVersion {
  id: EntityId;
  labelId: EntityId;
  versionNumber: number;
  sourceDraftId: EntityId;
  recipeVersionId: EntityId;
  rulePackId: NutritionLabelRulePackId;
  rulePackRevision: string;
  snapshot: NutritionLabelSnapshot;
  createdAt: string;
}
