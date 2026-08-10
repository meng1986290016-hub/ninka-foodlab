import type { IngredientImportDraft } from "../../api/import-types";
import { IngredientImportDraftCard } from "./IngredientImportDraftCard";

interface IngredientImportDraftListProps {
  drafts: IngredientImportDraft[];
  busy: boolean;
  unassignedAttachmentCount?: number;
  onOpen(draft: IngredientImportDraft): void;
  onRetry(draft: IngredientImportDraft): void;
  onDiscard(draft: IngredientImportDraft): void;
  onOpenImported(draft: IngredientImportDraft): void;
}

export function IngredientImportDraftList({
  drafts,
  busy,
  onOpen,
  onRetry,
  onDiscard,
  onOpenImported,
  unassignedAttachmentCount = 0,
}: IngredientImportDraftListProps) {
  if (drafts.length === 0) return null;

  return (
    <section className="agent-draft-section" aria-label="原料导入草稿">
      <div className="agent-draft-section__heading">
        <div>
          <strong>待复核原料</strong>
          <span>{drafts.length} 张草稿</span>
        </div>
      </div>
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
            onDiscard={() => onDiscard(draft)}
            onOpen={() => onOpen(draft)}
            onOpenImported={() => onOpenImported(draft)}
            onRetry={() => onRetry(draft)}
          />
        ))}
      </div>
    </section>
  );
}
