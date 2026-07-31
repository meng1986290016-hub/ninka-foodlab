import {
  createResearchReportDocument,
  type ResearchReportDocument,
  type ResearchReportDocumentInput,
  type ResearchReportTarget,
} from "@food-rd/core";
import Decimal from "decimal.js";

import type { NutritionLabelVersion } from "../../api/nutrition-label-types";
import type {
  RecipeTarget,
  RecipeTargetEvaluation,
  RecipeVersion,
} from "../../api/recipe-types";

interface BuildResearchReportDocumentInput {
  id: string;
  generatedAt: string;
  recipeVersion: RecipeVersion;
  nutritionLabelVersion: NutritionLabelVersion;
}

export function buildResearchReportDocument({
  id,
  generatedAt,
  recipeVersion,
  nutritionLabelVersion,
}: BuildResearchReportDocumentInput): Readonly<ResearchReportDocument> {
  if (nutritionLabelVersion.recipeVersionId !== recipeVersion.id) {
    throw new Error("营养标签版本与配方版本不一致");
  }
  const snapshot = recipeVersion.snapshot;
  const calculation = snapshot.calculation;
  const costs = new Map(
    calculation.cost.breakdown.map((item) => [item.id, item.amount]),
  );
  const inputMass = new Decimal(calculation.inputMassGrams);
  const targetEvaluations = new Map(
    calculation.targets.map((target) => [target.targetId, target]),
  );

  const documentInput: ResearchReportDocumentInput = {
    id,
    title: "食品研发报告",
    generatedAt,
    recipe: {
      id: snapshot.recipe.id,
      name: snapshot.recipe.name,
      code: snapshot.recipe.code,
      kind: snapshot.recipe.kind,
      versionId: recipeVersion.id,
      versionNumber: recipeVersion.versionNumber,
      versionCreatedAt: recipeVersion.createdAt,
      targetBatchGrams: snapshot.targetBatchGrams,
      finishedMassGrams: snapshot.finishedMassGrams,
      yieldPercent: calculation.yieldPercent,
      completenessPercent: calculation.completeness.percent,
    },
    ingredients: snapshot.items.map((item) => ({
      id: item.id,
      position: item.position,
      kind: item.kind,
      name:
        item.kind === "ingredient"
          ? item.ingredient.materialName
          : item.recipeVersion.recipeName,
      supplierName:
        item.kind === "ingredient"
          ? item.ingredient.supplierName
          : null,
      specification:
        item.kind === "ingredient"
          ? item.ingredient.modelOrSpecification || null
          : null,
      referencedVersion:
        item.kind === "recipe_version"
          ? `V${item.recipeVersion.versionNumber}`
          : null,
      amount: item.amount,
      unit: item.unit,
      massGrams: item.massGrams,
      percent: percentage(item.massGrams, inputMass),
      cost: costs.get(item.id) ?? null,
    })),
    nutrition: {
      labelVersionId: nutritionLabelVersion.id,
      labelVersionNumber: nutritionLabelVersion.versionNumber,
      standardCode:
        nutritionLabelVersion.snapshot.rulePack.standardCode,
      rulePackId: nutritionLabelVersion.snapshot.rulePack.id,
      rulePackRevision:
        nutritionLabelVersion.snapshot.rulePack.revision,
      officialSourceUrl:
        nutritionLabelVersion.snapshot.rulePack.officialSourceUrl,
      basisLabel: basisLabel(nutritionLabelVersion),
      requiredNotice:
        nutritionLabelVersion.snapshot.requiredNotice,
      rows: nutritionLabelVersion.snapshot.rows.map((row) => ({
        nutrientCode: row.nutrientCode,
        name: row.name,
        declaredValue: row.declaredValue,
        unit: row.unit,
        nrvPercent: row.nrvPercent,
        sourceKind: row.sourceKind,
        sourceReference: row.sourceReference,
      })),
    },
    cost: {
      rawMaterialTotal: calculation.cost.rawMaterialTotal,
      packagingTotal: calculation.cost.packagingTotal,
      additionalTotal: calculation.cost.additionalTotal,
      batchTotal: calculation.cost.batchTotal,
      perKg: calculation.cost.perKg,
      per100g: calculation.cost.per100g,
      perServing: calculation.cost.perServing,
      perPackage: calculation.cost.perPackage,
      status: calculation.cost.status,
    },
    targets: snapshot.targets.map((target) =>
      reportTarget(target, targetEvaluations.get(target.id)),
    ),
    allergens: {
      contains: [...calculation.allergens.contains],
      mayContain: [...calculation.allergens.mayContain],
    },
    notes: snapshot.markdownNotes,
    provenance: {
      recipeVersionId: recipeVersion.id,
      nutritionLabelVersionId: nutritionLabelVersion.id,
      generatedBy: "food-rd-studio",
    },
  };
  return createResearchReportDocument(documentInput);
}

function percentage(massGrams: string, inputMass: Decimal) {
  if (inputMass.isZero()) return "0";
  return new Decimal(massGrams)
    .div(inputMass)
    .mul(100)
    .toDecimalPlaces(4)
    .toString();
}

function basisLabel(version: NutritionLabelVersion) {
  const basis = version.snapshot.basis;
  if (basis.kind === "per_100g") return "每100g";
  if (basis.kind === "per_100ml") return "每100mL";
  return basis.servingDescription?.trim() || "每份";
}

function reportTarget(
  target: RecipeTarget,
  evaluation: RecipeTargetEvaluation | undefined,
): ResearchReportTarget {
  const label =
    target.metric.kind === "nutrition_per_100g"
      ? target.metric.nutrientName
      : costBasisLabel(target.metric.basis);
  const unit =
    target.metric.kind === "nutrition_per_100g"
      ? `${target.metric.unit}/100g`
      : "元";
  return {
    id: target.id,
    label,
    criterion: targetCriterion(target, unit),
    actual:
      evaluation?.observed === null ||
      evaluation?.observed === undefined
        ? null
        : `${evaluation.observed} ${unit}`,
    status: evaluation?.status ?? "unknown",
  };
}

function targetCriterion(target: RecipeTarget, unit: string) {
  if (target.minimum !== null && target.maximum !== null) {
    return `${target.minimum}–${target.maximum} ${unit}`;
  }
  if (target.minimum !== null) return `≥ ${target.minimum} ${unit}`;
  if (target.maximum !== null) return `≤ ${target.maximum} ${unit}`;
  return `未设置范围（${unit}）`;
}

function costBasisLabel(basis: "batch" | "per_kg" | "per_100g" | "per_serving" | "per_package") {
  if (basis === "batch") return "整批成本";
  if (basis === "per_kg") return "每 kg 成本";
  if (basis === "per_100g") return "每 100g 成本";
  if (basis === "per_serving") return "每份成本";
  return "每包装成本";
}
