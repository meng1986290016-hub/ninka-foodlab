import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { MaterialGroup } from "../../api/types";
import type {
  Recipe,
  RecipeAlternativeCreateInput,
  RecipeKind,
  RecipeSchemeStatus,
  RecipeSchemeUpdateInput,
  RecipeSummary,
  RecipeVersion,
} from "../../api/recipe-types";
import {
  recipeProductId,
  recipeSchemeName,
  recipeSchemeStatus,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import {
  calculateRecipeAtCurrentPrices,
  loadRecipeVersionClosure,
  type RecipeCurrentPriceResult,
} from "./recipe-current-price";
import { RecipeVersionComparisonPanel } from "./RecipeVersionComparisonPanel";

interface RecipeLibraryProps {
  api: DesktopApi;
  onOpenDraft(recipeId: string): void;
  onOpenNutritionLabel?(
    recipeId: string,
    recipeVersionId: string,
  ): void;
  onOpenSampleSheet?(recipeId: string, versionId: string | null): void;
  refreshToken?: number;
}

interface RecipeLibraryEntry {
  summary: RecipeSummary;
  versions: RecipeVersion[];
  currentPriceEstimate: RecipeCurrentPriceResult | null;
  ingredientDataChanged: boolean;
}

type RecipeStatusFilter =
  | "all"
  | "versioned"
  | "draft_only";
type RecipeLibraryTab = "active" | "archived";
type RecipeSchemeFilter = "all" | RecipeSchemeStatus;
type UpdatedFilter = "all" | "30" | "90" | "365";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function RecipeLibrary({
  api,
  onOpenDraft,
  onOpenNutritionLabel,
  onOpenSampleSheet,
  refreshToken = 0,
}: RecipeLibraryProps) {
  const [entries, setEntries] = useState<RecipeLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RecipeLibraryTab>("active");
  const [kind, setKind] = useState<"all" | RecipeKind>("all");
  const [status, setStatus] = useState<RecipeStatusFilter>("all");
  const [schemeFilter, setSchemeFilter] = useState<RecipeSchemeFilter>("all");
  const [updated, setUpdated] = useState<UpdatedFilter>("all");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [currentPrice, setCurrentPrice] =
    useState<RecipeCurrentPriceResult | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [archiveCandidate, setArchiveCandidate] =
    useState<RecipeSummary | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleteRecipeCandidate, setDeleteRecipeCandidate] =
    useState<RecipeSummary | null>(null);
  const [deleteDraftRecipeCandidate, setDeleteDraftRecipeCandidate] =
    useState<RecipeSummary | null>(null);
  const [deleteRecipeConfirmation, setDeleteRecipeConfirmation] = useState("");
  const [deletingRecipe, setDeletingRecipe] = useState(false);
  const [deleteVersionCandidate, setDeleteVersionCandidate] =
    useState<RecipeVersion | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const [schemeSettingsOpen, setSchemeSettingsOpen] = useState(false);
  const [schemeSaving, setSchemeSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createKind, setCreateKind] = useState<RecipeKind>("formula");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summaries = await api.listRecipes();
      const [versions, materialGroups] = await Promise.all([
        Promise.all(
          summaries.map((summary) =>
            api.listRecipeVersions(summary.recipe.id),
          ),
        ),
        api.listMaterialGroups(),
      ]);
      const versionById = new Map(
        versions.flat().map((version) => [version.id, version]),
      );
      setEntries(
        await Promise.all(
          summaries.map(async (summary, index) => {
            const recipeVersions = versions[index] ?? [];
            const latest = recipeVersions[0] ?? null;
            if (latest === null) {
              return {
                summary,
                versions: recipeVersions,
                currentPriceEstimate: null,
                ingredientDataChanged: false,
              };
            }
            try {
              const referencedVersions = await loadRecipeVersionClosure(
                async (id) => {
                  const loaded = versionById.get(id);
                  if (loaded !== undefined) return loaded;
                  const fetched = await api.getRecipeVersion(id);
                  versionById.set(fetched.id, fetched);
                  return fetched;
                },
                latest,
              );
              return {
                summary,
                versions: recipeVersions,
                currentPriceEstimate: calculateRecipeAtCurrentPrices({
                  rootVersion: latest,
                  referencedVersions,
                  materialGroups,
                }),
                ingredientDataChanged: hasUpdatedIngredientData(
                  [latest, ...referencedVersions],
                  materialGroups,
                ),
              };
            } catch {
              return {
                summary,
                versions: recipeVersions,
                currentPriceEstimate: null,
                ingredientDataChanged: false,
              };
            }
          }),
        ),
      );
    } catch (cause) {
      setError(messageFrom(cause, "配方库无法读取"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const now = Date.now();
    return entries.filter(({ summary }) => {
      const recipe = summary.recipe;
      const matchesQuery =
        normalized === "" ||
        [recipe.name, recipeSchemeName(recipe), recipe.code ?? "", ...recipe.tags].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(normalized),
        );
      const matchesKind = kind === "all" || recipe.kind === kind;
      const matchesScheme =
        schemeFilter === "all" || recipeSchemeStatus(recipe) === schemeFilter;
      const matchesTab =
        tab === "active"
          ? recipe.archivedAt === null
          : recipe.archivedAt !== null;
      const matchesStatus =
        tab === "archived" ||
        status === "all" ||
        (status === "versioned" &&
          summary.latestVersion !== null) ||
        (status === "draft_only" &&
          summary.latestVersion === null);
      const ageDays =
        (now - new Date(recipe.updatedAt).getTime()) /
        (24 * 60 * 60 * 1000);
      const matchesUpdated =
        updated === "all" || ageDays <= Number(updated);
      return (
        matchesQuery &&
        matchesKind &&
        matchesScheme &&
        matchesTab &&
        matchesStatus &&
        matchesUpdated
      );
    });
  }, [entries, kind, query, schemeFilter, status, tab, updated]);

  const sortedEntries = useMemo(
    () => [...filteredEntries].sort(compareRecipeSchemes),
    [filteredEntries],
  );

  const activeCount = entries.filter(
    ({ summary }) => summary.recipe.archivedAt === null,
  ).length;
  const archivedCount = entries.length - activeCount;

  useEffect(() => {
    if (
      selectedRecipeId !== null &&
      sortedEntries.some(
        ({ summary }) => summary.recipe.id === selectedRecipeId,
      )
    ) {
      return;
    }
    setSelectedRecipeId(
      sortedEntries[0]?.summary.recipe.id ?? null,
    );
  }, [selectedRecipeId, sortedEntries]);

  const selectedEntry =
    entries.find(
      ({ summary }) => summary.recipe.id === selectedRecipeId,
    ) ?? null;

  useEffect(() => {
    const versions = selectedEntry?.versions ?? [];
    if (
      selectedVersionId !== null &&
      versions.some((version) => version.id === selectedVersionId)
    ) {
      return;
    }
    setSelectedVersionId(versions[0]?.id ?? null);
  }, [selectedEntry, selectedVersionId]);

  const selectedVersion =
    selectedEntry?.versions.find(
      (version) => version.id === selectedVersionId,
    ) ?? null;
  const sameProductEntries = selectedEntry === null
    ? []
    : entries
        .filter(
          ({ summary }) =>
            recipeProductId(summary.recipe) ===
            recipeProductId(selectedEntry.summary.recipe),
        )
        .sort(compareRecipeSchemes);

  useEffect(() => {
    setCurrentPrice(null);
  }, [selectedVersionId]);

  async function copyToDraft() {
    if (selectedVersion === null) return;
    setCopying(true);
    setError(null);
    try {
      await api.copyRecipeVersionToDraft(selectedVersion.id);
      onOpenDraft(selectedVersion.recipeId);
    } catch (cause) {
      setError(messageFrom(cause, "无法复制为工作草稿"));
    } finally {
      setCopying(false);
    }
  }

  async function recalculateCurrentPrice() {
    if (selectedVersion === null) return;
    setRecalculating(true);
    setError(null);
    try {
      const [materialGroups, referencedVersions] = await Promise.all([
        api.listMaterialGroups(),
        loadRecipeVersionClosure(
          (id) => api.getRecipeVersion(id),
          selectedVersion,
        ),
      ]);
      setCurrentPrice(
        calculateRecipeAtCurrentPrices({
          rootVersion: selectedVersion,
          referencedVersions,
          materialGroups,
        }),
      );
    } catch (cause) {
      setError(messageFrom(cause, "无法按当前价格重算"));
    } finally {
      setRecalculating(false);
    }
  }

  async function confirmArchive() {
    if (archiveCandidate === null) return;
    setArchiving(true);
    setError(null);
    try {
      await api.archiveRecipe(archiveCandidate.recipe.id);
      setNotice(`“${archiveCandidate.recipe.name}”已归档`);
      setArchiveCandidate(null);
      setInspectorOpen(false);
      await refresh();
    } catch (cause) {
      setError(messageFrom(cause, "配方无法归档"));
    } finally {
      setArchiving(false);
    }
  }

  async function restoreSelected() {
    if (selectedEntry === null || selectedEntry.summary.recipe.archivedAt === null) return;
    setRestoring(true);
    setError(null);
    try {
      const restoredId = selectedEntry.summary.recipe.id;
      const restoredName = selectedEntry.summary.recipe.name;
      await api.restoreRecipe(restoredId);
      await refresh();
      setTab("active");
      setSelectedRecipeId(restoredId);
      setInspectorOpen(false);
      setNotice(`“${restoredName}”已取消归档`);
    } catch (cause) {
      setError(messageFrom(cause, "配方无法取消归档"));
    } finally {
      setRestoring(false);
    }
  }

  async function permanentlyDeleteSelectedRecipe() {
    if (deleteRecipeCandidate === null) return;
    setDeletingRecipe(true);
    setError(null);
    try {
      const deletedName = deleteRecipeCandidate.recipe.name;
      await api.permanentlyDeleteRecipe(
        deleteRecipeCandidate.recipe.id,
        deleteRecipeConfirmation,
      );
      setDeleteRecipeCandidate(null);
      setDeleteRecipeConfirmation("");
      setSelectedRecipeId(null);
      setSelectedVersionId(null);
      setInspectorOpen(false);
      await refresh();
      setNotice(`“${deletedName}”已永久删除`);
    } catch (cause) {
      setError(messageFrom(cause, "配方无法永久删除"));
    } finally {
      setDeletingRecipe(false);
    }
  }

  async function deleteSelectedDraftRecipe() {
    if (deleteDraftRecipeCandidate === null) return;
    setDeletingRecipe(true);
    setError(null);
    try {
      const deletedName = deleteDraftRecipeCandidate.recipe.name;
      await api.deleteDraftRecipe(deleteDraftRecipeCandidate.recipe.id);
      setDeleteDraftRecipeCandidate(null);
      setSelectedRecipeId(null);
      setSelectedVersionId(null);
      setInspectorOpen(false);
      await refresh();
      setNotice(`“${deletedName}”工作草稿已永久删除`);
    } catch (cause) {
      setError(messageFrom(cause, "工作草稿无法删除"));
    } finally {
      setDeletingRecipe(false);
    }
  }

  async function deleteSelectedVersion() {
    if (deleteVersionCandidate === null) return;
    setDeletingVersion(true);
    setError(null);
    try {
      const deletedNumber = deleteVersionCandidate.versionNumber;
      await api.deleteRecipeVersion(deleteVersionCandidate.id);
      setDeleteVersionCandidate(null);
      setSelectedVersionId(null);
      await refresh();
      setNotice(`正式版本 V${deletedNumber} 已永久删除`);
    } catch (cause) {
      setError(messageFrom(cause, "正式版本无法删除"));
    } finally {
      setDeletingVersion(false);
    }
  }

  async function createAlternative(
    input: Omit<RecipeAlternativeCreateInput, "sourceVersionId">,
  ) {
    if (selectedVersion === null) return;
    setSchemeSaving(true);
    setError(null);
    try {
      const created = await api.createRecipeAlternative({
        ...input,
        sourceVersionId: selectedVersion.id,
      });
      await refresh();
      setAlternativeOpen(false);
      setSelectedRecipeId(created.id);
      setNotice(`已创建替代配方“${recipeSchemeName(created)}”`);
      onOpenDraft(created.id);
    } catch (cause) {
      setError(messageFrom(cause, "替代配方无法创建"));
    } finally {
      setSchemeSaving(false);
    }
  }

  async function updateScheme(input: RecipeSchemeUpdateInput) {
    if (selectedEntry === null) return;
    setSchemeSaving(true);
    setError(null);
    try {
      const updatedRecipe = await api.updateRecipeScheme(
        selectedEntry.summary.recipe.id,
        input,
      );
      await refresh();
      setSchemeSettingsOpen(false);
      setSelectedRecipeId(updatedRecipe.id);
      setNotice(`配方方案“${recipeSchemeName(updatedRecipe)}”已更新`);
    } catch (cause) {
      setError(messageFrom(cause, "配方方案无法更新"));
    } finally {
      setSchemeSaving(false);
    }
  }

  async function createRecipe() {
    const name = createName.trim();
    if (!name) {
      setError("请填写产品名称");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.createRecipe({
        name,
        code: null,
        tags: [],
        kind: createKind,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateKind("formula");
      await refresh();
      onOpenDraft(created.id);
    } catch (cause) {
      setError(messageFrom(cause, "新配方无法创建"));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <section className="recipe-library recipe-library--loading">
        <p>正在读取配方库…</p>
      </section>
    );
  }

  return (
    <section
      className={
        comparisonOpen
          ? "recipe-library is-comparing"
          : "recipe-library"
      }
    >
      <div className="recipe-library__main">
        <header className="recipe-library__header">
          <div>
            <h1>配方库</h1>
            <p>查看正式版本、冻结快照与当前价格对比</p>
          </div>
          <div className="recipe-library__header-actions">
            <span className="recipe-library__count">
              {new Set(sortedEntries.map(({ summary }) => recipeProductId(summary.recipe))).size}
              {" "}个产品 · {sortedEntries.length} 套配方
            </span>
            <button
              className="button button--primary"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Icon name="plus" size={17} />
              新建配方
            </button>
          </div>
        </header>

        <div aria-label="配方库分类" className="recipe-library__tabs" role="tablist">
          <button
            aria-selected={tab === "active"}
            className={tab === "active" ? "is-active" : undefined}
            onClick={() => {
              setTab("active");
              setInspectorOpen(false);
              setComparisonOpen(false);
            }}
            role="tab"
            type="button"
          >
            研发中 <span>{activeCount}</span>
          </button>
          <button
            aria-selected={tab === "archived"}
            className={tab === "archived" ? "is-active" : undefined}
            onClick={() => {
              setTab("archived");
              setInspectorOpen(false);
              setComparisonOpen(false);
            }}
            role="tab"
            type="button"
          >
            归档库 <span>{archivedCount}</span>
          </button>
        </div>

        <div className="recipe-library__toolbar">
          <label className="recipe-library__search">
            <Icon name="search" size={17} />
            <span className="sr-only">搜索配方</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、编号或标签"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span>类型</span>
            <select
              aria-label="配方类型"
              onChange={(event) =>
                setKind(event.target.value as "all" | RecipeKind)
              }
              value={kind}
            >
              <option value="all">全部类型</option>
              <option value="formula">成品配方</option>
              <option value="semi_finished">半成品</option>
            </select>
          </label>
          {tab === "active" ? (
            <label>
              <span>版本状态</span>
              <select
                aria-label="配方状态"
                onChange={(event) =>
                  setStatus(event.target.value as RecipeStatusFilter)
                }
                value={status}
              >
                <option value="all">全部状态</option>
                <option value="versioned">已有正式版本</option>
                <option value="draft_only">仅有工作草稿</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>方案状态</span>
            <select
              aria-label="方案状态"
              onChange={(event) =>
                setSchemeFilter(event.target.value as RecipeSchemeFilter)
              }
              value={schemeFilter}
            >
              <option value="all">全部方案</option>
              <option value="current">当前使用</option>
              <option value="approved">已批准替代</option>
              <option value="researching">研发中</option>
              <option value="inactive">已停用</option>
            </select>
          </label>
          <label>
            <span>最近更新</span>
            <select
              aria-label="更新时间"
              onChange={(event) =>
                setUpdated(event.target.value as UpdatedFilter)
              }
              value={updated}
            >
              <option value="all">不限时间</option>
              <option value="30">近 30 天</option>
              <option value="90">近 90 天</option>
              <option value="365">近一年</option>
            </select>
          </label>
        </div>

        {error ? (
          <p className="recipe-library__message has-error" role="alert">
            <Icon name="warning" size={15} />
            {error}
          </p>
        ) : notice ? (
          <p className="recipe-library__message" role="status">
            <Icon name="check" size={15} />
            {notice}
          </p>
        ) : null}

        <div className="recipe-library__table-frame">
          <div className="recipe-library__table-scroll">
            <table className="recipe-library__table">
              <thead>
                <tr>
                  <th>产品 / 配方方案</th>
                  <th>方案状态</th>
                  <th>类型</th>
                  <th>版本状态</th>
                  <th>投料合计</th>
                  <th>整批成本</th>
                  <th>{tab === "archived" ? "归档时间" : "最近更新"}</th>
                  <th>引用</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => {
                  const recipe = entry.summary.recipe;
                  const latest = entry.versions[0] ?? null;
                  const selected = selectedRecipeId === recipe.id;
                  return (
                    <tr
                      className={selected ? "is-selected" : undefined}
                      key={recipe.id}
                      onClick={() => {
                        setSelectedRecipeId(recipe.id);
                        setSelectedVersionId(latest?.id ?? null);
                        setInspectorOpen(true);
                      }}
                    >
                      <td>
                        <button
                          aria-pressed={selected}
                          className="recipe-library__identity"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRecipeId(recipe.id);
                            setSelectedVersionId(latest?.id ?? null);
                            if (recipe.archivedAt === null) {
                              onOpenDraft(recipe.id);
                            } else {
                              setInspectorOpen(true);
                            }
                          }}
                          title={
                            recipe.archivedAt === null
                              ? "进入配方工作台"
                              : "已归档配方只能在右侧查看"
                          }
                          type="button"
                        >
                          <strong>{recipe.name}</strong>
                          <small>
                            {recipeSchemeName(recipe)}
                          </small>
                        </button>
                      </td>
                      <td>
                        <RecipeSchemeBadge status={recipeSchemeStatus(recipe)} />
                      </td>
                      <td>
                        <RecipeKindBadge kind={recipe.kind} />
                      </td>
                      <td>
                        {latest ? (
                          <span className="recipe-library__version-status">
                            <strong>{`V${latest.versionNumber}`}</strong>
                            {entry.ingredientDataChanged ? (
                              <small>原料数据有更新</small>
                            ) : null}
                          </span>
                        ) : (
                          <span className="recipe-library__draft-status">
                            工作草稿
                          </span>
                        )}
                      </td>
                      <td>
                        {latest
                          ? `${formatNumber(
                              latest.snapshot.calculation.inputMassGrams,
                            )} g`
                          : "—"}
                      </td>
                      <td>
                        {latest
                          ? (
                              <span className="recipe-library__cost-status">
                                <strong>
                                  {formatMoney(
                                    latest.snapshot.calculation.cost.batchTotal,
                                  )}
                                </strong>
                                {entry.ingredientDataChanged ? (
                                  <small>
                                    {entry.currentPriceEstimate?.status === "complete"
                                      ? `当前估算 ${formatMoney(
                                          entry.currentPriceEstimate.currentBatchTotal,
                                        )}`
                                      : "当前数据待补全"}
                                  </small>
                                ) : null}
                              </span>
                            )
                          : "—"}
                      </td>
                      <td>
                        {formatDate(
                          tab === "archived"
                            ? recipe.archivedAt ?? recipe.updatedAt
                            : recipe.updatedAt,
                        )}
                      </td>
                      <td>
                        {entry.summary.referencedByCount > 0 ? (
                          <span className="recipe-library__reference">
                            {entry.summary.referencedByCount} 处引用
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedEntries.length === 0 ? (
              <div className="recipe-library__empty">
                <Icon name="recipe-library" size={28} />
                <strong>没有符合条件的配方</strong>
                <span>可以调整搜索词或筛选条件。</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {comparisonOpen && selectedEntry ? (
        <RecipeVersionComparisonPanel
          api={api}
          key={selectedEntry.summary.recipe.id}
          onClose={() => setComparisonOpen(false)}
          recipeName={selectedEntry.summary.recipe.name}
          versions={selectedEntry.versions}
        />
      ) : (
        <RecipeVersionInspector
          currentPrice={currentPrice}
          deletingRecipe={deletingRecipe}
          deletingVersion={deletingVersion}
          entry={selectedEntry}
          productEntries={sameProductEntries}
          onArchive={() => {
            if (selectedEntry) setArchiveCandidate(selectedEntry.summary);
          }}
          onRestore={() => void restoreSelected()}
          onPermanentlyDelete={() => {
            if (selectedEntry) {
              setError(null);
              setDeleteRecipeConfirmation("");
              setDeleteRecipeCandidate(selectedEntry.summary);
            }
          }}
          onDeleteDraftRecipe={() => {
            if (selectedEntry) {
              setError(null);
              setDeleteDraftRecipeCandidate(selectedEntry.summary);
            }
          }}
          onDeleteVersion={() => {
            if (selectedVersion) {
              setError(null);
              setDeleteVersionCandidate(selectedVersion);
            }
          }}
          onOpenSampleSheet={() => {
            if (selectedEntry) {
              onOpenSampleSheet?.(
                selectedEntry.summary.recipe.id,
                selectedVersion?.id ?? null,
              );
            }
          }}
          onCompare={() => setComparisonOpen(true)}
          onClose={() => setInspectorOpen(false)}
          onCreateAlternative={() => setAlternativeOpen(true)}
          onOpenSchemeSettings={() => setSchemeSettingsOpen(true)}
          onCopy={() => void copyToDraft()}
          onOpenNutritionLabel={() => {
            if (selectedVersion) {
              onOpenNutritionLabel?.(
                selectedVersion.recipeId,
                selectedVersion.id,
              );
            }
          }}
          onRecalculate={() => void recalculateCurrentPrice()}
          onSelectVersion={setSelectedVersionId}
          onSelectRecipe={(recipeId) => {
            const target = entries.find(
              ({ summary }) => summary.recipe.id === recipeId,
            );
            setSelectedRecipeId(recipeId);
            setSelectedVersionId(target?.versions[0]?.id ?? null);
            setInspectorOpen(true);
          }}
          narrowOpen={inspectorOpen}
          recalculating={recalculating}
          selectedVersion={selectedVersion}
          copying={copying}
          restoring={restoring}
        />
      )}

      {archiveCandidate ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="archive-recipe-title"
            aria-modal="true"
            className="recipe-library-dialog recipe-library-dialog--form"
            role="dialog"
          >
            <div className="recipe-library-dialog__icon">
              <Icon name="archive" size={22} />
            </div>
            <h2 id="archive-recipe-title">确认归档配方</h2>
            <p>
              归档后，“{archiveCandidate.recipe.name}
              ”将不能继续编辑或保存新版本，但历史正式版本仍会保留。
            </p>
            <footer>
              <button
                className="button button--secondary"
                disabled={archiving}
                onClick={() => setArchiveCandidate(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="button button--primary"
                disabled={archiving}
                onClick={() => void confirmArchive()}
                type="button"
              >
                {archiving ? "正在归档…" : "确认归档"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {deleteVersionCandidate && selectedEntry ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="delete-recipe-version-title"
            aria-modal="true"
            className="recipe-library-dialog recipe-library-dialog--danger"
            role="dialog"
          >
            <div className="recipe-library-dialog__icon">
              <Icon name="trash" size={22} />
            </div>
            <h2 id="delete-recipe-version-title">
              删除正式版本 V{deleteVersionCandidate.versionNumber}？
            </h2>
            <p>
              将永久删除“{selectedEntry.summary.recipe.name}”的这一份冻结快照，操作无法撤销。若它已被草稿、半成品、营养标签或研发报告引用，系统会拒绝删除。
            </p>
            {error ? <p className="recipe-library-dialog__error" role="alert">{error}</p> : null}
            <footer>
              <button
                className="button button--secondary"
                disabled={deletingVersion}
                onClick={() => {
                  setDeleteVersionCandidate(null);
                  setError(null);
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="button recipe-library__confirm-delete-button"
                disabled={deletingVersion}
                onClick={() => void deleteSelectedVersion()}
                type="button"
              >
                {deletingVersion ? "正在删除…" : "永久删除版本"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {deleteDraftRecipeCandidate ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="delete-draft-recipe-title"
            aria-modal="true"
            className="recipe-library-dialog recipe-library-dialog--danger"
            role="dialog"
          >
            <div className="recipe-library-dialog__icon">
              <Icon name="trash" size={22} />
            </div>
            <h2 id="delete-draft-recipe-title">删除工作草稿？</h2>
            <p>
              将永久删除“{deleteDraftRecipeCandidate.recipe.name}”及其工作草稿，产品会从配方库中移除，删除后无法恢复。
            </p>
            {error ? <p className="recipe-library-dialog__error" role="alert">{error}</p> : null}
            <footer>
              <button
                className="button button--secondary"
                disabled={deletingRecipe}
                onClick={() => {
                  setDeleteDraftRecipeCandidate(null);
                  setError(null);
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="button recipe-library__confirm-delete-button"
                disabled={deletingRecipe}
                onClick={() => void deleteSelectedDraftRecipe()}
                type="button"
              >
                {deletingRecipe ? "正在删除…" : "永久删除工作草稿"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {deleteRecipeCandidate ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="delete-recipe-title"
            aria-modal="true"
            className="recipe-library-dialog recipe-library-dialog--form recipe-library-dialog--danger"
            role="dialog"
          >
            <div className="recipe-library-dialog__icon">
              <Icon name="trash" size={22} />
            </div>
            <h2 id="delete-recipe-title">永久删除配方</h2>
            <p>
              将删除“{deleteRecipeCandidate.recipe.name}”的工作草稿和全部配方版本。已经生成营养标签、研发报告或仍被其他配方引用时不会执行。
            </p>
            <label>
              <span>输入配方名称确认</span>
              <input
                autoFocus
                onChange={(event) => setDeleteRecipeConfirmation(event.target.value)}
                placeholder={deleteRecipeCandidate.recipe.name}
                value={deleteRecipeConfirmation}
              />
            </label>
            <small>这是永久操作，删除后不能从归档库恢复。</small>
            {error ? <p className="recipe-library-dialog__error" role="alert">{error}</p> : null}
            <footer>
              <button
                className="button button--secondary"
                disabled={deletingRecipe}
                onClick={() => {
                  setDeleteRecipeCandidate(null);
                  setDeleteRecipeConfirmation("");
                  setError(null);
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="button recipe-library__confirm-delete-button"
                disabled={
                  deletingRecipe ||
                  deleteRecipeConfirmation.trim() !== deleteRecipeCandidate.recipe.name
                }
                onClick={() => void permanentlyDeleteSelectedRecipe()}
                type="button"
              >
                {deletingRecipe ? "正在删除…" : "确认永久删除"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {createOpen ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="create-recipe-title"
            aria-modal="true"
            className="recipe-library-dialog recipe-library-dialog--form"
            role="dialog"
          >
            <div className="recipe-library-dialog__icon">
              <Icon name="recipe-workbench" size={22} />
            </div>
            <h2 id="create-recipe-title">新建配方</h2>
            <label className="recipe-library-dialog__field">
              <span>产品名称</span>
              <input
                autoFocus
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="例如：巧克力冰淇淋"
                value={createName}
              />
            </label>
            <label className="recipe-library-dialog__field">
              <span>配方类型</span>
              <select
                onChange={(event) => setCreateKind(event.target.value as RecipeKind)}
                value={createKind}
              >
                <option value="formula">成品配方</option>
                <option value="semi_finished">半成品</option>
              </select>
            </label>
            <footer>
              <button
                className="button button--secondary"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="button button--primary"
                disabled={creating || !createName.trim()}
                onClick={() => void createRecipe()}
                type="button"
              >
                {creating ? "正在创建…" : "创建并进入工作台"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {alternativeOpen && selectedEntry && selectedVersion ? (
        <AlternativeRecipeDialog
          productName={selectedEntry.summary.recipe.name}
          saving={schemeSaving}
          sourceVersionNumber={selectedVersion.versionNumber}
          onCancel={() => setAlternativeOpen(false)}
          onSubmit={(input) => void createAlternative(input)}
        />
      ) : null}

      {schemeSettingsOpen && selectedEntry ? (
        <RecipeSchemeDialog
          recipe={selectedEntry.summary.recipe}
          saving={schemeSaving}
          onCancel={() => setSchemeSettingsOpen(false)}
          onSubmit={(input) => void updateScheme(input)}
        />
      ) : null}
    </section>
  );
}

interface RecipeVersionInspectorProps {
  entry: RecipeLibraryEntry | null;
  productEntries: RecipeLibraryEntry[];
  selectedVersion: RecipeVersion | null;
  currentPrice: RecipeCurrentPriceResult | null;
  recalculating: boolean;
  copying: boolean;
  restoring: boolean;
  deletingRecipe: boolean;
  deletingVersion: boolean;
  narrowOpen: boolean;
  onSelectVersion(id: string): void;
  onSelectRecipe(id: string): void;
  onCopy(): void;
  onOpenNutritionLabel(): void;
  onRecalculate(): void;
  onArchive(): void;
  onRestore(): void;
  onPermanentlyDelete(): void;
  onDeleteDraftRecipe(): void;
  onDeleteVersion(): void;
  onOpenSampleSheet(): void;
  onCompare(): void;
  onClose(): void;
  onCreateAlternative(): void;
  onOpenSchemeSettings(): void;
}

function RecipeVersionInspector({
  entry,
  productEntries,
  selectedVersion,
  currentPrice,
  recalculating,
  copying,
  restoring,
  deletingRecipe,
  deletingVersion,
  narrowOpen,
  onSelectVersion,
  onSelectRecipe,
  onCopy,
  onOpenNutritionLabel,
  onRecalculate,
  onArchive,
  onRestore,
  onPermanentlyDelete,
  onDeleteDraftRecipe,
  onDeleteVersion,
  onOpenSampleSheet,
  onCompare,
  onClose,
  onCreateAlternative,
  onOpenSchemeSettings,
}: RecipeVersionInspectorProps) {
  if (entry === null) {
    return (
      <aside
        className={
          narrowOpen
            ? "recipe-library-inspector is-empty is-narrow-open"
            : "recipe-library-inspector is-empty"
        }
      >
        <Icon name="recipe-library" size={30} />
        <strong>选择一个配方</strong>
        <span>这里会显示冻结版本和成本信息。</span>
      </aside>
    );
  }

  const { recipe } = entry.summary;
  const referenced = entry.summary.referencedByCount > 0;
  const archived = recipe.archivedAt !== null;
  const inactive = recipeSchemeStatus(recipe) === "inactive";

  return (
    <aside
      aria-label={`${recipe.name}版本详情`}
      className={
        narrowOpen
          ? "recipe-library-inspector is-narrow-open"
          : "recipe-library-inspector"
      }
    >
      <header className="recipe-library-inspector__header">
        <div>
          <span className="recipe-library-inspector__eyebrow">
            {recipeSchemeName(recipe)}
          </span>
          <h2>{recipe.name}</h2>
          <p>
            <RecipeKindBadge kind={recipe.kind} />
            <RecipeSchemeBadge status={recipeSchemeStatus(recipe)} />
            {recipe.code ? <span>{recipe.code}</span> : null}
            {archived ? (
              <span className="recipe-library__archived">已归档</span>
            ) : null}
          </p>
        </div>
        <strong
          className={
            selectedVersion
              ? "recipe-library-inspector__version"
              : "recipe-library-inspector__version is-draft"
          }
        >
          {selectedVersion ? `V${selectedVersion.versionNumber}` : "工作草稿"}
        </strong>
        <button
          aria-label="关闭配方详情"
          className="recipe-library-inspector__close"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="recipe-library-inspector__actions">
        <button
          className="button button--primary"
          disabled={
            inactive || (archived
              ? selectedVersion === null
              : selectedVersion === null && entry.summary.draftUpdatedAt === null)
          }
          onClick={onOpenSampleSheet}
          type="button"
        >
          <Icon name="scale" size={16} />
          我要打样
        </button>
        <button
          className="button button--secondary"
          disabled={selectedVersion === null || copying || archived || inactive}
          onClick={onCopy}
          type="button"
        >
          <Icon name="copy" size={16} />
          {copying ? "正在复制…" : "复制为草稿"}
        </button>
        <button
          className="button button--secondary"
          disabled={selectedVersion === null || recalculating}
          onClick={onRecalculate}
          type="button"
        >
          <Icon name="trend" size={16} />
          {recalculating ? "正在重算…" : "按当前价格重算"}
        </button>
        <button
          className="button button--secondary recipe-library__compare-button"
          disabled={entry.versions.length < 2}
          onClick={onCompare}
          title={
            entry.versions.length < 2
              ? "至少需要两个正式版本"
              : undefined
          }
          type="button"
        >
          <Icon name="recipe-version" size={16} />
          比较版本
        </button>
        <button
          className="button button--secondary"
          disabled={selectedVersion === null || archived || inactive}
          onClick={onOpenNutritionLabel}
          type="button"
        >
          <Icon name="nutrition-label" size={16} />
          生成营养标签
        </button>
        {!archived && entry.versions.length === 0 ? (
          <button
            className="button button--secondary recipe-library__danger-button"
            disabled={deletingRecipe}
            onClick={onDeleteDraftRecipe}
            type="button"
          >
            <Icon name="trash" size={16} />
            {deletingRecipe ? "正在删除…" : "删除工作草稿"}
          </button>
        ) : (
          <button
            className="button button--secondary recipe-library__danger-button"
            disabled={selectedVersion === null || deletingVersion}
            onClick={onDeleteVersion}
            type="button"
          >
            <Icon name="trash" size={16} />
            {deletingVersion ? "正在删除…" : "删除此版本"}
          </button>
        )}
        {!archived ? (
          <button
            className="button button--secondary"
            disabled={selectedVersion === null || inactive}
            onClick={onCreateAlternative}
            type="button"
          >
            <Icon name="plus" size={16} />
            创建替代配方
          </button>
        ) : null}
        {!archived ? (
          <button
            className="button button--secondary"
            onClick={onOpenSchemeSettings}
            type="button"
          >
            <Icon name="edit" size={16} />
            方案设置
          </button>
        ) : null}
        {archived ? (
          <>
            <button
              className="button button--secondary recipe-library__restore-button"
              disabled={restoring || deletingRecipe}
              onClick={onRestore}
              type="button"
            >
              <Icon name="unlock" size={16} />
              {restoring ? "正在恢复…" : "取消归档"}
            </button>
            <button
              className="button button--secondary recipe-library__danger-button"
              disabled={referenced || deletingRecipe}
              onClick={onPermanentlyDelete}
              title={
                referenced
                  ? "该配方仍被其他正式版本引用，不能永久删除"
                  : undefined
              }
              type="button"
            >
              <Icon name="trash" size={16} />
              {deletingRecipe ? "正在删除…" : "永久删除配方"}
            </button>
          </>
        ) : (
          <button
            className="recipe-library__archive-button"
            disabled={referenced}
            onClick={onArchive}
            title={
              referenced
                ? "该配方仍被其他正式版本引用，不能归档"
                : undefined
            }
            type="button"
          >
            <Icon name="archive" size={16} />
            归档
          </button>
        )}
      </div>

      {referenced ? (
        <p className="recipe-library-inspector__protection">
          <Icon name="lock" size={14} />
          被其他正式版本引用 {entry.summary.referencedByCount}{" "}
          次，已保护，暂不能归档。
        </p>
      ) : null}

      <div className="recipe-library-inspector__scroll">
        <section className="recipe-library-inspector__section">
          <div className="recipe-library-inspector__section-title">
            <h3>同产品配方</h3>
            <span>{productEntries.length} 套</span>
          </div>
          <div className="recipe-library__scheme-list" role="list">
            {productEntries.map(({ summary }) => {
              const candidate = summary.recipe;
              return (
                <button
                  aria-current={candidate.id === recipe.id ? "true" : undefined}
                  className={candidate.id === recipe.id ? "is-active" : undefined}
                  key={candidate.id}
                  onClick={() => onSelectRecipe(candidate.id)}
                  type="button"
                >
                  <span>
                    <strong>{recipeSchemeName(candidate)}</strong>
                    <small>
                      {candidate.latestVersionNumber
                        ? `V${candidate.latestVersionNumber}`
                        : "工作草稿"}
                    </small>
                  </span>
                  <RecipeSchemeBadge status={recipeSchemeStatus(candidate)} />
                </button>
              );
            })}
          </div>
        </section>
        {entry.versions.length > 0 ? (
          <section className="recipe-library-inspector__section">
            <div className="recipe-library-inspector__section-title">
              <h3>版本历史</h3>
              <span>{entry.versions.length} 个正式版本</span>
            </div>
            <div
              aria-label="版本历史"
              className="recipe-library__version-list"
              role="list"
            >
              {entry.versions.map((version) => (
                <button
                  aria-label={`V${version.versionNumber}，保存于 ${formatDateTime(
                    version.createdAt,
                  )}`}
                  aria-current={
                    version.id === selectedVersion?.id
                      ? "true"
                      : undefined
                  }
                  className={
                    version.id === selectedVersion?.id
                      ? "is-active"
                      : undefined
                  }
                  key={version.id}
                  onClick={() => onSelectVersion(version.id)}
                  type="button"
                >
                  <strong>V{version.versionNumber}</strong>
                  <span>{formatDateTime(version.createdAt)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="recipe-library-inspector__no-version">
            <Icon name="edit" size={28} />
            <strong>目前只有工作草稿</strong>
            <span>在配方工作台保存正式版本后，可在这里查看快照。</span>
          </div>
        )}

        {selectedVersion ? (
          <VersionSnapshot
            currentPrice={currentPrice}
            version={selectedVersion}
          />
        ) : null}
      </div>
    </aside>
  );
}

function VersionSnapshot({
  version,
  currentPrice,
}: {
  version: RecipeVersion;
  currentPrice: RecipeCurrentPriceResult | null;
}) {
  const { snapshot } = version;
  const nutritionItems = snapshot.calculation.nutrients.filter(
    (nutrient) => (nutrient.category ?? "nutrition") === "nutrition",
  );
  const researchItems = snapshot.calculation.nutrients.filter(
    (nutrient) => nutrient.category === "research",
  );
  const itemNames = Object.fromEntries(
    snapshot.items.map((item) => [
      item.id,
      item.kind === "ingredient"
        ? item.ingredient.materialName
        : item.recipeVersion.recipeName,
    ]),
  );
  return (
    <>
      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>版本概览</h3>
          <span>保存于 {formatDateTime(version.createdAt)}</span>
        </div>
        <dl className="recipe-library__overview">
          <div>
            <dt>投料合计</dt>
            <dd>{formatNumber(snapshot.calculation.inputMassGrams)} g</dd>
          </div>
          <div>
            <dt>出成重量</dt>
            <dd>
              {snapshot.finishedMassGrams
                ? `${formatNumber(snapshot.finishedMassGrams)} g`
                : "按投料量计算"}
            </dd>
          </div>
          <div>
            <dt>数据完整度</dt>
            <dd>{snapshot.calculation.completeness.percent}%</dd>
          </div>
        </dl>
      </section>

      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>配方组成</h3>
          <span>{snapshot.items.length} 项</span>
        </div>
        <div className="recipe-library__snapshot-rows">
          {snapshot.items.map((item) => (
            <div key={item.id}>
              <span>
                <strong>
                  {item.kind === "ingredient"
                    ? item.ingredient.materialName
                    : item.recipeVersion.recipeName}
                </strong>
                <small>
                  {item.kind === "ingredient"
                    ? `${item.ingredient.supplierName} · ${item.ingredient.modelOrSpecification}`
                    : `半成品 V${item.recipeVersion.versionNumber}`}
                </small>
              </span>
              <b>
                {formatNumber(item.amount)} {item.unit}
              </b>
            </div>
          ))}
          {snapshot.items.length === 0 ? (
            <p className="recipe-library__muted">未记录配方组成</p>
          ) : null}
        </div>
      </section>

      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>营养估算</h3>
          <span>每 100 g</span>
        </div>
        <div className="recipe-library__nutrition">
          {nutritionItems.map((nutrient) => (
            <div key={nutrient.nutrientDefinitionId}>
              <span>{nutrient.name}</span>
              <strong>
                {nutrient.status === "unknown"
                  ? "—"
                  : `${formatNumber(nutrient.per100gKnownAmount)} ${nutrient.unit}`}
              </strong>
              <small>
                {nutrient.status === "complete"
                  ? "完整"
                  : nutrient.status === "partial"
                    ? "部分数据"
                    : "待补充"}
              </small>
            </div>
          ))}
          {nutritionItems.length === 0 ? (
            <p className="recipe-library__muted">暂无营养估算</p>
          ) : null}
        </div>
      </section>

      {researchItems.length > 0 ? (
        <section className="recipe-library-inspector__section">
          <div className="recipe-library-inspector__section-title">
            <h3>研发指标</h3>
            <span>理论研发估算</span>
          </div>
          <div className="recipe-library__nutrition">
            {researchItems.map((nutrient) => (
              <div key={nutrient.nutrientDefinitionId}>
                <span>{nutrient.name}</span>
                <strong>
                  {nutrient.status === "unknown"
                    ? "—"
                    : `${formatNumber(nutrient.per100gKnownAmount)} ${nutrient.unit}/100g`}
                </strong>
                <small>
                  {nutrient.status === "complete"
                    ? "完整"
                    : nutrient.status === "partial"
                      ? "部分数据"
                      : "待补充"}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>成本快照</h3>
          <span>保存时价格</span>
        </div>
        <dl className="recipe-library__cost">
          <div>
            <dt>原料</dt>
            <dd>
              {formatMoney(snapshot.calculation.cost.rawMaterialTotal)}
            </dd>
          </div>
          <div>
            <dt>包装</dt>
            <dd>{formatMoney(snapshot.calculation.cost.packagingTotal)}</dd>
          </div>
          <div>
            <dt>附加</dt>
            <dd>{formatMoney(snapshot.calculation.cost.additionalTotal)}</dd>
          </div>
          <div className="is-total">
            <dt>整批成本</dt>
            <dd>{formatMoney(snapshot.calculation.cost.batchTotal)}</dd>
          </div>
          <div>
            <dt>每 100 g</dt>
            <dd>{formatMoney(snapshot.calculation.cost.per100g)}</dd>
          </div>
        </dl>
        {currentPrice ? (
          <CurrentPriceComparison result={currentPrice} />
        ) : (
          <p className="recipe-library__price-hint">
            点击“按当前价格重算”可查看临时差异，不会覆盖本版本。
          </p>
        )}
      </section>

      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>过敏原</h3>
        </div>
        <div className="recipe-library__allergens">
          <p>
            <strong>含有：</strong>
            {snapshot.calculation.allergens.contains.join("、") || "无记录"}
          </p>
          <p>
            <strong>可能含有：</strong>
            {snapshot.calculation.allergens.mayContain.join("、") ||
              "无记录"}
          </p>
        </div>
      </section>

      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>研发备注</h3>
        </div>
        <p className="recipe-library__notes">
          {snapshot.markdownNotes || "未填写研发备注"}
        </p>
      </section>
    </>
  );
}

function CurrentPriceComparison({
  result,
}: {
  result: RecipeCurrentPriceResult;
}) {
  const difference = Number(result.difference);
  return (
    <div className="recipe-library__current-price" role="status">
      <header>
        <div>
          <Icon name="trend" size={16} />
          <strong>当前价格临时对比</strong>
        </div>
        <span className={difference > 0 ? "is-up" : "is-down"}>
          {formatMoneyDifference(result.difference)}
        </span>
      </header>
      <dl>
        <div>
          <dt>冻结版本</dt>
          <dd>{formatMoney(result.frozenBatchTotal)}</dd>
        </div>
        <div>
          <dt>当前价格</dt>
          <dd>{formatMoney(result.currentBatchTotal)}</dd>
        </div>
        <div>
          <dt>当前每 100 g</dt>
          <dd>{formatMoney(result.currentPer100g)}</dd>
        </div>
      </dl>
      {result.status === "partial" ? (
        <p>
          有 {result.missingIngredients.length} 项缺少当前价格或密度：
          {result.missingIngredients.join("、")}
        </p>
      ) : null}
      <small>仅用于当前决策，正式版本的冻结快照没有改变。</small>
    </div>
  );
}

function AlternativeRecipeDialog({
  productName,
  saving,
  sourceVersionNumber,
  onCancel,
  onSubmit,
}: {
  productName: string;
  saving: boolean;
  sourceVersionNumber: number;
  onCancel(): void;
  onSubmit(input: Omit<RecipeAlternativeCreateInput, "sourceVersionId">): void;
}) {
  const [schemeName, setSchemeName] = useState("");
  const [schemeStatus, setSchemeStatus] =
    useState<"approved" | "researching">("researching");
  return (
    <div className="recipe-library-dialog-backdrop">
      <form
        aria-labelledby="create-alternative-title"
        aria-modal="true"
        className="recipe-library-dialog recipe-library-dialog--form"
        onSubmit={(event) => {
          event.preventDefault();
          if (schemeName.trim()) onSubmit({ schemeName, schemeStatus });
        }}
        role="dialog"
      >
        <div className="recipe-library-dialog__icon">
          <Icon name="copy" size={22} />
        </div>
        <h2 id="create-alternative-title">创建替代配方</h2>
        <p>
          从“{productName}”V{sourceVersionNumber} 复制为独立草稿，之后拥有自己的版本历史。
        </p>
        <label>
          <span>替代配方名称</span>
          <input
            autoFocus
            maxLength={80}
            onChange={(event) => setSchemeName(event.target.value)}
            placeholder="例如：供应商 B 可可粉版本"
            value={schemeName}
          />
        </label>
        <label>
          <span>初始状态</span>
          <select
            onChange={(event) =>
              setSchemeStatus(event.target.value as "approved" | "researching")
            }
            value={schemeStatus}
          >
            <option value="researching">研发中</option>
            <option value="approved">已批准替代</option>
          </select>
        </label>
        <small>研发中方案可继续编辑和打样；确认可用后再改为“已批准替代”。</small>
        <footer>
          <button
            className="button button--secondary"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="button button--primary"
            disabled={saving || schemeName.trim() === ""}
            type="submit"
          >
            {saving ? "正在创建…" : "创建并进入工作台"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function RecipeSchemeDialog({
  recipe,
  saving,
  onCancel,
  onSubmit,
}: {
  recipe: Recipe;
  saving: boolean;
  onCancel(): void;
  onSubmit(input: RecipeSchemeUpdateInput): void;
}) {
  const [schemeName, setSchemeName] = useState(recipeSchemeName(recipe));
  const [schemeStatus, setSchemeStatus] =
    useState<RecipeSchemeStatus>(recipeSchemeStatus(recipe));
  return (
    <div className="recipe-library-dialog-backdrop">
      <form
        aria-labelledby="recipe-scheme-title"
        aria-modal="true"
        className="recipe-library-dialog recipe-library-dialog--form"
        onSubmit={(event) => {
          event.preventDefault();
          if (schemeName.trim()) onSubmit({ schemeName, schemeStatus });
        }}
        role="dialog"
      >
        <div className="recipe-library-dialog__icon">
          <Icon name="edit" size={22} />
        </div>
        <h2 id="recipe-scheme-title">方案设置</h2>
        <p>管理“{recipe.name}”下这套配方的名称和可用状态。</p>
        <label>
          <span>配方方案名称</span>
          <input
            maxLength={80}
            onChange={(event) => setSchemeName(event.target.value)}
            value={schemeName}
          />
        </label>
        <label>
          <span>方案状态</span>
          <select
            onChange={(event) =>
              setSchemeStatus(event.target.value as RecipeSchemeStatus)
            }
            value={schemeStatus}
          >
            <option value="current">当前使用</option>
            <option value="approved">已批准替代</option>
            <option value="researching">研发中</option>
            <option value="inactive">已停用</option>
          </select>
        </label>
        <small>
          设为“当前使用”时，原当前配方会自动变为“已批准替代”；已停用方案不可编辑、打样或保存新版本。
        </small>
        <footer>
          <button
            className="button button--secondary"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="button button--primary"
            disabled={saving || schemeName.trim() === ""}
            type="submit"
          >
            {saving ? "正在保存…" : "保存方案设置"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function RecipeKindBadge({ kind }: { kind: RecipeKind }) {
  return (
    <span
      className={`recipe-library__kind recipe-library__kind--${kind}`}
    >
      {kind === "formula" ? "成品配方" : "半成品"}
    </span>
  );
}

function RecipeSchemeBadge({ status }: { status: RecipeSchemeStatus }) {
  return (
    <span className={`recipe-library__scheme-status is-${status}`}>
      {schemeStatusLabel(status)}
    </span>
  );
}

function schemeStatusLabel(status: RecipeSchemeStatus) {
  switch (status) {
    case "current":
      return "当前使用";
    case "approved":
      return "已批准替代";
    case "researching":
      return "研发中";
    case "inactive":
      return "已停用";
  }
}

const schemeOrder: Record<RecipeSchemeStatus, number> = {
  current: 0,
  approved: 1,
  researching: 2,
  inactive: 3,
};

function compareRecipeSchemes(left: RecipeLibraryEntry, right: RecipeLibraryEntry) {
  const leftRecipe = left.summary.recipe;
  const rightRecipe = right.summary.recipe;
  return (
    leftRecipe.name.localeCompare(rightRecipe.name, "zh-CN") ||
    schemeOrder[recipeSchemeStatus(leftRecipe)] -
      schemeOrder[recipeSchemeStatus(rightRecipe)] ||
    recipeSchemeName(leftRecipe).localeCompare(recipeSchemeName(rightRecipe), "zh-CN")
  );
}

function hasUpdatedIngredientData(
  versions: RecipeVersion[],
  materialGroups: MaterialGroup[],
) {
  const currentVariants = new Map(
    materialGroups.flatMap((group) =>
      group.variants.map((variant) => [variant.id, variant] as const),
    ),
  );
  return versions.some((version) =>
    version.snapshot.items.some((item) => {
      if (item.kind !== "ingredient") return false;
      const current = currentVariants.get(
        item.ingredient.ingredientVariantId,
      );
      return (
        current === undefined ||
        current.updatedAt !== item.ingredient.ingredientUpdatedAt
      );
    }),
  );
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 4,
      }).format(number)
    : value;
}

function formatMoney(value: string) {
  const number = Number(value);
  return `¥${Number.isFinite(number) ? moneyFormatter.format(number) : value}`;
}

function formatMoneyDifference(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return formatMoney(value);
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}¥${moneyFormatter.format(Math.abs(number))}`;
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : fallback;
}
