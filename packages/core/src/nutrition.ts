import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";

export interface NutritionComponentInput {
  id: string;
  name: string;
  massGrams: DecimalString;
  nutrientsPer100g: Record<string, DecimalString | null>;
}

export interface NutritionInput {
  components: NutritionComponentInput[];
  finishedMassGrams?: DecimalString;
}

export type EstimateStatus = "complete" | "partial" | "unknown";

export interface NutrientEstimate {
  totalKnownAmount: DecimalString;
  per100gKnownAmount: DecimalString;
  status: EstimateStatus;
  completenessRatio: DecimalString;
  missingComponentIds: string[];
}

export interface NutritionSummary {
  inputMassGrams: DecimalString;
  basisMassGrams: DecimalString;
  basis: "input-mass" | "finished-mass";
  nutrients: Record<string, NutrientEstimate>;
}

export function calculateNutrition(
  input: NutritionInput,
): CalcResult<NutritionSummary> {
  let inputMass = new Decimal(0);
  const masses = new Map<string, Decimal>();

  for (const component of input.components) {
    if (masses.has(component.id)) {
      return fail({
        code: "duplicate-id",
        itemId: component.id,
        severity: "error",
        message: "营养计算项目 ID 不能重复",
      });
    }
    const mass = parseNonNegative(component.massGrams, "massGrams");
    if (!mass.ok) return mass;
    masses.set(component.id, mass.value);
    inputMass = inputMass.add(mass.value);
  }

  let basisMass = inputMass;
  let basis: NutritionSummary["basis"] = "input-mass";
  if (input.finishedMassGrams !== undefined) {
    const parsed = parsePositive(input.finishedMassGrams, "finishedMassGrams");
    if (!parsed.ok) return parsed;
    basisMass = parsed.value;
    basis = "finished-mass";
  } else {
    const parsed = parsePositive(decimalString(inputMass), "inputMassGrams");
    if (!parsed.ok) return parsed;
  }

  const codes = new Set<string>();
  for (const component of input.components) {
    for (const code of Object.keys(component.nutrientsPer100g)) codes.add(code);
  }

  const nutrients: Record<string, NutrientEstimate> = {};
  for (const code of codes) {
    let totalKnown = new Decimal(0);
    let knownMass = new Decimal(0);
    const missingComponentIds: string[] = [];

    for (const component of input.components) {
      const mass = masses.get(component.id) ?? new Decimal(0);
      const amount = component.nutrientsPer100g[code];
      if (amount === null || amount === undefined) {
        missingComponentIds.push(component.id);
        continue;
      }
      const parsedAmount = parseNonNegative(amount, code);
      if (!parsedAmount.ok) return parsedAmount;
      totalKnown = totalKnown.add(parsedAmount.value.mul(mass).div(100));
      knownMass = knownMass.add(mass);
    }

    const status: EstimateStatus = missingComponentIds.length === 0
      ? "complete"
      : missingComponentIds.length === input.components.length
        ? "unknown"
        : "partial";
    const completeness = inputMass.isZero()
      ? new Decimal(0)
      : knownMass.div(inputMass);

    nutrients[code] = {
      totalKnownAmount: decimalString(totalKnown),
      per100gKnownAmount: decimalString(totalKnown.div(basisMass).mul(100)),
      status,
      completenessRatio: decimalString(completeness),
      missingComponentIds,
    };
  }

  return ok({
    inputMassGrams: decimalString(inputMass),
    basisMassGrams: decimalString(basisMass),
    basis,
    nutrients,
  });
}
