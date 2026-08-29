import { useEffect, useState } from "react";

import type {
  DataResetPreview,
  DataResetRecoveryInfo,
} from "../../api/data-reset-types";
import type { DesktopApi } from "../../api/desktop-api";
import { DesktopApiError } from "../../api/types";
import { Icon } from "../../components/Icon";

const AGENT_UI_CACHE_KEYS = [
  "foodlab.agent.active-conversation.v1",
  "foodlab.agent.conversation-drafts.v1",
];

export function DataResetSettings({
  api,
  nativeAvailable,
}: {
  api: DesktopApi;
  nativeAvailable: boolean;
}) {
  const [preview, setPreview] = useState<DataResetPreview | null>(null);
  const [recovery, setRecovery] = useState<DataResetRecoveryInfo | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [noBackupConfirmation, setNoBackupConfirmation] = useState("");
  const [backupFailed, setBackupFailed] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "clear" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nativeAvailable || typeof api.getLatestDataResetRecovery !== "function") return;
    let active = true;
    void api
      .getLatestDataResetRecovery()
      .then((value) => {
        if (active) setRecovery(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, nativeAvailable]);

  async function inspectImpact() {
    if (!nativeAvailable || busy !== null) return;
    setBusy("preview");
    clearFeedback();
    setBackupFailed(false);
    try {
      const value = await api.previewDataReset();
      setPreview(value);
      setRecovery(value.latestRecovery);
      setConfirmation("");
      setNoBackupConfirmation("");
    } catch (cause) {
      setError(messageFrom(cause, "无法检查清空影响"));
    } finally {
      setBusy(null);
    }
  }

  async function clearData(allowWithoutBackup: boolean) {
    if (!preview || busy !== null) return;
    setBusy("clear");
    clearFeedback();
    try {
      const result = await api.executeDataReset({
        previewId: preview.previewId,
        confirmationPhrase: confirmation,
        allowWithoutBackup,
        ...(allowWithoutBackup
          ? { noBackupConfirmationPhrase: noBackupConfirmation }
          : {}),
      });
      setRecovery(result.recovery ?? recovery);
      setPreview(null);
      setMessage(
        `已清空 ${formatCount(result.clearedRecords)} 条研发记录和 ${formatCount(
          result.clearedAttachments,
        )} 个附件，应用即将重启。`,
      );
      clearAgentUiCache();
      await api.restartApplication();
    } catch (cause) {
      if (cause instanceof DesktopApiError && cause.code === "safety_backup_failed") {
        setBackupFailed(true);
      }
      setError(messageFrom(cause, "清空失败，当前数据未被替换"));
    } finally {
      setBusy(null);
    }
  }

  async function restoreRecovery() {
    if (!restoreConfirmed || busy !== null) return;
    setBusy("restore");
    clearFeedback();
    try {
      const result = await api.restoreLatestDataResetRecovery(true);
      setMessage(
        `已恢复 ${formatDate(result.recovery.createdAt)} 的清空前数据，应用即将重启。`,
      );
      clearAgentUiCache();
      await api.restartApplication();
    } catch (cause) {
      setError(messageFrom(cause, "恢复失败，当前数据未被替换"));
    } finally {
      setBusy(null);
    }
  }

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  return (
    <section className="data-management-block data-reset-settings" aria-labelledby="data-reset-title">
      <div>
        <span className="data-management-step"><Icon name="trash" size={16} /></span>
        <div>
          <h3 id="data-reset-title">清空本机研发数据</h3>
          <p>
            清除原料、配方、标签、报告、导入草稿与 Agent 历史；保留模型配置、API Key、内置资料和既有备份。
          </p>
        </div>
      </div>
      <button
        className="button button--secondary"
        disabled={!nativeAvailable || busy !== null}
        onClick={() => void inspectImpact()}
        type="button"
      >
        {busy === "preview" ? "正在检查…" : "先检查清空影响"}
      </button>

      {preview ? (
        <div className="data-management-review data-reset-settings__review">
          <dl className="data-management-summary">
            <Summary label="原料组" value={preview.counts.materialGroups} />
            <Summary label="原料版本" value={preview.counts.ingredientVariants} />
            <Summary label="配方" value={preview.counts.recipes} />
            <Summary label="标签与报告" value={preview.counts.nutritionLabels + preview.counts.researchReports} />
            <Summary label="导入草稿" value={preview.counts.importDrafts} />
            <Summary label="Agent 任务与会话" value={preview.counts.agentTasks + preview.counts.agentConversations} />
            <Summary label="已登记附件" value={preview.counts.attachments} />
          </dl>
          <div className="data-management-warning" role="note">
            <Icon name="warning" size={18} />
            <span>确认后会先停止 Agent，并在 recovery-backups 中创建和校验清空前安全快照。</span>
          </div>
          <label className="settings-field settings-field--wide">
            <span>输入“{preview.confirmationPhrase}”以确认</span>
            <input
              disabled={busy !== null}
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <button
            className="button data-reset-settings__danger-button"
            disabled={busy !== null || confirmation !== preview.confirmationPhrase}
            onClick={() => void clearData(false)}
            type="button"
          >
            {busy === "clear" ? "正在安全清空…" : "创建安全快照并清空"}
          </button>

          {backupFailed ? (
            <div className="data-reset-settings__no-backup">
              <strong>安全快照失败，数据尚未清空</strong>
              <p>只有明确接受无法恢复的风险时，才能使用下面的严格确认继续。</p>
              <label className="settings-field settings-field--wide">
                <span>输入完整短语“{preview.noBackupConfirmationPhrase}”</span>
                <input
                  disabled={busy !== null}
                  onChange={(event) => setNoBackupConfirmation(event.target.value)}
                  value={noBackupConfirmation}
                />
              </label>
              <button
                className="button data-reset-settings__danger-button"
                disabled={
                  busy !== null ||
                  noBackupConfirmation !== preview.noBackupConfirmationPhrase
                }
                onClick={() => void clearData(true)}
                type="button"
              >
                不备份并继续清空
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="data-reset-settings__recovery">
        <div>
          <strong>恢复最近一次清空前的数据</strong>
          <p>
            {recovery
              ? `最近快照：${formatDate(recovery.createdAt)}`
              : "当前没有可用的清空前安全快照。"}
          </p>
        </div>
        {recovery ? (
          <>
            <label>
              <input
                checked={restoreConfirmed}
                disabled={busy !== null}
                onChange={(event) => setRestoreConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>我确认恢复该快照并替换当前研发数据</span>
            </label>
            <button
              className="button button--secondary"
              disabled={!restoreConfirmed || busy !== null}
              onClick={() => void restoreRecovery()}
              type="button"
            >
              {busy === "restore" ? "正在恢复…" : "恢复最近快照"}
            </button>
          </>
        ) : null}
      </div>

      {message ? <p className="data-management-message is-success" role="status">{message}</p> : null}
      {error ? <p className="data-management-message is-error" role="alert">{error}</p> : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><dt>{label}</dt><dd>{formatCount(value)}</dd></div>;
}

function clearAgentUiCache() {
  for (const key of AGENT_UI_CACHE_KEYS) localStorage.removeItem(key);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
