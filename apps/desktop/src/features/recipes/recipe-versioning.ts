import Decimal from "decimal.js";

import type {
  Recipe,
  RecipeCalculationIssue,
  RecipeDraft,
  RecipeVersionCreateInput,
  RecipeVersionSnapshot,
} from "../../api/recipe-types";
import type { RecipeCalculationResult } from "./recipe-calculation";

export interface RecipeVersionValidationIssue {
  field: string;
  message: string;
}

export interface RecipeVersionPreparation {
  input: RecipeVersionCreateInput;
  warnings: RecipeCalculationIssue[];
}

export type PrepareRecipeVersionResult =
  | {
      ok: true;
      value: RecipeVersionPreparation;
    }
  | {
      ok: false;
      issues: RecipeVersionValidationIssue[];
    };

interface PrepareRecipeVersionRequest {
  recipe: Recipe;
  recipeName: string;
  draft: RecipeDraft;
  sourceDraftId: string;
  calculation: RecipeCalculationResult;
}

export function prepareRecipeVersion(
  request: PrepareRecipeVersionRequest,
): PrepareRecipeVersionResult {
  const issues = validateFormalVersionInput(
    request.recipeName,
    request.draft,
    request.calculation,
  );
  if (issues.length > 0 || !request.calculation.ok) {
    return { ok: false, issues };
  }

  const snapshot: RecipeVersionSnapshot = {
    schemaVersion: 1,
    recipe: {
      id: request.recipe.id,
      name: request.recipeName.trim(),
      code: request.recipe.code,
      tags: [...request.recipe.tags],
      kind: request.recipe.kind,
      productId: request.recipe.productId ?? request.recipe.id,
      schemeName: request.recipe.schemeName ?? "主配方",
      schemeStatus: request.recipe.schemeStatus ?? "current",
    },
    // Retained in the snapshot schema for backward compatibility. New
    // versions store the actual input total instead of a separate plan value.
    targetBatchGrams: request.calculation.value.calculation.inputMassGrams,
    finishedMassGrams: request.draft.finishedMassGrams,
    servingMassGrams: request.draft.servingMassGrams,
    packageCount: request.draft.packageCount,
    items: structuredClone(request.calculation.value.versionItems),
    packagingCosts: request.draft.packagingCosts.map((item) => ({
      ...item,
    })),
    additionalCosts: request.draft.additionalCosts.map((item) => ({
      ...item,
    })),
    targets: request.draft.targets.map((target) => ({
      ...target,
      metric: { ...target.metric },
    })),
    markdownNotes: request.draft.markdownNotes,
    calculation: structuredClone(request.calculation.value.calculation),
  };
  const dependencyVersionIds = [
    ...new Set(
      snapshot.items.flatMap((item) =>
        item.kind === "recipe_version"
          ? [item.recipeVersion.id]
          : [],
      ),
    ),
  ];

  return {
    ok: true,
    value: {
      input: {
        recipeId: request.recipe.id,
        sourceDraftId: request.sourceDraftId,
        basedOnVersionId: request.draft.basedOnVersionId,
        snapshot,
        dependencyVersionIds,
      },
      warnings: collectFormalVersionWarnings(
        request.calculation.value.calculation.completeness.percent,
        request.calculation.value.calculation.cost.status,
        request.calculation.warnings,
      ),
    },
  };
}

export function validateFormalVersionInput(
  recipeName: string,
  draft: RecipeDraft,
  calculation: RecipeCalculationResult,
): RecipeVersionValidationIssue[] {
  const issues: RecipeVersionValidationIssue[] = [];
  if (recipeName.trim() === "") {
    issues.push({ field: "配方名称", message: "请填写配方名称" });
  }
  if (
    draft.finishedMassGrams !== null &&
    !isPositive(draft.finishedMassGrams)
  ) {
    issues.push({
      field: "出成重量",
      message: "出成重量必须是大于 0 的有效数字",
    });
  }
  if (draft.items.length === 0) {
    issues.push({
      field: "配方项目",
      message: "至少添加一种原料或半成品",
    });
  }
  for (const item of draft.items) {
    if (item.kind === "material_need") {
      issues.push({
        field: item.materialNeed.materialName,
        message: "待补充原料需要先关联并替换为真实供应商版本",
      });
      continue;
    }
    const name =
      item.kind === "ingredient"
        ? item.materialName
        : item.recipeVersion.recipeName;
    if (!isPositive(item.amount)) {
      issues.push({
        field: name,
        message: "正式版本中的用量必须大于 0",
      });
    }
  }
  if (!calculation.ok) {
    for (const issue of calculation.issues) {
      issues.push({
        field: issueFieldLabel(issue),
        message: issue.message,
      });
    }
  }
  return dedupeValidationIssues(issues);
}

function collectFormalVersionWarnings(
  completeness: number,
  costStatus: "complete" | "partial",
  calculationWarnings: RecipeCalculationIssue[],
) {
  const warnings = calculationWarnings.map((issue) => ({ ...issue }));
  if (
    completeness < 100 &&
    !warnings.some((issue) => issue.field === "completeness")
  ) {
    warnings.push({
      code: "missing_reference",
      severity: "warning",
      message: `当前数据完整度为 ${completeness}%，版本会保留未知项`,
      field: "completeness",
      itemId: null,
    });
  }
  if (
    costStatus === "partial" &&
    !warnings.some((issue) => issue.code === "missing_price")
  ) {
    warnings.push({
      code: "missing_price",
      severity: "warning",
      message: "当前成本为部分估算，版本会保留缺失价格",
      field: "currentPrice",
      itemId: null,
    });
  }
  return warnings;
}

function isPositive(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
}

function issueFieldLabel(issue: RecipeCalculationIssue) {
  if (issue.itemId !== null) return "配方项目";
  switch (issue.field) {
    case "finishedMassGrams":
      return "出成重量";
    case "servingMassGrams":
      return "每份重量";
    case "packageCount":
      return "包装数量";
    default:
      return "计算结果";
  }
}

function dedupeValidationIssues(
  issues: RecipeVersionValidationIssue[],
) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
