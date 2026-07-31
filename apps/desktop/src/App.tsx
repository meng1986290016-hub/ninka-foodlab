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
import { RecipeLibrary } from "./features/recipes/RecipeLibrary";
import { RecipeWorkbench } from "./features/recipes/RecipeWorkbench";
import { SettingsPage } from "./features/settings/SettingsPage";
import "./styles/app.css";

interface AppProps {
  api?: DesktopApi;
  agentEvents?: AgentEventSource;
  filePicker?: ImportFilePicker;
}

export function App({ api, agentEvents, filePicker }: AppProps) {
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
  const [activePage, setActivePage] = useState<AppPage>("ingredients");
  const [agentOpen, setAgentOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "general" | "models"
  >("general");
  const [reviewDraft, setReviewDraft] =
    useState<IngredientImportDraft | null>(null);
  const [ingredientRefreshToken, setIngredientRefreshToken] = useState(0);
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void desktopApi.getDatabaseStatus().then((status) => {
      if (active) setDatabaseStatus(status);
    });
    return () => {
      active = false;
    };
  }, [desktopApi]);

  function navigate(page: AppPage) {
    if (page === "settings") setSettingsSection("general");
    setActivePage(page);
  }

  function configureAgent(section: "general" | "models") {
    setSettingsSection(section);
    setActivePage("settings");
    setAgentOpen(true);
  }

  return (
    <>
      <AppShell
        activePage={activePage}
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
            onReviewDraft={setReviewDraft}
            open={agentOpen}
          />
        }
        databaseStatus={databaseStatus}
        onNavigate={navigate}
        onToggleAgent={() => setAgentOpen((current) => !current)}
      >
        {activePage === "ingredients" ? (
          <IngredientLibrary
            api={desktopApi}
            refreshToken={ingredientRefreshToken}
          />
        ) : activePage === "recipes" ? (
          <RecipeWorkbench api={desktopApi} recipeId={activeRecipeId} />
        ) : activePage === "recipe-library" ? (
          <RecipeLibrary
            api={desktopApi}
            onOpenDraft={(recipeId) => {
              setActiveRecipeId(recipeId);
              setActivePage("recipes");
            }}
          />
        ) : activePage === "settings" ? (
          <SettingsPage
            api={desktopApi}
            initialSection={settingsSection}
            key={settingsSection}
          />
        ) : null}
      </AppShell>
      {reviewDraft ? (
        <ImportedVariantReview
          api={desktopApi}
          draft={reviewDraft}
          onCancel={() => setReviewDraft(null)}
          onSaved={() => {
            setReviewDraft(null);
            setIngredientRefreshToken((current) => current + 1);
            setDraftRefreshToken((current) => current + 1);
            setActivePage("ingredients");
          }}
        />
      ) : null}
    </>
  );
}
