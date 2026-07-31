import type {
  AgentCustomProviderSubconfig,
  AgentConversation,
  AgentMessage,
  AgentModelOption,
  AgentPreferences,
  AgentProviderConfig,
  AgentProviderConfigInput,
  AgentProviderSecretInput,
  AgentProviderTestResult,
  AgentRun,
  AgentRunRequest,
  CliDetectionResult,
} from "./agent-types";
import type {
  IngredientExchangeFormat,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "./import-types";
import type {
  NutritionLabel,
  NutritionLabelCalculation,
  NutritionLabelDraft,
  NutritionLabelDraftSaveInput,
  NutritionLabelInput,
  NutritionLabelVersion,
} from "./nutrition-label-types";
import type {
  Recipe,
  RecipeDraft,
  RecipeDraftSaveInput,
  RecipeInput,
  RecipeSummary,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionCreateInput,
} from "./recipe-types";
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
  listNutritionLabels(recipeId: string): Promise<NutritionLabel[]>;
  getNutritionLabel(id: string): Promise<NutritionLabel>;
  createNutritionLabel(input: NutritionLabelInput): Promise<NutritionLabel>;
  getNutritionLabelDraft(
    labelId: string,
  ): Promise<NutritionLabelDraft | null>;
  calculateNutritionLabelPreview(
    input: NutritionLabelDraftSaveInput,
  ): Promise<NutritionLabelCalculation>;
  saveNutritionLabelDraft(
    input: NutritionLabelDraftSaveInput,
  ): Promise<NutritionLabelDraft>;
  listNutritionLabelVersions(
    labelId: string,
  ): Promise<NutritionLabelVersion[]>;
  getNutritionLabelVersion(id: string): Promise<NutritionLabelVersion>;
  publishNutritionLabel(labelId: string): Promise<NutritionLabelVersion>;
  listRecipes(): Promise<RecipeSummary[]>;
  getRecipe(id: string): Promise<Recipe>;
  createRecipe(input: RecipeInput): Promise<Recipe>;
  updateRecipe(id: string, input: RecipeInput): Promise<Recipe>;
  archiveRecipe(id: string): Promise<void>;
  getRecipeDraft(recipeId: string): Promise<RecipeDraft | null>;
  saveRecipeDraft(input: RecipeDraftSaveInput): Promise<RecipeDraft>;
  listRecipeVersions(recipeId: string): Promise<RecipeVersion[]>;
  getRecipeVersion(id: string): Promise<RecipeVersion>;
  createRecipeVersion(input: RecipeVersionCreateInput): Promise<RecipeVersion>;
  copyRecipeVersionToDraft(versionId: string): Promise<RecipeDraft>;
  compareRecipeVersions(
    beforeVersionId: string,
    afterVersionId: string,
  ): Promise<RecipeVersionComparison>;
  getAgentPreferences(): Promise<AgentPreferences>;
  saveAgentPreferences(input: AgentPreferences): Promise<AgentPreferences>;
  listAgentProviderConfigs(): Promise<AgentProviderConfig[]>;
  saveAgentProviderConfig(
    input: AgentProviderConfigInput,
  ): Promise<AgentProviderConfig>;
  setAgentProviderSecret(input: AgentProviderSecretInput): Promise<void>;
  clearAgentProviderSecret(providerId: string): Promise<void>;
  listAgentProviderModels(providerId: string): Promise<AgentModelOption[]>;
  getAgentCustomProviderSubconfig(
    protocol: "openai_compatible" | "anthropic_messages",
  ): Promise<AgentCustomProviderSubconfig>;
  testAgentProvider(
    providerId: string,
    kind: AgentProviderTestResult["kind"],
  ): Promise<AgentProviderTestResult>;
  detectCliProviders(): Promise<CliDetectionResult[]>;
  listAgentConversations(): Promise<AgentConversation[]>;
  createAgentConversation(title?: string): Promise<AgentConversation>;
  deleteAgentConversation(id: string): Promise<void>;
  listAgentMessages(conversationId: string): Promise<AgentMessage[]>;
  startAgentRun(request: AgentRunRequest): Promise<AgentRun>;
  cancelAgentRun(id: string): Promise<AgentRun>;
  getAgentRun(id: string): Promise<AgentRun>;
  listAgentImportDrafts(runId: string): Promise<IngredientImportDraft[]>;
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
