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
import type {
  ArtifactManifest,
  AgentModelDirectory,
  AgentRuntimeSettingsMethod,
  HarnessHealth,
  HarnessStartRequest,
  HarnessTask,
  HarnessTaskEvent,
  HarnessTurn,
  LegacyResetPreview,
  LegacyResetResult,
} from "./agent-harness-types";
import type { AppVersionInfo, UpdateCheckResult } from "./app-info-types";
import type {
  DataResetExecuteRequest,
  DataResetPreview,
  DataResetRecoveryInfo,
  DataResetRestoreResult,
  DataResetResult,
} from "./data-reset-types";
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
import type { DesktopApi } from "./desktop-api";
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
  ResearchReportExportRequest,
  ResearchReportRecord,
  ResearchReportRecordInput,
} from "./research-report-types";
import type { SampleSheetExportRequest } from "./sample-sheet-types";
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
  "model_does_not_support_images",
  "attachment_too_large",
  "attachment_too_many",
  "attachment_dimensions_exceeded",
  "attachment_unsupported_format",
  "attachment_corrupt",
  "attachment_read_failed",
  "provider_auth_failed",
  "provider_network_unavailable",
  "unsupported_file",
  "invalid_state",
  "provider_not_configured",
  "provider_failure",
  "agent_runtime_failure",
  "invalid_model_output",
  "tool_denied",
  "cancelled",
  "invalid_backup",
  "unsupported_backup",
  "confirmation_required",
  "preview_stale",
  "delete_conflict",
  "restore_rollback_failed",
  "restore_completed_restart_required",
  "unsupported_operation",
  "update_offline",
  "update_timeout",
  "update_rate_limited",
  "update_unavailable",
  "update_no_release",
  "update_invalid_response",
  "safety_backup_failed",
  "agent_stop_failed",
  "recovery_unavailable",
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

  getAppVersion() {
    return this.invoke<AppVersionInfo>("get_app_version");
  }

  checkForUpdates() {
    return this.invoke<UpdateCheckResult>("check_for_updates");
  }

  openReleasePage(url: string) {
    return this.invoke<void>("open_release_page", { url });
  }

  previewDataReset() {
    return this.invoke<DataResetPreview>("preview_data_reset");
  }

  executeDataReset(request: DataResetExecuteRequest) {
    return this.invoke<DataResetResult>("execute_data_reset", { request });
  }

  getLatestDataResetRecovery() {
    return this.invoke<DataResetRecoveryInfo | null>(
      "get_latest_data_reset_recovery",
    );
  }

  restoreLatestDataResetRecovery(confirmed: boolean) {
    return this.invoke<DataResetRestoreResult>(
      "restore_latest_data_reset_recovery",
      { confirmed },
    );
  }

  restartApplication() {
    return this.invoke<void>("restart_application");
  }

  getHarnessHealth() {
    return this.invoke<HarnessHealth>("get_harness_health");
  }

  startHarness(request?: HarnessStartRequest) {
    return this.invoke<HarnessHealth>("start_harness", { request });
  }

  stopHarness() {
    return this.invoke<HarnessHealth>("stop_harness");
  }

  agentRuntimeSettingsCall<T>(
    method: AgentRuntimeSettingsMethod,
    payload: unknown,
  ) {
    return this.invoke<T>("agent_runtime_settings_call", { method, payload });
  }

  saveAgentProviderProfile(
    request: import("./agent-harness-types").AgentProviderProfileSaveRequest,
  ) {
    return this.invoke<{ revision: string | number; user: unknown }>(
      "save_agent_provider_profile",
      { request },
    );
  }

  testAgentProviderConnection(input: {
    provider: string;
    model: string;
    reasoningEffort?: string;
  }) {
    return this.invoke<{ ok: boolean }>("test_agent_provider_connection", input);
  }

  getAgentModelDirectory() {
    return this.invoke<AgentModelDirectory>("get_agent_model_directory");
  }

  selectAgentDefaultModel(input: {
    engine?: import("./agent-harness-types").AgentEngine;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }) {
    return this.invoke<{ selected: AgentModelDirectory["current"] }>(
      "select_agent_default_model",
      input,
    );
  }

  readThirdPartyLicenses() {
    return this.invoke<string>("read_third_party_licenses");
  }

  listHarnessTasks(
    scope: import("./agent-harness-types").HarnessTaskListScope = "active",
  ) {
    return this.invoke<HarnessTask[]>("list_harness_tasks", { scope });
  }

  getAgentConversationView(conversationId: string) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "get_agent_conversation_view",
      { conversationId },
    );
  }

  createHarnessTask(request: {
    title: string;
    workflow?: string;
    content?: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
    files?: ImportFileReference[];
  }) {
    return this.invoke<HarnessTask>("create_harness_task", { request });
  }

  renameHarnessTask(taskId: string, title: string) {
    return this.invoke<HarnessTask>("rename_harness_task", { taskId, title });
  }

  archiveHarnessTask(taskId: string) {
    return this.invoke<HarnessTask>("archive_harness_task", { taskId });
  }

  restoreHarnessTask(taskId: string) {
    return this.invoke<HarnessTask>("restore_harness_task", { taskId });
  }

  selectHarnessTaskModel(input: {
    taskId: string;
    engine: import("./agent-harness-types").AgentEngine;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }) {
    return this.invoke<HarnessTask>("select_harness_task_model", input);
  }

  createHarnessTurn(request: {
    taskId: string;
    parentTurnId?: string | null;
    content: string;
    activeRecipeId?: string | null;
    activeDraftFingerprint?: string | null;
  }) {
    return this.invoke<HarnessTurn>("create_harness_turn", { request });
  }

  submitAgentMessage(request: {
    conversationId: string;
    content: string;
    references: import("./agent-harness-types").AgentRecipeReference[];
    mode: import("./agent-harness-types").AgentDeliveryMode;
  }) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "submit_agent_message",
      { request },
    );
  }

  editAgentQueuedMessage(request: {
    messageId: string;
    content: string;
    references: import("./agent-harness-types").AgentRecipeReference[];
  }) {
    return this.invoke<import("./agent-harness-types").AgentQueuedMessage>(
      "edit_agent_queued_message",
      { request },
    );
  }

  deleteAgentQueuedMessage(messageId: string) {
    return this.invoke<void>("delete_agent_queued_message", { messageId });
  }

  stopAgentConversation(conversationId: string) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "stop_agent_conversation",
      { conversationId },
    );
  }

  resumeAgentQueue(conversationId: string) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "resume_agent_queue",
      { conversationId },
    );
  }

  selectAgentBranch(conversationId: string, turnId: string) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "select_agent_branch",
      { conversationId, turnId },
    );
  }

  editAgentTurn(turnId: string, content: string) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "edit_agent_turn",
      { request: { turnId, content } },
    );
  }

  bindAgentRecipe(conversationId: string, recipeId: string | null) {
    return this.invoke<import("./agent-harness-types").AgentConversationView>(
      "bind_agent_recipe",
      { conversationId, recipeId },
    );
  }

  resolveAgentRecipeReferences(query: string) {
    return this.invoke<import("./agent-harness-types").AgentRecipeMatchResult>(
      "resolve_agent_recipe_references",
      { query },
    );
  }

  syncHarnessTask(taskId: string) {
    return this.invoke<HarnessTask>("sync_harness_task", { taskId });
  }

  cancelHarnessTask(taskId: string) {
    return this.invoke<HarnessTask>("cancel_harness_task", { taskId });
  }

  listHarnessTurns(taskId: string) {
    return this.invoke<HarnessTurn[]>("list_harness_turns", { taskId });
  }

  listHarnessEvents(taskId: string, afterSeq: number) {
    return this.invoke<HarnessTaskEvent[]>("list_harness_events", {
      taskId,
      afterSeq,
    });
  }

  listHarnessArtifacts(taskId: string) {
    return this.invoke<ArtifactManifest[]>("list_harness_artifacts", { taskId });
  }

  previewLegacyAgentReset() {
    return this.invoke<LegacyResetPreview>("preview_legacy_agent_reset");
  }

  executeLegacyAgentReset(previewId: string, confirmationPhrase: string) {
    return this.invoke<LegacyResetResult>("execute_legacy_agent_reset", {
      previewId,
      confirmationPhrase,
    });
  }

  createDataBackup(destinationPath: string) {
    return this.invoke<BackupManifest>("create_data_backup", {
      destinationPath,
    });
  }

  inspectDataBackup(sourcePath: string) {
    return this.invoke<BackupPreflight>("inspect_data_backup", {
      sourcePath,
    });
  }

  restoreDataBackup(sourcePath: string, confirmed: boolean) {
    return this.invoke<BackupRestoreResult>("restore_data_backup", {
      sourcePath,
      confirmed,
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

  exportResearchReport(request: ResearchReportExportRequest) {
    return this.invoke<void>("export_research_report", { request });
  }

  exportSampleSheet(request: SampleSheetExportRequest) {
    return this.invoke<void>("export_sample_sheet", { request });
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

  createRecipeAlternative(input: RecipeAlternativeCreateInput) {
    return this.invoke<Recipe>("create_recipe_alternative", { input });
  }

  updateRecipe(id: string, input: RecipeInput) {
    return this.invoke<Recipe>("update_recipe", { id, input });
  }

  updateRecipeScheme(id: string, input: RecipeSchemeUpdateInput) {
    return this.invoke<Recipe>("update_recipe_scheme", { id, input });
  }

  archiveRecipe(id: string) {
    return this.invoke<void>("archive_recipe", { id });
  }

  restoreRecipe(id: string) {
    return this.invoke<void>("restore_recipe", { id });
  }

  deleteDraftRecipe(id: string) {
    return this.invoke<void>("delete_draft_recipe", { id });
  }

  permanentlyDeleteRecipe(id: string, confirmationName: string) {
    return this.invoke<void>("permanently_delete_recipe", {
      id,
      confirmationName,
    });
  }

  deleteRecipeVersion(id: string) {
    return this.invoke<void>("delete_recipe_version", { id });
  }

  getRecipeDraft(recipeId: string) {
    return this.invoke<RecipeDraft | null>("get_recipe_draft", { recipeId });
  }

  saveRecipeDraft(input: RecipeDraftSaveInput) {
    return this.invoke<RecipeDraft>("save_recipe_draft", { input });
  }

  appendRecipeDraftNotes(input: AppendRecipeDraftNotesInput) {
    return this.invoke<RecipeDraft>("append_recipe_draft_notes", { input });
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

  listAgentRecipeProposals(conversationId: string) {
    return this.invoke<AgentRecipeProposal[]>("list_agent_recipe_proposals", {
      conversationId,
    });
  }

  listAgentRecipeEstimateCards(conversationId: string) {
    return this.invoke<AgentRecipeEstimateCard[]>(
      "list_agent_recipe_estimate_cards",
      { conversationId },
    );
  }

  listRndReferenceCards(query = "", includeArchived = false) {
    return this.invoke<RndReferenceCard[]>("list_rnd_reference_cards", {
      query,
      includeArchived,
    });
  }

  createPersonalRndReferenceCard(input: PersonalReferenceCardDraft) {
    return this.invoke<RndReferenceCard>("create_personal_rnd_reference_card", {
      input,
    });
  }

  updatePersonalRndReferenceCard(
    id: string,
    input: PersonalReferenceCardDraft,
  ) {
    return this.invoke<RndReferenceCard>("update_personal_rnd_reference_card", {
      id,
      input,
    });
  }

  archivePersonalRndReferenceCard(id: string) {
    return this.invoke<RndReferenceCard>("archive_personal_rnd_reference_card", {
      id,
    });
  }

  getAgentRecipeProposal(id: string) {
    return this.invoke<AgentRecipeProposal>("get_agent_recipe_proposal", { id });
  }

  evaluateAgentRecipeProposal(input: AgentRecipeProposalPayload) {
    return this.invoke<AgentRecipeProposalEvaluation>(
      "evaluate_agent_recipe_proposal",
      { input },
    );
  }

  updateAgentRecipeProposal(id: string, input: AgentRecipeProposalPayload) {
    return this.invoke<AgentRecipeProposal>("update_agent_recipe_proposal", {
      id,
      input,
    });
  }

  acceptAgentRecipeProposal(input: AgentRecipeProposalAcceptInput) {
    return this.invoke<AcceptedAgentRecipeProposal>("accept_agent_recipe_proposal", {
      input,
    });
  }

  discardAgentRecipeProposal(id: string) {
    return this.invoke<AgentRecipeProposal>("discard_agent_recipe_proposal", { id });
  }

  listMaterialNeeds(status?: MaterialNeedStatus) {
    return this.invoke<MaterialNeed[]>("list_material_needs", {
      status: status ?? null,
    });
  }

  resolveMaterialNeed(id: string, ingredientVariantId: string) {
    return this.invoke<MaterialNeed>("resolve_material_need", {
      id,
      ingredientVariantId,
    });
  }

  dismissMaterialNeed(id: string) {
    return this.invoke<MaterialNeed>("dismiss_material_need", { id });
  }

  createIngredientImportJob(request: IngredientImportJobRequest) {
    return this.invoke<IngredientImportJob>("create_ingredient_import_job", {
      request,
    });
  }

  getIngredientImportJob(id: string) {
    return this.invoke<IngredientImportJob>("get_ingredient_import_job", { id });
  }

  getIngredientImportDraft(id: string) {
    return this.invoke<IngredientImportDraft>("get_ingredient_import_draft", { id });
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

  createNutrientDefinition(
    name: string,
    unit: string,
    category: NutrientDefinition["category"],
  ) {
    return this.invoke<NutrientDefinition>("create_nutrient_definition", {
      name,
      unit,
      category,
    });
  }

  updateNutrientDefinition(
    id: string,
    name: string,
    unit: string,
    category: NutrientDefinition["category"],
  ) {
    return this.invoke<NutrientDefinition>("update_nutrient_definition", {
      id,
      name,
      unit,
      category,
    });
  }

  archiveNutrientDefinition(id: string) {
    return this.invoke<void>("archive_nutrient_definition", { id });
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
