import { Fragment } from "react";

import type { IngredientVariant, MaterialGroup } from "../../api/types";
import { MaterialGroupRow } from "./MaterialGroupRow";
import { VariantRow } from "./VariantRow";

interface IngredientTableProps {
  expandedIds: Set<string>;
  loading: boolean;
  materialGroups: MaterialGroup[];
  onAddVariant: (group: MaterialGroup) => void;
  onArchiveVariant: (variant: IngredientVariant) => void;
  onEditVariant?: (group: MaterialGroup, variant: IngredientVariant) => void;
  onToggle: (groupId: string) => void;
}

export function IngredientTable({
  expandedIds,
  loading,
  materialGroups,
  onAddVariant,
  onArchiveVariant,
  onEditVariant,
  onToggle,
}: IngredientTableProps) {
  const variantCount = materialGroups.reduce(
    (total, group) => total + group.variants.length,
    0,
  );

  return (
    <div className="table-frame">
      <div className="table-scroll">
        <table className="ingredient-hierarchy-table">
          <thead>
            <tr>
              <th>原料名称</th>
              <th>分类</th>
              <th>供应商</th>
              <th>型号/规格</th>
              <th>当前含税价</th>
              <th>数据完整度</th>
              <th>最新更新日期</th>
              <th className="actions-column">操作</th>
            </tr>
          </thead>
          <tbody>
            {materialGroups.map((group) => {
              const expanded = expandedIds.has(group.id);
              return (
                <Fragment key={group.id}>
                  <MaterialGroupRow
                    expanded={expanded}
                    group={group}
                    onAddVariant={() => onAddVariant(group)}
                    onToggle={() => onToggle(group.id)}
                  />
                  {expanded
                    ? group.variants.map((variant) => (
                        <VariantRow
                          key={variant.id}
                          materialName={group.name}
                          onArchive={onArchiveVariant}
                          onEdit={
                            onEditVariant
                              ? (item) => onEditVariant(group, item)
                              : undefined
                          }
                          variant={variant}
                        />
                      ))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {loading ? <div className="table-state">正在加载原料…</div> : null}
        {!loading && materialGroups.length === 0 ? (
          <div className="table-state">
            <strong>没有找到原料</strong>
            <span>可以调整搜索条件，或新建一条原料记录。</span>
          </div>
        ) : null}
      </div>
      <div className="table-footer">
        <span>
          共 {materialGroups.length} 项 · {variantCount} 个供应商版本
        </span>
        <span>50 条/页</span>
      </div>
    </div>
  );
}
