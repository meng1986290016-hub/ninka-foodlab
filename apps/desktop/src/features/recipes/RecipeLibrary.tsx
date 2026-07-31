import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  RecipeKind,
  RecipeSummary,
  RecipeVersion,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";
import {
  calculateRecipeAtCurrentPrices,
  loadRecipeVersionClosure,
  type RecipeCurrentPriceResult,
} from "./recipe-current-price";

interface RecipeLibraryProps {
  api: DesktopApi;
  onOpenDraft(recipeId: string): void;
}

interface RecipeLibraryEntry {
  summary: RecipeSummary;
  versions: RecipeVersion[];
}

type RecipeStatusFilter =
  | "all"
  | "versioned"
  | "draft_only"
  | "archived";
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

export function RecipeLibrary({
  api,
  onOpenDraft,
}: RecipeLibraryProps) {
  const [entries, setEntries] = useState<RecipeLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | RecipeKind>("all");
  const [status, setStatus] = useState<RecipeStatusFilter>("all");
  const [updated, setUpdated] = useState<UpdatedFilter>("all");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [currentPrice, setCurrentPrice] =
    useState<RecipeCurrentPriceResult | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [archiveCandidate, setArchiveCandidate] =
    useState<RecipeSummary | null>(null);
  const [archiving, setArchiving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summaries = await api.listRecipes();
      const versions = await Promise.all(
        summaries.map((summary) =>
          api.listRecipeVersions(summary.recipe.id),
        ),
      );
      setEntries(
        summaries.map((summary, index) => ({
          summary,
          versions: versions[index] ?? [],
        })),
      );
    } catch (cause) {
      setError(messageFrom(cause, "配方库无法读取"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const now = Date.now();
    return entries.filter(({ summary }) => {
      const recipe = summary.recipe;
      const matchesQuery =
        normalized === "" ||
        [recipe.name, recipe.code ?? "", ...recipe.tags].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(normalized),
        );
      const matchesKind = kind === "all" || recipe.kind === kind;
      const matchesStatus =
        status === "all" ||
        (status === "versioned" &&
          summary.latestVersion !== null &&
          recipe.archivedAt === null) ||
        (status === "draft_only" &&
          summary.latestVersion === null &&
          recipe.archivedAt === null) ||
        (status === "archived" && recipe.archivedAt !== null);
      const ageDays =
        (now - new Date(recipe.updatedAt).getTime()) /
        (24 * 60 * 60 * 1000);
      const matchesUpdated =
        updated === "all" || ageDays <= Number(updated);
      return (
        matchesQuery &&
        matchesKind &&
        matchesStatus &&
        matchesUpdated
      );
    });
  }, [entries, kind, query, status, updated]);

  useEffect(() => {
    if (
      selectedRecipeId !== null &&
      filteredEntries.some(
        ({ summary }) => summary.recipe.id === selectedRecipeId,
      )
    ) {
      return;
    }
    setSelectedRecipeId(
      filteredEntries[0]?.summary.recipe.id ?? null,
    );
  }, [filteredEntries, selectedRecipeId]);

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
      await refresh();
    } catch (cause) {
      setError(messageFrom(cause, "配方无法归档"));
    } finally {
      setArchiving(false);
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
    <section className="recipe-library">
      <div className="recipe-library__main">
        <header className="recipe-library__header">
          <div>
            <h1>配方库</h1>
            <p>查看正式版本、冻结快照与当前价格对比</p>
          </div>
          <span className="recipe-library__count">
            {filteredEntries.length} 个配方
          </span>
        </header>

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
          <label>
            <span>状态</span>
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
              <option value="archived">已归档</option>
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
                  <th>配方名称</th>
                  <th>类型</th>
                  <th>最新版本</th>
                  <th>目标批量</th>
                  <th>整批成本</th>
                  <th>最近更新</th>
                  <th>引用</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
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
                      }}
                    >
                      <td>
                        <button
                          aria-pressed={selected}
                          className="recipe-library__identity"
                          onClick={() => {
                            setSelectedRecipeId(recipe.id);
                            setSelectedVersionId(latest?.id ?? null);
                          }}
                          type="button"
                        >
                          <strong>{recipe.name}</strong>
                          <small>
                            {recipe.code ??
                              (recipe.tags.length > 0
                                ? recipe.tags.join(" · ")
                                : "未设置编号或标签")}
                          </small>
                        </button>
                      </td>
                      <td>
                        <RecipeKindBadge kind={recipe.kind} />
                      </td>
                      <td>
                        {latest ? `V${latest.versionNumber}` : "—"}
                      </td>
                      <td>
                        {latest
                          ? `${formatNumber(
                              latest.snapshot.targetBatchGrams,
                            )} g`
                          : "—"}
                      </td>
                      <td>
                        {latest
                          ? formatMoney(
                              latest.snapshot.calculation.cost.batchTotal,
                            )
                          : "—"}
                      </td>
                      <td>{formatDate(recipe.updatedAt)}</td>
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
            {filteredEntries.length === 0 ? (
              <div className="recipe-library__empty">
                <Icon name="formula" size={28} />
                <strong>没有符合条件的配方</strong>
                <span>可以调整搜索词或筛选条件。</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <RecipeVersionInspector
        currentPrice={currentPrice}
        entry={selectedEntry}
        onArchive={() => {
          if (selectedEntry) setArchiveCandidate(selectedEntry.summary);
        }}
        onCopy={() => void copyToDraft()}
        onRecalculate={() => void recalculateCurrentPrice()}
        onSelectVersion={setSelectedVersionId}
        recalculating={recalculating}
        selectedVersion={selectedVersion}
        copying={copying}
      />

      {archiveCandidate ? (
        <div className="recipe-library-dialog-backdrop">
          <section
            aria-labelledby="archive-recipe-title"
            aria-modal="true"
            className="recipe-library-dialog"
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
    </section>
  );
}

interface RecipeVersionInspectorProps {
  entry: RecipeLibraryEntry | null;
  selectedVersion: RecipeVersion | null;
  currentPrice: RecipeCurrentPriceResult | null;
  recalculating: boolean;
  copying: boolean;
  onSelectVersion(id: string): void;
  onCopy(): void;
  onRecalculate(): void;
  onArchive(): void;
}

function RecipeVersionInspector({
  entry,
  selectedVersion,
  currentPrice,
  recalculating,
  copying,
  onSelectVersion,
  onCopy,
  onRecalculate,
  onArchive,
}: RecipeVersionInspectorProps) {
  if (entry === null) {
    return (
      <aside className="recipe-library-inspector is-empty">
        <Icon name="formula" size={30} />
        <strong>选择一个配方</strong>
        <span>这里会显示冻结版本和成本信息。</span>
      </aside>
    );
  }

  const { recipe } = entry.summary;
  const referenced = entry.summary.referencedByCount > 0;
  const archived = recipe.archivedAt !== null;

  return (
    <aside
      aria-label={`${recipe.name}版本详情`}
      className="recipe-library-inspector"
    >
      <header className="recipe-library-inspector__header">
        <div>
          <span className="recipe-library-inspector__eyebrow">
            冻结版本详情
          </span>
          <h2>{recipe.name}</h2>
          <p>
            <RecipeKindBadge kind={recipe.kind} />
            {recipe.code ? <span>{recipe.code}</span> : null}
            {archived ? (
              <span className="recipe-library__archived">已归档</span>
            ) : null}
          </p>
        </div>
        {selectedVersion ? (
          <strong className="recipe-library-inspector__version">
            V{selectedVersion.versionNumber}
          </strong>
        ) : null}
      </header>

      <div className="recipe-library-inspector__actions">
        <button
          className="button button--primary"
          disabled={selectedVersion === null || copying || archived}
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
          className="recipe-library__archive-button"
          disabled={referenced || archived}
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
      </div>

      {referenced ? (
        <p className="recipe-library-inspector__protection">
          <Icon name="lock" size={14} />
          被其他正式版本引用 {entry.summary.referencedByCount}{" "}
          次，已保护，暂不能归档。
        </p>
      ) : null}

      <div className="recipe-library-inspector__scroll">
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
  return (
    <>
      <section className="recipe-library-inspector__section">
        <div className="recipe-library-inspector__section-title">
          <h3>版本概览</h3>
          <span>保存于 {formatDateTime(version.createdAt)}</span>
        </div>
        <dl className="recipe-library__overview">
          <div>
            <dt>目标批量</dt>
            <dd>{formatNumber(snapshot.targetBatchGrams)} g</dd>
          </div>
          <div>
            <dt>成品产量</dt>
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
          {snapshot.calculation.nutrients.map((nutrient) => (
            <div key={nutrient.nutrientDefinitionId}>
              <span>{nutrient.name}</span>
              <strong>
                {formatNumber(nutrient.per100gKnownAmount)} {nutrient.unit}
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
          {snapshot.calculation.nutrients.length === 0 ? (
            <p className="recipe-library__muted">暂无营养估算</p>
          ) : null}
        </div>
      </section>

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

function RecipeKindBadge({ kind }: { kind: RecipeKind }) {
  return (
    <span
      className={`recipe-library__kind recipe-library__kind--${kind}`}
    >
      {kind === "formula" ? "成品配方" : "半成品"}
    </span>
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
  return `¥${formatNumber(value)}`;
}

function formatMoneyDifference(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return formatMoney(value);
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}¥${formatNumber(String(Math.abs(number)))}`;
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : fallback;
}
