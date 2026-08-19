import Decimal from "decimal.js";

import type {
  RecipeAdditionalCost,
  RecipeCalculationIssue,
  RecipeDraft,
  RecipeDraftItem,
  RecipeDraftSaveInput,
  RecipePackagingCost,
  RecipeTarget,
} from "../../api/recipe-types";
import type { RecipeCalculationResult } from "./recipe-calculation";
import { finishedMassLimitIssue } from "./recipe-mass-validation";

export interface RecipeDraftEditorState {
  draft: RecipeDraft;
  revision: number;
  evaluatedRevision: number;
  canSaveFormalDraft: boolean;
  dirty: boolean;
}

export type RecipeDraftEditablePatch = Partial<
  Pick<
    RecipeDraft,
    | "basedOnVersionId"
    | "source"
    | "finishedMassGrams"
    | "servingMassGrams"
    | "packageCount"
    | "markdownNotes"
  >
>;

export type RecipeDraftAction =
  | {
      type: "hydrate";
      draft: RecipeDraft;
      dirty?: boolean;
    }
  | {
      type: "patch";
      patch: RecipeDraftEditablePatch;
    }
  | {
      type: "set_items";
      items: RecipeDraftItem[];
    }
  | {
      type: "set_packaging_costs";
      costs: RecipePackagingCost[];
    }
  | {
      type: "set_additional_costs";
      costs: RecipeAdditionalCost[];
    }
  | {
      type: "set_targets";
      targets: RecipeTarget[];
    }
  | {
      type: "clear";
      timestamp: string;
    }
  | {
      type: "evaluation_completed";
      revision: number;
      draft: RecipeDraft;
      canSaveFormalDraft: boolean;
    }
  | {
      type: "persisted";
      revision: number;
      savedDraft: RecipeDraft | null;
    };

export type RecipeDraftCalculator = (
  draft: RecipeDraft,
) => RecipeCalculationResult;

export interface SettledRecipeDraft {
  draft: RecipeDraft;
  canSaveFormalDraft: boolean;
}

