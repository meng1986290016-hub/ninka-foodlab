import { useDeferredValue, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import { createImportFilePicker } from "../../api/import-file-picker";
import type {
  IngredientVariant,
  MaterialGroup,
  MaterialGroupInput,
  VariantComparison,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import { IngredientExchangeMenu } from "../imports/IngredientExchangeMenu";
import { IngredientImportDrawer } from "../imports/IngredientImportDrawer";
import { IngredientTable } from "./IngredientTable";
import { MaterialGroupEditor } from "./MaterialGroupEditor";
import { useIngredients } from "./useIngredients";
import { VariantEditor } from "./VariantEditor";
import { VariantComparisonDrawer } from "./VariantComparisonDrawer";

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

interface VariantSelection {
  groupId: string;
  ids: Set<string>;
}

export function IngredientLibrary({ api }: IngredientLibraryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [selection, setSelection] = useState<VariantSelection | null>(null);
  const [comparison, setComparison] = useState<VariantComparison | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filePicker] = useState(createImportFilePicker);
  const { archiveVariant, error, loading, materialGroups, refresh } =
    useIngredients(api, deferredQuery);

  function openEditor(nextEditor: EditorState) {
    setComparison(null);
    setComparisonError(null);
    setEditor(nextEditor);
  }

  async function handleCreateGroup(input: MaterialGroupInput) {
    const group = await api.createMaterialGroup(input);
    refresh();
    setExpandedIds((current) => new Set(current).add(group.id));
    openEditor({ kind: "variant", group, variant: null });
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

  function changeVariantSelection(
    group: MaterialGroup,
    variant: IngredientVariant,
    selected: boolean,
  ) {
    setSelection((current) => {
      if (current !== null && current.groupId !== group.id && selected) {
        const replace = window.confirm(
          "比较只能在同一种原料内进行。是否清除之前的选择？",
        );
        if (!replace) return current;
        return { groupId: group.id, ids: new Set([variant.id]) };
      }
      const ids = new Set(current?.ids ?? []);
      if (selected) ids.add(variant.id);
      else ids.delete(variant.id);
      return ids.size === 0 ? null : { groupId: group.id, ids };
    });
  }

  async function openComparison() {
    if (selection === null || selection.ids.size < 2) return;
    setComparisonError(null);
    try {
      const result = await api.compareIngredientVariants(
        selection.groupId,
        [...selection.ids],
      );
      setEditor(null);
      setComparison(result);
    } catch (cause) {
      setComparisonError(
        cause instanceof Error ? cause.message : "供应商版本比较失败",
      );
    }
  }

  function openImport() {
    setEditor(null);
    setComparison(null);
    setComparisonError(null);
    setImporting(true);
  }

  const comparisonGroup = comparison
    ? materialGroups.find((group) => group.id === comparison.materialGroupId)
    : null;
  const workspaceClass = importing
    ? "ingredient-workspace is-editing is-importing"
    : comparison
    ? "ingredient-workspace is-editing has-comparison"
    : editor
      ? "ingredient-workspace is-editing"
      : "ingredient-workspace";

  return (
    <section className={workspaceClass}>
      <div className="library-pane">
        <div className="library-header">
          <div>
            <h1>原料库</h1>
            <p>按通用原料归类，维护各供应商的价格、营养与研发记录。</p>
          </div>
          <div className="library-header-actions">
            <IngredientExchangeMenu
              api={api}
              filePicker={filePicker}
              onImport={openImport}
            />
            <button
              className="button button--primary new-ingredient-button"
              onClick={() => openEditor({ kind: "material-group" })}
              type="button"
            >
              <Icon name="plus" size={18} />
              新建原料
            </button>
          </div>
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
          {selection !== null && selection.ids.size >= 2 ? (
            <button
              className="button button--secondary compare-button"
              onClick={() => void openComparison()}
              type="button"
            >
              比较 {selection.ids.size} 个供应商版本
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="page-error" role="alert">
            {error}
          </p>
        ) : null}
        {comparisonError ? (
          <p className="page-error" role="alert">
            {comparisonError}
          </p>
        ) : null}

        <IngredientTable
          expandedIds={expandedIds}
          loading={loading}
          materialGroups={materialGroups}
          onAddVariant={(group) =>
            openEditor({ kind: "variant", group, variant: null })
          }
          onArchiveVariant={(variant) => void handleArchiveVariant(variant)}
          onEditVariant={(group, variant) =>
            openEditor({ kind: "variant", group, variant })
          }
          onToggle={toggleGroup}
          onVariantSelectionChange={changeVariantSelection}
          selectedVariantIds={selection?.ids ?? new Set()}
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
      {comparison ? (
        <VariantComparisonDrawer
          comparison={comparison}
          materialName={comparisonGroup?.name ?? "原料"}
          onClose={() => setComparison(null)}
        />
      ) : null}
      {importing ? (
        <IngredientImportDrawer
          api={api}
          filePicker={filePicker}
          onClose={() => setImporting(false)}
          onCommitted={(result) => {
            refresh();
            setExpandedIds((current) => {
              const next = new Set(current);
              result.variants.forEach((variant) => next.add(variant.materialGroupId));
              return next;
            });
            setImporting(false);
          }}
        />
      ) : null}
    </section>
  );
}
