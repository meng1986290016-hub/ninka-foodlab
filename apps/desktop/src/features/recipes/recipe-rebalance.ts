import {
  rebalanceFormula,
  toGrams,
  type RebalanceMode,
} from "@food-rd/core";
import Decimal from "decimal.js";

import type { RecipeDraftItem } from "../../api/recipe-types";

export type DraftRebalanceResult =
  | { ok: true; items: RecipeDraftItem[] }
  | { ok: false; message: string };

export function rebalanceDraftItems(
  items: RecipeDraftItem[],
  targetTotalGrams: string,
  mode: RebalanceMode,
): DraftRebalanceResult {
  const converted = [];
  for (const item of items) {
    const density =
      item.kind === "ingredient"
        ? item.ingredientVariant.densityGPerMl ?? undefined
        : undefined;
    const amount = toGrams(
      { value: item.amount, unit: item.unit },
      density,
    );
    if (!amount.ok) {
      return {
        ok: false,
        message: friendlyIssue(
          amount.issues[0]?.code,
          amount.issues[0]?.message,
        ),
      };
    }
    converted.push({
      id: item.id,
      amountGrams: amount.value,
      locked: item.locked,
    });
  }

  const result = rebalanceFormula({
    targetTotalGrams,
    items: converted,
    mode,
  });
  if (!result.ok) {
    return {
      ok: false,
      message: friendlyIssue(
        result.issues[0]?.code,
        result.issues[0]?.message,
      ),
    };
  }

  const amounts = new Map(
    result.value.map((item) => [item.id, item.amountGrams]),
  );
  return {
    ok: true,
    items: items.map((item) => ({
      ...item,
      amount: restoreUnit(amounts.get(item.id) ?? "0", item),
    })),
  };
}

function restoreUnit(amountGrams: string, item: RecipeDraftItem) {
  const grams = new Decimal(amountGrams);
  if (item.unit === "g") return compact(grams);
  if (item.unit === "mg") return compact(grams.mul(1000));
  if (item.unit === "kg") return compact(grams.div(1000));

  const density =
    item.kind === "ingredient"
      ? item.ingredientVariant.densityGPerMl
      : null;
  if (density === null) return compact(grams);
  const millilitres = grams.div(density);
  return item.unit === "L"
    ? compact(millilitres.div(1000))
    : compact(millilitres);
}

function compact(value: Decimal) {
  return value.toDecimalPlaces(9).toString();
}

function friendlyIssue(
  code: string | undefined,
  message: string | undefined,
) {
  if (code === "invalid-number") {
    return "存在无效用量，修正后再调整";
  }
  if (code === "negative-value") {
    return "原料用量不能小于 0";
  }
  if (code === "non-positive-value") {
    return "目标批量必须大于 0";
  }
  return message ?? "配方用量暂时无法调整";
}
