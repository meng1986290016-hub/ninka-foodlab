import type {
  EntityId,
  IngredientSourceAttachment,
  IngredientVariant,
  NutrientDefinitionCategory,
  NutritionBasis,
  PriceUnit,
} from "./types";

export type IngredientImportJobStatus =
  | "pending"
  | "extracting"
  | "recognizing"
  | "grouping"
  | "drafts_ready"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type IngredientImportDraftStatus =
  | "needs_review"
  | "ready"
  | "imported"
  | "discarded"
  | "failed";

export type ImportIssueSeverity = "warning" | "error";

export interface ImportIssue {
  code:
    | "missing_required"
    | "invalid_decimal"
    | "invalid_unit"
    | "invalid_basis"
    | "duplicate_variant"
    | "source_conflict"
    | "unsupported_file"
    | "damaged_file"
    | "password_protected";
  severity: ImportIssueSeverity;
  message: string;
  fieldPath: string | null;
  sourceName: string | null;
  row: number | null;
  column: string | null;
}

export interface ImportFileReference {
  kind: "native_path" | "browser_demo";
  value: string;
  mediaType?: string;
}

export type SourceAttachment = IngredientSourceAttachment;

export type ImportFieldConfidence = "high" | "medium" | "low";

export interface DraftSourceLink {
  fieldPath: string;
  attachmentId: EntityId;
  sourceLocator: string | null;
  confidence: ImportFieldConfidence | null;
}

export interface ImportedNutrientValue {
  definitionId: EntityId | null;
  name: string;
  unit: string;
  value: string | null;
  category?: NutrientDefinitionCategory | null;
}

export interface ReviewedIngredientImportDraft {
  materialGroupId: EntityId | null;
  materialName: string;
  categoryId: EntityId | null;
  categoryName: string | null;
  supplierId: EntityId | null;
  supplierName: string;
  modelOrSpecification: string;
  currentPrice: string | null;
  priceUnit: PriceUnit | null;
  densityGPerMl: string | null;
  nutritionBasis: NutritionBasis | null;
  nutrients: ImportedNutrientValue[];
  containsAllergens: string[];
  mayContainAllergens: string[];
  source: string;
  researchNotes: string;
  duplicateConfirmed: boolean;
}

export interface IngredientImportDraft {
  id: EntityId;
  jobId: EntityId;
  position: number;
  status: IngredientImportDraftStatus;
  review: ReviewedIngredientImportDraft;
  issues: ImportIssue[];
  attachments: SourceAttachment[];
  sourceLinks: DraftSourceLink[];
  importedVariantId: EntityId | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientImportJobRequest {
  files: ImportFileReference[];
  sourceKind: "spreadsheet" | "documents" | "agent";
}

export interface IngredientImportJob {
  id: EntityId;
  sourceKind: IngredientImportJobRequest["sourceKind"];
  status: IngredientImportJobStatus;
  progressCurrent: number;
  progressTotal: number;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientImportCommitResult {
  jobId: EntityId;
  variants: IngredientVariant[];
  attachmentCount: number;
}

export type IngredientExchangeFormat = "csv" | "xlsx";
