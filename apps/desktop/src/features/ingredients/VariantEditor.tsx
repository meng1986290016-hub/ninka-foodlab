import { useEffect, useMemo, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  IngredientVariant,
  IngredientVariantInput,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import { AllergenEditor } from "../imports/AllergenEditor";
import { SourceAttachmentList } from "../imports/SourceAttachmentList";
import { IngredientDraftNotice } from "./IngredientDraftNotice";
import { NutritionEditor } from "./NutritionEditor";
import { SweetnessEditor } from "./SweetnessEditor";
import { useIngredientDraft } from "./useIngredientDraft";
import { VariantBasicFields } from "./VariantBasicFields";

interface VariantEditorProps {
  api: DesktopApi;
  group: MaterialGroup;
  onCancel: () => void;
  onSaved: (variant: IngredientVariant) => void | Promise<void>;
  variant: IngredientVariant | null;
  initialResearchNotes?: string;
}

function emptyInput(groupId: string): IngredientVariantInput {
  return {
    materialGroupId: groupId,
    supplierId: "",
    modelOrSpecification: "",
    internalCode: null,
    currentPrice: null,
    priceUnit: "kg",
    densityGPerMl: null,
    source: "",
    researchNotes: "",
    nutrition: { basis: "per_100g", values: [] },
    sweetness: null,
    allergens: { contains: [], mayContain: [] },
  };
}

function toInput(
  group: MaterialGroup,
  variant: IngredientVariant | null,
  initialResearchNotes = "",
): IngredientVariantInput {
  if (variant === null) {
    return { ...emptyInput(group.id), researchNotes: initialResearchNotes };
  }
  return {
    id: variant.id,
    materialGroupId: group.id,
    supplierId: variant.supplierId,
    modelOrSpecification: variant.modelOrSpecification,
    internalCode: variant.internalCode,
    currentPrice: variant.currentPrice,
    priceUnit: variant.priceUnit,
    densityGPerMl: variant.densityGPerMl,
    source: variant.source,
    researchNotes: variant.researchNotes,
    nutrition: {
      basis: variant.nutrition.basis,
      values: variant.nutrition.values.map((value) => ({ ...value })),
    },
    sweetness: variant.sweetness ? { ...variant.sweetness } : null,
    allergens: {
      contains: [...variant.allergens.contains],
      mayContain: [...variant.allergens.mayContain],
    },
  };
}

function withDefinitions(
  input: IngredientVariantInput,
  definitions: NutrientDefinition[],
): IngredientVariantInput {
  const values = new Map(
    input.nutrition.values.map((value) => [
      value.nutrientDefinitionId,
      value.value,
    ]),
  );
  const builtInValues = definitions
    .filter((definition) => definition.builtIn)
    .map((definition) => ({
      nutrientDefinitionId: definition.id,
      value: values.get(definition.id) ?? null,
    }));
  const selectedCustomValues = input.nutrition.values.filter((value) =>
    definitions.some(
      (definition) =>
        definition.id === value.nutrientDefinitionId && !definition.builtIn,
    ),
  );
  return {
    ...input,
    nutrition: {
      ...input.nutrition,
      values: [...builtInValues, ...selectedCustomValues],
    },
  };
}

export function VariantEditor({
  api,
  group,
  onCancel,
  onSaved,
  variant,
  initialResearchNotes = "",
}: VariantEditorProps) {
  const [tab, setTab] = useState<"basic" | "nutrition" | "research">("basic");
  const [input, setInput] = useState<IngredientVariantInput>(() =>
    toInput(group, variant, initialResearchNotes),
  );
  const [definitions, setDefinitions] = useState<NutrientDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const draftKey = variant?.id ?? `new:${group.id}`;
  const draftPayload = useMemo(() => ({ input }), [input]);
  const draft = useIngredientDraft(api, draftKey, draftPayload, dirty);

  useEffect(() => {
    setInput(toInput(group, variant, initialResearchNotes));
    setTab("basic");
    setError(null);
    setDirty(false);
  }, [group, initialResearchNotes, variant]);

  useEffect(() => {
    let active = true;
    void api
      .listNutrientDefinitions()
      .then((loaded) => {
        if (!active) return;
        setDefinitions(loaded);
        setInput((current) => withDefinitions(current, loaded));
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "营养成分定义加载失败",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  function addDefinition(definition: NutrientDefinition) {
    setDefinitions((current) => [...current, definition]);
    setDirty(true);
  }

  function updateDefinition(definition: NutrientDefinition) {
    setDefinitions((current) =>
      current.map((item) => (item.id === definition.id ? definition : item)),
    );
  }

  function markDefinitionArchived(definitionId: string, archivedAt: string) {
    setDefinitions((current) =>
      current.map((item) =>
        item.id === definitionId ? { ...item, archivedAt } : item,
      ),
    );
  }

  function changeInput(next: IngredientVariantInput) {
    setInput(next);
    setDirty(true);
  }

  function restoreDraft() {
    const restored = draft.restore();
    if (restored === null) return;
    setInput(
      definitions.length === 0
        ? restored.input
        : withDefinitions(restored.input, definitions),
    );
    setDirty(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.supplierId === "") {
      setTab("basic");
      setError("请选择供应商");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveIngredientVariant(input);
      setDirty(false);
      await draft.discard();
      await onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "供应商版本保存失败");
    } finally {
      setSaving(false);
    }
  }

  const editing = variant !== null;

  return (
    <aside
      aria-label={editing ? "编辑供应商版本" : "新建供应商版本"}
      aria-modal="true"
      className="ingredient-drawer variant-drawer"
      role="dialog"
    >
      <div className="drawer-header">
        <div>
          <h2>{editing ? "编辑供应商版本" : "新建供应商版本"}</h2>
          <p>{group.name}</p>
        </div>
        <button
          aria-label="关闭供应商版本编辑器"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>

      <form className="ingredient-form variant-form" onSubmit={(event) => void handleSubmit(event)}>
        {draft.restorable ? (
          <IngredientDraftNotice
            onDiscard={() => void draft.discard()}
            onRestore={restoreDraft}
          />
        ) : null}

        <div aria-label="供应商版本信息" className="editor-tabs" role="tablist">
          <button
            aria-controls="variant-basic-panel"
            aria-selected={tab === "basic"}
            className={tab === "basic" ? "is-active" : undefined}
            onClick={() => setTab("basic")}
            role="tab"
            type="button"
          >
            基本信息
          </button>
          <button
            aria-controls="variant-nutrition-panel"
            aria-selected={tab === "nutrition"}
            className={tab === "nutrition" ? "is-active" : undefined}
            onClick={() => setTab("nutrition")}
            role="tab"
            type="button"
          >
            营养成分
          </button>
          <button
            aria-controls="variant-research-panel"
            aria-selected={tab === "research"}
            className={tab === "research" ? "is-active" : undefined}
            onClick={() => setTab("research")}
            role="tab"
            type="button"
          >
            研发指标
          </button>
        </div>

        <div
          className="variant-panel"
          hidden={tab !== "basic"}
          id="variant-basic-panel"
          role="tabpanel"
        >
          <VariantBasicFields
            api={api}
            input={input}
            onChange={changeInput}
            variant={variant}
          />
        </div>

        <div
          className="variant-panel"
          hidden={tab !== "nutrition"}
          id="variant-nutrition-panel"
          role="tabpanel"
        >
          <NutritionEditor
            api={api}
            definitions={definitions}
            densityGPerMl={input.densityGPerMl}
            nutrition={input.nutrition}
            onChange={(nutrition) =>
              changeInput({ ...input, nutrition })
            }
            onDefinitionCreated={addDefinition}
            onDefinitionUpdated={updateDefinition}
            onDefinitionArchived={markDefinitionArchived}
          />
          <AllergenEditor
            onChange={(allergens) =>
              changeInput({ ...input, allergens })
            }
            value={input.allergens ?? { contains: [], mayContain: [] }}
          />
          <SourceAttachmentList attachments={variant?.sourceAttachments ?? []} />
        </div>

        <div
          className="variant-panel"
          hidden={tab !== "research"}
          id="variant-research-panel"
          role="tabpanel"
        >
          <NutritionEditor
            api={api}
            category="research"
            definitions={definitions}
            densityGPerMl={input.densityGPerMl}
            nutrition={input.nutrition}
            onChange={(nutrition) => changeInput({ ...input, nutrition })}
            onDefinitionCreated={addDefinition}
            onDefinitionUpdated={updateDefinition}
            onDefinitionArchived={markDefinitionArchived}
            showBasis={false}
          />
          <SweetnessEditor
            densityGPerMl={input.densityGPerMl}
            onChange={(sweetness) => changeInput({ ...input, sweetness })}
            sweetness={input.sweetness ?? null}
          />
        </div>

        {dirty ? (
          <p aria-live="polite" className={`draft-status draft-status--${draft.status}`}>
            {draft.status === "saving"
              ? "正在自动保存草稿…"
              : draft.status === "saved"
                ? "草稿已自动保存"
                : draft.status === "failed"
                  ? "草稿自动保存失败"
                  : "草稿待保存"}
          </p>
        ) : null}

        {error !== null ? (
          <p aria-live="assertive" className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="drawer-actions">
          <button className="button button--secondary" onClick={onCancel} type="button">
            取消
          </button>
          <button className="button button--primary" disabled={saving} type="submit">
            {saving ? "正在保存…" : "保存供应商版本"}
          </button>
        </div>
      </form>
    </aside>
  );
}
