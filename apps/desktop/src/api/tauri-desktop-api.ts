import { invoke as tauriInvoke } from "@tauri-apps/api/core";

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
import type { DesktopApi } from "./desktop-api";
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
  ResearchReportRecord,
  ResearchReportRecordInput,
} from "./research-report-types";
import { DesktopApiError } from "./types";
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
  DesktopErrorCode,
} from "./types";

type Invoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

const desktopErrorCodes = new Set<DesktopErrorCode>([
  "invalid_input",
  "invalid_decimal",
  "not_found",
  "duplicate_code",
  "duplicate_name",
  "duplicate_variant",
  "reference_conflict",
  "missing_reference",
  "recipe_cycle",
  "archived",
  "conversion_unavailable",
  "import_failure",
  "attachment_failure",
  "unsupported_file",
  "invalid_state",
  "provider_not_configured",
  "provider_failure",
  "invalid_model_output",
  "tool_denied",
  "cancelled",
  "storage_failure",
  "unknown",
]);

function toDesktopApiError(cause: unknown) {
  if (cause instanceof Error) return cause;
  if (typeof cause === "object" && cause !== null) {
    const value = cause as { code?: unknown; field?: unknown; message?: unknown };
    if (typeof value.message === "string") {
      const code =
        typeof value.code === "string" &&
        desktopErrorCodes.has(value.code as DesktopErrorCode)
          ? (value.code as DesktopErrorCode)
          : "unknown";
      return new DesktopApiError(
        code,
        value.message,
        typeof value.field === "string" ? value.field : undefined,
      );
    }
  }
  return new DesktopApiError("unknown", "桌面命令执行失败");
}

export class TauriDesktopApi implements DesktopApi {
  constructor(private readonly invokeCommand: Invoke = tauriInvoke) {}

  private invoke<T>(command: string, args?: Record<string, unknown>) {
    return this.invokeCommand<T>(command, args).catch((cause: unknown) => {
      throw toDesktopApiError(cause);
    });
  }

  createResearchReport(input: ResearchReportRecordInput) {
    return this.invoke<ResearchReportRecord>("create_research_report", {
      input,
    });
  }

  listResearchReports(recipeVersionId: string) {
    return this.invoke<ResearchReportRecord[]>("list_research_reports", {
      recipeVersionId,
    });
  }

  getResearchReport(id: string) {
    return this.invoke<ResearchReportRecord>("get_research_report", { id });
  }

  listNutritionLabels(recipeId: string) {
    return this.invoke<NutritionLabel[]>("list_nutrition_labels", {
      recipeId,
    });
  }

  getNutritionLabel(id: string) {
    return this.invoke<NutritionLabel>("get_nutrition_label", { id });
  }

  createNutritionLabel(input: NutritionLabelInput) {
    return this.invoke<NutritionLabel>("create_nutrition_label", { input });
  }

  getNutritionLabelDraft(labelId: string) {
    return this.invoke<NutritionLabelDraft | null>(
      "get_nutrition_label_draft",
      { labelId },
    );
  }

  calculateNutritionLabelPreview(input: NutritionLabelDraftSaveInput) {
    return this.invoke<NutritionLabelCalculation>(
      "calculate_nutrition_label_preview",
      { input },
    );
  }

  saveNutritionLabelDraft(input: NutritionLabelDraftSaveInput) {
    return this.invoke<NutritionLabelDraft>("save_nutrition_label_draft", {
      input,
    });
  }

  listNutritionLabelVersions(labelId: string) {
    return this.invoke<NutritionLabelVersion[]>(
      "list_nutrition_label_versions",
      { labelId },
    );
  }

  getNutritionLabelVersion(id: string) {
    return this.invoke<NutritionLabelVersion>(
      "get_nutrition_label_version",
      { id },
    );
  }

  publishNutritionLabel(labelId: string) {
    return this.invoke<NutritionLabelVersion>("publish_nutrition_label", {
      labelId,
    });
  }

  listRecipes() {
    return this.invoke<RecipeSummary[]>("list_recipes");
  }

  getRecipe(id: string) {
    return this.invoke<Recipe>("get_recipe", { id });
  }

  createRecipe(input: RecipeInput) {
    return this.invoke<Recipe>("create_recipe", { input });
  }

  updateRecipe(id: string, input: RecipeInput) {
    return this.invoke<Recipe>("update_recipe", { id, input });
  }

  archiveRecipe(id: string) {
    return this.invoke<void>("archive_recipe", { id });
  }

  getRecipeDraft(recipeId: string) {
    return this.invoke<RecipeDraft | null>("get_recipe_draft", { recipeId });
  }

