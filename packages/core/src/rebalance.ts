import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface FormulaAmount {
  id: string;
  amountGrams: DecimalString;
  locked: boolean;
}

export type RebalanceMode =
  | { type: "auto-fill"; itemId: string }
  | { type: "proportional" };

export interface RebalanceInput {
  targetTotalGrams: DecimalString;
  items: FormulaAmount[];
  mode: RebalanceMode;
}

export function rebalanceFormula(
  input: RebalanceInput,
): CalcResult<FormulaAmount[]> {
  const target = parsePositive(input.targetTotalGrams, "targetTotalGrams");
  if (!target.ok) return target;

  const seen = new Set<string>();
  const parsed = new Map<string, Decimal>();
  for (const item of input.items) {
    if (seen.has(item.id)) {
      return fail({
        code: "duplicate-id",
        itemId: item.id,
        severity: "error",
        message: "配方项目 ID 不能重复",
      });
    }
    seen.add(item.id);
    const amount = parseNonNegative(item.amountGrams, "amountGrams");
    if (!amount.ok) return amount;
    parsed.set(item.id, amount.value);
  }

  if (input.mode.type === "auto-fill") {
    const fillerId = input.mode.itemId;
    const filler = input.items.find((item) => item.id === fillerId);
    if (filler === undefined || filler.locked) {
      return fail({
        code: "target-conflict",
        itemId: fillerId,
        severity: "error",
        message: "自动补足项必须存在且不能被锁定",
      });
    }
    const otherTotal = input.items
      .filter((item) => item.id !== filler.id)
      .reduce(
        (sum, item) => sum.add(parsed.get(item.id) ?? 0),
        new Decimal(0),
      );
    const remaining = target.value.sub(otherTotal);
    if (remaining.isNegative()) {
      return fail({
        code: "target-conflict",
        itemId: filler.id,
        severity: "error",
        message: "其他原料总量已超过目标批量，无法自动补足",
      });
    }
    return ok(input.items.map((item) => ({
      ...item,
      amountGrams: item.id === filler.id
        ? decimalString(remaining)
        : decimalString(parsed.get(item.id) ?? new Decimal(0)),
    })));
  }

  const lockedTotal = input.items
    .filter((item) => item.locked)
    .reduce(
      (sum, item) => sum.add(parsed.get(item.id) ?? 0),
      new Decimal(0),
    );
  const remaining = target.value.sub(lockedTotal);
  if (remaining.isNegative()) {
    return fail({
      code: "target-conflict",
      severity: "error",
      message: "已锁定原料总量超过目标批量",
    });
  }

  const unlocked = input.items.filter((item) => !item.locked);
  const unlockedTotal = unlocked.reduce(
    (sum, item) => sum.add(parsed.get(item.id) ?? 0),
    new Decimal(0),
  );
  if (unlocked.length === 0 || (unlockedTotal.isZero() && !remaining.isZero())) {
    return fail({
      code: "target-conflict",
      severity: "error",
      message: "没有可按比例调整的未锁定原料",
    });
  }

  const factor = unlockedTotal.isZero()
    ? new Decimal(0)
    : remaining.div(unlockedTotal);
  return ok(input.items.map((item) => ({
    ...item,
    amountGrams: item.locked
      ? decimalString(parsed.get(item.id) ?? new Decimal(0))
      : decimalString((parsed.get(item.id) ?? new Decimal(0)).mul(factor)),
  })));
}
