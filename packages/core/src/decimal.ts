import Decimal from "decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});

export type DecimalInput = string | number;
export type DecimalString = string;

export function parseDecimal(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  try {
    const value = new Decimal(input);
    if (!value.isFinite()) throw new Error("not finite");
    return ok(value);
  } catch {
    return fail({
      code: "invalid-number",
      field,
      severity: "error",
      message: field + " 必须是有效数字",
    });
  }
}

export function parseNonNegative(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  const parsed = parseDecimal(input, field);
  if (!parsed.ok) return parsed;
  if (parsed.value.isNegative()) {
    return fail({
      code: "negative-value",
      field,
      severity: "error",
      message: field + " 不能小于 0",
    });
  }
  return parsed;
}

export function parsePositive(
  input: DecimalInput,
  field: string,
): CalcResult<Decimal> {
  const parsed = parseDecimal(input, field);
  if (!parsed.ok) return parsed;
  if (parsed.value.lte(0)) {
    return fail({
      code: "non-positive-value",
      field,
      severity: "error",
      message: field + " 必须大于 0",
    });
  }
  return parsed;
}

export function decimalString(value: Decimal): DecimalString {
  return value.toFixed();
}
