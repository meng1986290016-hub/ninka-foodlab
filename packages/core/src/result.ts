export type IssueSeverity = "warning" | "error";

export type IssueCode =
  | "invalid-number"
  | "negative-value"
  | "non-positive-value"
  | "missing-density"
  | "invalid-unit"
  | "missing-price"
  | "target-conflict"
  | "duplicate-id"
  | "missing-recipe-version"
  | "recipe-cycle";

export interface CalculationIssue {
  code: IssueCode;
  field?: string;
  itemId?: string;
  severity: IssueSeverity;
  message: string;
}

export type CalcResult<T> =
  | { ok: true; value: T; warnings: CalculationIssue[] }
  | { ok: false; issues: CalculationIssue[] };

export function ok<T>(
  value: T,
  warnings: CalculationIssue[] = [],
): CalcResult<T> {
  return { ok: true, value, warnings };
}

export function fail<T = never>(
  ...issues: CalculationIssue[]
): CalcResult<T> {
  return { ok: false, issues };
}
