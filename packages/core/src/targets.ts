import {
  decimalString,
  parseDecimal,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface FormulaTarget {
  id: string;
  metricCode: string;
  minimum?: DecimalString;
  maximum?: DecimalString;
}

export interface TargetEvaluation {
  targetId: string;
  status: "met" | "below" | "above" | "unknown";
  observed: DecimalString | null;
  deltaToMinimum: DecimalString | null;
  deltaToMaximum: DecimalString | null;
}

export function evaluateTarget(
  observed: DecimalString | null,
  target: FormulaTarget,
): CalcResult<TargetEvaluation> {
  if (target.minimum === undefined && target.maximum === undefined) {
    return fail({
      code: "target-conflict",
      itemId: target.id,
      severity: "error",
      message: "目标必须包含下限或上限",
    });
  }

  if (observed === null) {
    return ok({
      targetId: target.id,
      status: "unknown",
      observed: null,
      deltaToMinimum: null,
      deltaToMaximum: null,
    });
  }

  const value = parseDecimal(observed, "observed");
  if (!value.ok) return value;
  const minimum = target.minimum === undefined
    ? null
    : parseDecimal(target.minimum, "minimum");
  if (minimum !== null && !minimum.ok) return minimum;
  const maximum = target.maximum === undefined
    ? null
    : parseDecimal(target.maximum, "maximum");
  if (maximum !== null && !maximum.ok) return maximum;

  if (
    minimum !== null &&
    maximum !== null &&
    minimum.value.gt(maximum.value)
  ) {
    return fail({
      code: "target-conflict",
      itemId: target.id,
      severity: "error",
      message: "目标下限不能大于上限",
    });
  }

  const status = minimum !== null && value.value.lt(minimum.value)
    ? "below"
    : maximum !== null && value.value.gt(maximum.value)
      ? "above"
      : "met";

  return ok({
    targetId: target.id,
    status,
    observed: decimalString(value.value),
    deltaToMinimum: minimum === null
      ? null
      : decimalString(value.value.sub(minimum.value)),
    deltaToMaximum: maximum === null
      ? null
      : decimalString(value.value.sub(maximum.value)),
  });
}
