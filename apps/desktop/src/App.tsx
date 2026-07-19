import { useEffect, useState } from "react";

import { createDesktopApi } from "./api/create-desktop-api";
import type { DesktopApi } from "./api/desktop-api";
import type { DatabaseStatus } from "./api/types";
import { AppShell } from "./components/AppShell";
import { IngredientLibrary } from "./features/ingredients/IngredientLibrary";
import "./styles/app.css";

interface AppProps {
  api?: DesktopApi;
}

export function App({ api }: AppProps) {
  const [desktopApi] = useState(() => api ?? createDesktopApi());
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(
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

  return (
    <AppShell databaseStatus={databaseStatus}>
      <IngredientLibrary api={desktopApi} />
    </AppShell>
  );
}
