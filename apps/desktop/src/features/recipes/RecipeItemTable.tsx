import Decimal from "decimal.js";

import type {
  RecipeCalculationIssue,
  RecipeDraftItem,
  RecipeItemUnit,
  RecipeVersion,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface RecipeItemTableProps {
  issues: RecipeCalculationIssue[];
  items: RecipeDraftItem[];
  missingData: Record<string, string[]>;
  targetBatchGrams: string;
  versionUpgrades: Record<string, RecipeVersion>;
  onAdd(): void;
  onAmountChange(id: string, amount: string): void;
  onAutoFillChange(id: string): void;
  onLockChange(id: string): void;
  onMove(id: string, direction: -1 | 1): void;
  onRemove(id: string): void;
  onUnitChange(id: string, unit: RecipeItemUnit): void;
  onUpgradeVersion(id: string, version: RecipeVersion): void;
}

const units: RecipeItemUnit[] = ["mg", "g", "kg", "mL", "L"];

export function RecipeItemTable({
  issues,
  items,
  missingData,
  targetBatchGrams,
  versionUpgrades,
  onAdd,
  onAmountChange,
  onAutoFillChange,
  onLockChange,
  onMove,
  onRemove,
  onUnitChange,
  onUpgradeVersion,
}: RecipeItemTableProps) {
  return (
    <div className="recipe-table-frame">
      <div className="recipe-table-scroll">
        <table className="recipe-item-table">
          <thead>
            <tr>
              <th aria-label="排序" />
              <th>锁定</th>
              <th>原料 / 供应商与规格</th>
              <th>用量</th>
              <th>单位</th>
              <th>占比</th>
              <th>补足</th>
              <th>数据</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="recipe-empty-row">
                <td colSpan={9}>
                  <strong>还没有配方原料</strong>
                  <span>添加具体供应商原料版本或半成品版本开始设计。</span>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const label = itemLabel(item);
                const itemIssues = issues.filter(
                  (issue) => issue.itemId === item.id,
                );
                return (
                  <tr
                    data-recipe-item="true"
                    key={item.id}
                  >
                    <td className="recipe-row-sort">
                      <span
                        aria-hidden="true"
                        className="recipe-drag-handle"
                      >
                        <Icon name="grip" size={18} />
                      </span>
                      <span className="recipe-sort-buttons">
                        <button
                          aria-label={`上移${label}`}
                          disabled={index === 0}
                          onClick={() => onMove(item.id, -1)}
                          type="button"
                        >
                          <Icon name="arrow-up" size={14} />
                        </button>
                        <button
                          aria-label={`下移${label}`}
                          disabled={index === items.length - 1}
                          onClick={() => onMove(item.id, 1)}
                          type="button"
                        >
                          <Icon name="arrow-down" size={14} />
                        </button>
                      </span>
                    </td>
                    <td className="recipe-lock-cell">
                      <button
                        aria-label={
                          item.locked
                            ? `解锁${label}`
                            : `锁定${label}`
                        }
                        aria-pressed={item.locked}
                        className={
                          item.locked
                            ? "recipe-icon-button is-active"
                            : "recipe-icon-button"
                        }
                        onClick={() => onLockChange(item.id)}
                        type="button"
                      >
                        <Icon
                          name={item.locked ? "lock" : "unlock"}
                          size={18}
                        />
                      </button>
                    </td>
                    <td className="recipe-identity-cell">
                      <strong>{label}</strong>
                      <span>
                        {itemDetail(item)}
                        {versionUpgrades[item.id] ? (
                          <button
                            aria-label={`将${label}升级到 V${versionUpgrades[item.id]!.versionNumber}`}
                            className="recipe-version-upgrade"
                            onClick={() =>
                              onUpgradeVersion(
                                item.id,
                                versionUpgrades[item.id]!,
                              )
                            }
                            type="button"
                          >
                            升级到 V
                            {versionUpgrades[item.id]!.versionNumber}
                          </button>
                        ) : null}
                      </span>
                    </td>
                    <td className="recipe-amount-cell">
                      <input
                        aria-invalid={
                          itemIssues.some((issue) =>
                            [
                              "invalid_number",
                              "negative_value",
                              "non_positive_value",
                            ].includes(issue.code),
                          )
                            ? "true"
                            : undefined
                        }
                        aria-label={`${label}用量`}
                        inputMode="decimal"
                        onChange={(event) =>
                          onAmountChange(item.id, event.target.value)
                        }
                        readOnly={item.autoFill}
                        title={
                          item.autoFill
                            ? "取消补足后可手动编辑"
                            : undefined
                        }
                        value={item.amount}
                      />
                      {itemIssues[0] ? (
                        <small role="alert">
                          {itemIssues[0].message}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <select
                        aria-label={`${label}单位`}
                        onChange={(event) =>
                          onUnitChange(
                            item.id,
                            event.target.value as RecipeItemUnit,
                          )
                        }
                        value={item.unit}
                      >
                        {units.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="recipe-percent-cell">
                      {percentage(item, targetBatchGrams)}
                    </td>
                    <td className="recipe-autofill-cell">
                      <button
                        aria-label={
                          item.autoFill
                            ? `取消${label}补足`
                            : `设${label}为补足`
                        }
                        aria-pressed={item.autoFill}
                        className={
                          item.autoFill
                            ? "recipe-autofill is-active"
                            : "recipe-autofill"
                        }
                        disabled={item.locked}
                        onClick={() => onAutoFillChange(item.id)}
                        type="button"
                      >
                        {item.autoFill ? "补足" : "—"}
                      </button>
                    </td>
                    <td>
                      {completeness(
                        item,
                        missingData[item.id] ?? [],
                      )}
                    </td>
                    <td className="recipe-row-actions">
                      <button
                        aria-label={`删除${label}`}
                        className="recipe-icon-button"
                        onClick={() => onRemove(item.id)}
                        type="button"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <button
        className="recipe-add-item-button"
        onClick={onAdd}
        type="button"
      >
        <Icon name="plus" size={18} />
        添加原料或半成品
      </button>
    </div>
  );
}

function itemLabel(item: RecipeDraftItem) {
  return item.kind === "ingredient"
    ? item.materialName
    : item.recipeVersion.recipeName;
}

function itemDetail(item: RecipeDraftItem) {
  if (item.kind === "recipe_version") {
    return `半成品 · V${item.recipeVersion.versionNumber}`;
  }
  return [
    item.ingredientVariant.supplierName,
    item.ingredientVariant.modelOrSpecification,
  ]
    .filter(Boolean)
    .join(" · ");
}

function percentage(
  item: RecipeDraftItem,
  targetBatchGrams: string,
) {
  if (item.unit !== "g") return "—";
  try {
    const total = new Decimal(targetBatchGrams);
    const amount = new Decimal(item.amount);
    if (!total.isFinite() || total.lte(0) || !amount.isFinite()) {
      return "—";
    }
    return `${amount.div(total).mul(100).toDecimalPlaces(2).toFixed(2)}%`;
  } catch {
    return "—";
  }
}

function completeness(
  item: RecipeDraftItem,
  missingData: string[],
) {
  if (item.kind === "recipe_version") {
    return <span className="recipe-data-status is-complete">版本固定</span>;
  }
  const percent = item.ingredientVariant.completeness.percent;
  return (
    <span className="recipe-data-cell">
      <span
        className={
          missingData.length === 0 && percent >= 100
            ? "recipe-data-status is-complete"
            : "recipe-data-status has-warning"
        }
        title={[
          ...missingData,
          ...item.ingredientVariant.completeness.missingFields,
        ].join("、")}
      >
        <Icon
          name={
            missingData.length === 0 && percent >= 100
              ? "check"
              : "warning"
          }
          size={15}
        />
        {missingData.length === 0 && percent >= 100
          ? "完整"
          : `${percent}%`}
      </span>
      {missingData.length > 0 ? (
        <small>
          缺少：{missingData.slice(0, 3).join("、")}
          {missingData.length > 3 ? `等${missingData.length}项` : ""}
        </small>
      ) : null}
    </span>
  );
}
