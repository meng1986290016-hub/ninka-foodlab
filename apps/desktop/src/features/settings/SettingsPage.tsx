import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { DesktopApi } from "../../api/desktop-api";
import type { BackupFilePicker } from "../../api/backup-file-picker";
import { Icon, type IconName } from "../../components/Icon";
import { DataManagementSettings } from "./DataManagementSettings";
import { HarnessSettings } from "./HarnessSettings";

interface SettingsPageProps {
  api: DesktopApi;
  initialSection?: SettingsSection;
  backupFilePicker?: BackupFilePicker;
  nativeBackupAvailable?: boolean;
  onDataRestored?(): void | Promise<void>;
}

type SettingsSection = "general" | "models" | "data" | "licenses";

const settingsSections: Array<{
  id: SettingsSection;
  icon: IconName;
  label: string;
}> = [
  { id: "general", icon: "settings", label: "通用" },
  { id: "models", icon: "ai-assistant", label: "LLM 模型" },
  { id: "data", icon: "database", label: "数据管理" },
  { id: "licenses", icon: "info", label: "第三方开源许可" },
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
          <HarnessSettings api={api} section="general" />
        ) : section === "models" ? (
          <HarnessSettings api={api} section="models" />
        ) : section === "data" ? (
          <DataManagementSettings
            api={api}
            filePicker={backupFilePicker}
            nativeAvailable={nativeBackupAvailable}
            onRestored={onDataRestored}
          />
        ) : (
          <OpenSourceLicenses api={api} />
        )}
      </div>
    </div>
  );
}

function OpenSourceLicenses({ api }: { api: DesktopApi }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api.readThirdPartyLicenses()
      .then((value) => {
        if (active) setContent(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "许可信息读取失败");
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="settings-section" aria-labelledby="licenses-title">
      <div className="settings-section__heading">
        <h2 id="licenses-title">第三方开源许可</h2>
        <p>FoodLab 随安装包保留所用开源软件的许可证和版权声明。</p>
      </div>
      {error ? <p className="settings-message is-error" role="alert">{error}</p> : null}
      {content ? (
        <div className="settings-card open-source-licenses">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content}</ReactMarkdown>
        </div>
      ) : !error ? <p className="settings-loading">正在读取许可信息…</p> : null}
    </section>
  );
}
