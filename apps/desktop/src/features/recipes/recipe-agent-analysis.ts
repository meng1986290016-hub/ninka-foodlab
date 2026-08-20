import Decimal from "decimal.js";

import type {
  Recipe,
  RecipeCalculation,
  RecipeCalculationIssue,
  RecipeDraft,
  RecipeDraftIngredientItem,
  RecipeNutrientEstimate,
  RecipeVersion,
} from "../../api/recipe-types";
import type {
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import { calculateRecipeDraft } from "./recipe-calculation";

export type RecipeAgentFindingSeverity = "blocker" | "warning" | "info";

export interface RecipeAgentFinding {
  code: string;
  severity: RecipeAgentFindingSeverity;
  title: string;
  detail: string;
}

export interface RecipeAgentCostContributor {
  id: string;
  name: string;
  amount: string;
  percent: string;
}

export interface RecipeAgentDiagnosis {
  recipeId: string;
  recipeName: string;
  sourceFingerprint: string;
  status: "healthy" | "attention" | "blocked";
  summary: string;
  calculation: RecipeCalculation | null;
  findings: RecipeAgentFinding[];
  recommendations: string[];
  topCostContributors: RecipeAgentCostContributor[];
}

export interface RecipeAgentNutrientDifference {
  nutrientDefinitionId: string;
  name: string;
  unit: string;
  before: string;
  after: string;
  difference: string;
  beforeStatus: RecipeNutrientEstimate["status"];
  afterStatus: RecipeNutrientEstimate["status"];
}

export interface RecipeAgentSubstitutionAnalysis {
  recipeId: string;
  recipeName: string;
  itemId: string;
  sourceFingerprint: string;
  materialName: string;
  amount: string;
  unit: string;
  source: {
    variantId: string;
    supplierName: string;
    specification: string;
  };
  candidate: {
    variantId: string;
    supplierName: string;
    specification: string;
  };
  before: RecipeCalculation;
  after: RecipeCalculation;
  batchCostDifference: string;
  perKgCostDifference: string;
  completenessDifference: number;
  nutrientDifferences: RecipeAgentNutrientDifference[];
  allergensAdded: string[];
  allergensRemoved: string[];
  mayContainAdded: string[];
  mayContainRemoved: string[];
  warnings: string[];
}

export interface RecipeAgentWorkbenchContext {
  recipe: Recipe;
  draft: RecipeDraft;
  referencedVersions: RecipeVersion[];
  nutrientDefinitions: NutrientDefinition[];
  readOnly: boolean;
  draftFingerprint: string;
  applyIngredientSubstitution(
    itemId: string,
    group: MaterialGroup,
    variant: IngredientVariant,
  ): void;
  appendResearchNotes(
    expectedDraftUpdatedAt: string,
    appendText: string,
  ): Promise<void>;
  saveDraftNow(): Promise<void>;
}

interface AnalysisRequest {
  recipe: Recipe;
  draft: RecipeDraft;
  referencedVersions: RecipeVersion[];
  nutrientDefinitions: NutrientDefinition[];
}

interface SubstitutionRequest extends AnalysisRequest {
  itemId: string;
  group: MaterialGroup;
  variant: IngredientVariant;
}

export function recipeDraftFingerprint(draft: RecipeDraft): string {
  return JSON.stringify({
    finishedMassGrams: draft.finishedMassGrams,
    servingMassGrams: draft.servingMassGrams,
    packageCount: draft.packageCount,
    items: draft.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      reference:
        item.kind === "ingredient"
          ? item.ingredientVariantId
          : item.kind === "recipe_version"
            ? item.recipeVersionId
            : item.materialNeedId,
      amount: item.amount,
      unit: item.unit,
      position: item.position,
    })),
    packagingCosts: draft.packagingCosts,
    additionalCosts: draft.additionalCosts,
  });
}

