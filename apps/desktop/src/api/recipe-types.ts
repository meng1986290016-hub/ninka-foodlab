import type {
  DataCompleteness,
  EntityId,
  IngredientVariant,
} from "./types";

export type RecipeDecimal = string;
export type RecipeKind = "formula" | "semi_finished";
export type RecipeItemUnit = "mg" | "g" | "kg" | "mL" | "L";
export type RecipeDraftSource = "manual" | "agent";

export interface Recipe {
  id: EntityId;
  name: string;
  code: string | null;
  tags: string[];
  kind: RecipeKind;
  currentDraftId: EntityId | null;
  latestVersionNumber: number | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface RecipeInput {
  name: string;
  code: string | null;
  tags: string[];
  kind: RecipeKind;
}

export interface RecipeVersionReference {
  id: EntityId;
  recipeId: EntityId;
  recipeName: string;
  versionNumber: number;
  outputMassGrams: RecipeDecimal;
  createdAt: string;
}

interface RecipeDraftItemBase {
  id: EntityId;
  position: number;
  amount: RecipeDecimal;
  unit: RecipeItemUnit;
  locked: boolean;
  autoFill: boolean;
}

export interface RecipeDraftIngredientItem extends RecipeDraftItemBase {
  kind: "ingredient";
  ingredientVariantId: EntityId;
  materialName: string;
  ingredientVariant: IngredientVariant;
}

export interface RecipeDraftVersionItem extends RecipeDraftItemBase {
  kind: "recipe_version";
  recipeVersionId: EntityId;
  recipeVersion: RecipeVersionReference;
}

export type RecipeDraftItem =
  | RecipeDraftIngredientItem
  | RecipeDraftVersionItem;

interface RecipeDraftItemInputBase {
  id: EntityId;
  position: number;
  amount: RecipeDecimal;
  unit: RecipeItemUnit;
  locked: boolean;
  autoFill: boolean;
}

export interface RecipeDraftIngredientItemInput
  extends RecipeDraftItemInputBase {
  kind: "ingredient";
  ingredientVariantId: EntityId;
}

export interface RecipeDraftVersionItemInput extends RecipeDraftItemInputBase {
  kind: "recipe_version";
  recipeVersionId: EntityId;
}

export type RecipeDraftItemInput =
  | RecipeDraftIngredientItemInput
  | RecipeDraftVersionItemInput;

export interface RecipePackagingCost {
  id: EntityId;
  name: string;
  quantity: RecipeDecimal;
  unitCost: RecipeDecimal;
}

export interface RecipeAdditionalCost {
  id: EntityId;
  name: string;
  amount: RecipeDecimal;
}

export type RecipeTargetMetric =
  | {
      kind: "nutrition_per_100g";
      nutrientDefinitionId: EntityId;
      nutrientName: string;
      unit: string;
    }
  | {
      kind: "cost";
      basis:
        | "batch"
        | "per_kg"
        | "per_100g"
        | "per_serving"
        | "per_package";
      unit: "CNY";
    };

export interface RecipeTarget {
  id: EntityId;
  metric: RecipeTargetMetric;
  minimum: RecipeDecimal | null;
  maximum: RecipeDecimal | null;
}

export interface RecipeTargetEvaluation {
  targetId: EntityId;
  status: "met" | "below" | "above" | "unknown";
  observed: RecipeDecimal | null;
  deltaToMinimum: RecipeDecimal | null;
  deltaToMaximum: RecipeDecimal | null;
}

export interface RecipeDraftInput {
  recipeId: EntityId;
  basedOnVersionId: EntityId | null;
  source: RecipeDraftSource;
  targetBatchGrams: RecipeDecimal;
  finishedMassGrams: RecipeDecimal | null;
  servingMassGrams: RecipeDecimal | null;
  packageCount: RecipeDecimal | null;
  items: RecipeDraftItemInput[];
  packagingCosts: RecipePackagingCost[];
  additionalCosts: RecipeAdditionalCost[];
  targets: RecipeTarget[];
  markdownNotes: string;
}

export interface RecipeDraftSaveInput extends RecipeDraftInput {
  calculation: RecipeCalculation | null;
  calculationIssues: RecipeCalculationIssue[];
}

export interface RecipeDraft
  extends Omit<RecipeDraftSaveInput, "items"> {
  id: EntityId;
  items: RecipeDraftItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeNutrientEstimate {
  nutrientDefinitionId: EntityId;
  name: string;
  unit: string;
  totalKnownAmount: RecipeDecimal;
  per100gKnownAmount: RecipeDecimal;
  status: "complete" | "partial" | "unknown";
  completenessRatio: RecipeDecimal;
  missingItemIds: EntityId[];
}

export interface RecipeCostBreakdownItem {
  id: EntityId;
  name: string;
  category: "ingredient" | "packaging" | "additional";
  amount: RecipeDecimal;
}

export interface RecipeCostSummary {
  rawMaterialTotal: RecipeDecimal;
  packagingTotal: RecipeDecimal;
  additionalTotal: RecipeDecimal;
  batchTotal: RecipeDecimal;
  perKg: RecipeDecimal;
  per100g: RecipeDecimal;
  perServing: RecipeDecimal | null;
  perPackage: RecipeDecimal | null;
  status: "complete" | "partial";
  missingItemIds: EntityId[];
  breakdown: RecipeCostBreakdownItem[];
}

export interface RecipeAllergenSummary {
  contains: string[];
  mayContain: string[];
  sourceItemIds: Record<string, EntityId[]>;
}

export interface RecipeCalculationIssue {
  code:
    | "invalid_number"
    | "negative_value"
    | "non_positive_value"
    | "missing_density"
    | "invalid_unit"
    | "missing_price"
    | "target_conflict"
    | "duplicate_id"
    | "missing_recipe_version"
    | "recipe_cycle"
    | "missing_reference";
  severity: "warning" | "error";
  message: string;
  field: string | null;
  itemId: EntityId | null;
}

export interface RecipeCalculation {
  inputMassGrams: RecipeDecimal;
  basisMassGrams: RecipeDecimal;
  basis: "input_mass" | "finished_mass";
  yieldPercent: RecipeDecimal | null;
  nutrients: RecipeNutrientEstimate[];
  cost: RecipeCostSummary;
  targets: RecipeTargetEvaluation[];
  allergens: RecipeAllergenSummary;
  completeness: DataCompleteness;
  calculatedAt: string;
}

export interface RecipeIngredientSnapshot {
  ingredientVariantId: EntityId;
  materialGroupId: EntityId;
  materialName: string;
  supplierId: EntityId;
  supplierName: string;
  modelOrSpecification: string;
  densityGPerMl: RecipeDecimal | null;
  nutrientsPer100g: Record<EntityId, RecipeDecimal | null>;
  nutrientUnits: Record<EntityId, string>;
  pricePerKg: RecipeDecimal | null;
  allergens: RecipeAllergenSummary;
  source: string;
  ingredientUpdatedAt: string;
}

interface RecipeVersionItemSnapshotBase {
  id: EntityId;
  position: number;
  amount: RecipeDecimal;
  unit: RecipeItemUnit;
  massGrams: RecipeDecimal;
  locked: boolean;
  autoFill: boolean;
}

export interface RecipeVersionIngredientItemSnapshot
  extends RecipeVersionItemSnapshotBase {
  kind: "ingredient";
  ingredient: RecipeIngredientSnapshot;
}

export interface RecipeVersionReferenceItemSnapshot
  extends RecipeVersionItemSnapshotBase {
  kind: "recipe_version";
  recipeVersion: RecipeVersionReference;
}

export type RecipeVersionItemSnapshot =
  | RecipeVersionIngredientItemSnapshot
  | RecipeVersionReferenceItemSnapshot;

export interface RecipeVersionSnapshot {
  schemaVersion: 1;
  recipe: {
    id: EntityId;
    name: string;
    code: string | null;
    tags: string[];
    kind: RecipeKind;
  };
  targetBatchGrams: RecipeDecimal;
  finishedMassGrams: RecipeDecimal | null;
  servingMassGrams: RecipeDecimal | null;
  packageCount: RecipeDecimal | null;
  items: RecipeVersionItemSnapshot[];
  packagingCosts: RecipePackagingCost[];
  additionalCosts: RecipeAdditionalCost[];
  targets: RecipeTarget[];
  markdownNotes: string;
  calculation: RecipeCalculation;
}

export interface RecipeVersion {
  id: EntityId;
  recipeId: EntityId;
  versionNumber: number;
  sourceDraftId: EntityId;
  basedOnVersionId: EntityId | null;
  snapshot: RecipeVersionSnapshot;
  createdAt: string;
}

export interface RecipeVersionCreateInput {
  recipeId: EntityId;
  sourceDraftId: EntityId;
  basedOnVersionId: EntityId | null;
  snapshot: RecipeVersionSnapshot;
  dependencyVersionIds: EntityId[];
}

export interface RecipeSummary {
  recipe: Recipe;
  draftUpdatedAt: string | null;
  latestVersion: RecipeVersionReference | null;
  referencedByCount: number;
}

export type RecipeVersionItemChange =
  | {
      kind: "added" | "removed";
      itemKey: string;
      label: string;
      beforeAmountGrams: RecipeDecimal | null;
      afterAmountGrams: RecipeDecimal | null;
    }
  | {
      kind: "amount_changed" | "reference_changed";
      itemKey: string;
      label: string;
      beforeAmountGrams: RecipeDecimal;
      afterAmountGrams: RecipeDecimal;
    };

export interface RecipeVersionComparisonRow {
  key: string;
  label: string;
  unit: string | null;
  before: RecipeDecimal | string | null;
  after: RecipeDecimal | string | null;
}

export interface RecipeVersionComparison {
  before: RecipeVersionReference;
  after: RecipeVersionReference;
  itemChanges: RecipeVersionItemChange[];
  nutritionChanges: RecipeVersionComparisonRow[];
  costChanges: RecipeVersionComparisonRow[];
  targetChanges: RecipeVersionComparisonRow[];
  allergenChanges: RecipeVersionComparisonRow[];
  notesChanged: boolean;
}
