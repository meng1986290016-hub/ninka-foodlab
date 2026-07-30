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
import { AppShell, type AppPage } from "./components/AppShell";
import { AgentPanel } from "./features/agent/AgentPanel";
import { IngredientLibrary } from "./features/ingredients/IngredientLibrary";
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
    <AppShell
      activePage={activePage}
      agentOpen={agentOpen}
      agentPanel={
        <AgentPanel
          api={desktopApi}
          events={eventSource}
          filePicker={sourcePicker}
          onClose={() => setAgentOpen(false)}
          onConfigure={configureAgent}
          open={agentOpen}
        />
      }
      databaseStatus={databaseStatus}
      onNavigate={navigate}
      onToggleAgent={() => setAgentOpen((current) => !current)}
    >
      {activePage === "ingredients" ? (
        <IngredientLibrary api={desktopApi} />
      ) : activePage === "settings" ? (
        <SettingsPage
          api={desktopApi}
          initialSection={settingsSection}
          key={settingsSection}
        />
      ) : (
        <section className="future-page">
          <h1>{activePage === "recipes" ? "配方工作台" : "配方库"}</h1>
          <p>该功能将在后续阶段开放，当前原料库和设置可正常使用。</p>
        </section>
      )}
    </AppShell>
  );
}
