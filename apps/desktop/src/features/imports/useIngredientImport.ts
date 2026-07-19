import { useRef, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  ImportFileReference,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "../../api/import-types";

export function useIngredientImport(api: DesktopApi) {
  const [job, setJob] = useState<IngredientImportJob | null>(null);
  const [drafts, setDrafts] = useState<IngredientImportDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRevision = useRef(0);
  const latestRevisionByDraft = useRef(new Map<string, number>());

  async function start(
    files: ImportFileReference[],
    sourceKind: IngredientImportJobRequest["sourceKind"],
  ) {
    latestRevisionByDraft.current.clear();
    setLoading(true);
    setError(null);
    try {
      const created = await api.createIngredientImportJob({ files, sourceKind });
      setJob(created);
      const loaded = created.status === "drafts_ready" || created.status === "partially_completed"
        ? await api.listIngredientImportDrafts(created.id)
        : [];
      setDrafts(loaded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "原料资料无法导入");
    } finally {
      setLoading(false);
    }
  }

  async function updateDraft(id: string, review: ReviewedIngredientImportDraft) {
    const revision = ++nextRevision.current;
    latestRevisionByDraft.current.set(id, revision);
    setDrafts((current) =>
      current.map((draft) => draft.id === id ? { ...draft, review } : draft),
    );
    setError(null);
    try {
      const updated = await api.updateIngredientImportDraft(id, review);
      if (latestRevisionByDraft.current.get(id) !== revision) return;
      setDrafts((current) =>
        current.map((draft) => draft.id === id ? updated : draft),
      );
    } catch (cause) {
      if (latestRevisionByDraft.current.get(id) !== revision) return;
      setError(cause instanceof Error ? cause.message : "导入草稿无法更新");
    }
  }

  async function discardDraft(id: string) {
    latestRevisionByDraft.current.set(id, ++nextRevision.current);
    setError(null);
    try {
      await api.discardIngredientImportDraft(id);
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === id ? { ...draft, status: "discarded" } : draft,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入草稿无法忽略");
    }
  }

  async function commit(): Promise<IngredientImportCommitResult | null> {
    if (job === null) return null;
    for (const draft of drafts) {
      latestRevisionByDraft.current.set(draft.id, ++nextRevision.current);
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.commitIngredientImportJob(job.id);
      const loaded = await api.listIngredientImportDrafts(job.id).catch(() => drafts);
      setDrafts(loaded);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "原料资料无法保存");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { job, drafts, loading, error, start, updateDraft, discardDraft, commit };
}