  saveRecipeDraft(input: RecipeDraftSaveInput) {
    return this.invoke<RecipeDraft>("save_recipe_draft", { input });
  }

  listRecipeVersions(recipeId: string) {
    return this.invoke<RecipeVersion[]>("list_recipe_versions", { recipeId });
  }

  getRecipeVersion(id: string) {
    return this.invoke<RecipeVersion>("get_recipe_version", { id });
  }

  createRecipeVersion(input: RecipeVersionCreateInput) {
    return this.invoke<RecipeVersion>("create_recipe_version", { input });
  }

  copyRecipeVersionToDraft(versionId: string) {
    return this.invoke<RecipeDraft>("copy_recipe_version_to_draft", {
      versionId,
    });
  }

  compareRecipeVersions(beforeVersionId: string, afterVersionId: string) {
    return this.invoke<RecipeVersionComparison>("compare_recipe_versions", {
      beforeVersionId,
      afterVersionId,
    });
  }

  getAgentPreferences() {
    return this.invoke<AgentPreferences>("get_agent_preferences");
  }

  saveAgentPreferences(input: AgentPreferences) {
    return this.invoke<AgentPreferences>("save_agent_preferences", { input });
  }

  listAgentProviderConfigs() {
    return this.invoke<AgentProviderConfig[]>("list_agent_provider_configs");
  }

  saveAgentProviderConfig(input: AgentProviderConfigInput) {
    return this.invoke<AgentProviderConfig>("save_agent_provider_config", {
      input,
    });
  }

  setAgentProviderSecret(input: AgentProviderSecretInput) {
    return this.invoke<void>("set_agent_provider_secret", { input });
  }

  clearAgentProviderSecret(providerId: string) {
    return this.invoke<void>("clear_agent_provider_secret", { providerId });
  }

  listAgentProviderModels(providerId: string) {
    return this.invoke<AgentModelOption[]>("list_agent_provider_models", {
      providerId,
    });
  }

  getAgentCustomProviderSubconfig(
    protocol: "openai_compatible" | "anthropic_messages",
  ) {
    return this.invoke<AgentCustomProviderSubconfig>(
      "get_agent_custom_provider_subconfig",
      { protocol },
    );
  }

  testAgentProvider(
    providerId: string,
    kind: AgentProviderTestResult["kind"],
  ) {
    return this.invoke<AgentProviderTestResult>("test_agent_provider", {
      providerId,
      kind,
    });
  }

  detectCliProviders() {
    return this.invoke<CliDetectionResult[]>("detect_cli_providers");
  }

  listAgentConversations() {
    return this.invoke<AgentConversation[]>("list_agent_conversations");
  }

  createAgentConversation(title?: string) {
    return this.invoke<AgentConversation>("create_agent_conversation", {
      title,
    });
  }

  deleteAgentConversation(id: string) {
    return this.invoke<void>("delete_agent_conversation", { id });
  }

  listAgentMessages(conversationId: string) {
    return this.invoke<AgentMessage[]>("list_agent_messages", {
      conversationId,
    });
  }

  startAgentRun(request: AgentRunRequest) {
    return this.invoke<AgentRun>("start_agent_run", { request });
  }

  cancelAgentRun(id: string) {
    return this.invoke<AgentRun>("cancel_agent_run", { id });
  }

  getAgentRun(id: string) {
    return this.invoke<AgentRun>("get_agent_run", { id });
  }

  listAgentImportDrafts(runId: string) {
    return this.invoke<IngredientImportDraft[]>("list_agent_import_drafts", {
      runId,
    });
  }

  createIngredientImportJob(request: IngredientImportJobRequest) {
    return this.invoke<IngredientImportJob>("create_ingredient_import_job", {
      request,
    });
  }

  getIngredientImportJob(id: string) {
    return this.invoke<IngredientImportJob>("get_ingredient_import_job", { id });
  }

  listIngredientImportDrafts(jobId: string) {
    return this.invoke<IngredientImportDraft[]>("list_ingredient_import_drafts", {
      jobId,
    });
  }

  updateIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ) {
    return this.invoke<IngredientImportDraft>("update_ingredient_import_draft", {
      id,
      review,
    });
  }

  discardIngredientImportDraft(id: string) {
    return this.invoke<void>("discard_ingredient_import_draft", { id });
  }

  cancelIngredientImportJob(id: string) {
    return this.invoke<IngredientImportJob>("cancel_ingredient_import_job", { id });
  }

  retryIngredientImportJob(id: string) {
    return this.invoke<IngredientImportJob>("retry_ingredient_import_job", { id });
  }

  commitIngredientImportJob(id: string) {
    return this.invoke<IngredientImportCommitResult>("commit_ingredient_import_job", {
      id,
    });
  }

  commitReviewedIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ) {
    return this.invoke<IngredientVariant>("commit_reviewed_ingredient_import_draft", {
      id,
      review,
    });
  }

  exportIngredientTemplate(
    format: IngredientExchangeFormat,
    destinationPath: string,
  ) {
    return this.invoke<void>("export_ingredient_template", {
      format,
      destinationPath,
    });
  }

  exportIngredientLibrary(
    format: IngredientExchangeFormat,
    destinationPath: string,
  ) {
    return this.invoke<void>("export_ingredient_library", {
      format,
      destinationPath,
    });
  }

  cleanupOrphanAttachments() {
    return this.invoke<number>("cleanup_orphan_attachments");
  }

  listCategories() {
    return this.invoke<Category[]>("list_categories");
  }

  createCategory(name: string) {
    return this.invoke<Category>("create_category", { name });
  }

  renameCategory(id: string, name: string) {
    return this.invoke<Category>("rename_category", { id, name });
  }

  archiveCategory(id: string) {
    return this.invoke<void>("archive_category", { id });
  }

  listSuppliers(query?: string) {
    return this.invoke<Supplier[]>("list_suppliers", { query });
  }

  createSupplier(name: string, notes = "") {
    return this.invoke<Supplier>("create_supplier", { name, notes });
  }

  updateSupplier(id: string, name: string, notes: string) {
    return this.invoke<Supplier>("update_supplier", { id, name, notes });
  }

  archiveSupplier(id: string) {
    return this.invoke<void>("archive_supplier", { id });
  }

  listMaterialGroups(query?: string) {
    return this.invoke<MaterialGroup[]>("list_material_groups", { query });
  }

  createMaterialGroup(input: MaterialGroupInput) {
    return this.invoke<MaterialGroup>("create_material_group", { input });
  }

  updateMaterialGroup(id: string, input: MaterialGroupInput) {
    return this.invoke<MaterialGroup>("update_material_group", { id, input });
  }

  archiveMaterialGroup(id: string) {
    return this.invoke<void>("archive_material_group", { id });
  }

  saveIngredientVariant(input: IngredientVariantInput) {
    return this.invoke<IngredientVariant>("save_ingredient_variant", { input });
  }

  copyIngredientVariant(sourceId: string, supplierId: string) {
    return this.invoke<IngredientVariant>("copy_ingredient_variant", {
      sourceId,
      supplierId,
    });
  }

  archiveIngredientVariant(id: string) {
    return this.invoke<void>("archive_ingredient_variant", { id });
  }

  listNutrientDefinitions() {
    return this.invoke<NutrientDefinition[]>("list_nutrient_definitions");
  }

  createNutrientDefinition(name: string, unit: string) {
    return this.invoke<NutrientDefinition>("create_nutrient_definition", {
      name,
      unit,
    });
  }

  compareIngredientVariants(materialGroupId: string, variantIds: string[]) {
    return this.invoke<VariantComparison>("compare_ingredient_variants", {
      materialGroupId,
      variantIds,
    });
  }

  /** Temporary schema-v1 compatibility methods. */
  listIngredients(request: IngredientListRequest = {}) {
    return this.invoke<Ingredient[]>("list_ingredients", { request });
  }

  getIngredient(id: string) {
    return this.invoke<Ingredient>("get_ingredient", { id });
  }

  createIngredient(input: IngredientInput) {
    return this.invoke<Ingredient>("create_ingredient", { input });
  }

  updateIngredient(id: string, input: IngredientInput) {
    return this.invoke<Ingredient>("update_ingredient", { id, input });
  }

  archiveIngredient(id: string) {
    return this.invoke<void>("archive_ingredient", { id });
  }

  getSetting<T>(key: string) {
    return this.invoke<T | null>("get_setting", { key });
  }

  setSetting<T>(key: string, value: T) {
    return this.invoke<void>("set_setting", { key, value });
  }

  getDraft<T>(kind: string, key: string) {
    return this.invoke<DraftRecord<T> | null>("get_draft", { kind, key });
  }

  saveDraft<T>(
    kind: string,
    key: string,
    payloadVersion: number,
    payload: T,
  ) {
    return this.invoke<DraftRecord<T>>("save_draft", {
      kind,
      key,
      payloadVersion,
      payload,
    });
  }

  clearDraft(kind: string, key: string) {
    return this.invoke<void>("clear_draft", { kind, key });
  }

  getDatabaseStatus() {
    return this.invoke<DatabaseStatus>("database_status");
  }
}
