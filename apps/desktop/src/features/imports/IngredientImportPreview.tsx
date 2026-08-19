import type {
  IngredientImportDraft,
  ReviewedIngredientImportDraft,
} from "../../api/import-types";
import type { NutritionBasis, PriceUnit } from "../../api/types";
import { AllergenEditor } from "./AllergenEditor";
import { ImportIssueList } from "./ImportIssueList";
import { SourceAttachmentList } from "./SourceAttachmentList";

interface IngredientImportPreviewProps {
  drafts: IngredientImportDraft[];
  onChange: (id: string, review: ReviewedIngredientImportDraft) => void;
  onDiscard: (id: string) => void;
}

const statusText: Record<IngredientImportDraft["status"], string> = {
  needs_review: "需复核",
  ready: "可导入",
  imported: "已导入",
  discarded: "已忽略",
  failed: "处理失败",
};

export function IngredientImportPreview({
  drafts,
  onChange,
  onDiscard,
}: IngredientImportPreviewProps) {
  if (drafts.length === 0) return null;
  return (
    <div className="import-preview-list">
      {drafts.map((draft, index) => {
        const review = draft.review;
        const update = <K extends keyof ReviewedIngredientImportDraft>(
          key: K,
          value: ReviewedIngredientImportDraft[K],
        ) => onChange(draft.id, { ...review, [key]: value });
        return (
          <details
            className={`import-preview-card is-${draft.status}`}
            key={draft.id}
            open={drafts.length === 1 || draft.status === "needs_review"}
          >
            <summary>
              <span className="import-row-index">{index + 1}</span>
              <span>
                <strong>{review.materialName || "未命名原料"}</strong>
                <small>{review.supplierName || "未填供应商"} · {review.modelOrSpecification || "无型号"}</small>
              </span>
              <span className="import-card-meta">
                <em>{statusText[draft.status]}</em>
                {draft.issues.length > 0 ? <small>{draft.issues.length} 个问题</small> : null}
              </span>
            </summary>

            <div className="import-preview-fields">
              <ImportIssueList issues={draft.issues} />
              <SourceAttachmentList attachments={draft.attachments} />

              <label className="field">
                <span>原料名称</span>
                <input
                  onChange={(event) => update("materialName", event.target.value)}
                  value={review.materialName}
                />
              </label>
              <label className="field">
                <span>分类</span>
                <input
                  onChange={(event) => update("categoryName", event.target.value || null)}
                  value={review.categoryName ?? ""}
                />
              </label>
              <label className="field">
                <span>供应商</span>
                <input
                  onChange={(event) => update("supplierName", event.target.value)}
                  value={review.supplierName}
                />
              </label>
              <label className="field">
                <span>型号/规格</span>
                <input
                  onChange={(event) => update("modelOrSpecification", event.target.value)}
                  value={review.modelOrSpecification}
                />
              </label>
              <label className="field">
                <span>当前含税价</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => update("currentPrice", event.target.value || null)}
                  value={review.currentPrice ?? ""}
                />
              </label>
              <label className="field">
                <span>价格单位</span>
                <select
                  onChange={(event) =>
                    update("priceUnit", event.target.value === "" ? null : event.target.value as PriceUnit)
                  }
                  value={review.priceUnit ?? ""}
                >
                  <option value="">请选择</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="mL">mL</option>
                </select>
              </label>
              <label className="field">
                <span>密度（g/mL，可选）</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => update("densityGPerMl", event.target.value || null)}
                  value={review.densityGPerMl ?? ""}
                />
              </label>
              <label className="field">
                <span>营养数据基准</span>
                <select
                  onChange={(event) =>
                    update("nutritionBasis", event.target.value === "" ? null : event.target.value as NutritionBasis)
                  }
                  value={review.nutritionBasis ?? ""}
                >
                  <option value="">请选择</option>
                  <option value="per_100g">每 100 g</option>
                  <option value="per_100ml">每 100 mL</option>
                </select>
              </label>

              <div className="import-nutrient-grid field--full">
                <h4>营养成分</h4>
                {review.nutrients.map((nutrient, nutrientIndex) => (
                  <div className="import-custom-nutrient" key={`${nutrient.name}-${nutrient.unit}-${nutrientIndex}`}>
                    <label className="field">
                      <span>{nutrient.name}（{nutrient.unit}）</span>
                      <input
                        aria-label={`${nutrient.name}（${nutrient.unit}）`}
                        inputMode="decimal"
                        onChange={(event) => {
                          const nutrients = review.nutrients.map((candidate, candidateIndex) =>
                            candidateIndex === nutrientIndex
                              ? { ...candidate, value: event.target.value === "" ? null : event.target.value }
                              : candidate,
                          );
                          update("nutrients", nutrients);
                        }}
                        placeholder="未知"
                        value={nutrient.value ?? ""}
                      />
                    </label>
                    {nutrient.definitionId === null ? (
                      <label className="field">
                        <span>分类</span>
                        <select
                          aria-label={`${nutrient.name}分类`}
                          onChange={(event) => {
                            const nutrients = review.nutrients.map((candidate, candidateIndex) =>
                              candidateIndex === nutrientIndex
                                ? {
                                    ...candidate,
                                    category: event.target.value === ""
                                      ? null
                                      : event.target.value as "nutrition" | "research",
                                  }
                                : candidate,
                            );
                            update("nutrients", nutrients);
                          }}
                          value={nutrient.category ?? ""}
                        >
                          <option value="">请选择分类</option>
                          <option value="nutrition">营养相关</option>
                          <option value="research">研发指标</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                ))}
                <p className="data-helper">留空表示未知；输入 0 表示已确认为 0。</p>
              </div>


              <AllergenEditor
                onChange={(allergens) => {
                  onChange(draft.id, {
                    ...review,
                    containsAllergens: allergens.contains,
                    mayContainAllergens: allergens.mayContain,
                  });
                }}
                value={{
                  contains: review.containsAllergens,
                  mayContain: review.mayContainAllergens,
                }}
              />
              <label className="import-duplicate-confirm field--full">
                <input
                  checked={review.duplicateConfirmed}
                  onChange={(event) => update("duplicateConfirmed", event.target.checked)}
                  type="checkbox"
                />
                <span>如果与已有供应商和型号重复，仍确认导入</span>
              </label>
              <label className="field field--full">
                <span>数据来源</span>
                <input
                  onChange={(event) => update("source", event.target.value)}
                  value={review.source}
                />
              </label>
              <label className="field field--full">
                <span>研发备注</span>
                <textarea
                  onChange={(event) => update("researchNotes", event.target.value)}
                  rows={3}
                  value={review.researchNotes}
                />
              </label>
              {draft.status !== "discarded" && draft.status !== "imported" ? (
                <button
                  className="text-button import-discard-button"
                  onClick={() => onDiscard(draft.id)}
                  type="button"
                >
                  忽略这一条
                </button>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}
