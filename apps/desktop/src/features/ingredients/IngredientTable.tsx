import type { IngredientVariant, MaterialGroup } from "../../api/types";
import { Icon } from "../../components/Icon";
import { MaterialGroupRow } from "./MaterialGroupRow";
import { VariantRow } from "./VariantRow";

interface IngredientTableProps {
  activeGroupId: string | null;
  loading: boolean;
  materialGroups: MaterialGroup[];
  onAddVariant: (group: MaterialGroup) => void;
  onArchiveVariant: (variant: IngredientVariant) => void;
  onEditVariant?: (group: MaterialGroup, variant: IngredientVariant) => void;
  onViewVariantGaps?: (group: MaterialGroup, variant: IngredientVariant) => void;
  onVariantSelectionChange: (
    group: MaterialGroup,
    variant: IngredientVariant,
    selected: boolean,
  ) => void;
  selectedVariantIds: Set<string>;
  onSelectGroup: (groupId: string) => void;
}

export function IngredientTable({
  activeGroupId,
  loading,
  materialGroups,
  onAddVariant,
  onArchiveVariant,
  onEditVariant,
  onViewVariantGaps,
  onVariantSelectionChange,
  selectedVariantIds,
  onSelectGroup,
}: IngredientTableProps) {
  const variantCount = materialGroups.reduce(
    (total, group) => total + group.variants.length,
    0,
  );
  const activeGroup =
    materialGroups.find((group) => group.id === activeGroupId) ??
    materialGroups[0] ??
    null;

  return (
    <div className="table-frame ingredient-split-frame">
      {loading && materialGroups.length === 0 ? (
        <div className="table-state">正在加载原料…</div>
      ) : !loading && materialGroups.length === 0 ? (
        <div className="table-state">
          <strong>没有找到原料</strong>
          <span>可以调整搜索条件，或新建一条原料记录。</span>
        </div>
      ) : activeGroup ? (
        <div className="ingredient-split-view">
          <aside aria-label="通用原料" className="material-master-pane">
            <div className="material-master-pane__header">
              <strong>通用原料</strong>
              <span>{materialGroups.length} 项</span>
            </div>
            <div className="material-master-list">
              {materialGroups.map((group) => (
                <MaterialGroupRow
                  group={group}
                  key={group.id}
                  onSelect={() => onSelectGroup(group.id)}
                  selected={group.id === activeGroup.id}
                />
              ))}
            </div>
          </aside>

          <section
            aria-label={`${activeGroup.name}的具体原料`}
            className="material-detail-pane"
          >
            <header className="material-detail-header">
              <div>
                <h2>{activeGroup.name}</h2>
                <span className="material-group-category-badge">
                  {activeGroup.categoryName ?? "未分类"}
                </span>
                <span className="variant-count">
                  共 {activeGroup.variants.length} 款
                </span>
              </div>
              <button
                aria-label={`为 ${activeGroup.name} 添加一款`}
                className="button button--secondary material-detail-add-button"
                onClick={() => onAddVariant(activeGroup)}
                type="button"
              >
                <Icon name="plus" size={16} />
                添加一款
              </button>
            </header>

            {activeGroup.variants.length > 0 ? (
              <div className="table-scroll material-detail-table-scroll">
                <table
                  aria-label={`${activeGroup.name}的具体原料列表`}
                  className="ingredient-variant-table"
                >
                  <thead>
                    <tr>
                      <th className="variant-select-column">
                        <span className="sr-only">选择比较</span>
                      </th>
                      <th>供应商</th>
                      <th>型号/规格</th>
                      <th>当前含税价</th>
                      <th>数据完整度</th>
                      <th>最新更新日期</th>
                      <th className="actions-column">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup.variants.map((variant) => (
                      <VariantRow
                        key={variant.id}
                        materialName={activeGroup.name}
                        onArchive={onArchiveVariant}
                        onEdit={
                          onEditVariant
                            ? (item) => onEditVariant(activeGroup, item)
                            : undefined
                        }
                        onSelectionChange={(item, selected) =>
                          onVariantSelectionChange(activeGroup, item, selected)
                        }
                        onViewGaps={
                          onViewVariantGaps
                            ? (item) => onViewVariantGaps(activeGroup, item)
                            : undefined
                        }
                        selected={selectedVariantIds.has(variant.id)}
                        variant={variant}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-state material-detail-empty">
                <strong>还没有具体原料</strong>
                <span>添加供应商、型号或规格后，会显示在这里。</span>
                <button
                  className="button button--secondary"
                  onClick={() => onAddVariant(activeGroup)}
                  type="button"
                >
                  <Icon name="plus" size={16} />
                  添加第一款
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="table-state">
          <strong>请选择通用原料</strong>
        </div>
      )}
      <div className="table-footer">
        <span>
          共 {materialGroups.length} 项通用原料 · {variantCount} 款具体原料
        </span>
        <span>50 条/页</span>
      </div>
    </div>
  );
}
