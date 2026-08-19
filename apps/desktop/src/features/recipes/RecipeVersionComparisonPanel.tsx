import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionComparisonRow,
  RecipeVersionItemChange,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface RecipeVersionComparisonPanelProps {
  api: DesktopApi;
  recipeName: string;
  versions: RecipeVersion[];
  onClose(): void;
}

export function RecipeVersionComparisonPanel({
  api,
  recipeName,
  versions,
  onClose,
}: RecipeVersionComparisonPanelProps) {
  const [beforeId, setBeforeId] = useState(versions[1]?.id ?? "");
  const [afterId, setAfterId] = useState(versions[0]?.id ?? "");
  const [comparison, setComparison] =
    useState<RecipeVersionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (beforeId === "" || afterId === "" || beforeId === afterId) {
      setComparison(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .compareRecipeVersions(beforeId, afterId)
      .then((result) => {
        if (active) setComparison(result);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error && cause.message !== ""
              ? cause.message
              : "版本差异无法读取",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [afterId, api, beforeId]);

  const beforeVersion =
    versions.find((version) => version.id === beforeId) ?? null;
  const afterVersion =
    versions.find((version) => version.id === afterId) ?? null;
  const changeCount = useMemo(
    () =>
      comparison === null
        ? 0
        : comparison.itemChanges.length +
          comparison.nutritionChanges.length +
          comparison.costChanges.length +
          comparison.targetChanges.length +
          comparison.allergenChanges.length +
          Number(comparison.notesChanged),
    [comparison],
  );

  if (versions.length < 2) {
    return (
      <aside
        aria-label={`${recipeName}版本比较`}
        className="recipe-comparison-panel"
      >
        <header className="recipe-comparison-panel__header">
          <div>
            <span>研发差异</span>
            <h2>配方版本比较</h2>
          </div>
          <button
            aria-label="关闭版本比较"
            className="recipe-icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="recipe-comparison-panel__empty">
          <Icon name="version-compare" size={30} />
          <strong>至少需要两个正式版本</strong>
          <span>复制当前版本为草稿并保存新版本后，即可进行比较。</span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${recipeName}版本比较`}
      className="recipe-comparison-panel"
    >
      <header className="recipe-comparison-panel__header">
        <div>
          <span>研发差异</span>
          <h2>配方版本比较</h2>
          <p>{recipeName}</p>
        </div>
        <button
          aria-label="关闭版本比较"
          className="recipe-icon-button"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="recipe-comparison-panel__selectors">
        <label>
          <span>基准版本</span>
          <select
            aria-label="基准版本"
            onChange={(event) => setBeforeId(event.target.value)}
            value={beforeId}
          >
            {versions.map((version) => (
              <option
                disabled={version.id === afterId}
                key={version.id}
                value={version.id}
              >
                V{version.versionNumber} · {formatDate(version.createdAt)}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="交换比较版本"
          className="recipe-comparison-panel__swap"
          onClick={() => {
            setBeforeId(afterId);
            setAfterId(beforeId);
          }}
          type="button"
        >
          ⇄
        </button>
        <label>
          <span>对比版本</span>
          <select
            aria-label="对比版本"
            onChange={(event) => setAfterId(event.target.value)}
            value={afterId}
          >
            {versions.map((version) => (
              <option
                disabled={version.id === beforeId}
                key={version.id}
                value={version.id}
              >
                V{version.versionNumber} · {formatDate(version.createdAt)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="recipe-comparison-panel__summary">
        {loading ? (
          <span>正在计算差异…</span>
        ) : error ? (
          <span className="has-error" role="alert">
            {error}
          </span>
        ) : comparison ? (
          <>
            <strong>
              V{comparison.before.versionNumber} → V
              {comparison.after.versionNumber}
            </strong>
            <span>
              {changeCount === 0
                ? "未发现研发数据变化"
                : `共 ${changeCount} 项变化`}
            </span>
          </>
        ) : null}
      </div>

      <div className="recipe-comparison-panel__scroll">
        {comparison ? (
          changeCount === 0 ? (
            <div className="recipe-comparison-panel__empty">
              <Icon name="check" size={28} />
              <strong>两个版本的研发数据一致</strong>
              <span>版本时间和编号不同，但快照内容没有差异。</span>
            </div>
          ) : (
            <>
              <ItemChangeSection
                afterVersion={comparison.after.versionNumber}
                beforeVersion={comparison.before.versionNumber}
                rows={comparison.itemChanges}
              />
              <ComparisonSection
                afterVersion={comparison.after.versionNumber}
                beforeVersion={comparison.before.versionNumber}
                emptyLabel="营养估算没有变化"
                rows={comparison.nutritionChanges}
                title="营养成分（每 100g）"
                tone="nutrition"
              />
              <ComparisonSection
                afterVersion={comparison.after.versionNumber}
                beforeVersion={comparison.before.versionNumber}
                emptyLabel="成本快照没有变化"
                rows={comparison.costChanges}
                title="成本"
                tone="cost"
              />
              <ComparisonSection
                afterVersion={comparison.after.versionNumber}
                beforeVersion={comparison.before.versionNumber}
                emptyLabel="研发目标没有变化"
                rows={comparison.targetChanges}
                title="目标"
                tone="target"
              />
              <ComparisonSection
                afterVersion={comparison.after.versionNumber}
                beforeVersion={comparison.before.versionNumber}
                emptyLabel="过敏原没有变化"
                rows={comparison.allergenChanges}
                title="过敏原"
                tone="allergen"
              />
              <NotesChangeSection
                afterNotes={
                  afterVersion?.snapshot.markdownNotes ?? ""
                }
                afterVersion={comparison.after.versionNumber}
                beforeNotes={
                  beforeVersion?.snapshot.markdownNotes ?? ""
                }
                beforeVersion={comparison.before.versionNumber}
                changed={comparison.notesChanged}
              />
            </>
          )
        ) : null}
      </div>
    </aside>
  );
}

function ItemChangeSection({
  rows,
  beforeVersion,
  afterVersion,
}: {
  rows: RecipeVersionItemChange[];
  beforeVersion: number;
  afterVersion: number;
}) {
  return (
    <ComparisonGroup
      count={rows.length}
      emptyLabel="配方组成没有变化"
      title="配方组成"
    >
      {rows.length > 0 ? (
        <div className="recipe-comparison-table recipe-comparison-table--items">
          <ComparisonHead
            afterVersion={afterVersion}
            beforeVersion={beforeVersion}
          />
          {rows.map((row) => (
            <div className="recipe-comparison-table__row" key={row.itemKey}>
              <span>
                <strong>{baseItemName(row.label)}</strong>
                <small>{itemChangeKind(row.kind)}</small>
              </span>
              <span>
                <strong>{row.beforeLabel ?? "—"}</strong>
                <small>
                  {formatMass(row.beforeAmountGrams)}
                </small>
              </span>
              <span>
                <strong>{row.afterLabel ?? "—"}</strong>
                <small>{formatMass(row.afterAmountGrams)}</small>
              </span>
              <ChangeBadge
                kind={row.kind}
                value={itemChangeValue(row)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </ComparisonGroup>
  );
}

function ComparisonSection({
  title,
  rows,
  beforeVersion,
  afterVersion,
  emptyLabel,
  tone,
}: {
  title: string;
  rows: RecipeVersionComparisonRow[];
  beforeVersion: number;
  afterVersion: number;
  emptyLabel: string;
  tone: "nutrition" | "cost" | "target" | "allergen";
}) {
  return (
    <ComparisonGroup
      count={rows.length}
      emptyLabel={emptyLabel}
      title={title}
    >
      {rows.length > 0 ? (
        <div className="recipe-comparison-table">
          <ComparisonHead
            afterVersion={afterVersion}
            beforeVersion={beforeVersion}
          />
          {rows.map((row) => (
            <div className="recipe-comparison-table__row" key={row.key}>
              <strong>{row.label}</strong>
              <span>{comparisonValue(row.before, row.unit)}</span>
              <span>{comparisonValue(row.after, row.unit)}</span>
              <ChangeBadge
                kind={comparisonTone(row, tone)}
                value={comparisonDelta(row)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </ComparisonGroup>
  );
}

function NotesChangeSection({
  changed,
  beforeNotes,
  afterNotes,
  beforeVersion,
  afterVersion,
}: {
  changed: boolean;
  beforeNotes: string;
  afterNotes: string;
  beforeVersion: number;
  afterVersion: number;
}) {
  return (
    <ComparisonGroup
      count={Number(changed)}
      emptyLabel="研发备注没有变化"
      title="研发备注"
    >
      {changed ? (
        <div className="recipe-comparison-notes">
          <div>
            <span>V{beforeVersion}</span>
            <p>{beforeNotes || "未填写备注"}</p>
          </div>
          <div>
            <span>V{afterVersion}</span>
            <p>{afterNotes || "未填写备注"}</p>
          </div>
        </div>
      ) : null}
    </ComparisonGroup>
  );
}

function ComparisonGroup({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="recipe-comparison-group">
      <header>
        <h3>{title}</h3>
        <span>{count > 0 ? `${count} 项变化` : emptyLabel}</span>
      </header>
      {children}
    </section>
  );
}

function ComparisonHead({
  beforeVersion,
  afterVersion,
}: {
  beforeVersion: number;
  afterVersion: number;
}) {
  return (
    <div className="recipe-comparison-table__head">
      <span>项目</span>
      <span>V{beforeVersion}</span>
      <span>V{afterVersion}</span>
      <span>变化</span>
    </div>
  );
}

function ChangeBadge({
  value,
  kind,
}: {
  value: string;
  kind:
    | RecipeVersionItemChange["kind"]
    | "increase"
    | "decrease"
    | "changed";
}) {
  return (
    <span className={`recipe-comparison-change is-${kind}`}>
      {value}
    </span>
  );
}

function itemChangeKind(kind: RecipeVersionItemChange["kind"]) {
  return {
    added: "新增项目",
    removed: "移除项目",
    amount_changed: "用量变化",
    reference_changed: "供应商或半成品版本变化",
  }[kind];
}

function itemChangeValue(row: RecipeVersionItemChange) {
  if (row.kind === "added") return "新增";
  if (row.kind === "removed") return "移除";
  if (row.kind === "reference_changed") return "来源变化";
  const before = Number(row.beforeAmountGrams);
  const after = Number(row.afterAmountGrams);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return "已变化";
  }
  const delta = after - before;
  return `${delta > 0 ? "+" : ""}${formatNumber(String(delta))} g`;
}

function comparisonTone(
  row: RecipeVersionComparisonRow,
  tone: "nutrition" | "cost" | "target" | "allergen",
): "increase" | "decrease" | "changed" {
  const before = numericValue(row.before);
  const after = numericValue(row.after);
  if (tone === "cost" && before !== null && after !== null) {
    return after > before
      ? "increase"
      : after < before
        ? "decrease"
        : "changed";
  }
  return "changed";
}

function comparisonDelta(row: RecipeVersionComparisonRow) {
  const before = numericValue(row.before);
  const after = numericValue(row.after);
  if (before === null || after === null) {
    if (row.before === null && row.after !== null) {
      return `未知 → ${comparisonValue(row.after, row.unit)}`;
    }
    if (row.before !== null && row.after === null) return "变为未知";
    return "已变化";
  }
  const delta = after - before;
  if (delta === 0) return "已变化";
  if (row.unit === "CNY") {
    return `${delta > 0 ? "+" : "-"}¥${formatNumber(
      String(Math.abs(delta)),
    )}`;
  }
  return `${delta > 0 ? "+" : ""}${formatNumber(String(delta))}${
    row.unit ? ` ${row.unit}` : ""
  }`;
}

function comparisonValue(
  value: string | null,
  unit: string | null,
) {
  if (value === null) return "未知";
  const number = numericValue(value);
  if (number !== null) {
    if (unit === "CNY") return `¥${formatNumber(value)}`;
    return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
  }
  return value === "" ? "无记录" : value;
}

function numericValue(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMass(value: string | null) {
  return value === null ? "—" : `${formatNumber(value)} g`;
}

function baseItemName(label: string) {
  return label.split(" · ")[0] ?? label;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 4,
      }).format(number)
    : value;
}
