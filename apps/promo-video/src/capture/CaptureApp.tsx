import { BrowserAgentEventSource } from "../../../desktop/src/api/agent-event-source";
import type { ReactNode } from "react";
import type { ImportFilePicker } from "../../../desktop/src/api/import-file-picker";
import { AppShell, type AppPage } from "../../../desktop/src/components/AppShell";
import { AgentPanel } from "../../../desktop/src/features/agent/AgentPanel";
import { IngredientLibrary } from "../../../desktop/src/features/ingredients/IngredientLibrary";
import { NutritionLabelWorkspace } from "../../../desktop/src/features/labels/NutritionLabelWorkspace";
import { RecipeWorkbench } from "../../../desktop/src/features/recipes/RecipeWorkbench";
import type { PromoDemoFixture } from "./promo-demo-api";

export type CaptureSurface = "ingredients" | "agent" | "workbench" | "label";

const events = new BrowserAgentEventSource();
const filePicker: ImportFilePicker = {
  async pickSources() {
    return [];
  },
  async pickDestination() {
    return null;
  },
};

function Shell({
  activePage,
  children,
}: {
  activePage: AppPage;
  children: ReactNode;
}) {
  return (
    <AppShell
      activePage={activePage}
      agentOpen={false}
      agentPanel={null}
      databaseStatus={{ mode: "browser-demo", schemaVersion: 10, healthy: true }}
      onNavigate={() => {}}
      onToggleAgent={() => {}}
    >
      {children}
    </AppShell>
  );
}

export function CaptureApp({
  fixture,
  surface,
}: {
  fixture: PromoDemoFixture;
  surface: CaptureSurface;
}) {
  const { api, recipeId, recipeVersionId } = fixture;
  return (
    <>
      {surface === "ingredients" ? (
        <Shell activePage="ingredients">
          <IngredientLibrary api={api} refreshToken={0} />
        </Shell>
      ) : null}
      {surface === "workbench" ? (
        <Shell activePage="recipe-library">
          <RecipeWorkbench api={api} onBack={() => {}} recipeId={recipeId} />
        </Shell>
      ) : null}
      {surface === "label" ? (
        <Shell activePage="recipe-library">
          <NutritionLabelWorkspace
            api={api}
            onBack={() => {}}
            recipeId={recipeId}
            recipeVersionId={recipeVersionId}
          />
        </Shell>
      ) : null}
      {surface === "agent" ? (
        <main className="agent-window-root">
          <AgentPanel
            api={api}
            events={events}
            filePicker={filePicker}
            onClose={() => {}}
            onConfigure={() => {}}
            onOpenImported={() => {}}
            onReviewDraft={() => {}}
            open
          />
        </main>
      ) : null}
      <div className="promo-capture-badge">演示数据</div>
    </>
  );
}
