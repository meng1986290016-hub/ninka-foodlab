import { useEffect, useMemo, useState } from "react";

import type {
  DraftSourceLink,
  ImportFieldConfidence,
  IngredientImportDraft,
  SourceAttachment,
} from "../../api/import-types";
import { Icon } from "../../components/Icon";

interface DraftSourceEvidenceProps {
  draft: IngredientImportDraft;
}

interface SourceGroup {
  fieldPath: string;
  links: DraftSourceLink[];
  confidence: ImportFieldConfidence | null;
}

const confidenceRank: Record<ImportFieldConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const fieldLabels: Record<string, string> = {
  materialName: "通用原料名称",
  categoryName: "分类",
  supplierName: "供应商名称",
  modelOrSpecification: "型号/规格",
  currentPrice: "当前含税价",
  priceUnit: "价格单位",
  densityGPerMl: "密度",
  nutritionBasis: "营养基准",
  containsAllergens: "含有过敏原",
  mayContainAllergens: "可能含有过敏原",
  source: "数据来源",
  researchNotes: "研发备注",
};

function fieldLabel(fieldPath: string, draft: IngredientImportDraft) {
  if (fieldPath.startsWith("nutrients.")) {
    const nutrientPath = fieldPath.slice("nutrients.".length);
    let nutrientName = nutrientPath.endsWith(".value")
      ? nutrientPath.slice(0, -".value".length)
      : nutrientPath;
    if (/^\d+$/.test(nutrientName)) {
      const position = Number(nutrientName);
      nutrientName =
        draft.review.nutrients[position]?.name ?? `第 ${position + 1} 项`;
    }
    if (nutrientName) return `${nutrientName}（营养成分）`;
  }
  return fieldLabels[fieldPath] ?? fieldPath;
}

function groupLinks(links: DraftSourceLink[]) {
  const groups = new Map<string, DraftSourceLink[]>();
  for (const link of links) {
    const existing = groups.get(link.fieldPath) ?? [];
    if (
      !existing.some(
        (candidate) =>
          candidate.attachmentId === link.attachmentId &&
          candidate.sourceLocator === link.sourceLocator,
      )
    ) {
      existing.push(link);
      groups.set(link.fieldPath, existing);
    }
  }
  return [...groups.entries()].map(([fieldPath, grouped]): SourceGroup => {
    const values = grouped.map((link) => link.confidence ?? null);
    const confidence = values.includes(null)
      ? null
      : values.reduce<ImportFieldConfidence | null>((lowest, value) => {
          if (value === null) return lowest;
          if (lowest === null || confidenceRank[value] < confidenceRank[lowest]) {
            return value;
          }
          return lowest;
        }, null);
    return { fieldPath, links: grouped, confidence };
  });
}

function confidenceLabel(value: ImportFieldConfidence | null) {
  if (value === "high") return "高可信";
  if (value === "medium") return "中等可信";
  if (value === "low") return "低可信";
  return "未标注可信度";
}

function sourceText(
  link: DraftSourceLink,
  attachments: Map<string, SourceAttachment>,
) {
  const attachment = attachments.get(link.attachmentId);
  const name = attachment?.originalName ?? "未知来源文件";
  return link.sourceLocator ? `${name} · ${link.sourceLocator}` : name;
}

export function DraftSourceEvidence({ draft }: DraftSourceEvidenceProps) {
  const [expanded, setExpanded] = useState(false);
  const groupedSources = useMemo(
    () => groupLinks(draft.sourceLinks),
    [draft.sourceLinks],
  );
  const attachmentMap = useMemo(
    () => new Map(draft.attachments.map((attachment) => [attachment.id, attachment])),
    [draft.attachments],
  );
  const conflictFields = useMemo(
    () =>
      new Set(
        draft.issues
          .filter((issue) => issue.code === "source_conflict" && issue.fieldPath)
          .map((issue) => issue.fieldPath!),
      ),
    [draft.issues],
  );

  useEffect(() => setExpanded(false), [draft.id]);

  const groups = useMemo(
    () =>
      groupedSources.toSorted((left, right) => {
        const priority = (group: SourceGroup) => {
          if (conflictFields.has(group.fieldPath)) return 0;
          if (group.confidence === "low") return 1;
          if (group.confidence === null) return 2;
          if (group.confidence === "medium") return 3;
          return 4;
        };
        return priority(left) - priority(right);
      }),
    [conflictFields, groupedSources],
  );
  const priorityFieldCount = useMemo(
    () =>
      new Set([
        ...conflictFields,
        ...groups
          .filter(
            (group) =>
              group.confidence === "low" || group.confidence === null,
          )
          .map((group) => group.fieldPath),
      ]).size,
    [conflictFields, groups],
  );
  const visibleGroups = expanded ? groups : groups.slice(0, 6);

  return (
    <section className="draft-source-evidence field--full" aria-label="字段来源依据">
      <header>
        <div>
          <h4>字段来源依据</h4>
          <p>
            {groups.length > 0
              ? `${groups.length} 个字段已关联原始资料`
              : "当前草稿没有字段级来源链接"}
          </p>
        </div>
        {priorityFieldCount > 0 ? (
          <span className="draft-source-evidence__conflict-count">
            <Icon name="warning" size={13} />
            {priorityFieldCount} 项优先复核
          </span>
        ) : null}
      </header>

      {visibleGroups.length > 0 ? (
        <div className="draft-source-evidence__list">
          {visibleGroups.map((group) => {
            const conflict = conflictFields.has(group.fieldPath);
            return (
              <div
                className={`draft-source-evidence__row${conflict ? " is-conflict" : ""}${group.confidence === "low" ? " is-low" : ""}${group.confidence === null ? " is-unknown" : ""}`}
                key={group.fieldPath}
              >
                <div className="draft-source-evidence__field">
                  <strong>{fieldLabel(group.fieldPath, draft)}</strong>
                  <span
                    className={`draft-source-evidence__confidence is-${group.confidence ?? "unknown"}`}
                  >
                    {conflict ? "来源冲突" : confidenceLabel(group.confidence)}
                  </span>
                </div>
                <div className="draft-source-evidence__sources">
                  {group.links.map((link) => (
                    <span
                      key={`${link.attachmentId}:${link.sourceLocator ?? ""}`}
                      title={sourceText(link, attachmentMap)}
                    >
                      {sourceText(link, attachmentMap)}
                    </span>
                  ))}
                </div>
                {conflict ? <small>来源存在冲突，请以原始资料为准</small> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="draft-source-evidence__empty">
          Agent 未返回可定位的字段来源，请逐项对照上方原始文件后再保存。
        </p>
      )}

      {groups.length > 6 ? (
        <button
          className="draft-source-evidence__toggle"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "收起字段来源" : `查看全部 ${groups.length} 个字段来源`}
        </button>
      ) : null}
      <small className="draft-source-evidence__note">
        低可信表示字段包含推断或原文不清晰；来源链接和可信度均不代表字段已经通过人工确认。
      </small>
    </section>
  );
}
