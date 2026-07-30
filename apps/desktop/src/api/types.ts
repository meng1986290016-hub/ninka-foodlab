export type EntityId = string;
export type PriceUnit = "kg" | "g" | "L" | "mL";
export type NutritionBasis = "per_100g" | "per_100ml";

export interface Category {
  id: EntityId;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Supplier {
  id: EntityId;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface NutrientDefinition {
  id: EntityId;
  code: string;
  name: string;
  unit: string;
  builtIn: boolean;
  sortOrder: number;
}

export interface VariantNutritionValue {
  nutrientDefinitionId: EntityId;
  value: string | null;
}

export interface VariantNutrition {
  basis: NutritionBasis;
  values: VariantNutritionValue[];
}

export interface DataCompleteness {
  percent: number;
  missingFields: string[];
}

export interface IngredientVariantAllergens {
  contains: string[];
  mayContain: string[];
}

export interface IngredientSourceAttachment {
  id: EntityId;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface IngredientVariant {
  id: EntityId;
  materialGroupId: EntityId;
  supplierId: EntityId;
  supplierName: string;
  modelOrSpecification: string;
  internalCode: string | null;
  currentPrice: string | null;
  priceUnit: PriceUnit;
  densityGPerMl: string | null;
  source: string;
  researchNotes: string;
  nutrition: VariantNutrition;
  allergens: IngredientVariantAllergens;
  sourceAttachments: IngredientSourceAttachment[];
  completeness: DataCompleteness;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MaterialGroup {
  id: EntityId;
  name: string;
  categoryId: EntityId | null;
  categoryName: string | null;
  variants: IngredientVariant[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MaterialGroupInput {
  name: string;
  categoryId: EntityId | null;
}

export interface IngredientVariantInput {
  id?: EntityId;
  materialGroupId: EntityId;
  supplierId: EntityId;
  modelOrSpecification: string;
  internalCode: string | null;
  currentPrice: string | null;
  priceUnit: PriceUnit;
  densityGPerMl: string | null;
  source: string;
  researchNotes: string;
  nutrition: VariantNutrition;
  allergens?: IngredientVariantAllergens;
  duplicateConfirmed?: boolean;
}

export interface VariantComparisonRow {
  key: string;
  label: string;
  unit: string | null;
  values: Record<EntityId, string | null>;
}

export interface VariantComparison {
  materialGroupId: EntityId;
  variants: IngredientVariant[];
  rows: VariantComparisonRow[];
}

/**
 * Temporary schema-v1 compatibility types. They remain until the ingredient
 * library switches to grouped supplier variants in Task 4–6.
 */
export interface IngredientInput {
  name: string;
  internalCode: string;
  category: string;
  tags: string[];
  notes: string;
  densityGPerMl: string | null;
  currentPrice: string;
  priceUnit: PriceUnit;
  priceUpdatedAt: string;
  source: string;
  sourceDate: string;
}

export interface Ingredient extends IngredientInput {
  id: string;
  completeness: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface IngredientListRequest {
  query?: string;
}

export interface DraftRecord<T = unknown> {
  kind: string;
  key: string;
  payloadVersion: number;
  payload: T;
  updatedAt: string;
}

export interface DatabaseStatus {
  mode: "sqlite" | "browser-demo";
  schemaVersion: number;
  healthy: boolean;
}

export type DesktopErrorCode =
  | "invalid_input"
  | "invalid_decimal"
  | "not_found"
  | "duplicate_code"
  | "duplicate_name"
  | "duplicate_variant"
  | "reference_conflict"
  | "conversion_unavailable"
  | "import_failure"
  | "attachment_failure"
  | "unsupported_file"
  | "invalid_state"
  | "provider_not_configured"
  | "provider_failure"
  | "invalid_model_output"
  | "tool_denied"
  | "cancelled"
  | "storage_failure"
  | "unknown";

export class DesktopApiError extends Error {
  constructor(
    readonly code: DesktopErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}
