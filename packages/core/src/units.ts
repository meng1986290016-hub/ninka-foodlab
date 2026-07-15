import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalInput,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export type MassUnit = "mg" | "g" | "kg";
export type VolumeUnit = "mL" | "L";
export type Unit = MassUnit | VolumeUnit;

export interface Quantity {
  value: DecimalInput;
  unit: Unit;
}

export function toGrams(
  quantity: Quantity,
  densityGPerMl?: DecimalInput,
): CalcResult<DecimalString> {
  const amount = parseNonNegative(quantity.value, "quantity.value");
  if (!amount.ok) return amount;

  const unit: string = quantity.unit;
  if (unit === "mg") return ok(decimalString(amount.value.div(1000)));
  if (unit === "g") return ok(decimalString(amount.value));
  if (unit === "kg") return ok(decimalString(amount.value.mul(1000)));

  if (unit !== "mL" && unit !== "L") {
    return fail({
      code: "invalid-unit",
      field: "quantity.unit",
      severity: "error",
      message: "不支持的计量单位",
    });
  }

  if (densityGPerMl === undefined) {
    return fail({
      code: "missing-density",
      field: "densityGPerMl",
      severity: "error",
      message: "体积换算需要填写大于 0 的密度",
    });
  }

  const density = parsePositive(densityGPerMl, "densityGPerMl");
  if (!density.ok) {
    return fail({
      code: "missing-density",
      field: "densityGPerMl",
      severity: "error",
      message: "体积换算需要填写大于 0 的密度",
    });
  }

  const millilitres = unit === "L"
    ? amount.value.mul(1000)
    : amount.value;
  return ok(decimalString(millilitres.mul(density.value)));
}
