import { useDeferredValue, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { IngredientVariant, MaterialGroup, MaterialGroupInput } from "../../api/types";
import { Icon } from "../../components/Icon";
import { IngredientTable } from "./IngredientTable";
import { MaterialGroupEditor } from "./MaterialGroupEditor";
import { useIngredients } from "./useIngredients";
import { VariantEditor } from "./VariantEditor";

interface IngredientLibraryProps {
  api: DesktopApi;
}

type EditorState =
  | { kind: "material-group" }
  | {
      kind: "variant";
      group: MaterialGroup;
      variant: IngredientVariant | null;
    };

export function IngredientLibrary({ api }: IngredientLibraryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const { archiveVariant, error, loading, materialGroups, refresh } =
    useIngredients(api, deferredQuery);

  async function handleCreateGroup(input: MaterialGroupInput) {
    const group = await api.createMaterialGroup(input);
    refresh();
    setExpandedIds((current) => new Set(current).add(group.id));
    setEditor({ kind: "variant", group, variant: null });
  }

  function handleVariantSaved(group: MaterialGroup) {
    refresh();
    setExpandedIds((current) => new Set(current).add(group.id));
    setEditor(null);
  }

  async function handleArchiveVariant(variant: IngredientVariant) {
    if (!window.confirm(`确认归档“${variant.supplierName}”的供应商版本吗？`)) {
      return;
    }
    await archiveVariant(variant);
  }

  function toggleGroup(groupId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <section className={editor ? "ingredient-workspace is-editing" : "ingredient-workspace"}>
      <div className="library-pane">
        <div className="library-header">
          <div>
            <h1>原料库</h1>
            <p>按通用原料归类，维护各供应商的价格、营养与研发记录。</p>
          </div>
          <button
            className="button button--primary new-ingredient-button"
            onClick={() => setEditor({ kind: "material-group" })}
            type="button"
          >
            <Icon name="plus" size={18} />
            新建原料
          </button>
        </div>

        <div className="library-toolbar">
          <label className="search-field">
            <Icon name="search" size={18} />
            <span className="sr-only">搜索原料</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索原料、供应商、型号或备注"
              type="search"
              value={query}
            />
          </label>
          {query ? (
            <button className="text-button" onClick={() => setQuery("")} type="button">
              清除
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="page-error" role="alert">
            {error}
          </p>
        ) : null}

        <IngredientTable
          expandedIds={expandedIds}
          loading={loading}
          materialGroups={materialGroups}
          onAddVariant={(group) =>
            setEditor({ kind: "variant", group, variant: null })
          }
          onArchiveVariant={(variant) => void handleArchiveVariant(variant)}
          onEditVariant={(group, variant) =>
            setEditor({ kind: "variant", group, variant })
          }
          onToggle={toggleGroup}
        />
      </div>

      {editor?.kind === "material-group" ? (
        <MaterialGroupEditor
          api={api}
          onCancel={() => setEditor(null)}
          onSave={handleCreateGroup}
        />
      ) : null}
      {editor?.kind === "variant" ? (
        <VariantEditor
          api={api}
          group={editor.group}
          onCancel={() => setEditor(null)}
          onSaved={() => handleVariantSaved(editor.group)}
          variant={editor.variant}
        />
      ) : null}
    </section>
  );
}