export function diagnoseRecipeDraft(
  request: AnalysisRequest,
): RecipeAgentDiagnosis {
  const result = calculateRecipeDraft({
    draft: request.draft,
    referencedVersions: request.referencedVersions,
    nutrientDefinitions: request.nutrientDefinitions,
    calculatedAt: new Date().toISOString(),
  });
  const findings: RecipeAgentFinding[] = [];
  const recommendations: string[] = [];
  const ingredientItems = request.draft.items.filter(
    (item): item is RecipeDraftIngredientItem => item.kind === "ingredient",
  );
  const unresolvedCount = request.draft.items.filter(
    (item) => item.kind === "material_need",
  ).length;

  if (request.draft.items.length === 0) {
    findings.push({
      code: "empty_formula",
      severity: "blocker",
      title: "配方尚未添加原料",
      detail: "至少添加一项原料或半成品后，才能形成可用的营养与成本判断。",
    });
  }
  if (unresolvedCount > 0) {
    findings.push({
      code: "material_needs",
      severity: "blocker",
      title: `${unresolvedCount} 项原料仍待补充`,
      detail: "这些占位原料会计入投料量，但营养和成本按缺失处理，并会阻止保存正式版本。",
    });
    recommendations.push("先在原料库解决待补充需求，再复核正式版本。");
  }

  if (!result.ok) {
    findings.push(...result.issues.map(issueToFinding));
    return {
      recipeId: request.recipe.id,
      recipeName: request.recipe.name,
      sourceFingerprint: recipeDraftFingerprint(request.draft),
      status: "blocked",
      summary: "当前草稿存在阻断计算的问题，暂时不能形成完整诊断。",
      calculation: null,
      findings: uniqueFindings(findings),
      recommendations: uniqueStrings([
        ...recommendations,
        "先修正标为阻断的问题，再重新诊断。",
      ]),
      topCostContributors: [],
    };
  }

  const calculation = result.value.calculation;
  if (request.draft.finishedMassGrams === null) {
    findings.push({
      code: "finished_mass_missing",
      severity: "warning",
      title: "尚未填写出成重量",
      detail: "系统暂按当前投料合计折算每 100 g 营养和单位成本，未计入蒸发、吸水或加工损耗。",
    });
    recommendations.push("打样后记录实际出成重量，以校正得率、每 100 g 营养和每 kg 成本。");
  } else if (calculation.yieldPercent !== null) {
    const yieldPercent = decimal(calculation.yieldPercent);
    if (yieldPercent !== null && (yieldPercent.lt(70) || yieldPercent.gt(105))) {
      findings.push({
        code: "yield_check",
        severity: "warning",
        title: "得率需要人工确认",
        detail: `当前得率为 ${formatNumber(yieldPercent)}%。部分浓缩、干燥、发酵或吸水工艺可能合理，但建议核对投料与出成记录。`,
      });
    }
  }

  if (calculation.completeness.percent < 80) {
    const missingFields = friendlyMissingFields(
      calculation.completeness.missingFields,
    );
    findings.push({
      code: "low_completeness",
      severity: "warning",
      title: `数据完整度仅 ${calculation.completeness.percent}%`,
      detail:
        missingFields.length > 0
          ? `主要缺失：${missingFields.slice(0, 5).join("、")}。`
          : "部分原料营养或价格资料不完整。",
    });
    recommendations.push("优先补齐占比高或成本高原料的营养与价格数据。");
  }

  if (calculation.cost.status === "partial") {
    findings.push({
      code: "partial_cost",
      severity: "warning",
      title: "成本结果不完整",
      detail: `${calculation.cost.missingItemIds.length} 个配方项缺少可用价格，当前成本不能作为最终核算值。`,
    });
  }

  const partialNutrients = calculation.nutrients.filter(
    (nutrient) => nutrient.status !== "complete",
  );
  if (partialNutrients.length > 0) {
    findings.push({
      code: "partial_nutrition",
      severity: "info",
      title: `${partialNutrients.length} 项营养结果含缺失数据`,
      detail: `${partialNutrients.slice(0, 5).map((item) => item.name).join("、")}等项目需要结合完整原料标签后再判断。`,
    });
  }

  if (calculation.allergens.contains.length > 0) {
    findings.push({
      code: "allergens",
      severity: "info",
      title: "已识别含有的过敏原",
      detail: calculation.allergens.contains.join("、"),
    });
  }

  const topCostContributors = costContributors(calculation);
  if (topCostContributors.length > 0) {
    recommendations.push(
      `如需降本，可先比较“${topCostContributors[0]!.name}”的其他供应商版本。`,
    );
  }
  if (ingredientItems.length > 0 && findings.length === 0) {
    findings.push({
      code: "no_obvious_issue",
      severity: "info",
      title: "未发现明显的结构性问题",
      detail: "营养、成本和得率仍应以实际打样、检测结果及适用法规复核为准。",
    });
  }

  const unique = uniqueFindings(findings);
  const status = unique.some((finding) => finding.severity === "blocker")
    ? "blocked"
    : unique.some((finding) => finding.severity === "warning")
      ? "attention"
      : "healthy";
  return {
    recipeId: request.recipe.id,
    recipeName: request.recipe.name,
    sourceFingerprint: recipeDraftFingerprint(request.draft),
    status,
    summary:
      status === "healthy"
        ? "当前配方数据可继续用于研发试算，未发现明显阻断项。"
        : status === "blocked"
          ? "当前配方存在会影响正式版本的阻断项。"
          : "当前配方可以继续试算，但有几项数据或工艺假设需要复核。",
    calculation,
    findings: unique,
    recommendations: uniqueStrings(recommendations).slice(0, 4),
    topCostContributors,
  };
}

