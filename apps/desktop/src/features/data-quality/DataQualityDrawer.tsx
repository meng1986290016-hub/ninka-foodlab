import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../../components/Icon";
import type {
  DataGapEntry,
  DataGapReport,
  NutritionDetail,
} from "./data-quality";

export type DataQualityDrawerContent =
  | {
      kind: "gaps";
      report: DataGapReport;
      initialGrouping: "field" | "source";
      nutrientDefinitionId?: string;
    }
  | { kind: "nutrition"; detail: NutritionDetail };

interface DataQualityDrawerProps {
  content: DataQualityDrawerContent | null;
  onClose(): void;
  onEditIngredient?(entry: DataGapEntry): void;
}

const categoryLabels = {
  nutrition: "营养",
  cost: "成本",
  density: "密度",
  source: "来源",
  material: "原料关联",
  version: "版本引用",
} as const;

export function DataQualityDrawer({
  content,
  onClose,
  onEditIngredient,
}: DataQualityDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (content === null) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [content]);

  useEffect(() => {
    if (content === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [content, onClose]);

  if (content === null) return null;
  const title = content.kind === "gaps" ? "数据缺口" : "营养信息";
  return (
    <div
      className="data-quality-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="data-quality-drawer-title"
        aria-modal="true"
        className="data-quality-drawer"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="data-quality-drawer__header">
          <div>
            <span>{title}</span>
            <h2 id="data-quality-drawer-title">
              {content.kind === "gaps"
                ? content.report.title
                : content.detail.title}
            </h2>
          </div>
          <button aria-label={`关闭${title}`} onClick={onClose} type="button">
            <Icon name="close" size={20} />
          </button>
        </header>
        {content.kind === "gaps" ? (
          <GapReportView
            initialGrouping={content.initialGrouping}
            onEditIngredient={onEditIngredient}
            report={content.report}
            {...(content.nutrientDefinitionId === undefined
              ? {}
              : { nutrientDefinitionId: content.nutrientDefinitionId })}
          />
        ) : (
          <NutritionDetailView detail={content.detail} />
        )}
      </aside>
    </div>
  );
}

function GapReportView({
  report,
  initialGrouping,
  nutrientDefinitionId,
  onEditIngredient,
}: {
  report: DataGapReport;
  initialGrouping: "field" | "source";
  nutrientDefinitionId?: string;
  onEditIngredient: DataQualityDrawerProps["onEditIngredient"];
}) {
  const [grouping, setGrouping] = useState(initialGrouping);
  const visibleEntries = useMemo(
    () =>
      nutrientDefinitionId === undefined
        ? report.entries
        : report.entries.filter(
            (entry) =>
              entry.fieldId === nutrientDefinitionId ||
              entry.category === "material" ||
              entry.category === "version" ||
              entry.category === "density",
          ),
    [nutrientDefinitionId, report.entries],
  );
  const groups = useMemo(
    () => groupEntries(visibleEntries, grouping),
    [grouping, visibleEntries],
  );
  const selectedCoverage =
    nutrientDefinitionId === undefined
      ? null
      : report.nutrientCoverage.find(
          (item) => item.nutrientDefinitionId === nutrientDefinitionId,
        ) ?? null;

  return (
    <div className="data-quality-drawer__body">
      <section className="data-quality-summary">
        <div>
          <span>总数据完整度</span>
          <strong>
            {report.completenessPercent === null
              ? "未计算"
              : `${report.completenessPercent}%`}
          </strong>
        </div>
        <div>
          <span>缺失或待核实</span>
          <strong>{visibleEntries.length} 项</strong>
        </div>
      </section>

      {selectedCoverage ? (
        <section className="data-quality-coverage" aria-label="营养覆盖率">
          <div>
            <strong>{selectedCoverage.name}</strong>
            <span>{coverageStatus(selectedCoverage.status)}</span>
          </div>
          <progress max={100} value={selectedCoverage.ratio * 100} />
          <p>
            投料覆盖率 {formatPercent(selectedCoverage.ratio)}
            {selectedCoverage.knownMassGrams && selectedCoverage.trackedMassGrams
              ? ` · 已知 ${formatNumber(selectedCoverage.knownMassGrams)} g / 跟踪 ${formatNumber(selectedCoverage.trackedMassGrams)} g`
              : ""}
          </p>
        </section>
      ) : (
        <CoverageBreakdown report={report} />
      )}

      <div className="data-quality-grouping" aria-label="缺口分组方式">
        <button
          aria-pressed={grouping === "source"}
          className={grouping === "source" ? "is-active" : undefined}
          onClick={() => setGrouping("source")}
          type="button"
        >
          按原料
        </button>
        <button
          aria-pressed={grouping === "field"}
          className={grouping === "field" ? "is-active" : undefined}
          onClick={() => setGrouping("field")}
          type="button"
        >
          按数据项
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="data-quality-empty">
          <Icon name="check" size={24} />
          <strong>没有发现需要补充的信息</strong>
        </div>
      ) : (
        <div className="data-quality-groups">
          {groups.map((group) => (
            <section key={group.key}>
              <header>
                <strong>{group.label}</strong>
                <span>{group.entries.length} 项</span>
              </header>
              {group.entries.map((entry) => (
                <article className="data-quality-entry" key={entry.id}>
                  <div className="data-quality-entry__heading">
                    <span className={`is-${entry.state}`}>
                      {entry.state === "missing" ? "缺失" : "待核实"}
                    </span>
                    <strong>{entry.fieldName}</strong>
                    <small>{categoryLabels[entry.category]}</small>
                  </div>
                  <p>{entry.reason}</p>
                  <ol aria-label="来源路径" className="data-quality-path">
                    {entry.path.map((node, index) => (
                      <li key={`${node.id}:${index}`}>{node.label}</li>
                    ))}
                  </ol>
                  {entry.massGrams ? (
                    <small className="data-quality-entry__mass">
                      对应投料 {formatNumber(entry.massGrams)} g
                    </small>
                  ) : null}
                  {entry.editable && onEditIngredient ? (
                    <button
                      className="button button--secondary data-quality-entry__edit"
                      onClick={() => onEditIngredient(entry)}
                      type="button"
                    >
                      去原料库补充
                    </button>
                  ) : null}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CoverageBreakdown({ report }: { report: DataGapReport }) {
  const incomplete = report.nutrientCoverage.filter(
    (item) => item.status !== "complete",
  );
  if (incomplete.length === 0) return null;
  return (
    <section className="data-quality-coverage-list">
      <header>
        <strong>营养覆盖</strong>
      </header>
      {incomplete.map((item) => (
        <div key={item.nutrientDefinitionId}>
          <span>
            {item.name}
          </span>
          <strong>{formatPercent(item.ratio)}</strong>
        </div>
      ))}
    </section>
  );
}

function NutritionDetailView({ detail }: { detail: NutritionDetail }) {
  return (
    <div className="data-quality-drawer__body">
      <section className="nutrition-detail-meta">
        <p>{detail.subtitle || "供应商/规格未记录"}</p>
        <dl>
          <div>
            <dt>数据基准</dt>
            <dd>{detail.basisLabel}</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{detail.sourceLabel}</dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd>{formatDateTime(detail.updatedAt)}</dd>
          </div>
          {detail.completenessPercent === null ? null : (
            <div>
              <dt>数据完整度</dt>
              <dd>{detail.completenessPercent}%</dd>
            </div>
          )}
        </dl>
        {detail.note ? <p className="nutrition-detail-note">{detail.note}</p> : null}
      </section>
      <section className="nutrition-detail-table" aria-label="营养数据">
        <header>
          <span>项目</span>
          <span>{detail.basisLabel}</span>
          <span>状态</span>
        </header>
        {detail.rows.map((row) => (
          <div key={row.nutrientDefinitionId}>
            <span>
              {row.name}
            </span>
            <strong>{nutritionValue(row)}</strong>
            <small className={`is-${row.status}`}>
              {nutritionStatus(row)}
            </small>
          </div>
        ))}
      </section>
    </div>
  );
}

function groupEntries(entries: DataGapEntry[], grouping: "field" | "source") {
  const groups = new Map<
    string,
    { key: string; label: string; entries: DataGapEntry[] }
  >();
  for (const entry of entries) {
    const source = entry.path.at(-1)?.label ?? "未知来源";
    const key = grouping === "field" ? `${entry.category}:${entry.fieldName}` : source;
    const label = grouping === "field" ? entry.fieldName : source;
    const group = groups.get(key) ?? { key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function nutritionValue(row: NutritionDetail["rows"][number]) {
  if (row.value === null) return "—";
  const value = `${formatNumber(row.value)} ${row.unit}`.trim();
  return row.status === "partial" ? `已知部分 ${value}` : value;
}

function nutritionStatus(row: NutritionDetail["rows"][number]) {
  if (row.status === "unknown") return "未录入";
  if (row.status === "confirmed_zero") return "已确认 0";
  if (row.status === "partial") {
    return row.completenessRatio === null
      ? "部分数据"
      : `覆盖 ${formatPercent(row.completenessRatio)}`;
  }
  return "已知";
}

function coverageStatus(status: "complete" | "partial" | "unknown") {
  if (status === "complete") return "完整";
  if (status === "partial") return "部分数据";
  return "待补充";
}

function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

function formatNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(number)
    : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "未记录"
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
