import Decimal from "decimal.js";
import { decimalString } from "./decimal.js";
import type {
  NutritionLabelBasis,
  NutritionLabelCalculation,
  NutritionLabelCalculationInput,
  NutritionLabelIssue,
  NutritionLabelNutrientRule,
  NutritionLabelRoundingMode,
  NutritionLabelRowSnapshot,
  NutritionLabelSourceValue,
} from "./nutrition-label.js";
import { getNutritionLabelRulePack } from "./nutrition-label-rules.js";

const ENERGY_FACTORS = {
  protein: new Decimal(17),
  fat: new Decimal(37),
  carbohydrate: new Decimal(17),
  dietary_fiber: new Decimal(8),
} as const;

interface ParsedSource {
  source: NutritionLabelSourceValue;
  value: Decimal | null;
  valid: boolean;
}

export function calculateNutritionLabel(
  input: NutritionLabelCalculationInput,
): NutritionLabelCalculation {
  const pack = getNutritionLabelRulePack(input.rulePackId);
  const issues: NutritionLabelIssue[] = [];
  const normalizationFactor = basisNormalizationFactor(input.basis, issues);
  const rules = new Map(
    pack.nutrients.map((rule) => [rule.nutrientCode, rule] as const),
  );
  const sources = collectSources(input.sourceValues, issues);

  const optionalCodes = input.optionalNutrientCodes
    .filter((code, index, values) => values.indexOf(code) === index)
    .filter((code) => {
      if (rules.has(code)) return true;
      issues.push({
        code: "unsupported_nutrient",
        severity: "error",
        nutrientCode: code,
        message: `规则包 ${pack.standardCode} 不支持营养项目 ${code}`,
      });
      return false;
    })
    .filter((code) => !pack.mandatoryNutrientCodes.includes(code));

  const selectedCodes = [
    ...pack.mandatoryNutrientCodes,
    ...optionalCodes,
  ];
  const parsed = new Map<string, ParsedSource>();

  for (const code of selectedCodes) {
    if (code === "energy") continue;
    const rule = rules.get(code);
    if (!rule) continue;
    parsed.set(
      code,
      parseSource(rule, sources.get(code), issues),
    );
  }

  const rowsByCode = new Map<string, NutritionLabelRowSnapshot>();
  const energyRule = rules.get("energy");
  if (energyRule) {
    rowsByCode.set(
      "energy",
      calculateEnergyRow(
        energyRule,
        parsed,
        optionalCodes.includes("dietary_fiber"),
        normalizationFactor,
        input.roundingMode,
        issues,
      ),
    );
  }

  for (const code of selectedCodes) {
    if (code === "energy") continue;
    const rule = rules.get(code);
    const source = parsed.get(code);
    if (!rule || !source) continue;
    rowsByCode.set(
      code,
      calculateRow(
        rule,
        source,
        normalizationFactor,
        input.roundingMode,
      ),
    );
  }

  const rows = selectedCodes
    .map((code) => rowsByCode.get(code))
    .filter((row): row is NutritionLabelRowSnapshot => row !== undefined);

  return {
    rulePack: {
      id: pack.id,
      revision: pack.revision,
      standardCode: pack.standardCode,
      publishedOn: pack.publishedOn,
      effectiveFrom: pack.effectiveFrom,
      officialSourceUrl: pack.officialSourceUrl,
    },
    basis: input.basis,
    roundingMode: input.roundingMode,
    rows,
    issues,
    publishable: !issues.some((issue) => issue.severity === "error"),
    requiredNotice: pack.requiredNotice,
  };
}

function collectSources(
  values: NutritionLabelSourceValue[],
  issues: NutritionLabelIssue[],
) {
  const sources = new Map<string, NutritionLabelSourceValue>();
  const duplicates = new Set<string>();
  for (const source of values) {
    if (sources.has(source.nutrientCode)) {
      if (!duplicates.has(source.nutrientCode)) {
        duplicates.add(source.nutrientCode);
        issues.push({
          code: "duplicate_nutrient",
          severity: "error",
          nutrientCode: source.nutrientCode,
          message: `营养项目 ${source.nutrientCode} 只能提供一个最终来源值`,
        });
      }
      continue;
    }
    sources.set(source.nutrientCode, source);
  }
  return sources;
}

