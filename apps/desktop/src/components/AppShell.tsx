import { useState, type ReactNode } from "react";

import brandSymbolUrl from "../../../../assets/branding/source/ninka-symbol-color-dark.svg?url";
import type { DatabaseStatus } from "../api/types";
import { APP_NAME } from "../app-metadata";
import { Icon, type IconName } from "./Icon";

interface AppShellProps {
  children: ReactNode;
  agentPanel: ReactNode;
  agentOpen: boolean;
  databaseStatus: DatabaseStatus | null;
  activePage: AppPage;
  onNavigate(page: AppPage): void;
  onToggleAgent(): void;
}

export type AppPage = "ingredients" | "recipe-library" | "settings";

const navigation: Array<{ id: AppPage; label: string; icon: IconName }> = [
  { id: "ingredients", label: "原料库", icon: "ingredient-library" },
  { id: "recipe-library", label: "配方库", icon: "recipe-library" },
  { id: "settings", label: "设置", icon: "settings" },
];

export function AppShell({
  children,
  agentPanel,
  agentOpen,
  databaseStatus,
  activePage,
  onNavigate,
  onToggleAgent,
}: AppShellProps) {
  const isBrowserDemo = databaseStatus?.mode !== "sqlite";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const shellClassName = [
    "app-shell",
    agentOpen ? "is-agent-open" : "",
    sidebarCollapsed ? "is-sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <aside className="sidebar">
        <div className="brand" title={`${APP_NAME} · Ninka FoodLab`}>
          <img
            alt="Ninka FoodLab 品牌标志"
            className="brand__mark"
            src={brandSymbolUrl}
          />
          <span className="brand__identity">
            <strong>{APP_NAME}</strong>
            <small>Ninka FoodLab</small>
          </span>
        </div>
        <nav aria-label="主导航" className="primary-nav">
          {navigation.map((item) => (
            <button
              aria-label={item.label}
              aria-current={item.id === activePage ? "page" : undefined}
              className={
                item.id === activePage ? "nav-item nav-item--active" : "nav-item"
              }
              data-label={item.label}
              key={item.label}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              type="button"
            >
              <Icon name={item.icon} />
              <span className="nav-item__label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button
          aria-label={sidebarCollapsed ? "展开导航" : "收起导航"}
          aria-pressed={sidebarCollapsed}
          className="collapse-button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? "展开导航" : "收起导航"}
          type="button"
        >
          {sidebarCollapsed ? "››" : "‹‹"}
        </button>
      </aside>

      <header className="topbar">
        <button
          aria-expanded={agentOpen}
          aria-label={
            agentOpen ? "隐藏食品研发 Agent 面板" : "打开食品研发 Agent"
          }
          className={
            agentOpen ? "agent-toggle-button is-active" : "agent-toggle-button"
          }
          onClick={onToggleAgent}
          type="button"
        >
          <Icon name="ai-assistant" size={18} />
          <span>{agentOpen ? "关闭 Agent" : "食品研发 Agent"}</span>
        </button>
        <span className="topbar-spacer" />
        <div className="database-indicator">
          <Icon name="database" size={19} />
          <span>{isBrowserDemo ? "浏览器演示数据" : "本地数据库"}</span>
          <span className="health-dot" aria-label="数据状态正常" />
        </div>
        <span className="offline-indicator">离线可用</span>
      </header>

      <main className="app-content">{children}</main>
      {agentPanel}

      <footer className="statusbar">
        <span>{isBrowserDemo ? "浏览器演示数据" : "SQLite 本地数据"}</span>
        <span>版本 0.1.0 · 离线模式</span>
      </footer>
    </div>
  );
}
