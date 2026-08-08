import { useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { BackupFilePicker } from "../../api/backup-file-picker";
import { Icon, type IconName } from "../../components/Icon";
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

const settingsSections: Array<{
  id: SettingsSection;
  icon: IconName;
  label: string;
}> = [
  { id: "general", icon: "settings", label: "通用" },
  { id: "models", icon: "message", label: "LLM 模型" },
  { id: "data", icon: "database", label: "数据管理" },
];

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
        <div className="settings-nav__items">
          {settingsSections.map((item) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              className={section === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
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