export function analyzeIngredientSubstitution(
  request: SubstitutionRequest,
): RecipeAgentSubstitutionAnalysis {
  const sourceItem = request.draft.items.find(
    (item): item is RecipeDraftIngredientItem =>
      item.id === request.itemId && item.kind === "ingredient",
  );
  if (!sourceItem) throw new Error("没有找到要替代的原料行");
  if (sourceItem.ingredientVariantId === request.variant.id) {
    throw new Error("候选供应商版本与当前原料相同");
  }
  if (request.variant.archivedAt !== null) {
    throw new Error("候选供应商版本已经归档，不能应用到配方");
  }

  const beforeResult = calculateRecipeDraft({
    draft: request.draft,
    referencedVersions: request.referencedVersions,
    nutrientDefinitions: request.nutrientDefinitions,
    calculatedAt: new Date().toISOString(),
  });
  if (!beforeResult.ok) {
    throw new Error(firstCalculationError(beforeResult.issues));
  }
  const nextDraft: RecipeDraft = {
    ...request.draft,
    items: request.draft.items.map((item) =>
      item.id === sourceItem.id
        ? {
            ...sourceItem,
            materialName: request.group.name,
            ingredientVariantId: request.variant.id,
            ingredientVariant: request.variant,
          }
        : item,
    ),
  };
  const afterResult = calculateRecipeDraft({
    draft: nextDraft,
    referencedVersions: request.referencedVersions,
    nutrientDefinitions: request.nutrientDefinitions,
    calculatedAt: new Date().toISOString(),
  });
  if (!afterResult.ok) {
    throw new Error(firstCalculationError(afterResult.issues));
  }

  const before = beforeResult.value.calculation;
  const after = afterResult.value.calculation;
  const warnings = uniqueStrings([
    ...(sourceItem.unit === "mL" || sourceItem.unit === "L") &&
    request.variant.densityGPerMl === null
      ? ["候选原料缺少密度，无法可靠换算体积投料。"]
      : [],
    ...(after.cost.status === "partial"
      ? ["替代后的成本仍有缺失数据，差异只能作为当前已知价格的试算。"]
      : []),
    ...(after.completeness.percent < before.completeness.percent
      ? ["候选供应商版本的数据完整度较低，替代后结果的不确定性增加。"]
      : []),
    ...(request.group.id !== sourceItem.ingredientVariant.materialGroupId
      ? ["候选原料来自不同的通用原料，请额外复核功能特性、工艺和感官表现。"]
      : []),
  ]);

  return {
    recipeId: request.recipe.id,
    recipeName: request.recipe.name,
    itemId: sourceItem.id,
    sourceFingerprint: recipeDraftFingerprint(request.draft),
    materialName: sourceItem.materialName,
    amount: sourceItem.amount,
    unit: sourceItem.unit,
    source: {
      variantId: sourceItem.ingredientVariantId,
      supplierName: sourceItem.ingredientVariant.supplierName,
      specification: sourceItem.ingredientVariant.modelOrSpecification,
    },
    candidate: {
      variantId: request.variant.id,
      supplierName: request.variant.supplierName,
      specification: request.variant.modelOrSpecification,
    },
    before,
    after,
    batchCostDifference: subtract(
      after.cost.batchTotal,
      before.cost.batchTotal,
    ),
    perKgCostDifference: subtract(after.cost.perKg, before.cost.perKg),
    completenessDifference:
      after.completeness.percent - before.completeness.percent,
    nutrientDifferences: nutrientDifferences(before, after),
    allergensAdded: difference(after.allergens.contains, before.allergens.contains),
    allergensRemoved: difference(before.allergens.contains, after.allergens.contains),
    mayContainAdded: difference(after.allergens.mayContain, before.allergens.mayContain),
    mayContainRemoved: difference(before.allergens.mayContain, after.allergens.mayContain),
    warnings,
  };
}