function parseSource(
  rule: NutritionLabelNutrientRule,
  source: NutritionLabelSourceValue | undefined,
  issues: NutritionLabelIssue[],
): ParsedSource {
  const fallback: NutritionLabelSourceValue = {
    nutrientCode: rule.nutrientCode,
    value: null,
    unit: rule.unit,
    sourceKind: "recipe_estimate",
    sourceReference: null,
    observedAt: null,
    completeness: "unknown",
  };
  const actual = source ?? fallback;

  if (actual.unit !== rule.unit) {
    issues.push({
      code: "unit_mismatch",
      severity: "error",
      nutrientCode: rule.nutrientCode,
      message: `${rule.name}必须使用 ${rule.unit}，当前为 ${actual.unit}`,
    });
    return { source: actual, value: null, valid: false };
  }

  if (actual.value === null) {
    if (rule.required) {
      issues.push({
        code: "required_nutrient_unknown",
        severity: "error",
        nutrientCode: rule.nutrientCode,
        message: `${rule.name}缺少可用于正式标签的数据`,
      });
    }
    return { source: actual, value: null, valid: !rule.required };
  }

  let parsed: Decimal;
  try {
    parsed = new Decimal(actual.value);
    if (!parsed.isFinite() || parsed.isNegative()) throw new Error("invalid");
  } catch {
    issues.push({
      code: "invalid_value",
      severity: "error",
      nutrientCode: rule.nutrientCode,
      message: `${rule.name}必须是大于等于 0 的有效数字`,
    });
    return { source: actual, value: null, valid: false };
  }

  if (
    actual.completeness === "partial" ||
    actual.completeness === "unknown"
  ) {
    issues.push({
      code: "incomplete_source",
      severity: rule.required ? "error" : "warning",
      nutrientCode: rule.nutrientCode,
      message: `${rule.name}的数据来源不完整`,
    });
  }

  return { source: actual, value: parsed, valid: true };
}

function calculateEnergyRow(
  rule: NutritionLabelNutrientRule,
  parsed: Map<string, ParsedSource>,
  includeFiber: boolean,
  normalizationFactor: Decimal | null,
  roundingMode: NutritionLabelRoundingMode,
  issues: NutritionLabelIssue[],
): NutritionLabelRowSnapshot {
  const componentCodes = ["protein", "fat", "carbohydrate"] as const;
  const missing = componentCodes.filter(
    (code) => parsed.get(code)?.value === null ||
      parsed.get(code)?.value === undefined,
  );
  if (includeFiber && parsed.get("dietary_fiber")?.value == null) {
    missing.push("dietary_fiber" as (typeof componentCodes)[number]);
  }

  if (missing.length > 0) {
    issues.push({
      code: "required_nutrient_unknown",
      severity: "error",
      nutrientCode: "energy",
      message: `能量缺少计算所需项目：${missing.join("、")}`,
    });
    return {
      nutrientCode: "energy",
      name: rule.name,
      unit: rule.unit,
      rawValue: null,
      declaredValue: null,
      nrvPercent: null,
      sourceKind: "derived_calculation",
      sourceReference: null,
    };
  }

  let raw = new Decimal(0);
  for (const code of componentCodes) {
    raw = raw.add(
      parsed.get(code)!.value!.mul(ENERGY_FACTORS[code]),
    );
  }
  if (includeFiber) {
    raw = raw.add(
      parsed.get("dietary_fiber")!.value!.mul(ENERGY_FACTORS.dietary_fiber),
    );
  }

  return rowFromValue(
    rule,
    raw,
    normalizationFactor,
    roundingMode,
    "derived_calculation",
    `derived:${[
      ...componentCodes,
      ...(includeFiber ? ["dietary_fiber"] : []),
    ].join("+")}`,
  );
}