export function createEmptyRecipeDraft(
  recipeId: string,
  timestamp: string,
): RecipeDraft {
  return {
    id: `local:${recipeId}`,
    recipeId,
    basedOnVersionId: null,
    source: "manual",
    targetBatchGrams: "0",
    finishedMassGrams: null,
    servingMassGrams: null,
    packageCount: null,
    items: [],
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes: "",
    calculation: null,
    calculationIssues: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createRecipeDraftEditorState(
  draft: RecipeDraft,
  dirty = false,
): RecipeDraftEditorState {
  return {
    draft,
    revision: 0,
    evaluatedRevision: -1,
    canSaveFormalDraft: false,
    dirty,
  };
}

export function recipeDraftReducer(
  state: RecipeDraftEditorState,
  action: RecipeDraftAction,
): RecipeDraftEditorState {
  switch (action.type) {
    case "hydrate":
      return createRecipeDraftEditorState(
        action.draft,
        action.dirty ?? false,
      );
    case "patch":
      return changed(state, {
        ...state.draft,
        ...action.patch,
      });
    case "set_items":
      return changed(state, {
        ...state.draft,
        items: action.items,
      });
    case "set_packaging_costs":
      return changed(state, {
        ...state.draft,
        packagingCosts: action.costs,
      });
    case "set_additional_costs":
      return changed(state, {
        ...state.draft,
        additionalCosts: action.costs,
      });
    case "set_targets":
      return changed(state, {
        ...state.draft,
        targets: action.targets,
      });
    case "clear":
      return changed(
        state,
        createEmptyRecipeDraft(state.draft.recipeId, action.timestamp),
      );
    case "evaluation_completed":
      if (action.revision !== state.revision) return state;
      return {
        ...state,
        draft: action.draft,
        evaluatedRevision: action.revision,
        canSaveFormalDraft: action.canSaveFormalDraft,
      };
    case "persisted": {
      const savedDraft = action.savedDraft;
      const draft =
        savedDraft === null
          ? state.draft
          : {
              ...state.draft,
              id: savedDraft.id,
              createdAt: savedDraft.createdAt,
              updatedAt: savedDraft.updatedAt,
            };
      return {
        ...state,
        draft,
        dirty:
          action.revision === state.revision ? false : state.dirty,
      };
    }
  }
}

export function settleRecipeDraft(
  draft: RecipeDraft,
  calculate?: RecipeDraftCalculator,
): SettledRecipeDraft {
  const validationIssues = validateRecipeDraftNumbers(draft);
  if (validationIssues.length > 0) {
    return {
      draft: {
        ...draft,
        calculationIssues: validationIssues,
      },
      canSaveFormalDraft: false,
    };
  }
  if (calculate === undefined) {
    const limitIssue = finishedMassLimitIssue(
      draft.finishedMassGrams,
      draft.calculation?.inputMassGrams,
    );
    return {
      draft:
        limitIssue === null
          ? draft
          : {
              ...draft,
              calculationIssues: [
                ...draft.calculationIssues.filter(
                  (issue) =>
                    issue.code !== "finished_mass_exceeds_input",
                ),
                limitIssue,
              ],
            },
      canSaveFormalDraft: limitIssue === null,
    };
  }

  try {
    const result = calculate(draft);
    if (!result.ok) {
      return {
        draft: {
          ...draft,
          calculationIssues: result.issues,
        },
        canSaveFormalDraft: true,
      };
    }
    const limitIssue = finishedMassLimitIssue(
      draft.finishedMassGrams,
      result.value.calculation.inputMassGrams,
    );
    return {
      draft: {
        ...draft,
        targetBatchGrams: result.value.calculation.inputMassGrams,
        calculation: result.value.calculation,
        calculationIssues:
          limitIssue === null
            ? result.warnings
            : [...result.warnings, limitIssue],
      },
      canSaveFormalDraft: limitIssue === null,
    };
  } catch {
    return {
      draft: {
        ...draft,
        calculationIssues: [
          {
            code: "missing_reference",
            severity: "error",
            message: "配方计算暂时无法完成，已保留上一次有效结果",
            field: null,
            itemId: null,
          },
        ],
      },
      canSaveFormalDraft: true,
    };
  }
}

export function validateRecipeDraftNumbers(
  draft: RecipeDraft,
): RecipeCalculationIssue[] {
  const issues: RecipeCalculationIssue[] = [];
  validateOptionalPositive(
    draft.finishedMassGrams,
    "finishedMassGrams",
    issues,
  );
  validateOptionalPositive(
    draft.servingMassGrams,
    "servingMassGrams",
    issues,
  );
  validateOptionalPositive(
    draft.packageCount,
    "packageCount",
    issues,
  );

  for (const item of draft.items) {
    validateNumber(
      item.amount,
      "amount",
      item.id,
      "non_negative",
      issues,
    );
  }
  for (const item of draft.packagingCosts) {
    validateNumber(
      item.quantity,
      "quantity",
      item.id,
      "non_negative",
      issues,
    );
    validateNumber(
      item.unitCost,
      "unitCost",
      item.id,
      "non_negative",
      issues,
    );
  }
  for (const item of draft.additionalCosts) {
    validateNumber(
      item.amount,
      "amount",
      item.id,
      "non_negative",
      issues,
    );
  }
  for (const target of draft.targets) {
    validateOptionalNumber(
      target.minimum,
      "minimum",
      target.id,
      issues,
    );
    validateOptionalNumber(
      target.maximum,
      "maximum",
      target.id,
      issues,
    );
  }
  return issues;
}

export function toRecipeDraftSaveInput(
  draft: RecipeDraft,
): RecipeDraftSaveInput {
  return {
    recipeId: draft.recipeId,
    basedOnVersionId: draft.basedOnVersionId,
    source: draft.source,
    targetBatchGrams:
      draft.calculation?.inputMassGrams ?? draft.targetBatchGrams,
    finishedMassGrams: draft.finishedMassGrams,
    servingMassGrams: draft.servingMassGrams,
    packageCount: draft.packageCount,
    items: draft.items.map((item) => {
      if (item.kind === "ingredient") {
        return {
            id: item.id,
            position: item.position,
            kind: "ingredient",
            ingredientVariantId: item.ingredientVariantId,
            amount: item.amount,
            unit: item.unit,
            locked: false,
            autoFill: false,
          };
      }
      if (item.kind === "material_need") {
        return {
          id: item.id,
          position: item.position,
          kind: "material_need" as const,
          materialNeedId: item.materialNeedId,
          amount: item.amount,
          unit: item.unit,
          locked: false,
          autoFill: false,
        };
      }
      return {
            id: item.id,
            position: item.position,
            kind: "recipe_version",
            recipeVersionId: item.recipeVersionId,
            amount: item.amount,
            unit: item.unit,
            locked: false,
            autoFill: false,
          };
    }),
    packagingCosts: draft.packagingCosts.map((item) => ({ ...item })),
    additionalCosts: draft.additionalCosts.map((item) => ({ ...item })),
    targets: draft.targets.map((target) => ({
      ...target,
      metric: { ...target.metric },
    })),
    markdownNotes: draft.markdownNotes,
    calculation: draft.calculation,
    calculationIssues: [...draft.calculationIssues],
  };
}

function changed(
  state: RecipeDraftEditorState,
  draft: RecipeDraft,
): RecipeDraftEditorState {
  return {
    ...state,
    draft,
    revision: state.revision + 1,
    evaluatedRevision: -1,
    canSaveFormalDraft: false,
    dirty: true,
  };
}

function validateOptionalPositive(
  value: string | null,
  field: string,
  issues: RecipeCalculationIssue[],
) {
  if (value === null) return;
  validateNumber(value, field, null, "positive", issues);
}

function validateOptionalNumber(
  value: string | null,
  field: string,
  itemId: string,
  issues: RecipeCalculationIssue[],
) {
  if (value === null) return;
  validateNumber(value, field, itemId, "any", issues);
}

function validateNumber(
  value: string,
  field: string,
  itemId: string | null,
  constraint: "any" | "non_negative" | "positive",
  issues: RecipeCalculationIssue[],
) {
  let parsed: Decimal;
  try {
    if (value.trim() === "") throw new Error("empty");
    parsed = new Decimal(value);
    if (!parsed.isFinite()) throw new Error("not finite");
  } catch {
    issues.push({
      code: "invalid_number",
      severity: "error",
      message: "请输入有效数字",
      field,
      itemId,
    });
    return;
  }

  if (constraint === "non_negative" && parsed.isNegative()) {
    issues.push({
      code: "negative_value",
      severity: "error",
      message: "数值不能小于 0",
      field,
      itemId,
    });
  } else if (constraint === "positive" && parsed.lte(0)) {
    issues.push({
      code: "non_positive_value",
      severity: "error",
      message: "数值必须大于 0",
      field,
      itemId,
    });
  }
}
