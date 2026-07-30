import type { ReactNode } from "react";

import type { DatabaseStatus } from "../api/types";
import { APP_NAME } from "../app-metadata";
import { Icon, type IconName } from "./Icon";

interface AppShellProps {
  children: ReactNode;
  databaseStatus: DatabaseStatus | null;
  activePage: AppPage;
  onNavigate(page: AppPage): void;
}

export type AppPage = "ingredients" | "recipes" | "recipe-library" | "settings";

const navigation: Array<{ id: AppPage; label: string; icon: IconName }> = [
  { id: "ingredients", label: "原料库", icon: "ingredients" },
  { id: "recipes", label: "配方工作台", icon: "flask" },
  { id: "recipe-library", label: "配方库", icon: "formula" },
  { id: "settings", label: "设置", icon: "settings" },
];

export function AppShell({
  children,
  databaseStatus,
  activePage,
  onNavigate,
}: AppShellProps) {
  const isBrowserDemo = databaseStatus?.mode !== "sqlite";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">{APP_NAME}</div>
        <nav aria-label="主导航" className="primary-nav">
          {navigation.map((item) => (
            <button
              aria-current={item.id === activePage ? "page" : undefined}
              className={
                item.id === activePage ? "nav-item nav-item--active" : "nav-item"
              }
              key={item.label}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button aria-label="收起导航" className="collapse-button" type="button">
          ‹‹
        </button>
      </aside>

      <header className="topbar">
        <div className="database-indicator">
          <Icon name="database" size={19} />
          <span>{isBrowserDemo ? "浏览器演示数据" : "本地数据库"}</span>
          <span className="health-dot" aria-label="数据状态正常" />
        </div>
        <span className="offline-indicator">离线可用</span>
      </header>

      <main className="app-content">{children}</main>

      <footer className="statusbar">
        <span>{isBrowserDemo ? "浏览器演示数据" : "SQLite 本地数据"}</span>
        <span>版本 0.1.0 · 离线模式</span>
      </footer>
    </div>
  );
}
