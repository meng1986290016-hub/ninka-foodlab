import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  IngredientImportDraft,
  ReviewedIngredientImportDraft,
} from "../../api/import-types";
import type {
  Category,
  IngredientVariant,
  IngredientVariantInput,
  NutrientDefinition,
  Supplier,
  VariantNutrition,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import { AllergenEditor } from "../imports/AllergenEditor";
import { ImportIssueList } from "../imports/ImportIssueList";
import { DraftSourceEvidence } from "../imports/DraftSourceEvidence";
import { SourceAttachmentList } from "../imports/SourceAttachmentList";
import { NutritionEditor } from "./NutritionEditor";
import { VariantBasicFields } from "./VariantBasicFields";

interface ImportedVariantReviewProps {
  api: DesktopApi;
  draft: IngredientImportDraft;
  queuePosition?: number;
  queueTotal?: number;
  onCancel(): void;
  onSaved(variant: IngredientVariant): void | Promise<void>;
  onSavedAndNext?(variant: IngredientVariant): void | Promise<void>;
}

function cloneReview(
  review: ReviewedIngredientImportDraft,
): ReviewedIngredientImportDraft {
  return {
    ...review,
    nutrients: review.nutrients.map((nutrient) => ({ ...nutrient })),
    containsAllergens: [...review.containsAllergens],
    mayContainAllergens: [...review.mayContainAllergens],
  };
}

export function ImportedVariantReview({
  api,
  draft,
  queuePosition = 1,
  queueTotal = 1,
  onCancel,
  onSaved,
  onSavedAndNext,
}: ImportedVariantReviewProps) {
  const [tab, setTab] = useState<"basic" | "nutrition">("basic");
  const [review, setReview] = useState(() => cloneReview(draft.review));
  const [definitions, setDefinitions] = useState<NutrientDefinition[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReview(cloneReview(draft.review));
    setTab("basic");
    setError("");
  }, [draft]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listNutrientDefinitions(),
      api.listSuppliers(),
      api.listCategories(),
    ])
      .then(([nextDefinitions, nextSuppliers, nextCategories]) => {
        if (!active) return;
        setDefinitions(nextDefinitions);
        setSuppliers(nextSuppliers);
        setCategories(nextCategories);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "复核表单加载失败",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  const variantInput = useMemo<IngredientVariantInput>(() => {
    const values = new Map(
      review.nutrients
        .filter((nutrient) => nutrient.definitionId !== null)
        .map((nutrient) => [nutrient.definitionId!, nutrient.value]),
    );
    return {
      materialGroupId: review.materialGroupId ?? "",
      supplierId: review.supplierId ?? "",
      modelOrSpecification: review.modelOrSpecification,
      internalCode: null,
      currentPrice: review.currentPrice,
      priceUnit: review.priceUnit ?? "kg",
      densityGPerMl: review.densityGPerMl,
      source: review.source,
      researchNotes: review.researchNotes,
      nutrition: {
        basis: review.nutritionBasis ?? "per_100g",
        values: definitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: values.get(definition.id) ?? null,
        })),
      },
      allergens: {
        contains: [...review.containsAllergens],
        mayContain: [...review.mayContainAllergens],
      },
    };
  }, [definitions, review]);

  function update<K extends keyof ReviewedIngredientImportDraft>(
    key: K,
    value: ReviewedIngredientImportDraft[K],
  ) {
    setReview((current) => ({ ...current, [key]: value }));
  }

  function updateBasic(input: IngredientVariantInput) {
    const supplier =
      suppliers.find((candidate) => candidate.id === input.supplierId) ?? null;
    setReview((current) => ({
      ...current,
      supplierId: input.supplierId || null,
      supplierName: supplier?.name ?? current.supplierName,
      modelOrSpecification: input.modelOrSpecification,
      currentPrice: input.currentPrice,
      priceUnit: input.priceUnit,
      densityGPerMl: input.densityGPerMl,
      source: input.source,
      researchNotes: input.researchNotes,
    }));
  }

  function updateNutrition(nutrition: VariantNutrition) {
    const nextValues = new Map(
      nutrition.values.map((value) => [
        value.nutrientDefinitionId,
        value.value,
      ]),
    );
    setReview((current) => {
      const existingIds = new Set(
        current.nutrients
          .map((nutrient) => nutrient.definitionId)
          .filter((id): id is string => id !== null),
      );
      const updated = current.nutrients.map((nutrient) =>
        nutrient.definitionId
          ? {
              ...nutrient,
              value: nextValues.get(nutrient.definitionId) ?? null,
            }
          : nutrient,
      );
      for (const definition of definitions) {
        if (!existingIds.has(definition.id)) {
          updated.push({
            definitionId: definition.id,
            name: definition.name,
            unit: definition.unit,
            value: nextValues.get(definition.id) ?? null,
          });
        }
      }
      return {
        ...current,
        nutritionBasis: nutrition.basis,
        nutrients: updated,
      };
    });
  }

  async function saveReview(continueToNext: boolean) {
    setSaving(true);
    setError("");
    try {
      const saved = await api.commitReviewedIngredientImportDraft(
        draft.id,
        review,
      );
      if (continueToNext && onSavedAndNext) {
        await onSavedAndNext(saved);
      } else {
        await onSaved(saved);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "原料草稿保存失败",
      );
    } finally {
      setSaving(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveReview(false);
  }

  const customNutrients = review.nutrients.filter(
    (nutrient) => nutrient.definitionId === null,
  );

  return (
    <aside
      aria-label="人工复核原料草稿"
      aria-modal="true"
      className="imported-review"
      role="dialog"
    >
      <header className="drawer-header">
        <div>
          <h2>人工复核原料草稿</h2>
          <p>确认后才会正式保存到原料库</p>
        </div>
        {queueTotal > 1 ? (
          <span className="imported-review__progress">
            第 {queuePosition} / {queueTotal} 张
          </span>
        ) : null}
        <button
          aria-label="关闭原料草稿复核"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          <Icon name="close" />
        </button>
      </header>

      <form
        className="ingredient-form imported-review__form"
        onSubmit={(event) => void save(event)}
      >
        <ImportIssueList issues={draft.issues} />
        <SourceAttachmentList attachments={draft.attachments} />
        <DraftSourceEvidence draft={draft} />

        <div aria-label="原料草稿信息" className="editor-tabs" role="tablist">
          <button
            aria-selected={tab === "basic"}
            className={tab === "basic" ? "is-active" : undefined}
            onClick={() => setTab("basic")}
            role="tab"
            type="button"
          >
            基本信息
          </button>
          <button
            aria-selected={tab === "nutrition"}
            className={tab === "nutrition" ? "is-active" : undefined}
            onClick={() => setTab("nutrition")}
            role="tab"
            type="button"
          >
            营养与过敏原
          </button>
        </div>

        <div className="variant-panel" hidden={tab !== "basic"} role="tabpanel">
          <div className="variant-fields">
            <label className="field field--full">
              <span>通用原料名称</span>
              <input
                onChange={(event) => update("materialName", event.target.value)}
                value={review.materialName}
              />
            </label>
            <label className="field field--full">
              <span>分类</span>
              <input
                list="imported-review-categories"
                onChange={(event) => {
                  const categoryName = event.target.value;
                  const category =
                    categories.find(
                      (candidate) => candidate.name === categoryName,
                    ) ??
                    null;
                  setReview((current) => ({
                    ...current,
                    categoryId: category?.id ?? null,
                    categoryName: categoryName || null,
                  }));
                }}
                value={review.categoryName ?? ""}
              />
              <datalist id="imported-review-categories">
                {categories.map((category) => (
                  <option key={category.id} value={category.name} />
                ))}
              </datalist>
            </label>
            <label className="field field--full">
              <span>供应商名称（新建或修正）</span>
              <input
                onChange={(event) => {
                  setReview((current) => ({
                    ...current,
                    supplierId: null,
                    supplierName: event.target.value,
                  }));
                }}
                value={review.supplierName}
              />
            </label>
          </div>
          <VariantBasicFields
            allowReferenceCreation={false}
            api={api}
            input={variantInput}
            onChange={updateBasic}
            showInternalCode={false}
            variant={null}
          />
        </div>

        <div className="variant-panel" hidden={tab !== "nutrition"} role="tabpanel">
          <NutritionEditor
            allowCustomDefinition={false}
            api={api}
            definitions={definitions}
            densityGPerMl={review.densityGPerMl}
            nutrition={variantInput.nutrition}
            onChange={updateNutrition}
            onDefinitionCreated={() => {}}
          />
          {customNutrients.length > 0 ? (
            <div className="import-nutrient-grid field--full">
              <h4>资料中的自定义成分</h4>
              {customNutrients.map((nutrient, index) => (
                <label
                  className="field"
                  key={`${nutrient.name}-${nutrient.unit}-${index}`}
                >
                  <span>
                    {nutrient.name}（{nutrient.unit}）
                  </span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => {
                      const nutrients = review.nutrients.map((candidate) =>
                        candidate === nutrient
                          ? {
                              ...candidate,
                              value: event.target.value || null,
                            }
                          : candidate,
                      );
                      update("nutrients", nutrients);
                    }}
                    value={nutrient.value ?? ""}
                  />
                </label>
              ))}
              <p className="data-helper">
                保存时会一并创建这些营养成分定义，请确认名称和单位。
              </p>
            </div>
          ) : null}
          <AllergenEditor
            onChange={(allergens) =>
              setReview((current) => ({
                ...current,
                containsAllergens: allergens.contains,
                mayContainAllergens: allergens.mayContain,
              }))
            }
            value={{
              contains: review.containsAllergens,
              mayContain: review.mayContainAllergens,
            }}
          />
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="drawer-actions">
          <button
            className="button button--secondary"
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={
              onSavedAndNext
                ? "button button--secondary"
                : "button button--primary"
            }
            disabled={saving}
            type="submit"
          >
            {saving
              ? "正在保存…"
              : onSavedAndNext
                ? "仅保存并关闭"
                : "保存供应商版本"}
          </button>
          {onSavedAndNext ? (
            <button
              className="button button--primary imported-review__next-button"
              disabled={saving}
              onClick={() => void saveReview(true)}
              type="button"
            >
              {saving ? "正在保存…" : "保存并复核下一张"}
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
