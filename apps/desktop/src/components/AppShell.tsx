import type { ReactNode } from "react";

import type { DatabaseStatus } from "../api/types";
import { APP_NAME } from "../app-metadata";
import { Icon, type IconName } from "./Icon";

interface AppShellProps {
  children: ReactNode;
  databaseStatus: DatabaseStatus | null;
}

const navigation: Array<{ label: string; icon: IconName; active?: boolean }> = [
  { label: "原料库", icon: "ingredients", active: true },
  { label: "配方工作台", icon: "flask" },
  { label: "配方库", icon: "formula" },
  { label: "设置", icon: "settings" },
];

export function AppShell({ children, databaseStatus }: AppShellProps) {
  const isBrowserDemo = databaseStatus?.mode !== "sqlite";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">{APP_NAME}</div>
        <nav aria-label="主导航" className="primary-nav">
          {navigation.map((item) => (
            <button
              aria-current={item.active ? "page" : undefined}
              className={item.active ? "nav-item nav-item--active" : "nav-item"}
              disabled={!item.active}
              key={item.label}
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
