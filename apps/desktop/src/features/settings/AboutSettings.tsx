import { useEffect, useState } from "react";

import type { UpdateCheckResult } from "../../api/app-info-types";
import type { DesktopApi } from "../../api/desktop-api";
import { Icon } from "../../components/Icon";

export function AboutSettings({ api }: { api: DesktopApi }) {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .getAppVersion()
      .then((info) => {
        if (active) setVersion(info.currentVersion);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause, "无法读取当前版本"));
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function checkForUpdates() {
    if (checking) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.checkForUpdates());
    } catch (cause) {
      setError(messageFrom(cause, "检查更新失败"));
    } finally {
      setChecking(false);
    }
  }

  async function openReleasePage() {
    if (result === null) return;
    try {
      await api.openReleasePage(result.releaseUrl);
    } catch (cause) {
      setError(messageFrom(cause, "无法打开下载页面"));
    }
  }

  return (
    <section className="settings-section settings-section--general about-settings" aria-labelledby="about-title">
      <div className="settings-section__heading">
        <h2 id="about-title">关于 Ninka FoodLab</h2>
        <p>查看当前安装版本，并按需检查项目 GitHub 的最新稳定版。</p>
      </div>

      <div className="about-settings__content">
        <div className="settings-preference-row about-settings__version-row">
          <Icon className="settings-preference-row__icon" name="info" size={22} />
          <div className="settings-preference-row__copy">
            <strong>当前版本</strong>
            <small>版本号直接来自当前桌面安装包。</small>
          </div>
          <div className="about-settings__version-actions">
            <strong className="about-settings__version">
              {version === null ? "正在读取…" : `V${version}`}
            </strong>
            <button
              className="button button--secondary settings-runtime-retry"
              disabled={checking}
              onClick={() => void checkForUpdates()}
              type="button"
            >
              <Icon name="refresh" size={17} />
              {checking ? "正在检查…" : "检查更新"}
            </button>
          </div>
        </div>

        {result?.status === "latest" ? (
          <div className="about-settings__result is-latest" role="status">
            <Icon name="check" size={18} />
            <div>
              <strong>已是最新稳定版</strong>
              <p>GitHub 最新稳定版为 V{result.latestVersion}。</p>
            </div>
          </div>
        ) : null}

        {result?.status === "update_available" ? (
          <div className="about-settings__result is-update">
            <Icon name="info" size={18} />
            <div role="status">
              <strong>发现新版本 V{result.latestVersion}</strong>
              <p>
                {result.publishedAt
                  ? `发布于 ${formatDate(result.publishedAt)}。`
                  : "GitHub 已发布新的稳定版。"}
                应用不会自动下载或安装。
              </p>
            </div>
            <button
              className="button button--primary"
              onClick={() => void openReleasePage()}
              type="button"
            >
              打开下载页面
            </button>
          </div>
        ) : null}

        {error !== null ? (
          <div className="about-settings__result is-error" role="alert">
            <Icon name="warning" size={18} />
            <div>
              <strong>操作未完成</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        <div className="about-settings__privacy-note">
          <Icon name="lock" size={18} />
          <p>仅在点击“检查更新”时访问 GitHub；启动应用时不会自动检查。</p>
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
