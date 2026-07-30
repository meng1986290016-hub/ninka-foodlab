import { useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import { AgentGeneralSettings } from "./AgentGeneralSettings";
import { ModelProviderSettings } from "./ModelProviderSettings";

interface SettingsPageProps {
  api: DesktopApi;
}

type SettingsSection = "general" | "models";

export function SettingsPage({ api }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("general");

  return (
    <div className="settings-page">
      <aside className="settings-nav" aria-label="设置分类">
        <h1>设置</h1>
        <button
          aria-current={section === "general" ? "page" : undefined}
          className={section === "general" ? "is-active" : ""}
          onClick={() => setSection("general")}
          type="button"
        >
          通用
        </button>
        <button
          aria-current={section === "models" ? "page" : undefined}
          className={section === "models" ? "is-active" : ""}
          onClick={() => setSection("models")}
          type="button"
        >
          LLM 模型
        </button>
      </aside>
      <div className="settings-content">
        {section === "general" ? (
          <AgentGeneralSettings api={api} />
        ) : (
          <ModelProviderSettings api={api} />
        )}
      </div>
    </div>
  );
}
