import type { IngredientImportDraft } from "../../api/import-types";

interface IngredientImportDraftCardProps {
  draft: IngredientImportDraft;
  busy: boolean;
  onOpen(): void;
  onRetry(): void;
  onDiscard(): void;
  onOpenImported(): void;
}

const statusText: Record<IngredientImportDraft["status"], string> = {
  needs_review: "待人工复核",
  ready: "可保存",
  imported: "已保存到原料库",
  discarded: "已放弃",
  failed: "识别失败",
};

function missingFields(draft: IngredientImportDraft) {
  const review = draft.review;
  return [
    !review.materialName.trim() ? "原料名称" : null,
    !review.supplierName.trim() ? "供应商" : null,
    !review.nutritionBasis ? "营养基准" : null,
    !review.priceUnit && review.currentPrice ? "价格单位" : null,
  ].filter((field): field is string => field !== null);
}

export function IngredientImportDraftCard({
  draft,
  busy,
  onOpen,
  onRetry,
  onDiscard,
  onOpenImported,
}: IngredientImportDraftCardProps) {
  const missing = missingFields(draft);
  const nutrientCount = draft.review.nutrients.filter(
    (nutrient) => nutrient.value !== null,
  ).length;
  const sourceNames = [
    ...new Set(draft.attachments.map((attachment) => attachment.originalName)),
  ];
  const inactive =
    draft.status === "discarded" || draft.status === "imported";

  return (
    <article
      className={[
        "agent-draft-card",
        `is-${draft.status}`,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header>
        <span>{statusText[draft.status]}</span>
        {draft.issues.length > 0 ? (
          <small>{draft.issues.length} 个待处理问题</small>
        ) : null}
      </header>
      <h4>{draft.review.materialName || "未识别原料名称"}</h4>
      <p>
        {draft.review.supplierName || "未识别供应商"}
        {draft.review.modelOrSpecification
          ? ` · ${draft.review.modelOrSpecification}`
          : ""}
      </p>
      <div className="agent-draft-card__facts">
        <span>营养项目 {nutrientCount}</span>
        <span>
          {missing.length > 0 ? `缺少：${missing.join("、")}` : "必填信息齐全"}
        </span>
      </div>
      {sourceNames.length > 0 ? (
        <small className="agent-draft-card__sources">
          来源：{sourceNames.join("、")}
        </small>
      ) : null}

      <div className="agent-draft-card__actions">
        {draft.status === "imported" ? (
          <button onClick={onOpenImported} type="button">
            在原料库查看
          </button>
        ) : !inactive ? (
          <>
            <button
              className="is-primary"
              disabled={busy}
              onClick={onOpen}
              type="button"
            >
              打开并检查
            </button>
            <button disabled={busy} onClick={onRetry} type="button">
              重新识别
            </button>
            <button
              className="is-danger"
              disabled={busy}
              onClick={onDiscard}
              type="button"
            >
              放弃
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
