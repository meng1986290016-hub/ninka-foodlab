import Decimal from "decimal.js";
import { toGrams } from "@food-rd/core";
import { useState } from "react";

import type {
  RecipeCalculationIssue,
  RecipeDraftItem,
  RecipeItemUnit,
  RecipeVersion,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface RecipeItemTableProps {
  disabled?: boolean;
  issues: RecipeCalculationIssue[];
  items: RecipeDraftItem[];
  missingData: Record<string, string[]>;
  versionUpgrades: Record<string, RecipeVersion>;
  onAdd(): void;
  onAmountChange(id: string, amount: string): void;
  onMove(id: string, direction: -1 | 1): void;
  onRemove(id: string): void;
  onReplaceMaterialNeed(id: string): void;
  onUnitChange(id: string, unit: RecipeItemUnit): void;
  onUpgradeVersion(id: string, version: RecipeVersion): void;
  onViewGaps?(item: RecipeDraftItem): void;
  onViewNutrition?(item: RecipeDraftItem): void;
}

const units: RecipeItemUnit[] = ["mg", "g", "kg", "mL", "L"];

export function RecipeItemTable({
  disabled = false,
  issues,
  items,
  missingData,
  versionUpgrades,
  onAdd,
  onAmountChange,
  onMove,
  onRemove,
  onReplaceMaterialNeed,
  onUnitChange,
  onUpgradeVersion,
  onViewGaps,
  onViewNutrition,
}: RecipeItemTableProps) {
  const [focusedAmountId, setFocusedAmountId] = useState<string | null>(null);
  const totalMassGrams = formulaMassGrams(items);

  return (
    <div className="recipe-table-frame">
      <div className="recipe-table-scroll">
        <table className="recipe-item-table">
          <thead>
            <tr>
              <th aria-label="排序" />
              <th>原料 / 供应商与规格</th>
              <th>用量</th>
              <th>单位</th>
              <th>占比</th>
              <th>数据</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="recipe-empty-row">
                <td colSpan={7}>
                  <strong>还没有配方原料</strong>
                  <span>添加具体供应商原料版本或半成品版本开始设计。</span>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const label = itemLabel(item);
                const displayedAmount =
                  focusedAmountId === item.id
                    ? item.amount
                    : formatDisplayedAmount(item.amount);
                const itemIssues = issues.filter(
                  (issue) => issue.itemId === item.id,
                );
                const amountIssue = itemIssues.find(isAmountIssue);
                const dataIssue = itemIssues.find(
                  (issue) => !isAmountIssue(issue),
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
                          disabled={disabled || index === 0}
                          onClick={() => onMove(item.id, -1)}
                          type="button"
                        >
                          <Icon name="arrow-up" size={14} />
                        </button>
                        <button
                          aria-label={`下移${label}`}
                          disabled={disabled || index === items.length - 1}
                          onClick={() => onMove(item.id, 1)}
                          type="button"
                        >
                          <Icon name="arrow-down" size={14} />
                        </button>
                      </span>
                    </td>
                    <td className="recipe-identity-cell">
                      {item.kind === "material_need" || !onViewNutrition ? (
                        <strong>{label}</strong>
                      ) : (
                        <span
                          aria-label={`查看${label}的营养信息`}
                          className="data-quality-trigger recipe-nutrition-link"
                          onClick={() => onViewNutrition(item)}
                          onKeyDown={(event) =>
                            activateWithKeyboard(event, () =>
                              onViewNutrition(item),
                            )
                          }
                          role="button"
                          tabIndex={0}
                        >
                          <strong>{label}</strong>
                          <Icon name="nutrition" size={15} />
                        </span>
                      )}
                      <span>
                        {itemDetail(item)}
                        {item.kind === "material_need" &&
                        item.materialNeed.status === "resolved" &&
                        item.materialNeed.resolvedIngredientVariantId ? (
                          <button
                            className="recipe-version-upgrade"
                            disabled={disabled}
                            onClick={() => onReplaceMaterialNeed(item.id)}
                            type="button"
                          >
                            使用已关联原料
                          </button>
                        ) : null}
                        {versionUpgrades[item.id] ? (
                          <button
                            aria-label={`将${label}升级到 V${versionUpgrades[item.id]!.versionNumber}`}
                            className="recipe-version-upgrade"
                            disabled={disabled}
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
                        aria-invalid={amountIssue ? "true" : undefined}
                        aria-label={`${label}用量`}
                        disabled={disabled}
                        inputMode="decimal"
                        onChange={(event) =>
                          onAmountChange(item.id, event.target.value)
                        }
                        onBlur={() => setFocusedAmountId(null)}
                        onFocus={() => setFocusedAmountId(item.id)}
                        title={
                          displayedAmount !== item.amount
                            ? `精确值：${item.amount}`
                            : undefined
                        }
                        value={displayedAmount}
                      />
                      {amountIssue ? (
                        <small
                          className="recipe-cell-issue"
                          role="alert"
                          title={amountIssue.message}
                        >
                          {amountIssue.message}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <select
                        aria-label={`${label}单位`}
                        disabled={disabled}
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
                      {percentage(item, totalMassGrams)}
                    </td>
                    <td className="recipe-data-column">
                      <span className="recipe-data-cell">
                        {completeness(
                          item,
                          missingData[item.id] ?? [],
                          onViewGaps,
                        )}
                        {dataIssue ? (
                          <small
                            className="recipe-cell-issue"
                            role={
                              dataIssue.severity === "error"
                                ? "alert"
                                : "status"
                            }
                            title={dataIssue.message}
                          >
                            {dataIssue.message}
                          </small>
                        ) : null}
                      </span>
                    </td>
                    <td className="recipe-row-actions">
                      <button
                        aria-label={`删除${label}`}
                        className="recipe-icon-button"
                        disabled={disabled}
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
        disabled={disabled}
        onClick={onAdd}
        type="button"
      >
        <Icon name="plus" size={18} />
        添加原料或半成品
      </button>
    </div>
  );
}

function formatDisplayedAmount(value: string) {
  try {
    const amount = new Decimal(value);
    if (!amount.isFinite()) return value;
    const decimalPlaces = amount.abs().lt(1) ? 6 : 3;
    return amount.toDecimalPlaces(decimalPlaces).toFixed();
  } catch {
    return value;
  }
}

function itemLabel(item: RecipeDraftItem) {
  if (item.kind === "ingredient") return item.materialName;
  if (item.kind === "material_need") return item.materialNeed.materialName;
  return item.recipeVersion.recipeName;
}

function itemDetail(item: RecipeDraftItem) {
  if (item.kind === "recipe_version") {
    return `半成品 · V${item.recipeVersion.versionNumber}`;
  }
  if (item.kind === "material_need") {
    return `待补充原料 · ${item.materialNeed.desiredSpecification || item.materialNeed.missingReason}`;
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
  totalMassGrams: Decimal | null,
) {
  if (totalMassGrams === null || totalMassGrams.lte(0)) return "—";
  const density =
    item.kind === "ingredient"
      ? item.ingredientVariant.densityGPerMl ?? undefined
      : undefined;
  const converted = toGrams(
    { value: item.amount, unit: item.unit },
    density,
  );
  if (!converted.ok) return "—";
  try {
    const amount = new Decimal(converted.value);
    if (!amount.isFinite()) {
      return "—";
    }
    return `${amount.div(totalMassGrams).mul(100).toDecimalPlaces(2).toFixed(2)}%`;
  } catch {
    return "—";
  }
}

function formulaMassGrams(items: RecipeDraftItem[]) {
  let total = new Decimal(0);
  for (const item of items) {
    const density =
      item.kind === "ingredient"
        ? item.ingredientVariant.densityGPerMl ?? undefined
        : undefined;
    const converted = toGrams(
      { value: item.amount, unit: item.unit },
      density,
    );
    if (!converted.ok) return null;
    total = total.add(converted.value);
  }
  return total;
}

function completeness(
  item: RecipeDraftItem,
  missingData: string[],
  onViewGaps: RecipeItemTableProps["onViewGaps"],
) {
  if (item.kind === "recipe_version") {
    const incomplete = missingData.length > 0;
    return (
      <span
        className={`data-quality-trigger recipe-data-status ${incomplete ? "has-warning" : "is-complete"}`}
        onClick={() => onViewGaps?.(item)}
        onKeyDown={(event) =>
          activateWithKeyboard(event, () => onViewGaps?.(item))
        }
        role="button"
        tabIndex={0}
      >
        {incomplete ? "部分数据" : "版本固定"}
      </span>
    );
  }
  if (item.kind === "material_need") {
    return (
      <span
        className="recipe-data-status has-warning"
        title="关联真实供应商版本后才可保存正式版本"
      >
        <Icon name="warning" size={15} />
        待补充
      </span>
    );
  }
  const percent = item.ingredientVariant.completeness.percent;
  return (
    <>
      <span
        className={
          `data-quality-trigger recipe-data-status ${
            missingData.length === 0 && percent >= 100
              ? "is-complete"
              : "has-warning"
          }`
        }
        onClick={() => onViewGaps?.(item)}
        onKeyDown={(event) =>
          activateWithKeyboard(event, () => onViewGaps?.(item))
        }
        role="button"
        tabIndex={0}
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
    </>
  );
}

function isAmountIssue(issue: RecipeCalculationIssue) {
  return issue.field === "amount";
}

function activateWithKeyboard(
  event: { key: string; preventDefault(): void },
  action: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}
