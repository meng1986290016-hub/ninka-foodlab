import { useDeferredValue, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  Ingredient,
  IngredientInput,
  IngredientVariant,
  MaterialGroup,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import { IngredientEditor } from "./IngredientEditor";
import { IngredientTable } from "./IngredientTable";
import { useIngredients } from "./useIngredients";

interface IngredientLibraryProps {
  api: DesktopApi;
}

function legacyIngredientFor(
  group: MaterialGroup,
  variant: IngredientVariant,
): Ingredient {
  return {
    id: group.id,
    name: group.name,
    internalCode: variant.internalCode ?? "",
    category: group.categoryName ?? "",
    tags: [],
    notes: variant.researchNotes,
    densityGPerMl: variant.densityGPerMl,
    currentPrice: variant.currentPrice ?? "",
    priceUnit: variant.priceUnit,
    priceUpdatedAt: variant.updatedAt.slice(0, 10),
    source: variant.source,
    sourceDate: variant.updatedAt.slice(0, 10),
    completeness: variant.completeness.percent,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    archivedAt: variant.archivedAt,
  };
}

export function IngredientLibrary({ api }: IngredientLibraryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<Ingredient | "new" | null>(null);
  const {
    archiveVariant,
    error,
    loading,
    materialGroups,
    saveLegacyIngredient,
  } = useIngredients(api, deferredQuery);

  async function handleSave(input: IngredientInput, id?: string) {
    await saveLegacyIngredient(input, id);
    await api.clearDraft("ingredient-editor", id ?? "new");
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
            onClick={() => setEditor("new")}
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
          onArchiveVariant={(variant) => void handleArchiveVariant(variant)}
          onEditVariant={(group, variant) =>
            setEditor(legacyIngredientFor(group, variant))
          }
          onToggle={toggleGroup}
        />
      </div>

      {editor ? (
        <IngredientEditor
          api={api}
          ingredient={editor === "new" ? null : editor}
          onCancel={() => setEditor(null)}
          onSave={handleSave}
        />
      ) : null}
    </section>
  );
}
