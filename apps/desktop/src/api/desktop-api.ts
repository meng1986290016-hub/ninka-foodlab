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
  ArtifactManifest,
  AgentModelDirectory,
  AgentConversationView,
  AgentDeliveryMode,
  AgentQueuedMessage,
  AgentRecipeMatchResult,
  AgentRecipeReference,
  AgentRuntimeSettingsMethod,
  HarnessHealth,
  HarnessStartRequest,
  HarnessTask,
  HarnessTaskEvent,
  HarnessTurn,
  LegacyResetPreview,
  LegacyResetResult,
} from "./agent-harness-types";
import type {
  AcceptedAgentRecipeProposal,
  AgentRecipeProposal,
  AgentRecipeProposalAcceptInput,
  AgentRecipeProposalEvaluation,
  AgentRecipeProposalPayload,
  MaterialNeed,
  MaterialNeedStatus,
} from "./agent-recipe-types";
import type {
  AgentRecipeEstimateCard,
  AppendRecipeDraftNotesInput,
  PersonalReferenceCardDraft,
  RndReferenceCard,
} from "./rnd-reference-types";
import type {
  BackupManifest,
  BackupPreflight,
  BackupRestoreResult,
} from "./backup-types";
import type {
  IngredientExchangeFormat,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ImportFileReference,
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
  RecipeAlternativeCreateInput,
  RecipeDraft,
  RecipeDraftSaveInput,
  RecipeInput,
  RecipeSchemeUpdateInput,
  RecipeSummary,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionCreateInput,
} from "./recipe-types";
import type {
  ResearchReportRecord,
  ResearchReportExportRequest,
  ResearchReportRecordInput,
} from "./research-report-types";
import type { SampleSheetExportRequest } from "./sample-sheet-types";
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
  getHarnessHealth(): Promise<HarnessHealth>;
  startHarness(request?: HarnessStartRequest): Promise<HarnessHealth>;
  stopHarness(): Promise<HarnessHealth>;
  agentRuntimeSettingsCall<T>(
    method: AgentRuntimeSettingsMethod,
    payload: unknown,
  ): Promise<T>;
  saveAgentProviderProfile(
    input: import("./agent-harness-types").AgentProviderProfileSaveRequest,
  ): Promise<{ revision: string | number; user: unknown }>;
  testAgentProviderConnection(input: {
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<{ ok: boolean }>;
  getAgentModelDirectory(): Promise<AgentModelDirectory>;
  selectAgentDefaultModel(input: {
    engine?: import("./agent-harness-types").AgentEngine;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<{ selected: AgentModelDirectory["current"] }>;
  readThirdPartyLicenses(): Promise<string>;
  listHarnessTasks(
    scope?: import("./agent-harness-types").HarnessTaskListScope,
  ): Promise<HarnessTask[]>;
  getAgentConversationView(conversationId: string): Promise<AgentConversationView>;
  createHarnessTask(input: {
    title: string;
    workflow?: string;
    content?: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
    files?: ImportFileReference[];
  }): Promise<HarnessTask>;
  renameHarnessTask(taskId: string, title: string): Promise<HarnessTask>;
  archiveHarnessTask(taskId: string): Promise<HarnessTask>;
  restoreHarnessTask(taskId: string): Promise<HarnessTask>;
  selectHarnessTaskModel(input: {
    taskId: string;
    engine: import("./agent-harness-types").AgentEngine;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<HarnessTask>;
  createHarnessTurn(input: {
    taskId: string;
    parentTurnId?: string | null;
    content: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }): Promise<HarnessTurn>;
  submitAgentMessage(input: {
    conversationId: string;
    content: string;
    references: AgentRecipeReference[];
    mode: AgentDeliveryMode;
  }): Promise<AgentConversationView>;
  editAgentQueuedMessage(input: {
    messageId: string;
    content: string;
    references: AgentRecipeReference[];
  }): Promise<AgentQueuedMessage>;
  deleteAgentQueuedMessage(messageId: string): Promise<void>;
  stopAgentConversation(conversationId: string): Promise<AgentConversationView>;
  resumeAgentQueue(conversationId: string): Promise<AgentConversationView>;
  selectAgentBranch(conversationId: string, turnId: string): Promise<AgentConversationView>;
  editAgentTurn(turnId: string, content: string): Promise<AgentConversationView>;
  bindAgentRecipe(conversationId: string, recipeId: string | null): Promise<AgentConversationView>;
  resolveAgentRecipeReferences(query: string): Promise<AgentRecipeMatchResult>;
  syncHarnessTask(taskId: string): Promise<HarnessTask>;
  cancelHarnessTask(taskId: string): Promise<HarnessTask>;
  listHarnessTurns(taskId: string): Promise<HarnessTurn[]>;
  listHarnessEvents(taskId: string, afterSeq: number): Promise<HarnessTaskEvent[]>;
  listHarnessArtifacts(taskId: string): Promise<ArtifactManifest[]>;
  previewLegacyAgentReset(): Promise<LegacyResetPreview>;
  executeLegacyAgentReset(
    previewId: string,
    confirmationPhrase: string,
  ): Promise<LegacyResetResult>;
  createDataBackup(destinationPath: string): Promise<BackupManifest>;
  inspectDataBackup(sourcePath: string): Promise<BackupPreflight>;
  restoreDataBackup(
    sourcePath: string,
    confirmed: boolean,
  ): Promise<BackupRestoreResult>;
  exportResearchReport(request: ResearchReportExportRequest): Promise<void>;
  exportSampleSheet(request: SampleSheetExportRequest): Promise<void>;
  createResearchReport(
    input: ResearchReportRecordInput,
  ): Promise<ResearchReportRecord>;
  listResearchReports(
    recipeVersionId: string,
  ): Promise<ResearchReportRecord[]>;
  getResearchReport(id: string): Promise<ResearchReportRecord>;
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
  createRecipeAlternative(input: RecipeAlternativeCreateInput): Promise<Recipe>;
  updateRecipe(id: string, input: RecipeInput): Promise<Recipe>;
  updateRecipeScheme(id: string, input: RecipeSchemeUpdateInput): Promise<Recipe>;
  archiveRecipe(id: string): Promise<void>;
  restoreRecipe(id: string): Promise<void>;
  deleteDraftRecipe(id: string): Promise<void>;
  permanentlyDeleteRecipe(id: string, confirmationName: string): Promise<void>;
  deleteRecipeVersion(id: string): Promise<void>;
  getRecipeDraft(recipeId: string): Promise<RecipeDraft | null>;
  saveRecipeDraft(input: RecipeDraftSaveInput): Promise<RecipeDraft>;
  appendRecipeDraftNotes(
    input: AppendRecipeDraftNotesInput,
  ): Promise<RecipeDraft>;
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
  listAgentRecipeProposals(conversationId: string): Promise<AgentRecipeProposal[]>;
  listAgentRecipeEstimateCards(
    conversationId: string,
  ): Promise<AgentRecipeEstimateCard[]>;
  listRndReferenceCards(
    query?: string,
    includeArchived?: boolean,
  ): Promise<RndReferenceCard[]>;
  createPersonalRndReferenceCard(
    input: PersonalReferenceCardDraft,
  ): Promise<RndReferenceCard>;
  updatePersonalRndReferenceCard(
    id: string,
    input: PersonalReferenceCardDraft,
  ): Promise<RndReferenceCard>;
  archivePersonalRndReferenceCard(id: string): Promise<RndReferenceCard>;
  getAgentRecipeProposal(id: string): Promise<AgentRecipeProposal>;
  evaluateAgentRecipeProposal(
    input: AgentRecipeProposalPayload,
  ): Promise<AgentRecipeProposalEvaluation>;
  updateAgentRecipeProposal(
    id: string,
    input: AgentRecipeProposalPayload,
  ): Promise<AgentRecipeProposal>;
  acceptAgentRecipeProposal(
    input: AgentRecipeProposalAcceptInput,
  ): Promise<AcceptedAgentRecipeProposal>;
  discardAgentRecipeProposal(id: string): Promise<AgentRecipeProposal>;
  listMaterialNeeds(status?: MaterialNeedStatus): Promise<MaterialNeed[]>;
  resolveMaterialNeed(
    id: string,
    ingredientVariantId: string,
  ): Promise<MaterialNeed>;
  dismissMaterialNeed(id: string): Promise<MaterialNeed>;
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
    category: NutrientDefinition["category"],
  ): Promise<NutrientDefinition>;
  updateNutrientDefinition(
    id: string,
    name: string,
    unit: string,
    category: NutrientDefinition["category"],
  ): Promise<NutrientDefinition>;
  archiveNutrientDefinition(id: string): Promise<void>;
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
