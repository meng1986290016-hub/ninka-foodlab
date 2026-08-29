import { useEffect, useState } from "react";

import {
  createAgentEventSource,
  type AgentEventSource,
} from "./api/agent-event-source";
import { createDesktopApi } from "./api/create-desktop-api";
import type { DesktopApi } from "./api/desktop-api";
import {
  createImportFilePicker,
  type ImportFilePicker,
} from "./api/import-file-picker";
import type { DatabaseStatus } from "./api/types";
import type { IngredientImportDraft } from "./api/import-types";
import { AppShell, type AppPage } from "./components/AppShell";
import { AgentPanel } from "./features/agent/AgentPanel";
import { IngredientLibrary } from "./features/ingredients/IngredientLibrary";
import { ImportedVariantReview } from "./features/ingredients/ImportedVariantReview";
import { NutritionLabelWorkspace } from "./features/labels/NutritionLabelWorkspace";
import { RecipeLibrary } from "./features/recipes/RecipeLibrary";
import {
  RecipeWorkbench,
  type RecipeIngredientEditRequest,
} from "./features/recipes/RecipeWorkbench";
import { SampleSheetWorkspace } from "./features/recipes/SampleSheetWorkspace";
import type { SampleSheetLaunch } from "./features/recipes/sample-sheet-source";
import type { RecipeAgentWorkbenchContext } from "./features/recipes/recipe-agent-analysis";
import {
  SettingsPage,
  type SettingsSection,
} from "./features/settings/SettingsPage";
import "./styles/app.css";
import {
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
} from "./theme";

interface AppProps {
  api?: DesktopApi;
  agentEvents?: AgentEventSource;
  filePicker?: ImportFilePicker;
}

