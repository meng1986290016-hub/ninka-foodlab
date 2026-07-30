import { useEffect, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  AgentPreferences,
  AgentProviderConfig,
} from "../../api/agent-types";

interface AgentGeneralSettingsProps {
  api: DesktopApi;
}

export function AgentGeneralSettings({ api }: AgentGeneralSettingsProps) {
  const [preferences, setPreferences] = useState<AgentPreferences | null>(null);
  const [providers, setProviders] = useState<AgentProviderConfig[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.getAgentPreferences(),
      api.listAgentProviderConfigs(),
    ])
      .then(([nextPreferences, nextProviders]) => {
        if (!active) return;
        setPreferences(nextPreferences);
        setProviders(nextProviders);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Agent 设置读取失败");
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function save(next: AgentPreferences) {
    setPreferences(next);
    try {
      setPreferences(await api.saveAgentPreferences(next));
      setMessage("已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "设置保存失败");
    }
  }

  if (!preferences) {
    return <p className="settings-loading">正在读取 Agent 设置…</p>;
  }

  const activeProvider = providers.find((provider) => provider.enabled);
  const imageProviders = providers.filter(
    (provider) => provider.capabilities.images,
  );

  return (
    <section className="settings-section" aria-labelledby="agent-general-title">
      <div className="settings-section__heading">
        <h2 id="agent-general-title">食品研发 Agent</h2>
        <p>Agent 默认开启；所有原料导入结果都必须经过人工复核才能保存。</p>
      </div>

      <div className="settings-row">
        <div>
          <strong>启用食品研发 Agent</strong>
          <p>关闭后不影响原料库、表格导入和其他手动研发功能。</p>
        </div>
        <button
          aria-checked={preferences.enabled}
          aria-label="启用食品研发 Agent"
          className={preferences.enabled ? "switch is-on" : "switch"}
          onClick={() =>
            void save({ ...preferences, enabled: !preferences.enabled })
          }
          role="switch"
          type="button"
        >
          <span />
        </button>
      </div>

      <label className="settings-field settings-field--wide">
        <span>图片识别模型</span>
        <select
          onChange={(event) =>
            void save({
              ...preferences,
              visionProviderConfigId: event.target.value || null,
            })
          }
          value={preferences.visionProviderConfigId ?? ""}
        >
          <option value="">
            {activeProvider?.capabilities.images
              ? "使用当前聊天模型"
              : "尚未选择"}
          </option>
          {imageProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName}
            </option>
          ))}
        </select>
        <small>
          当前聊天模型不支持图片时，标签照片会交给这里选择的模型读取。
        </small>
      </label>

      <div className="settings-safety-note">
        Agent 可以读取原料库、附件和导入草稿，但不能绕过人工复核直接正式入库。
      </div>
      {message ? <p className="settings-message">{message}</p> : null}
    </section>
  );
}
