import { useState } from "react";

import type { BackupFilePicker } from "../../api/backup-file-picker";
import { createBackupFilePicker } from "../../api/backup-file-picker";
import type { BackupManifest, BackupPreflight } from "../../api/backup-types";
import type { DesktopApi } from "../../api/desktop-api";
import { Icon } from "../../components/Icon";
import { LegacyAgentReset } from "./LegacyAgentReset";

interface DataManagementSettingsProps {
  api: DesktopApi;
  filePicker?: BackupFilePicker | undefined;
  nativeAvailable?: boolean | undefined;
  onRestored?: (() => void | Promise<void>) | undefined;
  now?: () => Date;
}

type Operation = "create" | "inspect" | "restore";

export function DataManagementSettings({
  api,
  filePicker,
  nativeAvailable = window.__TAURI_INTERNALS__ !== undefined,
  onRestored,
  now = () => new Date(),
}: DataManagementSettingsProps) {
  const [defaultFilePicker] = useState(createBackupFilePicker);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<BackupPreflight | null>(null);
  const [createdBackup, setCreatedBackup] = useState<BackupManifest | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = filePicker ?? defaultFilePicker;
  const busy = operation !== null;

  async function createBackup() {
    if (!nativeAvailable || busy) return;
    setOperation("create");
    clearFeedback();
    try {
      const date = now().toISOString().slice(0, 10);
      const destination = await picker.pickBackupDestination(
        `food-rd-backup-${date}`,
      );
      if (destination === null) return;
      const manifest = await api.createDataBackup(destination);
      setCreatedBackup(manifest);
      setMessage(
        `备份已创建并校验：${manifest.totals.attachmentCount} 个附件，${formatBytes(
          manifest.totals.totalBytes,
        )}`,
      );
    } catch (cause) {
      setError(messageFrom(cause, "备份创建失败"));
    } finally {
      setOperation(null);
    }
  }

  async function selectAndInspect() {
    if (!nativeAvailable || busy) return;
    setOperation("inspect");
    clearFeedback();
    try {
      const source = await picker.pickBackupSource();
      if (source === null) return;
      const result = await api.inspectDataBackup(source);
      setSelectedPath(source);
      setPreflight(result);
      setConfirmed(false);
      setMessage("备份检查通过，可以确认恢复影响。");
    } catch (cause) {
      setSelectedPath(null);
      setPreflight(null);
      setConfirmed(false);
      setError(messageFrom(cause, "备份检查失败"));
    } finally {
      setOperation(null);
    }
  }

  async function restoreBackup() {
    if (
      !nativeAvailable ||
      busy ||
      !confirmed ||
      selectedPath === null ||
      preflight === null
    ) {
      return;
    }
    setOperation("restore");
    clearFeedback();
    try {
      const result = await api.restoreDataBackup(selectedPath, true);
      setConfirmed(false);
      try {
        await onRestored?.();
      } catch {
        setError("数据已恢复，但界面刷新失败；请重新启动应用后核对数据");
        return;
      }
      setMessage(
        `数据已恢复到 schema ${result.restoredSchemaVersion}；恢复前安全副本：${result.safetyBackupFileName}`,
      );
    } catch (cause) {
      setError(messageFrom(cause, "数据恢复失败，当前数据未被替换"));
    } finally {
      setOperation(null);
    }
  }

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  return (
    <section className="settings-section data-management" aria-labelledby="data-management-title">
      <div className="settings-section__heading">
        <h2 id="data-management-title">数据管理</h2>
        <p>创建可校验的本地备份，并在恢复前检查内容、版本与影响。</p>
      </div>

      {!nativeAvailable ? (
        <div className="data-management__browser-note" role="note">
          <Icon name="offline" size={19} />
          <div>
            <strong>浏览器演示模式不执行真实本机备份</strong>
            <p>请在桌面版中创建、检查或恢复 .foodrd-backup 文件。</p>
          </div>
        </div>
      ) : null}

      <section className="data-management-block" aria-labelledby="create-backup-title">
        <div>
          <span className="data-management-step">1</span>
          <div>
            <h3 id="create-backup-title">创建备份</h3>
            <p>
              包含 SQLite 数据库和已登记附件；不包含 API Key、缓存和临时文件。
            </p>
          </div>
        </div>
        <button
          className="button button--secondary"
          disabled={!nativeAvailable || busy}
          onClick={() => void createBackup()}
          type="button"
        >
          <Icon name="backup" size={17} />
          {operation === "create" ? "正在创建…" : "创建备份"}
        </button>
        {createdBackup !== null ? (
          <small className="data-management-block__meta">
            最近创建：{formatDate(createdBackup.createdAt)} · schema {createdBackup.schemaVersion}
          </small>
        ) : null}
      </section>

      <section className="data-management-block" aria-labelledby="restore-backup-title">
        <div>
          <span className="data-management-step">2</span>
          <div>
            <h3 id="restore-backup-title">检查与恢复</h3>
            <p>先选择备份并完成只读预检，通过后才能确认恢复。</p>
          </div>
        </div>
        <button
          className="button button--secondary"
          disabled={!nativeAvailable || busy}
          onClick={() => void selectAndInspect()}
          type="button"
        >
          <Icon name="restore" size={17} />
          {operation === "inspect" ? "正在检查…" : "选择并检查备份"}
        </button>

        {preflight !== null ? (
          <div className="data-management-review">
            <div className="data-management-selected-file">
              <Icon name="check" size={16} />
              <span>已检查：{fileName(selectedPath ?? "")}</span>
            </div>
            <dl className="data-management-summary">
              <SummaryItem label="备份时间" value={formatDate(preflight.createdAt)} />
              <SummaryItem label="应用版本" value={`V${preflight.applicationVersion}`} />
              <SummaryItem
                label="数据库版本"
                value={
                  preflight.requiresMigration
                    ? `schema ${preflight.sourceSchemaVersion} → ${preflight.targetSchemaVersion}`
                    : `schema ${preflight.sourceSchemaVersion} · 无需迁移`
                }
              />
              <SummaryItem label="数据记录" value={formatCount(preflight.dataRecordCount)} />
              <SummaryItem label="附件" value={`${formatCount(preflight.attachmentCount)} 个`} />
              <SummaryItem label="总大小" value={formatBytes(preflight.totalBytes)} />
            </dl>
            <div className="data-management-warning">
              <Icon name="warning" size={18} />
              <span>恢复前会自动备份当前数据；恢复失败将自动回滚。</span>
            </div>
            <div className="data-management-confirmation">
              <label>
                <input
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>我已确认将用所选备份替换当前数据</span>
              </label>
              <button
                className="button data-management-restore-button"
                disabled={!confirmed || busy}
                onClick={() => void restoreBackup()}
                type="button"
              >
                <Icon name="restore" size={17} />
                {operation === "restore" ? "正在恢复…" : "恢复所选备份"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <LegacyAgentReset api={api} />

      {message !== null ? (
        <p className="data-management-message is-success" role="status">
          <Icon name="check" size={16} />
          {message}
        </p>
      ) : null}
      {error !== null ? (
        <p className="data-management-message is-error" role="alert">
          <Icon name="warning" size={16} />
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function fileName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? "备份文件";
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