export function App({ api, agentEvents, filePicker }: AppProps) {
  useState(() => {
    applyThemePreference(readThemePreference());
    return true;
  });
  const [eventSource] = useState(
    () => agentEvents ?? createAgentEventSource(),
  );
  const [desktopApi] = useState(
    () => api ?? createDesktopApi(eventSource),
  );
  const [sourcePicker] = useState(
    () => filePicker ?? createImportFilePicker(),
  );
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(
    null,
  );
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<AppPage>("ingredients");
  const [agentOpen, setAgentOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [reviewDraft, setReviewDraft] =
    useState<IngredientImportDraft | null>(null);
  const [reviewQueue, setReviewQueue] = useState<IngredientImportDraft[]>([]);
  const [reviewQueueTotal, setReviewQueueTotal] = useState(0);
  const [reviewQueueCompleted, setReviewQueueCompleted] = useState(0);
  const [ingredientRefreshToken, setIngredientRefreshToken] = useState(0);
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const [recipeRefreshToken, setRecipeRefreshToken] = useState(0);
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(
    null,
  );
  const [activeNutritionLabel, setActiveNutritionLabel] = useState<{
    recipeId: string;
    recipeVersionId: string;
  } | null>(null);
  const [sampleSheetLaunch, setSampleSheetLaunch] =
    useState<SampleSheetLaunch | null>(null);
  const [recipeAgentContext, setRecipeAgentContext] =
    useState<RecipeAgentWorkbenchContext | null>(null);
  const [ingredientEditSession, setIngredientEditSession] = useState<
    (RecipeIngredientEditRequest & { key: string }) | null
  >(null);
  const [resumeNutritionItemId, setResumeNutritionItemId] = useState<
    string | null
  >(null);
  const isAgentSurface = new URLSearchParams(window.location.search).get("surface") === "agent";

  useEffect(() => {
    return subscribeThemePreference();
  }, []);

  useEffect(() => {
    if (typeof desktopApi.getAppVersion !== "function") return;
    let active = true;
    void desktopApi.getDatabaseStatus().then((status) => {
      if (active) setDatabaseStatus(status);
    });
    return () => {
      active = false;
    };
  }, [desktopApi]);

  useEffect(() => {
    let active = true;
    void desktopApi
      .getAppVersion()
      .then((info) => {
        if (active) setAppVersion(info.currentVersion);
      })
      .catch(() => {
        if (active) setAppVersion(null);
      });
    return () => {
      active = false;
    };
  }, [desktopApi]);

  function navigate(page: AppPage) {
    if (page === "settings") setSettingsSection("general");
    setActiveNutritionLabel(null);
    setSampleSheetLaunch(null);
    if (page !== "recipe-library") setActiveRecipeId(null);
    if (page !== "recipe-library") setRecipeAgentContext(null);
    setIngredientEditSession(null);
    setResumeNutritionItemId(null);
    setActivePage(page);
  }

  function openIngredientEditor(request: RecipeIngredientEditRequest) {
    setIngredientEditSession({
      ...request,
      key: `${request.recipeId}:${request.itemId}:${Date.now()}`,
    });
    setActivePage("ingredients");
  }

  function returnFromIngredientEditor() {
    const session = ingredientEditSession;
    if (session === null) return;
    setIngredientRefreshToken((current) => current + 1);
    setDraftRefreshToken((current) => current + 1);
    setRecipeRefreshToken((current) => current + 1);
    setActiveRecipeId(session.recipeId);
    setResumeNutritionItemId(session.itemId);
    setIngredientEditSession(null);
    setActivePage("recipe-library");
  }

  function configureAgent(section: "general" | "models") {
    if (isAgentSurface) window.history.replaceState(null, "", window.location.pathname);
    setSettingsSection(section);
    setActivePage("settings");
    setAgentOpen(true);
  }

  async function refreshAfterRestore() {
    const status = await desktopApi.getDatabaseStatus();
    setDatabaseStatus(status);
    setIngredientRefreshToken((current) => current + 1);
    setDraftRefreshToken((current) => current + 1);
    setActiveRecipeId(null);
    setActiveNutritionLabel(null);
    setSampleSheetLaunch(null);
  }

  function openReviewQueue(
    draft: IngredientImportDraft,
    drafts: IngredientImportDraft[],
  ) {
    const reviewable = drafts.filter(
      (candidate) =>
        candidate.status !== "imported" && candidate.status !== "discarded",
    );
    const currentIndex = reviewable.findIndex(
      (candidate) => candidate.id === draft.id,
    );
    const ordered =
      currentIndex >= 0
        ? [
            ...reviewable.slice(currentIndex),
            ...reviewable.slice(0, currentIndex),
          ]
        : [draft, ...reviewable];
    setReviewQueue(ordered);
    setReviewQueueTotal(ordered.length);
    setReviewQueueCompleted(0);
    setReviewDraft(draft);
  }

  function refreshAfterIngredientImport() {
    setIngredientRefreshToken((current) => current + 1);
    setDraftRefreshToken((current) => current + 1);
  }

  function closeReviewQueue() {
    setReviewDraft(null);
    setReviewQueue([]);
    setReviewQueueTotal(0);
    setReviewQueueCompleted(0);
  }

  if (isAgentSurface) {
    return (
      <main className="agent-window-root">
        <AgentPanel
          api={desktopApi}
          events={eventSource}
          filePicker={sourcePicker}
          onClose={() => {}}
          onConfigure={configureAgent}
          onOpenImported={() => {}}
          onReviewDraft={() => {}}
          open
        />
      </main>
    );
  }

  return (
    <>
      <AppShell
        activePage={activePage}
        appVersion={appVersion}
        agentOpen={agentOpen}
        agentPanel={
          <AgentPanel
            api={desktopApi}
            draftRefreshToken={draftRefreshToken}
            events={eventSource}
            filePicker={sourcePicker}
            onClose={() => setAgentOpen(false)}
            onConfigure={configureAgent}
            onOpenImported={() => {
              setActivePage("ingredients");
              setAgentOpen(false);
            }}
            onOpenRecipeDraft={(recipeId) => {
              setActiveNutritionLabel(null);
              setSampleSheetLaunch(null);
              setActiveRecipeId(recipeId);
              setActivePage("recipe-library");
            }}
            onReviewDraft={openReviewQueue}
            open={agentOpen}
            recipeContext={recipeAgentContext}
          />
        }
        databaseStatus={databaseStatus}
        onNavigate={navigate}
        onToggleAgent={() => setAgentOpen((current) => !current)}
      >
        {sampleSheetLaunch ? (
          <SampleSheetWorkspace
            api={desktopApi}
            launch={sampleSheetLaunch}
            onBack={() => setSampleSheetLaunch(null)}
          />
        ) : activePage === "ingredients" ? (
          <IngredientLibrary
            api={desktopApi}
            editLaunch={ingredientEditSession}
            onEditLaunchFinished={returnFromIngredientEditor}
            refreshToken={ingredientRefreshToken}
          />
        ) : activePage === "recipe-library" ? (
          <>
            <div
              className={
                activeRecipeId || activeNutritionLabel
                  ? "app-view-cache is-hidden"
                  : "app-view-cache"
              }
            >
              <RecipeLibrary
                api={desktopApi}
                onOpenDraft={setActiveRecipeId}
                onOpenNutritionLabel={(
                  recipeId,
                  recipeVersionId,
                ) =>
                  setActiveNutritionLabel({
                    recipeId,
                    recipeVersionId,
                  })
                }
                onOpenSampleSheet={(recipeId, versionId) =>
                  setSampleSheetLaunch({
                    origin: "library",
                    recipeId,
                    initialVersionId: versionId,
                  })
                }
                refreshToken={recipeRefreshToken}
              />
            </div>
            {activeRecipeId ? (
              <RecipeWorkbench
                api={desktopApi}
                onAgentContextChange={setRecipeAgentContext}
                onBack={() => {
                  setActiveRecipeId(null);
                  setRecipeRefreshToken((current) => current + 1);
                }}
                onOpenAgent={() => setAgentOpen(true)}
                onEditIngredient={openIngredientEditor}
                onOpenSampleSheet={setSampleSheetLaunch}
                onResumeNutritionConsumed={() =>
                  setResumeNutritionItemId(null)
                }
                recipeId={activeRecipeId}
                resumeNutritionItemId={resumeNutritionItemId}
              />
            ) : activeNutritionLabel ? (
              <NutritionLabelWorkspace
                api={desktopApi}
                onBack={() => setActiveNutritionLabel(null)}
                recipeId={activeNutritionLabel.recipeId}
                recipeVersionId={
                  activeNutritionLabel.recipeVersionId
                }
              />
            ) : null}
          </>
        ) : activePage === "settings" ? (
          <SettingsPage
            api={desktopApi}
            initialSection={settingsSection}
            key={settingsSection}
            onDataRestored={refreshAfterRestore}
          />
        ) : null}
      </AppShell>
      {reviewDraft ? (
        <ImportedVariantReview
          api={desktopApi}
          draft={reviewDraft}
          onCancel={closeReviewQueue}
          onSaved={() => {
            closeReviewQueue();
            refreshAfterIngredientImport();
            setActivePage("ingredients");
          }}
          {...(reviewQueue.length > 1
            ? {
                onSavedAndNext: () => {
                  const remaining = reviewQueue.slice(1);
                  refreshAfterIngredientImport();
                  setReviewQueue(remaining);
                  setReviewQueueCompleted((current) => current + 1);
                  setReviewDraft(remaining[0] ?? null);
                },
              }
            : {})}
          queuePosition={reviewQueueCompleted + 1}
          queueTotal={reviewQueueTotal}
        />
      ) : null}
    </>
  );
}
