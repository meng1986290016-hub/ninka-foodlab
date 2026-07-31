import { useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { BackupFilePicker } from "../../api/backup-file-picker";
import { AgentGeneralSettings } from "./AgentGeneralSettings";
import { DataManagementSettings } from "./DataManagementSettings";
import { ModelProviderSettings } from "./ModelProviderSettings";

interface SettingsPageProps {
  api: DesktopApi;
  initialSection?: SettingsSection;
  backupFilePicker?: BackupFilePicker;
  nativeBackupAvailable?: boolean;
  onDataRestored?(): void | Promise<void>;
}

type SettingsSection = "general" | "models" | "data";

export function SettingsPage({
  api,
  initialSection = "general",
  backupFilePicker,
  nativeBackupAvailable,
  onDataRestored,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

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
        <button
          aria-current={section === "data" ? "page" : undefined}
          className={section === "data" ? "is-active" : ""}
          onClick={() => setSection("data")}
          type="button"
        >
          数据管理
        </button>
      </aside>
      <div className="settings-content">
        {section === "general" ? (
          <AgentGeneralSettings api={api} />
        ) : section === "models" ? (
          <ModelProviderSettings api={api} />
        ) : (
          <DataManagementSettings
            api={api}
            filePicker={backupFilePicker}
            nativeAvailable={nativeBackupAvailable}
            onRestored={onDataRestored}
          />
        )}
      </div>
    </div>
  );
}
