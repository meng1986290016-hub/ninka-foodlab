import type { ImportIssue } from "../../api/import-types";

interface ImportIssueListProps {
  issues: ImportIssue[];
}

export function ImportIssueList({ issues }: ImportIssueListProps) {
  if (issues.length === 0) return null;
  return (
    <ul className="import-issue-list" aria-label="需复核问题">
      {issues.map((issue, index) => {
        const locator = [
          issue.row === null ? null : `第 ${issue.row} 行`,
          issue.column,
        ].filter(Boolean).join(" · ");
        return (
          <li className={`is-${issue.severity}`} key={`${issue.code}-${index}`}>
            {locator ? <strong>{locator}</strong> : null}
            <span>{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
