import { useState } from "react";

import type { IngredientImportDraft } from "../../api/import-types";
import { IngredientImportDraftCard } from "./IngredientImportDraftCard";

interface IngredientImportDraftListProps {
  drafts: IngredientImportDraft[];
  busy: boolean;
  unassignedAttachmentCount?: number;
  onOpen(draft: IngredientImportDraft): void;
  onRetry(draft: IngredientImportDraft): void;
  onMerge(source: IngredientImportDraft, target: IngredientImportDraft): void;
  onSplit(draft: IngredientImportDraft): void;
  onDiscard(draft: IngredientImportDraft): void;
  onOpenImported(draft: IngredientImportDraft): void;
}

export function IngredientImportDraftList({
  drafts,
  busy,
  onOpen,
  onRetry,
  onMerge,
  onSplit,
  onDiscard,
  onOpenImported,
  unassignedAttachmentCount = 0,
}: IngredientImportDraftListProps) {
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  if (drafts.length === 0) return null;
  const mergeSource = drafts.find((draft) => draft.id === mergeSourceId) ?? null;

  return (
    <section className="agent-draft-section" aria-label="原料导入草稿">
      <div className="agent-draft-section__heading">
        <div>
          <strong>待复核原料</strong>
          <span>{drafts.length} 张草稿</span>
        </div>
        {mergeSource ? (
          <button onClick={() => setMergeSourceId(null)} type="button">
            取消合并
          </button>
        ) : null}
      </div>
      {mergeSource ? (
        <p className="agent-merge-hint">
          已选择“{mergeSource.review.materialName || "未命名原料"}”，请选择要合并到的草稿。
        </p>
      ) : null}
      {unassignedAttachmentCount > 0 ? (
        <p className="agent-unassigned-warning" role="status">
          还有 {unassignedAttachmentCount} 份资料未归入任何草稿，请重新识别或人工检查。
        </p>
      ) : null}
      <div className="agent-draft-list">
        {drafts.map((draft) => (
          <IngredientImportDraftCard
            busy={busy}
            draft={draft}
            key={draft.id}
            mergeSource={draft.id === mergeSourceId}
            mergeTarget={Boolean(
              mergeSource &&
                mergeSource.id !== draft.id &&
                draft.status !== "imported" &&
                draft.status !== "discarded",
            )}
            onDiscard={() => onDiscard(draft)}
            onMergeHere={() => {
              if (!mergeSource) return;
              onMerge(mergeSource, draft);
              setMergeSourceId(null);
            }}
            onOpen={() => onOpen(draft)}
            onOpenImported={() => onOpenImported(draft)}
            onRetry={() => onRetry(draft)}
            onSplit={() => onSplit(draft)}
            onStartMerge={() =>
              setMergeSourceId((current) =>
                current === draft.id ? null : draft.id,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