function calculateRow(
  rule: NutritionLabelNutrientRule,
  parsed: ParsedSource,
  normalizationFactor: Decimal | null,
  roundingMode: NutritionLabelRoundingMode,
): NutritionLabelRowSnapshot {
  if (parsed.value === null) {
    return {
      nutrientCode: rule.nutrientCode,
      name: rule.name,
      unit: rule.unit,
      rawValue: null,
      declaredValue: null,
      nrvPercent: null,
      sourceKind: parsed.source.sourceKind,
      sourceReference: parsed.source.sourceReference,
    };
  }
  return rowFromValue(
    rule,
    parsed.value,
    normalizationFactor,
    roundingMode,
    parsed.source.sourceKind,
    parsed.source.sourceReference,
  );
}

function rowFromValue(
  rule: NutritionLabelNutrientRule,
  rawValue: Decimal,
  normalizationFactor: Decimal | null,
  roundingMode: NutritionLabelRoundingMode,
  sourceKind: NutritionLabelRowSnapshot["sourceKind"],
  sourceReference: string | null,
): NutritionLabelRowSnapshot {
  if (normalizationFactor === null) {
    return {
      nutrientCode: rule.nutrientCode,
      name: rule.name,
      unit: rule.unit,
      rawValue: decimalString(rawValue),
      declaredValue: null,
      nrvPercent: null,
      sourceKind,
      sourceReference,
    };
  }

  const per100 = rawValue.mul(normalizationFactor);
  const isZero = per100.lte(rule.zeroThreshold);
  const declaredValue = isZero
    ? formattedZero(rule.roundingInterval)
    : roundToInterval(rawValue, rule.roundingInterval, roundingMode);
  const nrvPercent = rule.nrv === null
    ? null
    : isZero
      ? "0"
      : roundPercentage(declaredValue, rule.nrv, roundingMode);

  return {
    nutrientCode: rule.nutrientCode,
    name: rule.name,
    unit: rule.unit,
    rawValue: decimalString(rawValue),
    declaredValue,
    nrvPercent,
    sourceKind,
    sourceReference,
  };
}

function basisNormalizationFactor(
  basis: NutritionLabelBasis,
  issues: NutritionLabelIssue[],
): Decimal | null {
  let quantity: Decimal;
  try {
    quantity = new Decimal(basis.quantity);
    if (!quantity.isFinite() || quantity.lte(0)) throw new Error("invalid");
  } catch {
    issues.push({
      code: "unsupported_basis",
      severity: "error",
      message: "营养标签基准数量必须大于 0",
    });
    return null;
  }

  if (
    basis.kind === "per_100g" &&
    (basis.unit !== "g" || !quantity.eq(100))
  ) {
    issues.push({
      code: "unsupported_basis",
      severity: "error",
      message: "每 100g 标签必须使用 100 g 基准",
    });
    return null;
  }
  if (
    basis.kind === "per_100ml" &&
    (basis.unit !== "mL" || !quantity.eq(100))
  ) {
    issues.push({
      code: "unsupported_basis",
      severity: "error",
      message: "每 100mL 标签必须使用 100 mL 基准",
    });
    return null;
  }
  if (basis.kind === "per_serving") return new Decimal(100).div(quantity);
  return new Decimal(1);
}

function roundToInterval(
  value: Decimal,
  interval: string,
  mode: NutritionLabelRoundingMode,
) {
  const rounding = mode === "half_even"
    ? Decimal.ROUND_HALF_EVEN
    : Decimal.ROUND_HALF_UP;
  const step = new Decimal(interval);
  return value
    .div(step)
    .toDecimalPlaces(0, rounding)
    .mul(step)
    .toFixed(decimalPlaces(interval));
}

function roundPercentage(
  declaredValue: string,
  nrv: string,
  mode: NutritionLabelRoundingMode,
) {
  const rounding = mode === "half_even"
    ? Decimal.ROUND_HALF_EVEN
    : Decimal.ROUND_HALF_UP;
  return new Decimal(declaredValue)
    .div(nrv)
    .mul(100)
    .toDecimalPlaces(0, rounding)
    .toFixed(0);
}

function formattedZero(interval: string) {
  return new Decimal(0).toFixed(decimalPlaces(interval));
}

function decimalPlaces(value: string) {
  const point = value.indexOf(".");
  return point === -1 ? 0 : value.length - point - 1;
}
