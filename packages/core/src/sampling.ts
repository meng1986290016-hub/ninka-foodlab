import Decimal from "decimal.js";

import {
  decimalString,
  parseNonNegative,
  parsePositive,
  type DecimalString,
} from "./decimal.js";
import { fail, ok, type CalcResult } from "./result.js";
import type { Unit } from "./units.js";

export type SamplingBasis = "finished_output" | "planned_input";
export type SamplingHierarchy = "direct" | "expanded";
export type SamplingTargetUnit = "g" | "kg";

export interface SamplingIngredient {
  id: string;
  name: string;
  supplierName: string | null;
  specification: string | null;
}

interface SamplingItemBase {
  id: string;
  position: number;
  amount: DecimalString;
  unit: Unit;
  massGrams: DecimalString;
}

export interface SamplingIngredientItem extends SamplingItemBase {
  kind: "ingredient";
  ingredient: SamplingIngredient;
}

export interface SamplingRecipeItem extends SamplingItemBase {
  kind: "recipe_version";
  recipeVersionId: string;
  recipeName: string;
  versionNumber: number;
}

export type SamplingItem = SamplingIngredientItem | SamplingRecipeItem;

export interface SamplingRecipeNode {
  id: string;
  name: string;
  versionLabel: string;
  finishedMassGrams: DecimalString | null;
  outputMassGrams: DecimalString;
  items: SamplingItem[];
}

export interface SamplingCalculationInput {
  source: SamplingRecipeNode;
  referencedRecipes: Record<string, SamplingRecipeNode>;
  basis: SamplingBasis;
  hierarchy: SamplingHierarchy;
  targetAmount: DecimalString;
  targetUnit: SamplingTargetUnit;
}

export interface SamplingLine {
  id: string;
  kind: "ingredient" | "recipe_version";
  name: string;
  supplierName: string | null;
  specification: string | null;
  sourcePath: string[];
  amount: DecimalString;
  unit: Unit;
  massGrams: DecimalString;
}

export interface SamplingCalculation {
  basis: SamplingBasis;
  hierarchy: SamplingHierarchy;
  targetMassGrams: DecimalString;
  sourceInputMassGrams: DecimalString;
  sourceFinishedMassGrams: DecimalString | null;
  yieldPercent: DecimalString | null;
  scaleFactor: DecimalString;
  expectedInputMassGrams: DecimalString;
  expectedFinishedMassGrams: DecimalString | null;
  lines: SamplingLine[];
}

export interface FormattedSamplingAmount {
  value: string;
  unit: Unit;
  label: string;
}

export function calculateSamplingSheet(
  input: SamplingCalculationInput,
): CalcResult<SamplingCalculation> {
  const target = parsePositive(input.targetAmount, "targetAmount");
  if (!target.ok) return target;
  const targetMass =
    input.targetUnit === "kg" ? target.value.mul(1000) : target.value;
  const sourceInput = sumInputMass(input.source.items);
  if (!sourceInput.ok) return sourceInput;
  if (sourceInput.value.isZero()) {
    return fail({
      code: "non-positive-value",
      field: "sourceInputMassGrams",
      severity: "error",
      message: "原配方投料合计必须大于 0",
    });
  }

  let sourceFinished: Decimal | null = null;
  if (input.source.finishedMassGrams !== null) {
    const parsed = parsePositive(
      input.source.finishedMassGrams,
      "sourceFinishedMassGrams",
    );
    if (!parsed.ok) return parsed;
    sourceFinished = parsed.value;
  }
  if (input.basis === "finished_output" && sourceFinished === null) {
    return fail({
      code: "non-positive-value",
      field: "sourceFinishedMassGrams",
      severity: "error",
      message: "原配方未填写出成重量，请改用计划投料量计算",
    });
  }

  const scale = targetMass.div(
    input.basis === "finished_output"
      ? sourceFinished ?? sourceInput.value
      : sourceInput.value,
  );
  const lines =
    input.hierarchy === "direct"
      ? directLines(input.source, scale)
      : expandedLines(input.source, input.referencedRecipes, scale);
  if (!lines.ok) return lines;

  return ok({
    basis: input.basis,
    hierarchy: input.hierarchy,
    targetMassGrams: decimalString(targetMass),
    sourceInputMassGrams: decimalString(sourceInput.value),
    sourceFinishedMassGrams:
      sourceFinished === null ? null : decimalString(sourceFinished),
    yieldPercent:
      sourceFinished === null
        ? null
        : decimalString(sourceFinished.div(sourceInput.value).mul(100)),
    scaleFactor: decimalString(scale),
    expectedInputMassGrams: decimalString(sourceInput.value.mul(scale)),
    expectedFinishedMassGrams:
      sourceFinished === null
        ? null
        : decimalString(sourceFinished.mul(scale)),
    lines: lines.value,
  });
}

