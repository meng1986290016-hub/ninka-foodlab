import Decimal from "decimal.js";

import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export const THEORETICAL_SWEETNESS_DEFINITION_ID = "theoretical_sweetness";

export interface SweetnessComponentInput {
  id: string;
  massGrams: DecimalString;
  relativeFactor: DecimalString | null;
}

export interface SweetnessInput {
  components: SweetnessComponentInput[];
  totalInputMassGrams?: DecimalString;
  finishedMassGrams?: DecimalString;
}

export interface SweetnessSummary {
  inputMassGrams: DecimalString;
  basisMassGrams: DecimalString;
  basis: "input-mass" | "finished-mass";
  totalSucroseEquivalentGrams: DecimalString;
  per100gSucroseEquivalent: DecimalString;
  status: "complete" | "partial" | "unknown";
  missingComponentIds: string[];
}

export function calculateSweetness(
  input: SweetnessInput,
): CalcResult<SweetnessSummary> {
  if (input.components.length === 0) {
    return fail({
      code: "non-positive-value",
      field: "components",
      severity: "error",
      message: "理论甜度至少需要一个已配置原料",
    });
  }

  let configuredMass = new Decimal(0);
  let totalEquivalent = new Decimal(0);
  let knownCount = 0;
  const missingComponentIds: string[] = [];
  const ids = new Set<string>();

  for (const component of input.components) {
    if (ids.has(component.id)) {
      return fail({
        code: "duplicate-id",
        itemId: component.id,
        severity: "error",
        message: "理论甜度计算项目 ID 不能重复",
      });
    }
    ids.add(component.id);
    const mass = parseNonNegative(component.massGrams, "massGrams");
    if (!mass.ok) return mass;
    configuredMass = configuredMass.add(mass.value);

    if (component.relativeFactor === null) {
      missingComponentIds.push(component.id);
      continue;
    }
    const factor = parseNonNegative(
      component.relativeFactor,
      "relativeFactor",
    );
    if (!factor.ok) return factor;
    totalEquivalent = totalEquivalent.add(
      factor.value.mul(mass.value),
    );
    knownCount += 1;
  }

  let inputMass = configuredMass;
  if (input.totalInputMassGrams !== undefined) {
    const parsedInputMass = parsePositive(
      input.totalInputMassGrams,
      "totalInputMassGrams",
    );
    if (!parsedInputMass.ok) return parsedInputMass;
    inputMass = parsedInputMass.value;
  }
  let basisMass = inputMass;
  let basis: SweetnessSummary["basis"] = "input-mass";
  if (input.finishedMassGrams !== undefined) {
    const parsed = parsePositive(input.finishedMassGrams, "finishedMassGrams");
    if (!parsed.ok) return parsed;
    basisMass = parsed.value;
    basis = "finished-mass";
  } else {
    if (input.totalInputMassGrams === undefined) {
      const parsed = parsePositive(decimalString(inputMass), "inputMassGrams");
      if (!parsed.ok) return parsed;
    }
  }

  return ok({
    inputMassGrams: decimalString(inputMass),
    basisMassGrams: decimalString(basisMass),
    basis,
    totalSucroseEquivalentGrams: decimalString(totalEquivalent),
    per100gSucroseEquivalent: decimalString(
      totalEquivalent.mul(100).div(basisMass),
    ),
    status:
      missingComponentIds.length === 0
        ? "complete"
        : knownCount === 0
          ? "unknown"
          : "partial",
    missingComponentIds,
  });
}
