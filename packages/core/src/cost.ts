import Decimal from "decimal.js";
import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { ok, type CalcResult } from "./result.js";

export interface CostComponentInput {
  id: string;
  name: string;
  massGrams: DecimalString;
  pricePerKg: DecimalString | null;
}

export interface NamedCostInput {
  id: string;
  name: string;
}

export interface PackagingCostInput extends NamedCostInput {
  quantity: DecimalString;
  unitCost: DecimalString;
}

export interface AdditionalCostInput extends NamedCostInput {
  amount: DecimalString;
}

export interface CostInput {
  components: CostComponentInput[];
  finishedMassGrams?: DecimalString;
  packaging?: PackagingCostInput[];
  additional?: AdditionalCostInput[];
  servingMassGrams?: DecimalString;
  packageCount?: DecimalString;
}

export interface CostBreakdownItem {
  id: string;
  name: string;
  category: "ingredient" | "packaging" | "additional";
  amount: DecimalString;
}

export interface CostSummary {
  rawMaterialTotal: DecimalString;
  packagingTotal: DecimalString;
  additionalTotal: DecimalString;
  batchTotal: DecimalString;
  perKg: DecimalString;
  per100g: DecimalString;
  perServing: DecimalString | null;
  perPackage: DecimalString | null;
  status: "complete" | "partial";
  missingComponentIds: string[];
  breakdown: CostBreakdownItem[];
}

export function calculateCost(input: CostInput): CalcResult<CostSummary> {
  let inputMass = new Decimal(0);
  let rawMaterialTotal = new Decimal(0);
  let packagingTotal = new Decimal(0);
  let additionalTotal = new Decimal(0);
  const missingComponentIds: string[] = [];
  const breakdown: CostBreakdownItem[] = [];

  for (const component of input.components) {
    const mass = parseNonNegative(component.massGrams, "massGrams");
    if (!mass.ok) return mass;
    inputMass = inputMass.add(mass.value);
    if (component.pricePerKg === null) {
      missingComponentIds.push(component.id);
      continue;
    }
    const price = parseNonNegative(component.pricePerKg, "pricePerKg");
    if (!price.ok) return price;
    const amount = mass.value.div(1000).mul(price.value);
    rawMaterialTotal = rawMaterialTotal.add(amount);
    breakdown.push({
      id: component.id,
      name: component.name,
      category: "ingredient",
      amount: decimalString(amount),
    });
  }

  for (const item of input.packaging ?? []) {
    const quantity = parseNonNegative(item.quantity, "packaging.quantity");
    if (!quantity.ok) return quantity;
    const unitCost = parseNonNegative(item.unitCost, "packaging.unitCost");
    if (!unitCost.ok) return unitCost;
    const amount = quantity.value.mul(unitCost.value);
    packagingTotal = packagingTotal.add(amount);
    breakdown.push({
      id: item.id,
      name: item.name,
      category: "packaging",
      amount: decimalString(amount),
    });
  }

  for (const item of input.additional ?? []) {
    const amount = parseNonNegative(item.amount, "additional.amount");
    if (!amount.ok) return amount;
    additionalTotal = additionalTotal.add(amount.value);
    breakdown.push({
      id: item.id,
      name: item.name,
      category: "additional",
      amount: decimalString(amount.value),
    });
  }

  let basisMass = inputMass;
  if (input.finishedMassGrams !== undefined) {
    const parsed = parsePositive(input.finishedMassGrams, "finishedMassGrams");
    if (!parsed.ok) return parsed;
    basisMass = parsed.value;
  } else {
    const parsed = parsePositive(decimalString(inputMass), "inputMassGrams");
    if (!parsed.ok) return parsed;
  }

  const batchTotal = rawMaterialTotal.add(packagingTotal).add(additionalTotal);
  const perGram = batchTotal.div(basisMass);

  let perServing: DecimalString | null = null;
  if (input.servingMassGrams !== undefined) {
    const serving = parsePositive(input.servingMassGrams, "servingMassGrams");
    if (!serving.ok) return serving;
    perServing = decimalString(perGram.mul(serving.value));
  }

  let perPackage: DecimalString | null = null;
  if (input.packageCount !== undefined) {
    const count = parsePositive(input.packageCount, "packageCount");
    if (!count.ok) return count;
    perPackage = decimalString(batchTotal.div(count.value));
  }

  return ok({
    rawMaterialTotal: decimalString(rawMaterialTotal),
    packagingTotal: decimalString(packagingTotal),
    additionalTotal: decimalString(additionalTotal),
    batchTotal: decimalString(batchTotal),
    perKg: decimalString(perGram.mul(1000)),
    per100g: decimalString(perGram.mul(100)),
    perServing,
    perPackage,
    status: missingComponentIds.length === 0 ? "complete" : "partial",
    missingComponentIds,
    breakdown,
  });
}
