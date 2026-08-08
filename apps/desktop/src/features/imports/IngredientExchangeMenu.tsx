import { useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { ImportFilePicker } from "../../api/import-file-picker";
import type { IngredientExchangeFormat } from "../../api/import-types";
import { Icon } from "../../components/Icon";

interface IngredientExchangeMenuProps {
  api: DesktopApi;
  filePicker: ImportFilePicker;
  onImport: () => void;
}

export function IngredientExchangeMenu({
  api,
  filePicker,
  onImport,
}: IngredientExchangeMenuProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportFile(
    kind: "template" | "library",
    format: IngredientExchangeFormat,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const defaultName = kind === "template" ? "原料导入模板" : "原料库";
      const destination = await filePicker.pickDestination(format, defaultName);
      if (destination === null) return;
      if (kind === "template") {
        await api.exportIngredientTemplate(format, destination);
      } else {
        await api.exportIngredientLibrary(format, destination);
      }
      setMessage(kind === "template" ? "模板已保存" : "原料库已导出");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件无法保存");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exchange-menu">
      <button
        aria-expanded={open}
        className="button button--secondary"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon name="database" size={17} />
        数据交换
      </button>
      {open ? (
        <div className="exchange-menu__popover">
          <button
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onImport();
            }}
            type="button"
          >
            <Icon name="import" size={16} />
            导入原料资料
          </button>
          <button disabled={busy} onClick={() => void exportFile("template", "csv")} type="button">
            <Icon name="export" size={16} />
            下载 CSV 模板
          </button>
          <button disabled={busy} onClick={() => void exportFile("template", "xlsx")} type="button">
            <Icon name="export" size={16} />
            下载 XLSX 模板
          </button>
          <button disabled={busy} onClick={() => void exportFile("library", "xlsx")} type="button">
            <Icon name="export" size={16} />
            导出原料库
          </button>
        </div>
      ) : null}
      {message ? <span aria-live="polite" className="exchange-message">{message}</span> : null}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
