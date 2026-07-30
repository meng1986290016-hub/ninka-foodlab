import { useEffect, useState } from "react";

import { createDesktopApi } from "./api/create-desktop-api";
import type { DesktopApi } from "./api/desktop-api";
import type { DatabaseStatus } from "./api/types";
import { AppShell, type AppPage } from "./components/AppShell";
import { IngredientLibrary } from "./features/ingredients/IngredientLibrary";
import { SettingsPage } from "./features/settings/SettingsPage";
import "./styles/app.css";

interface AppProps {
  api?: DesktopApi;
}

export function App({ api }: AppProps) {
  const [desktopApi] = useState(() => api ?? createDesktopApi());
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(
    null,
  );
  const [activePage, setActivePage] = useState<AppPage>("ingredients");

  useEffect(() => {
    let active = true;
    void desktopApi.getDatabaseStatus().then((status) => {
      if (active) setDatabaseStatus(status);
    });
    return () => {
      active = false;
    };
  }, [desktopApi]);

  return (
    <AppShell
      activePage={activePage}
      databaseStatus={databaseStatus}
      onNavigate={setActivePage}
    >
      {activePage === "ingredients" ? (
        <IngredientLibrary api={desktopApi} />
      ) : activePage === "settings" ? (
        <SettingsPage api={desktopApi} />
      ) : (
        <section className="future-page">
          <h1>{activePage === "recipes" ? "配方工作台" : "配方库"}</h1>
          <p>该功能将在后续阶段开放，当前原料库和设置可正常使用。</p>
        </section>
      )}
    </AppShell>
  );
}