function issueToFinding(issue: RecipeCalculationIssue): RecipeAgentFinding {
  return {
    code: issue.code,
    severity: issue.severity === "error" ? "blocker" : "warning",
    title: issue.severity === "error" ? "配方计算被阻断" : "配方数据需要确认",
    detail: issue.message,
  };
}

function firstCalculationError(issues: RecipeCalculationIssue[]) {
  return issues.find((issue) => issue.severity === "error")?.message ??
    issues[0]?.message ??
    "配方无法完成确定性试算";
}

function nutrientDifferences(
  before: RecipeCalculation,
  after: RecipeCalculation,
): RecipeAgentNutrientDifference[] {
  const beforeById = new Map(
    before.nutrients.map((nutrient) => [nutrient.nutrientDefinitionId, nutrient]),
  );
  return after.nutrients
    .flatMap((next) => {
      const previous = beforeById.get(next.nutrientDefinitionId);
      if (!previous) return [];
      const difference = subtract(
        next.per100gKnownAmount,
        previous.per100gKnownAmount,
      );
      const changed = !new Decimal(difference).isZero() || previous.status !== next.status;
      return changed
        ? [{
            nutrientDefinitionId: next.nutrientDefinitionId,
            name: next.name,
            unit: next.unit,
            before: previous.per100gKnownAmount,
            after: next.per100gKnownAmount,
            difference,
            beforeStatus: previous.status,
            afterStatus: next.status,
          }]
        : [];
    })
    .sort((left, right) =>
      new Decimal(right.difference).abs().cmp(new Decimal(left.difference).abs()),
    );
}

function costContributors(
  calculation: RecipeCalculation,
): RecipeAgentCostContributor[] {
  const total = decimal(calculation.cost.rawMaterialTotal);
  if (total === null || total.lte(0)) return [];
  return calculation.cost.breakdown
    .filter((item) => item.category === "ingredient")
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      percent: new Decimal(item.amount).div(total).mul(100).toFixed(1),
    }))
    .sort((left, right) => new Decimal(right.amount).cmp(left.amount))
    .slice(0, 3);
}

function uniqueFindings(findings: RecipeAgentFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function friendlyMissingFields(values: string[]) {
  return uniqueStrings(
    values.map((value) => value.split(/[：:]/, 1)[0] ?? value),
  );
}

function difference(left: string[], right: string[]) {
  const existing = new Set(right);
  return left.filter((value) => !existing.has(value));
}

function subtract(left: string, right: string) {
  return new Decimal(left).sub(right).toString();
}

function decimal(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

function formatNumber(value: Decimal) {
  return value.toDecimalPlaces(2).toString();
}
