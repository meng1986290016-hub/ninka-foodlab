import { useState } from "react";

import type { LegacyResetPreview } from "../../api/agent-harness-types";
import type { DesktopApi } from "../../api/desktop-api";
import { Icon } from "../../components/Icon";

export function LegacyAgentReset({ api }: { api: DesktopApi }) {
  const [preview, setPreview] = useState<LegacyResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function inspect() {
    setBusy(true);
    setMessage("");
    try {
      setPreview(await api.previewLegacyAgentReset());
      setConfirmation("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "旧 Agent 数据预检失败");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!preview || !preview.canExecute || confirmation !== preview.confirmationPhrase) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api.executeLegacyAgentReset(preview.previewId, confirmation);
      setPreview(null);
      setConfirmation("");
      setMessage(
        `已删除 ${result.deletedRecords} 条记录、${result.deletedFiles} 个文件，清理 ${result.clearedKeychainAccounts} 个旧凭据${
          result.cleanupFailures.length ? `；${result.cleanupFailures.length} 项需重试` : ""
        }。`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "旧 Agent 数据清理失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="data-management-block legacy-agent-reset" aria-labelledby="legacy-agent-reset-title">
      <div>
        <span className="data-management-step"><Icon name="trash" size={16} /></span>
        <div>
          <h3 id="legacy-agent-reset-title">旧 Agent 数据重置</h3>
          <p>先只读预检；确认短语正确且数据图无冲突时，才会以单事务删除。</p>
        </div>
      </div>
      <button className="button button--secondary" disabled={busy} onClick={() => void inspect()} type="button">
        {busy ? "正在处理…" : "执行只读预检"}
      </button>
      {preview ? (
        <div className="data-management-review">
          <dl className="data-management-summary">
            {preview.counts.map((item) => (
              <div key={item.kind}><dt>{item.kind}</dt><dd>{item.count}</dd></div>
            ))}
          </dl>
          <p>拟删除文件：{preview.filePaths.length}；旧 Keychain 凭据：{preview.keychainAccounts.length}</p>
          {preview.conflicts.length ? (
            <div className="data-management-warning" role="alert">
              <Icon name="warning" size={18} />
              <span>{preview.conflicts.join("；")}</span>
            </div>
          ) : null}
          <label className="settings-field settings-field--wide">
            <span>再次输入确认短语</span>
            <input
              disabled={!preview.canExecute || busy}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={preview.confirmationPhrase}
              value={confirmation}
            />
          </label>
          <button
            className="button data-management-restore-button"
            disabled={!preview.canExecute || busy || confirmation !== preview.confirmationPhrase}
            onClick={() => void execute()}
            type="button"
          >
            永久删除预检范围内数据
          </button>
        </div>
      ) : null}
      {message ? <p className="data-management-message" role="status">{message}</p> : null}
    </section>
  );
}
