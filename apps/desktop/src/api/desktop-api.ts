import type {
  IngredientExchangeFormat,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "./import-types";
import type {
  Category,
  DatabaseStatus,
  DraftRecord,
  Ingredient,
  IngredientInput,
  IngredientListRequest,
  IngredientVariant,
  IngredientVariantInput,
  MaterialGroup,
  MaterialGroupInput,
  NutrientDefinition,
  Supplier,
  VariantComparison,
} from "./types";

/** Remove after the grouped supplier UI fully replaces the v1 editor. */
export interface LegacyIngredientApi {
  listIngredients(request?: IngredientListRequest): Promise<Ingredient[]>;
  getIngredient(id: string): Promise<Ingredient>;
  createIngredient(input: IngredientInput): Promise<Ingredient>;
  updateIngredient(id: string, input: IngredientInput): Promise<Ingredient>;
  archiveIngredient(id: string): Promise<void>;
}

export interface DesktopApi extends LegacyIngredientApi {
  createIngredientImportJob(
    request: IngredientImportJobRequest,
  ): Promise<IngredientImportJob>;
  getIngredientImportJob(id: string): Promise<IngredientImportJob>;
  listIngredientImportDrafts(jobId: string): Promise<IngredientImportDraft[]>;
  updateIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ): Promise<IngredientImportDraft>;
  discardIngredientImportDraft(id: string): Promise<void>;
  cancelIngredientImportJob(id: string): Promise<IngredientImportJob>;
  retryIngredientImportJob(id: string): Promise<IngredientImportJob>;
  commitIngredientImportJob(
    id: string,
  ): Promise<IngredientImportCommitResult>;
  commitReviewedIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ): Promise<IngredientVariant>;
  exportIngredientTemplate(
    format: IngredientExchangeFormat,
    destinationPath: string,
  ): Promise<void>;
  exportIngredientLibrary(
    format: IngredientExchangeFormat,
    destinationPath: string,
  ): Promise<void>;
  cleanupOrphanAttachments(): Promise<number>;
  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: string, name: string): Promise<Category>;
  archiveCategory(id: string): Promise<void>;
  listSuppliers(query?: string): Promise<Supplier[]>;
  createSupplier(name: string, notes?: string): Promise<Supplier>;
  updateSupplier(id: string, name: string, notes: string): Promise<Supplier>;
  archiveSupplier(id: string): Promise<void>;
  listMaterialGroups(query?: string): Promise<MaterialGroup[]>;
  createMaterialGroup(input: MaterialGroupInput): Promise<MaterialGroup>;
  updateMaterialGroup(
    id: string,
    input: MaterialGroupInput,
  ): Promise<MaterialGroup>;
  archiveMaterialGroup(id: string): Promise<void>;
  saveIngredientVariant(
    input: IngredientVariantInput,
  ): Promise<IngredientVariant>;
  copyIngredientVariant(
    sourceId: string,
    supplierId: string,
  ): Promise<IngredientVariant>;
  archiveIngredientVariant(id: string): Promise<void>;
  listNutrientDefinitions(): Promise<NutrientDefinition[]>;
  createNutrientDefinition(
    name: string,
    unit: string,
  ): Promise<NutrientDefinition>;
  compareIngredientVariants(
    materialGroupId: string,
    variantIds: string[],
  ): Promise<VariantComparison>;
  getSetting<T>(key: string): Promise<T | null>;
  setSetting<T>(key: string, value: T): Promise<void>;
  getDraft<T>(kind: string, key: string): Promise<DraftRecord<T> | null>;
  saveDraft<T>(
    kind: string,
    key: string,
    payloadVersion: number,
    payload: T,
  ): Promise<DraftRecord<T>>;
  clearDraft(kind: string, key: string): Promise<void>;
  getDatabaseStatus(): Promise<DatabaseStatus>;
}
