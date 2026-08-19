import { useDeferredValue, useEffect, useRef, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { MaterialNeed } from "../../api/agent-recipe-types";
import { createImportFilePicker } from "../../api/import-file-picker";
import type {
  IngredientVariant,
  MaterialGroup,
  MaterialGroupInput,
  NutrientDefinition,
  VariantComparison,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import {
  DataQualityDrawer,
  type DataQualityDrawerContent,
} from "../data-quality/DataQualityDrawer";
import {
  buildVariantDataGapReport,
  type DataGapEntry,
} from "../data-quality/data-quality";
import { IngredientExchangeMenu } from "../imports/IngredientExchangeMenu";
import { IngredientImportDrawer } from "../imports/IngredientImportDrawer";
import { IngredientTable } from "./IngredientTable";
import { MaterialGroupEditor } from "./MaterialGroupEditor";
import { useIngredients } from "./useIngredients";
import { VariantEditor } from "./VariantEditor";
import { VariantComparisonDrawer } from "./VariantComparisonDrawer";
import { MaterialNeedList } from "./MaterialNeedList";

interface IngredientLibraryProps {
  api: DesktopApi;
  editLaunch?: {
    key: string;
    materialGroupId: string;
    ingredientVariantId: string;
  } | null;
  onEditLaunchFinished?(): void;
  refreshToken?: number;
}

type EditorState =
  | { kind: "material-group"; need?: MaterialNeed }
  | {
      kind: "variant";
      group: MaterialGroup;
      variant: IngredientVariant | null;
      need?: MaterialNeed;
    };

interface VariantSelection {
  groupId: string;
  ids: Set<string>;
}

export function IngredientLibrary({
  api,
  editLaunch = null,
  onEditLaunchFinished,
  refreshToken = 0,
}: IngredientLibraryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [selection, setSelection] = useState<VariantSelection | null>(null);
  const [comparison, setComparison] = useState<VariantComparison | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<"materials" | "needs">("materials");
  const [needs, setNeeds] = useState<MaterialNeed[]>([]);
  const [needsLoading, setNeedsLoading] = useState(false);
  const [needsError, setNeedsError] = useState<string | null>(null);
  const [filePicker] = useState(createImportFilePicker);
  const processedEditLaunchRef = useRef<string | null>(null);
  const [nutrientDefinitions, setNutrientDefinitions] = useState<
    NutrientDefinition[]
  >([]);
  const [dataDrawer, setDataDrawer] =
    useState<DataQualityDrawerContent | null>(null);
  const { archiveVariant, error, loading, materialGroups, refresh } =
    useIngredients(api, deferredQuery);

  useEffect(() => {
    if (refreshToken > 0) refresh();
  }, [refreshToken]);

  useEffect(() => {
    let active = true;
    void api.listNutrientDefinitions().then((definitions) => {
      if (active) setNutrientDefinitions(definitions);
    });
    return () => {
      active = false;
    };
  }, [api, refreshToken]);

  async function refreshNeeds() {
    setNeedsLoading(true);
    setNeedsError(null);
    try {
      setNeeds(await api.listMaterialNeeds("open"));
    } catch (cause) {
      setNeedsError(cause instanceof Error ? cause.message : "待补充需求无法读取");
    } finally {
      setNeedsLoading(false);
    }
  }

  useEffect(() => {
    void refreshNeeds();
  }, [api, refreshToken]);

  function openEditor(nextEditor: EditorState) {
    setComparison(null);
    setComparisonError(null);
    setEditor(nextEditor);
  }

  useEffect(() => {
    if (
      editLaunch === null ||
      loading ||
      processedEditLaunchRef.current === editLaunch.key
    ) {
      return;
    }
    const group = materialGroups.find(
      (candidate) => candidate.id === editLaunch.materialGroupId,
    );
    const variant = group?.variants.find(
      (candidate) => candidate.id === editLaunch.ingredientVariantId,
    );
    if (group === undefined || variant === undefined) return;
    processedEditLaunchRef.current = editLaunch.key;
    setTab("materials");
    setActiveGroupId(group.id);
    openEditor({ kind: "variant", group, variant });
  }, [editLaunch, loading, materialGroups]);

  async function handleCreateGroup(input: MaterialGroupInput) {
    const group = await api.createMaterialGroup(input);
    refresh();
    setActiveGroupId(group.id);
    openEditor({
      kind: "variant",
      group,
      variant: null,
      ...(editor?.kind === "material-group" && editor.need
        ? { need: editor.need }
        : {}),
    });
  }

  async function handleVariantSaved(
    group: MaterialGroup,
    variant: IngredientVariant,
    need?: MaterialNeed,
  ) {
    if (need) {
      await api.resolveMaterialNeed(need.id, variant.id);
      await refreshNeeds();
    }
    refresh();
    setActiveGroupId(group.id);
    setEditor(null);
    if (editLaunch?.ingredientVariantId === variant.id) {
      onEditLaunchFinished?.();
    }
  }

  async function handleArchiveVariant(variant: IngredientVariant) {
    const specification =
      variant.modelOrSpecification.trim() || "未填写型号/规格";
    if (
      !window.confirm(
        `确认归档“${variant.supplierName} · ${specification}”的原料版本吗？`,
      )
    ) {
      return;
    }
    await archiveVariant(variant);
  }

  function openVariantGaps(group: MaterialGroup, variant: IngredientVariant) {
    setDataDrawer({
      kind: "gaps",
      report: buildVariantDataGapReport(
        group.name,
        variant,
        nutrientDefinitions,
      ),
      initialGrouping: "field",
    });
  }

  function editIngredientFromGap(entry: DataGapEntry) {
    if (
      entry.materialGroupId === null ||
      entry.ingredientVariantId === null
    ) {
      return;
    }
    const group = materialGroups.find(
      (candidate) => candidate.id === entry.materialGroupId,
    );
    const variant = group?.variants.find(
      (candidate) => candidate.id === entry.ingredientVariantId,
    );
    if (group === undefined || variant === undefined) return;
    setDataDrawer(null);
    setActiveGroupId(group.id);
    openEditor({ kind: "variant", group, variant });
  }

  function selectGroup(groupId: string) {
    setActiveGroupId(groupId);
    setSelection(null);
    setComparison(null);
    setComparisonError(null);
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
        cause instanceof Error ? cause.message : "原料版本比较失败",
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
            <p>
              按通用原料归类，分别维护不同供应商、型号与规格的价格、营养和研发记录。
            </p>
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

        <div aria-label="原料库分类" className="ingredient-library-tabs" role="tablist">
          <button aria-selected={tab === "materials"} className={tab === "materials" ? "is-active" : undefined} onClick={() => setTab("materials")} role="tab" type="button">原料列表</button>
          <button aria-selected={tab === "needs"} className={tab === "needs" ? "is-active" : undefined} onClick={() => setTab("needs")} role="tab" type="button">待补充需求 <span>{needs.length}</span></button>
        </div>

        {tab === "materials" ? <div className="library-toolbar">
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
              比较 {selection.ids.size} 个原料版本
            </button>
          ) : null}
        </div> : null}

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
        {needsError ? <p className="page-error" role="alert">{needsError}</p> : null}

        {tab === "materials" ? <IngredientTable
          activeGroupId={activeGroupId}
          loading={loading}
          materialGroups={materialGroups}
          onAddVariant={(group) =>
            openEditor({ kind: "variant", group, variant: null })
          }
          onArchiveVariant={(variant) => void handleArchiveVariant(variant)}
          onEditVariant={(group, variant) =>
            openEditor({ kind: "variant", group, variant })
          }
          onViewVariantGaps={openVariantGaps}
          onSelectGroup={selectGroup}
          onVariantSelectionChange={changeVariantSelection}
          selectedVariantIds={selection?.ids ?? new Set()}
        /> : needsLoading ? <div className="material-needs-empty"><span>正在读取待补充需求…</span></div> : <MaterialNeedList
          busy={false}
          materialGroups={materialGroups}
          needs={needs}
          onCreate={(need) => openEditor({ kind: "material-group", need })}
          onDismiss={(need) => {
            if (!window.confirm(`关闭“${need.materialName}”这项待补充需求？`)) return;
            void api.dismissMaterialNeed(need.id).then(refreshNeeds);
          }}
          onResolve={(need, variantId) => {
            void api.resolveMaterialNeed(need.id, variantId).then(refreshNeeds);
          }}
        />}
      </div>

      {editor?.kind === "material-group" ? (
        <MaterialGroupEditor
          api={api}
          initialName={editor.need?.materialName ?? ""}
          onCancel={() => setEditor(null)}
          onSave={handleCreateGroup}
        />
      ) : null}
      {editor?.kind === "variant" ? (
        <VariantEditor
          api={api}
          group={editor.group}
          initialResearchNotes={
            editor.need
              ? `来源：Agent 待补充原料需求\n用途：${editor.need.purpose}\n期望规格：${editor.need.desiredSpecification}\n缺失原因：${editor.need.missingReason}`
              : ""
          }
          onCancel={() => {
            const launchedVariantId = editLaunch?.ingredientVariantId;
            const editorVariantId = editor.variant?.id;
            setEditor(null);
            if (
              launchedVariantId !== undefined &&
              editorVariantId === launchedVariantId
            ) {
              onEditLaunchFinished?.();
            }
          }}
          onSaved={(variant) => void handleVariantSaved(editor.group, variant, editor.need)}
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
      <DataQualityDrawer
        content={dataDrawer}
        onClose={() => setDataDrawer(null)}
        onEditIngredient={editIngredientFromGap}
      />
      {importing ? (
        <IngredientImportDrawer
          api={api}
          filePicker={filePicker}
          onClose={() => setImporting(false)}
          onCommitted={(result) => {
            refresh();
            const firstImportedGroupId = result.variants[0]?.materialGroupId;
            if (firstImportedGroupId) setActiveGroupId(firstImportedGroupId);
            setImporting(false);
          }}
        />
      ) : null}
    </section>
  );
}
