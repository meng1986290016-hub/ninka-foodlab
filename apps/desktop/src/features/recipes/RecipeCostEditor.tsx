import Decimal from "decimal.js";

import type {
  RecipeAdditionalCost,
  RecipeCalculationIssue,
  RecipePackagingCost,
} from "../../api/recipe-types";
import { Icon } from "../../components/Icon";

interface RecipeCostEditorProps {
  additionalCosts: RecipeAdditionalCost[];
  issues: RecipeCalculationIssue[];
  packagingCosts: RecipePackagingCost[];
  onAdditionalCostsChange(items: RecipeAdditionalCost[]): void;
  onPackagingCostsChange(items: RecipePackagingCost[]): void;
}

export function RecipeCostEditor({
  additionalCosts,
  issues,
  packagingCosts,
  onAdditionalCostsChange,
  onPackagingCostsChange,
}: RecipeCostEditorProps) {
  const count = packagingCosts.length + additionalCosts.length;

  function updatePackaging(
    id: string,
    patch: Partial<RecipePackagingCost>,
  ) {
    onPackagingCostsChange(
      packagingCosts.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }

  function updateAdditional(
    id: string,
    patch: Partial<RecipeAdditionalCost>,
  ) {
    onAdditionalCostsChange(
      additionalCosts.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section
      aria-label="成本附加项"
      className="recipe-supplemental-section"
    >
      <header>
        <h2>成本附加项</h2>
        <span>{count} 项</span>
      </header>

      {count === 0 ? (
        <p className="recipe-cost-empty">
          尚未添加包材或其他成本。
        </p>
      ) : (
        <div className="recipe-cost-editor">
          <div
            aria-hidden="true"
            className="recipe-cost-editor__head"
          >
            <span>类型</span>
            <span>项目</span>
            <span>数量</span>
            <span>单价/金额</span>
            <span>小计</span>
            <span />
          </div>
          {packagingCosts.map((item) => {
            const quantityIssue = findIssue(
              issues,
              item.id,
              "quantity",
            );
            const unitCostIssue = findIssue(
              issues,
              item.id,
              "unitCost",
            );
            return (
              <div className="recipe-cost-row" key={item.id}>
                <span className="recipe-cost-kind">包材</span>
                <input
                  aria-label="包材名称"
                  onChange={(event) =>
                    updatePackaging(item.id, {
                      name: event.target.value,
                    })
                  }
                  value={item.name}
                />
                <input
                  aria-invalid={quantityIssue ? "true" : undefined}
                  aria-label={`${item.name || "包材"}数量`}
                  inputMode="decimal"
                  onChange={(event) =>
                    updatePackaging(item.id, {
                      quantity: event.target.value,
                    })
                  }
                  title={quantityIssue?.message}
                  value={item.quantity}
                />
                <input
                  aria-invalid={unitCostIssue ? "true" : undefined}
                  aria-label={`${item.name || "包材"}单价`}
                  inputMode="decimal"
                  onChange={(event) =>
                    updatePackaging(item.id, {
                      unitCost: event.target.value,
                    })
                  }
                  title={unitCostIssue?.message}
                  value={item.unitCost}
                />
                <output>{packagingSubtotal(item)}</output>
                <button
                  aria-label={`删除${item.name || "包材"}成本`}
                  className="recipe-icon-button"
                  onClick={() =>
                    onPackagingCostsChange(
                      packagingCosts.filter(
                        (candidate) => candidate.id !== item.id,
                      ),
                    )
                  }
                  type="button"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })}
          {additionalCosts.map((item) => {
            const amountIssue = findIssue(
              issues,
              item.id,
              "amount",
            );
            return (
              <div className="recipe-cost-row" key={item.id}>
                <span className="recipe-cost-kind is-additional">
                  其他
                </span>
                <input
                  aria-label="其他成本名称"
                  onChange={(event) =>
                    updateAdditional(item.id, {
                      name: event.target.value,
                    })
                  }
                  value={item.name}
                />
                <span className="recipe-cost-na">—</span>
                <input
                  aria-invalid={amountIssue ? "true" : undefined}
                  aria-label={`${item.name || "其他成本"}金额`}
                  inputMode="decimal"
                  onChange={(event) =>
                    updateAdditional(item.id, {
                      amount: event.target.value,
                    })
                  }
                  title={amountIssue?.message}
                  value={item.amount}
                />
                <output>{currency(item.amount)}</output>
                <button
                  aria-label={`删除${item.name || "其他"}成本`}
                  className="recipe-icon-button"
                  onClick={() =>
                    onAdditionalCostsChange(
                      additionalCosts.filter(
                        (candidate) => candidate.id !== item.id,
                      ),
                    )
                  }
                  type="button"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <footer className="recipe-cost-actions">
        <button
          onClick={() =>
            onPackagingCostsChange([
              ...packagingCosts,
              {
                id: createCostId("packaging"),
                name: "新包材",
                quantity: "1",
                unitCost: "0",
              },
            ])
          }
          type="button"
        >
          <Icon name="plus" size={16} />
          添加包材
        </button>
        <button
          onClick={() =>
            onAdditionalCostsChange([
              ...additionalCosts,
              {
                id: createCostId("additional"),
                name: "其他成本",
                amount: "0",
              },
            ])
          }
          type="button"
        >
          <Icon name="plus" size={16} />
          添加其他成本
        </button>
      </footer>
    </section>
  );
}

function findIssue(
  issues: RecipeCalculationIssue[],
  itemId: string,
  field: string,
) {
  return issues.find(
    (issue) => issue.itemId === itemId && issue.field === field,
  );
}

function packagingSubtotal(item: RecipePackagingCost) {
  try {
    return new Decimal(item.quantity)
      .mul(item.unitCost)
      .toFixed(2);
  } catch {
    return "—";
  }
}

function currency(value: string) {
  try {
    return new Decimal(value).toFixed(2);
  } catch {
    return "—";
  }
}

function createCostId(kind: string) {
  return globalThis.crypto?.randomUUID?.() ??
    `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
