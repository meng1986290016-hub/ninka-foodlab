import { useEffect, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { MaterialGroup, MaterialGroupInput } from "../../api/types";
import { Icon } from "../../components/Icon";
import { CategoryCombobox } from "./CategoryCombobox";

interface MaterialGroupEditorProps {
  api: DesktopApi;
  group?: MaterialGroup | null | undefined;
  onCancel: () => void;
  onSave: (input: MaterialGroupInput) => Promise<void>;
}

export function MaterialGroupEditor({
  api,
  group = null,
  onCancel,
  onSave,
}: MaterialGroupEditorProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    group?.categoryId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(group?.name ?? "");
    setCategoryId(group?.categoryId ?? null);
    setError(null);
  }, [group]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("请填写原料名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmed, categoryId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通用原料保存失败");
    } finally {
      setSaving(false);
    }
  }

  const editing = group !== null;

  return (
    <aside
      aria-label={editing ? "编辑通用原料" : "新建通用原料"}
      aria-modal="true"
      className="ingredient-drawer"
      role="dialog"
    >
      <div className="drawer-header">
        <div>
          <h2>{editing ? "编辑通用原料" : "新建通用原料"}</h2>
          <p>先建立通用名称，再添加一个或多个供应商版本。</p>
        </div>
        <button
          aria-label="关闭通用原料编辑器"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>

      <form className="ingredient-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field field--full">
          <span>原料名称</span>
          <input
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：脱脂乳粉"
            value={name}
          />
        </label>

        <CategoryCombobox
          api={api}
          onChange={setCategoryId}
          value={categoryId}
        />

        {error !== null ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="drawer-actions">
          <button className="button button--secondary" onClick={onCancel} type="button">
            取消
          </button>
          <button className="button button--primary" disabled={saving} type="submit">
            {saving ? "正在保存…" : "保存通用原料"}
          </button>
        </div>
      </form>
    </aside>
  );
}
