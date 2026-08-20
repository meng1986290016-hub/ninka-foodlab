import { useMemo, useState } from "react";

import type {
  AgentRecipeEstimateCard,
  RndReferenceCard,
} from "../../api/rnd-reference-types";
import type { RecipeAgentWorkbenchContext } from "../recipes/recipe-agent-analysis";

interface AgentRecipeEstimateCardListProps {
  cards: AgentRecipeEstimateCard[];
  context: RecipeAgentWorkbenchContext | null;
  references: RndReferenceCard[];
  onOpenReferences(ids: string[]): void;
}

export function AgentRecipeEstimateCardList({
  cards,
  context,
  references,
  onOpenReferences,
}: AgentRecipeEstimateCardListProps) {
  const referenceById = useMemo(
    () => new Map(references.map((card) => [card.id, card])),
    [references],
  );
  const [previewCard, setPreviewCard] =
    useState<AgentRecipeEstimateCard | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (cards.length === 0) return null;

  function openPreview(card: AgentRecipeEstimateCard) {
    setNotice("");
    setError("");
    setPreviewCard(card);
    setPreviewText(card.notePreview);
  }

  async function appendPreview() {
    if (!previewCard || !context || previewText.trim() === "") return;
    setSaving(true);
    setError("");
    try {
      await context.appendResearchNotes(
        previewCard.sourceDraftUpdatedAt,
        previewText,
      );
      setPreviewCard(null);
      setPreviewText("");
      setNotice("已追加到当前配方的研发备注");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "研发备注未修改，请重新打开估算卡",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="agent-estimate-list" aria-label="当前配方参考估算">
      {cards.map((card) => {
        const cited = card.citedReferenceCardIds.flatMap((id) => {
          const reference = referenceById.get(id);
          return reference ? [reference] : [];
        });
        const referenceIds = [
          ...card.citedReferenceCardIds,
          ...(card.conflict?.alternativeReferenceCardIds ?? []),
        ];
        const currentRecipe = context?.recipe.id === card.recipeId;
        const status =
          card.status === "stale" ||
          (currentRecipe &&
            context !== null &&
            card.sourceDraftFingerprint !== context.draftFingerprint)
            ? "stale"
            : card.status;
        const canAppend =
          status === "ready" &&
          currentRecipe &&
          context !== null &&
          !context.readOnly;
        return (
          <article
            className={`agent-estimate-card is-${status}`}
            key={card.id}
          >
            <header>
              <div>
                <span>Agent 参考估算</span>
                <strong>{card.title}</strong>
              </div>
              <em>{estimateStatusLabel(status)}</em>
            </header>

            {status === "ready" ? (
              <>
                <div className="agent-estimate-card__value">
                  <div>
                    <span>当前中心估计</span>
                    <strong>{card.estimatedValue}</strong>
                    <small>g 蔗糖当量 / 100 g</small>
                  </div>
                  <div>
                    <span>可能区间</span>
                    <strong>
                      {card.minimumValue}–{card.maximumValue}
                    </strong>
                    <small>{basisLabel(card.basis)}</small>
                  </div>
                </div>
                <dl className="agent-estimate-card__details">
                  <div>
                    <dt>置信度</dt>
                    <dd>{confidenceLabel(card.confidence)}</dd>
                  </div>
                  <div>
                    <dt>使用的配方数据</dt>
                    <dd>
                      {card.formulaInputs.map((input) => (
                        <span key={`${input.label}:${input.amount}:${input.unit}`}>
                          {input.label} {input.amount} {input.unit}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>简要推算</dt>
                    <dd>{card.calculationSummary}</dd>
                  </div>
                  {card.assumptions.length > 0 ? (
                    <div>
                      <dt>具体假设</dt>
                      <dd>{card.assumptions.join("；")}</dd>
                    </div>
                  ) : null}
                  {card.influencingFactors.length > 0 ? (
                    <div>
                      <dt>影响因素</dt>
                      <dd>{card.influencingFactors.join("；")}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>引用参考卡</dt>
                    <dd>
                      {cited.length > 0
                        ? cited.map((reference) => reference.title).join("、")
                        : card.citedReferenceCardIds.join("、")}
                    </dd>
                  </div>
                </dl>
                {card.conflict ? (
                  <p className="agent-estimate-card__conflict">
                    <strong>存在其他来源范围：</strong>
                    {card.conflict.rationale}
                  </p>
                ) : null}
              </>
            ) : status === "needs_input" ? (
              <div className="agent-estimate-card__missing">
                <strong>需要补充信息</strong>
                <p>缺少关键条件，因此本次不提供中心值：</p>
                <ul>
                  {card.missingInputs.map((input) => (
                    <li key={input}>{input}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="agent-estimate-card__stale">
                配方草稿已变化，这张卡不能再加入研发备注。请基于当前草稿重新估算。
              </p>
            )}

            <footer>
              <button
                disabled={referenceIds.length === 0}
                onClick={() => onOpenReferences(referenceIds)}
                type="button"
              >
                查看参考卡
              </button>
              {status === "ready" ? (
                <button
                  className="is-primary"
                  disabled={!canAppend}
                  onClick={() => openPreview(card)}
                  title={
                    canAppend
                      ? undefined
                      : currentRecipe
                        ? "当前配方为只读状态"
                        : "请先打开这张卡对应的配方"
                  }
                  type="button"
                >
                  加入研发备注
                </button>
              ) : null}
            </footer>
          </article>
        );
      })}
      {notice ? <p className="agent-estimate-list__notice" role="status">{notice}</p> : null}
      {error && !previewCard ? <p className="agent-estimate-list__error" role="alert">{error}</p> : null}

      {previewCard ? (
        <div className="agent-estimate-preview" role="presentation">
          <section aria-label="追加研发备注预览" aria-modal="true" role="dialog">
            <header>
              <div>
                <span>写入前确认</span>
                <strong>研发备注预览</strong>
              </div>
              <button
                aria-label="关闭研发备注预览"
                disabled={saving}
                onClick={() => setPreviewCard(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <p>你可以编辑下面的内容；确认后只会追加，不会覆盖现有备注。</p>
            <textarea
              aria-label="待追加的研发备注"
              onChange={(event) => setPreviewText(event.target.value)}
              rows={12}
              value={previewText}
            />
            {error ? <p role="alert">{error}</p> : null}
            <footer>
              <button
                disabled={saving}
                onClick={() => setPreviewCard(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="is-primary"
                disabled={saving || previewText.trim() === ""}
                onClick={() => void appendPreview()}
                type="button"
              >
                {saving ? "正在追加…" : "确认追加"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function estimateStatusLabel(status: AgentRecipeEstimateCard["status"]) {
  if (status === "ready") return "可参考";
  if (status === "needs_input") return "需要补充";
  return "已失效";
}

function confidenceLabel(confidence: AgentRecipeEstimateCard["confidence"]) {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  return "低";
}

function basisLabel(basis: AgentRecipeEstimateCard["basis"]) {
  return basis === "finished_product_100g"
    ? "按实际出成每 100 g"
    : "按实际投料每 100 g";
}