export function formatSamplingAmount(
  amount: DecimalString,
  unit: Unit,
): FormattedSamplingAmount {
  const parsed = new Decimal(amount);
  let display = parsed;
  let displayUnit: Unit = unit;
  if (unit === "kg" && parsed.abs().lt(1)) {
    display = parsed.mul(1000);
    displayUnit = "g";
  } else if (unit === "L" && parsed.abs().lt(1)) {
    display = parsed.mul(1000);
    displayUnit = "mL";
  } else if (unit === "g" && parsed.abs().lt(1)) {
    display = parsed.mul(1000);
    displayUnit = "mg";
  }

  let decimals: number;
  if (displayUnit === "kg" || displayUnit === "L") {
    decimals = 3;
  } else if (displayUnit === "mg") {
    decimals = 0;
  } else if (display.abs().gte(100)) {
    decimals = 1;
  } else if (display.abs().gte(1)) {
    decimals = 2;
  } else {
    decimals = 3;
  }
  const value = display.toDecimalPlaces(decimals).toFixed(decimals);
  return { value, unit: displayUnit, label: `${value} ${displayUnit}` };
}

function sumInputMass(items: SamplingItem[]): CalcResult<Decimal> {
  let total = new Decimal(0);
  for (const item of items) {
    const mass = parseNonNegative(item.massGrams, "massGrams");
    if (!mass.ok) return mass;
    total = total.add(mass.value);
  }
  return ok(total);
}

function directLines(
  source: SamplingRecipeNode,
  scale: Decimal,
): CalcResult<SamplingLine[]> {
  const lines: SamplingLine[] = [];
  for (const item of orderedItems(source.items)) {
    const line = scaledLine(item, scale, []);
    if (!line.ok) return line;
    lines.push(line.value);
  }
  return ok(lines);
}

function expandedLines(
  source: SamplingRecipeNode,
  graph: Record<string, SamplingRecipeNode>,
  scale: Decimal,
): CalcResult<SamplingLine[]> {
  const visit = (
    node: SamplingRecipeNode,
    nodeScale: Decimal,
    sourcePath: string[],
    versionPath: string[],
  ): CalcResult<SamplingLine[]> => {
    if (versionPath.includes(node.id)) {
      return fail({
        code: "recipe-cycle",
        itemId: node.id,
        severity: "error",
        message: `检测到配方循环引用：${[...versionPath, node.id].join(" → ")}`,
      });
    }
    const nextVersionPath = [...versionPath, node.id];
    const lines: SamplingLine[] = [];
    for (const item of orderedItems(node.items)) {
      if (item.kind === "ingredient") {
        const line = scaledLine(item, nodeScale, sourcePath);
        if (!line.ok) return line;
        lines.push(line.value);
        continue;
      }
      const child = graph[item.recipeVersionId];
      if (child === undefined) {
        return fail({
          code: "missing-recipe-version",
          itemId: item.recipeVersionId,
          severity: "error",
          message: `找不到半成品版本：${item.recipeName} V${item.versionNumber}`,
        });
      }
      const itemMass = parseNonNegative(item.massGrams, "massGrams");
      if (!itemMass.ok) return itemMass;
      const childOutput = parsePositive(
        child.outputMassGrams,
        "outputMassGrams",
      );
      if (!childOutput.ok) return childOutput;
      const childScale = nodeScale.mul(itemMass.value).div(childOutput.value);
      const nested = visit(
        child,
        childScale,
        [...sourcePath, `${item.recipeName} V${item.versionNumber}`],
        nextVersionPath,
      );
      if (!nested.ok) return nested;
      lines.push(...nested.value);
    }
    return ok(lines);
  };

  return visit(source, scale, [], []);
}

function scaledLine(
  item: SamplingItem,
  scale: Decimal,
  sourcePath: string[],
): CalcResult<SamplingLine> {
  const amount = parseNonNegative(item.amount, "amount");
  if (!amount.ok) return amount;
  const mass = parseNonNegative(item.massGrams, "massGrams");
  if (!mass.ok) return mass;
  if (item.kind === "ingredient") {
    return ok({
      id: item.id,
      kind: item.kind,
      name: item.ingredient.name,
      supplierName: item.ingredient.supplierName,
      specification: item.ingredient.specification,
      sourcePath,
      amount: decimalString(amount.value.mul(scale)),
      unit: item.unit,
      massGrams: decimalString(mass.value.mul(scale)),
    });
  }
  return ok({
    id: item.id,
    kind: item.kind,
    name: item.recipeName,
    supplierName: "自制半成品",
    specification: `V${item.versionNumber}`,
    sourcePath,
    amount: decimalString(amount.value.mul(scale)),
    unit: item.unit,
    massGrams: decimalString(mass.value.mul(scale)),
  });
}

function orderedItems(items: SamplingItem[]) {
  return [...items].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
}
