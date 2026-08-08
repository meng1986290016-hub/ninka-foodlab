import { useMemo, useState } from "react";

import type { MaterialNeed } from "../../api/agent-recipe-types";
import type { MaterialGroup } from "../../api/types";
import { Icon } from "../../components/Icon";

interface MaterialNeedListProps {
  busy: boolean;
  materialGroups: MaterialGroup[];
  needs: MaterialNeed[];
  onCreate(need: MaterialNeed): void;
  onDismiss(need: MaterialNeed): void;
  onResolve(need: MaterialNeed, ingredientVariantId: string): void;
}

export function MaterialNeedList({
  busy,
  materialGroups,
  needs,
  onCreate,
  onDismiss,
  onResolve,
}: MaterialNeedListProps) {
  const variants = useMemo(
    () =>
      materialGroups.flatMap((group) =>
        group.variants
          .filter((variant) => variant.archivedAt === null)
          .map((variant) => ({ group, variant })),
      ),
    [materialGroups],
  );
  const [selection, setSelection] = useState<Record<string, string>>({});

  if (needs.length === 0) {
    return (
      <div className="material-needs-empty">
        <Icon name="check" size={28} />
        <strong>没有待补充原料</strong>
        <span>Agent 提出的缺失原料会集中显示在这里。</span>
      </div>
    );
  }
  return (
    <div className="material-needs-list">
      {needs.map((need) => (
        <article key={need.id}>
          <header>
            <div><h3>{need.materialName}</h3><span>{need.suggestedAmount} {need.suggestedUnit}</span></div>
            <small>待补充</small>
          </header>
          <p>{need.purpose || need.missingReason}</p>
          {need.desiredSpecification ? <dl><dt>期望规格</dt><dd>{need.desiredSpecification}</dd></dl> : null}
          <div className="material-needs-list__resolve">
            <select aria-label={`${need.materialName}关联供应商版本`} onChange={(event) => setSelection((current) => ({ ...current, [need.id]: event.target.value }))} value={selection[need.id] ?? ""}>
              <option value="">选择已有供应商版本…</option>
              {variants.map(({ group, variant }) => <option key={variant.id} value={variant.id}>{group.name} · {variant.supplierName}{variant.modelOrSpecification ? ` · ${variant.modelOrSpecification}` : ""}</option>)}
            </select>
            <button className="button button--primary" disabled={busy || !selection[need.id]} onClick={() => onResolve(need, selection[need.id]!)} type="button">确认关联</button>
          </div>
          <footer>
            <button className="button button--secondary" disabled={busy} onClick={() => onCreate(need)} type="button"><Icon name="plus" size={15} />从需求新建原料</button>
            <button className="text-button" disabled={busy} onClick={() => onDismiss(need)} type="button">关闭需求</button>
          </footer>
        </article>
      ))}
    </div>
  );
}
