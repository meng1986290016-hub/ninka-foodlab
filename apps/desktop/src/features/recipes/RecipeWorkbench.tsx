import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import Decimal from "decimal.js";
import { toGrams } from "@food-rd/core";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  Recipe,
  RecipeCalculation,
  RecipeCalculationIssue,
  RecipeDraftItem,
  RecipeItemUnit,
  RecipeSummary,
  RecipeVersion,
} from "../../api/recipe-types";
import { recipeSchemeStatus } from "../../api/recipe-types";
import { recipeVersionOutputMass } from "../../api/recipe-output-mass";
import type {
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import {
  DataQualityDrawer,
  type DataQualityDrawerContent,
} from "../data-quality/DataQualityDrawer";
import {
  buildDraftDataGapReport,
  createVariantNutritionDetail,
  createVersionNutritionDetail,
  type DataGapEntry,
} from "../data-quality/data-quality";
import { calculateRecipeDraft } from "./recipe-calculation";
import { RecipeCostEditor } from "./RecipeCostEditor";
import { RecipeHeader } from "./RecipeHeader";
import { RecipeIngredientPicker } from "./RecipeIngredientPicker";
import { RecipeItemTable } from "./RecipeItemTable";
import { RecipeVersionDialog } from "./RecipeVersionDialog";
import {
  prepareRecipeVersion,
  type RecipeVersionPreparation,
  type RecipeVersionValidationIssue,
} from "./recipe-versioning";
import { useRecipeDraft } from "./useRecipeDraft";
import type { SampleSheetLaunch } from "./sample-sheet-source";
import {
  recipeDraftFingerprint,
  type RecipeAgentWorkbenchContext,
} from "./recipe-agent-analysis";

interface RecipeWorkbenchProps {
  api: DesktopApi;
  recipeId?: string | null;
  /** Kept for compatibility with older embedded consumers; creation now lives in the library. */
  onRecipeCreated?(recipeId: string): void;
  onBack?(): void;
  onAgentContextChange?(context: RecipeAgentWorkbenchContext | null): void;
  onOpenAgent?(): void;
  onOpenSampleSheet?(launch: SampleSheetLaunch): void;
  onEditIngredient?(request: RecipeIngredientEditRequest): void;
  onResumeNutritionConsumed?(): void;
  resumeNutritionItemId?: string | null;
}

export interface RecipeIngredientEditRequest {
  recipeId: string;
  itemId: string;
  materialGroupId: string;
  ingredientVariantId: string;
}

type NarrowView = "formula" | "results" | "allergens";
type BatchMassUnit = "g" | "kg";

export function RecipeWorkbench({
  api,
  recipeId,
  onBack,
  onAgentContextChange,
  onOpenAgent,
  onOpenSampleSheet,
  onEditIngredient,
  onResumeNutritionConsumed,
  resumeNutritionItemId,
}: RecipeWorkbenchProps) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecipes(await api.listRecipes());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "配方无法读取",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active =
    recipes.find(
      (summary) =>
        summary.recipe.id === recipeId,
    ) ??
    (recipeId == null
      ? recipes.find(
          (summary) =>
            summary.recipe.kind === "formula" &&
            summary.recipe.archivedAt === null,
        ) ?? recipes.find((summary) => summary.recipe.archivedAt === null) ?? null
      : null);

  if (loading) {
    return (
      <section className="recipe-workbench recipe-workbench--loading">
        <p>正在读取配方工作台…</p>
      </section>
    );
  }
  if (active === null) {
    return (
      <section className="recipe-workbench recipe-workbench--empty">
        <div>
          <Icon name="recipe-workbench" size={32} />
          <h1>配方工作台</h1>
          <p>没有找到要打开的配方，请返回配方库重新选择。</p>
          {error ? (
            <p className="page-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button button--primary" onClick={onBack} type="button">
            返回配方库
          </button>
        </div>
      </section>
    );
  }

  return (
    <RecipeEditorLoader
      api={api}
      key={active.recipe.id}
      onAgentContextChange={onAgentContextChange}
      onBack={onBack}
      onOpenAgent={onOpenAgent}
      onEditIngredient={onEditIngredient}
      onResumeNutritionConsumed={onResumeNutritionConsumed}
      onRecipeUpdated={(recipe) =>
        setRecipes((current) =>
          current.map((summary) =>
            summary.recipe.id === recipe.id
              ? { ...summary, recipe }
              : summary,
          ),
        )
      }
      onOpenSampleSheet={onOpenSampleSheet}
      recipe={active.recipe}
      resumeNutritionItemId={resumeNutritionItemId}
    />
  );
}

interface RecipeEditorLoaderProps {
  api: DesktopApi;
  recipe: Recipe;
  onAgentContextChange: ((context: RecipeAgentWorkbenchContext | null) => void) | undefined;
  onBack: (() => void) | undefined;
  onOpenAgent: (() => void) | undefined;
  onRecipeUpdated(recipe: Recipe): void;
  onOpenSampleSheet: ((launch: SampleSheetLaunch) => void) | undefined;
  onEditIngredient: ((request: RecipeIngredientEditRequest) => void) | undefined;
  onResumeNutritionConsumed: (() => void) | undefined;
  resumeNutritionItemId: string | null | undefined;
}

function RecipeEditorLoader({
  api,
  recipe,
  onAgentContextChange,
  onBack,
  onOpenAgent,
  onRecipeUpdated,
  onOpenSampleSheet,
  onEditIngredient,
  onResumeNutritionConsumed,
  resumeNutritionItemId,
}: RecipeEditorLoaderProps) {
  const [nutrients, setNutrients] = useState<NutrientDefinition[] | null>(
    null,
  );
  const [versions, setVersions] = useState<RecipeVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([
      api.listNutrientDefinitions(),
      api.getRecipeDraft(recipe.id),
    ])
      .then(async ([definitions, draft]) => {
        const versionIds = [
          ...new Set(
            (draft?.items ?? [])
              .filter((item) => item.kind === "recipe_version")
              .map((item) =>
                item.kind === "recipe_version"
                  ? item.recipeVersionId
                  : "",
              ),
          ),
        ].filter(Boolean);
        const loadedVersions = await loadRecipeVersionClosure(
          api,
          versionIds,
        );
        if (!active) return;
        setNutrients(definitions);
        setVersions(loadedVersions);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "配方工作台无法加载",
        );
      });
    return () => {
      active = false;
    };
  }, [api, recipe.id]);

  if (error) {
    return (
      <section className="recipe-workbench recipe-workbench--loading">
        <p className="page-error" role="alert">
          {error}
        </p>
      </section>
    );
  }
  if (nutrients === null || versions === null) {
    return (
      <section className="recipe-workbench recipe-workbench--loading">
        <p>正在准备营养与成本计算…</p>
      </section>
    );
  }
  return (
    <RecipeEditor
      api={api}
      initialVersions={versions}
      nutrientDefinitions={nutrients}
      onAgentContextChange={onAgentContextChange}
      onRecipeUpdated={onRecipeUpdated}
      onBack={onBack}
      onOpenAgent={onOpenAgent}
      onEditIngredient={onEditIngredient}
      onOpenSampleSheet={onOpenSampleSheet}
      onResumeNutritionConsumed={onResumeNutritionConsumed}
      recipe={recipe}
      resumeNutritionItemId={resumeNutritionItemId}
    />
  );
}

interface RecipeEditorProps {
  api: DesktopApi;
  initialVersions: RecipeVersion[];
  nutrientDefinitions: NutrientDefinition[];
  recipe: Recipe;
  onAgentContextChange: ((context: RecipeAgentWorkbenchContext | null) => void) | undefined;
  onBack: (() => void) | undefined;
  onOpenAgent: (() => void) | undefined;
  onRecipeUpdated(recipe: Recipe): void;
  onOpenSampleSheet: ((launch: SampleSheetLaunch) => void) | undefined;
  onEditIngredient: ((request: RecipeIngredientEditRequest) => void) | undefined;
  onResumeNutritionConsumed: (() => void) | undefined;
  resumeNutritionItemId: string | null | undefined;
}

function RecipeEditor({
  api,
  initialVersions,
  nutrientDefinitions,
  recipe,
  onAgentContextChange,
  onBack,
  onOpenAgent,
  onRecipeUpdated,
  onOpenSampleSheet,
  onEditIngredient,
  onResumeNutritionConsumed,
  resumeNutritionItemId,
}: RecipeEditorProps) {
  const [referencedVersions, setReferencedVersions] =
    useState(initialVersions);
  const [recipeName, setRecipeName] = useState(recipe.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorError, setEditorError] =
    useState<string | null>(null);
  const [narrowView, setNarrowView] =
    useState<NarrowView>("formula");
  const [versionUpgrades, setVersionUpgrades] = useState<
    Record<string, RecipeVersion>
  >({});
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionPreparation, setVersionPreparation] =
    useState<RecipeVersionPreparation | null>(null);
  const [versionValidationIssues, setVersionValidationIssues] =
    useState<RecipeVersionValidationIssue[]>([]);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionNotice, setVersionNotice] = useState<string | null>(
    null,
  );
  const [dataDrawer, setDataDrawer] =
    useState<DataQualityDrawerContent | null>(null);
  const [batchMassUnitOverride, setBatchMassUnitOverride] =
    useState<BatchMassUnit | null>(null);
  const calculate = useCallback(
    (draft: Parameters<typeof calculateRecipeDraft>[0]["draft"]) =>
      calculateRecipeDraft({
        draft,
        referencedVersions,
        nutrientDefinitions,
        calculatedAt: new Date().toISOString(),
      }),
    [nutrientDefinitions, referencedVersions],
  );
  const draftState = useRecipeDraft(api, recipe.id, { calculate });
  const { draft, dispatch } = draftState;
  const inactive = recipeSchemeStatus(recipe) === "inactive";
  const dataGapReport = useMemo(
    () =>
      buildDraftDataGapReport({
        draft,
        recipeName,
        calculation: draft.calculation,
        nutrientDefinitions,
        referencedVersions,
      }),
    [draft, nutrientDefinitions, recipeName, referencedVersions],
  );

  const openNutritionDetail = useCallback(
    (item: RecipeDraftItem) => {
      if (item.kind === "ingredient") {
        setDataDrawer({
          kind: "nutrition",
          detail: createVariantNutritionDetail(
            item.materialName,
            item.ingredientVariant,
            nutrientDefinitions,
          ),
        });
        return;
      }
      if (item.kind === "recipe_version") {
        const version = referencedVersions.find(
          (candidate) => candidate.id === item.recipeVersionId,
        );
        if (version !== undefined) {
          setDataDrawer({
            kind: "nutrition",
            detail: createVersionNutritionDetail(version),
          });
        }
      }
    },
    [nutrientDefinitions, referencedVersions],
  );

  useEffect(() => {
    if (resumeNutritionItemId == null || draftState.loading) return;
    const item = draft.items.find((candidate) => candidate.id === resumeNutritionItemId);
    if (item !== undefined) openNutritionDetail(item);
    onResumeNutritionConsumed?.();
  }, [
    draft.items,
    draftState.loading,
    onResumeNutritionConsumed,
    openNutritionDetail,
    resumeNutritionItemId,
  ]);

  const openGapReport = useCallback(
    (nutrientDefinitionId?: string) =>
      setDataDrawer({
        kind: "gaps",
        report: dataGapReport,
        initialGrouping:
          nutrientDefinitionId === undefined ? "source" : "field",
        ...(nutrientDefinitionId === undefined
          ? {}
          : { nutrientDefinitionId }),
      }),
    [dataGapReport],
  );

  const editIngredientFromGap = useCallback(
    async (entry: DataGapEntry) => {
      if (
        inactive ||
        !entry.editable ||
        entry.ingredientVariantId === null ||
        entry.materialGroupId === null ||
        onEditIngredient === undefined
      ) {
        return;
      }
      const itemId = entry.path.at(-1)?.id;
      if (itemId === undefined) return;
      setEditorError(null);
      try {
        await draftState.saveNow();
        onEditIngredient({
          recipeId: recipe.id,
          itemId,
          materialGroupId: entry.materialGroupId,
          ingredientVariantId: entry.ingredientVariantId,
        });
      } catch (cause) {
        setEditorError(
          cause instanceof Error
            ? cause.message
            : "草稿保存失败，暂未打开原料库",
        );
      }
    },
    [draftState, inactive, onEditIngredient, recipe.id],
  );
  const applyIngredientSubstitution = useCallback(
    (
      itemId: string,
      group: MaterialGroup,
      variant: IngredientVariant,
    ) => {
      dispatch({
        type: "set_items",
        items: normalizePositions(
          draft.items.map((item) =>
            item.id === itemId && item.kind === "ingredient"
              ? {
                  ...item,
                  materialName: group.name,
                  ingredientVariantId: variant.id,
                  ingredientVariant: variant,
                }
              : item,
          ),
        ),
      });
      setVersionNotice(
        `已替换为 ${variant.supplierName} · ${variant.modelOrSpecification || "未填写规格"}，草稿将自动保存`,
      );
    },
    [dispatch, draft.items],
  );
  const agentContext = useMemo<RecipeAgentWorkbenchContext>(
    () => ({
      recipe,
      draft,
      referencedVersions,
      nutrientDefinitions,
      readOnly: inactive,
      draftFingerprint: recipeDraftFingerprint(draft),
      applyIngredientSubstitution,
    }),
    [
      applyIngredientSubstitution,
      draft,
      inactive,
      nutrientDefinitions,
      recipe,
      referencedVersions,
    ],
  );

  useEffect(() => {
    onAgentContextChange?.(agentContext);
  }, [agentContext, onAgentContextChange]);

  useEffect(
    () => () => {
      onAgentContextChange?.(null);
    },
    [onAgentContextChange],
  );
  const versionReferenceKey = draft.items
    .flatMap((item) =>
      item.kind === "recipe_version"
        ? [
            `${item.id}:${item.recipeVersion.recipeId}:${item.recipeVersion.versionNumber}`,
          ]
        : [],
    )
    .join("|");

  useEffect(() => {
    let active = true;
    const versionItems = draft.items.filter(
      (item) => item.kind === "recipe_version",
    );
    const recipeIds = [
      ...new Set(
        versionItems.map((item) =>
          item.kind === "recipe_version"
            ? item.recipeVersion.recipeId
            : "",
        ),
      ),
    ].filter(Boolean);
    if (recipeIds.length === 0) {
      setVersionUpgrades({});
      return () => {
        active = false;
      };
    }
    void Promise.all(
      recipeIds.map((recipeId) => api.listRecipeVersions(recipeId)),
    )
      .then((versionLists) => {
        if (!active) return;
        const latestByRecipe = new Map<string, RecipeVersion>();
        for (const version of versionLists.flat()) {
          const current = latestByRecipe.get(version.recipeId);
          if (
            current === undefined ||
            version.versionNumber > current.versionNumber
          ) {
            latestByRecipe.set(version.recipeId, version);
          }
        }
        const upgrades: Record<string, RecipeVersion> = {};
        for (const item of versionItems) {
          if (item.kind !== "recipe_version") continue;
          const latest = latestByRecipe.get(
            item.recipeVersion.recipeId,
          );
          if (
            latest !== undefined &&
            latest.versionNumber > item.recipeVersion.versionNumber
          ) {
            upgrades[item.id] = latest;
          }
        }
        setVersionUpgrades(upgrades);
      })
      .catch(() => {
        if (active) setVersionUpgrades({});
      });
    return () => {
      active = false;
    };
  }, [api, versionReferenceKey]);

  async function commitRecipeName() {
    const name = recipeName.trim();
    if (name === "") {
      setRecipeName(recipe.name);
      return;
    }
    if (name === recipe.name) return;
    try {
      const updated = await api.updateRecipe(recipe.id, {
        name,
        code: recipe.code,
        tags: recipe.tags,
        kind: recipe.kind,
      });
      setRecipeName(updated.name);
      onRecipeUpdated(updated);
    } catch {
      setRecipeName(recipe.name);
    }
  }

  async function changeRecipeKind(kind: Recipe["kind"]) {
    if (kind === recipe.kind) return;
    try {
      const updated = await api.updateRecipe(recipe.id, {
        name: recipeName.trim() || recipe.name,
        code: recipe.code,
        tags: recipe.tags,
        kind,
      });
      setRecipeName(updated.name);
      onRecipeUpdated(updated);
      setVersionNotice(
        kind === "semi_finished"
          ? "已设为半成品；保存正式版本后可加入其他配方"
          : "已设为成品配方",
      );
    } catch (cause) {
      setEditorError(
        cause instanceof Error ? cause.message : "配方类型更新失败",
      );
    }
  }

  async function returnToLibrary() {
    setEditorError(null);
    try {
      await commitRecipeName();
      if (recipeSchemeStatus(recipe) !== "inactive") {
        await draftState.saveNow();
      }
      onBack?.();
    } catch (cause) {
      setEditorError(
        cause instanceof Error ? cause.message : "草稿保存失败，暂未返回配方库",
      );
    }
  }

  function setItems(items: RecipeDraftItem[]) {
    dispatch({
      type: "set_items",
      items: normalizePositions(items),
    });
  }

  function addIngredient(
    group: MaterialGroup,
    variant: IngredientVariant,
  ) {
    setItems([
      ...draft.items,
      {
        id: createItemId(),
        position: draft.items.length,
        kind: "ingredient",
        ingredientVariantId: variant.id,
        materialName: group.name,
        ingredientVariant: variant,
        amount: "0",
        unit: "g",
        locked: false,
        autoFill: false,
      },
    ]);
  }

  async function addVersion(version: RecipeVersion) {
    try {
      const closure = await loadRecipeVersionClosure(api, [version.id]);
      setReferencedVersions((current) =>
        mergeRecipeVersions(current, closure),
      );
      const outputMass = recipeVersionOutputMass(version.snapshot);
      setItems([
        ...draft.items,
        {
          id: createItemId(),
          position: draft.items.length,
          kind: "recipe_version",
          recipeVersionId: version.id,
          recipeVersion: {
            id: version.id,
            recipeId: version.recipeId,
            recipeName: version.snapshot.recipe.name,
            versionNumber: version.versionNumber,
            outputMassGrams: outputMass,
            createdAt: version.createdAt,
          },
          amount: "0",
          unit: "g",
          locked: false,
          autoFill: false,
        },
      ]);
    } catch (cause) {
      setEditorError(
        cause instanceof Error
          ? cause.message
          : "半成品版本无法读取",
      );
    }
  }

  async function upgradeVersion(
    itemId: string,
    version: RecipeVersion,
  ) {
    try {
      const closure = await loadRecipeVersionClosure(api, [version.id]);
      setReferencedVersions((current) =>
        mergeRecipeVersions(current, closure),
      );
      const outputMass = recipeVersionOutputMass(version.snapshot);
      setItems(
        draft.items.map((item) =>
          item.id === itemId && item.kind === "recipe_version"
            ? {
                ...item,
                recipeVersionId: version.id,
                recipeVersion: {
                  id: version.id,
                  recipeId: version.recipeId,
                  recipeName: version.snapshot.recipe.name,
                  versionNumber: version.versionNumber,
                  outputMassGrams: outputMass,
                  createdAt: version.createdAt,
                },
              }
            : item,
        ),
      );
      setVersionNotice(
        `${version.snapshot.recipe.name} 已升级到 V${version.versionNumber}`,
      );
    } catch (cause) {
      setEditorError(
        cause instanceof Error
          ? cause.message
          : "半成品版本升级失败",
      );
    }
  }

  async function replaceMaterialNeed(itemId: string) {
    const item = draft.items.find(
      (candidate) => candidate.id === itemId && candidate.kind === "material_need",
    );
    if (
      !item ||
      item.kind !== "material_need" ||
      !item.materialNeed.resolvedIngredientVariantId
    ) {
      return;
    }
    try {
      const groups = await api.listMaterialGroups();
      const selected = groups
        .flatMap((group) =>
          group.variants.map((variant) => ({ group, variant })),
        )
        .find(
          ({ variant }) =>
            variant.id === item.materialNeed.resolvedIngredientVariantId,
        );
      if (!selected) throw new Error("已关联的供应商原料版本不可用");
      setItems(
        draft.items.map((candidate) =>
          candidate.id === itemId
            ? {
                id: candidate.id,
                position: candidate.position,
                kind: "ingredient" as const,
                ingredientVariantId: selected.variant.id,
                materialName: selected.group.name,
                ingredientVariant: selected.variant,
                amount: candidate.amount,
                unit: candidate.unit,
                locked: false,
                autoFill: false,
              }
            : candidate,
        ),
      );
      setVersionNotice(`${item.materialNeed.materialName} 已替换为真实供应商原料版本`);
    } catch (cause) {
      setEditorError(
        cause instanceof Error ? cause.message : "待补充原料替换失败",
      );
    }
  }

  function moveItem(id: string, direction: -1 | 1) {
    const index = draft.items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.items.length) return;
    const items = [...draft.items];
    const current = items[index];
    const adjacent = items[target];
    if (current === undefined || adjacent === undefined) return;
    items[index] = adjacent;
    items[target] = current;
    setItems(items);
  }

  function openVersionDialog() {
    const result = prepareRecipeVersion({
      recipe,
      recipeName,
      draft,
      sourceDraftId: draft.id,
      calculation: calculate(draft),
    });
    setVersionError(null);
    setVersionNotice(null);
    setVersionDialogOpen(true);
    if (result.ok) {
      setVersionPreparation(result.value);
      setVersionValidationIssues([]);
    } else {
      setVersionPreparation(null);
      setVersionValidationIssues(result.issues);
    }
  }

  async function confirmVersionSave() {
    if (versionPreparation === null || versionSaving) return;
    setVersionSaving(true);
    setVersionError(null);
    try {
      await draftState.saveNow();
      const persistedDraft = await api.getRecipeDraft(recipe.id);
      if (persistedDraft === null) {
        throw new Error("草稿尚未保存，请稍后重试");
      }
      const preparedName =
        versionPreparation.input.snapshot.recipe.name;
      let updatedRecipe = recipe;
      if (preparedName !== recipe.name) {
        updatedRecipe = await api.updateRecipe(recipe.id, {
          name: preparedName,
          code: recipe.code,
          tags: recipe.tags,
          kind: recipe.kind,
        });
        setRecipeName(updatedRecipe.name);
      }
      const version = await api.createRecipeVersion({
        ...versionPreparation.input,
        sourceDraftId: persistedDraft.id,
        basedOnVersionId: persistedDraft.basedOnVersionId,
        snapshot: {
          ...versionPreparation.input.snapshot,
          recipe: {
            id: updatedRecipe.id,
            name: updatedRecipe.name,
            code: updatedRecipe.code,
            tags: [...updatedRecipe.tags],
            kind: updatedRecipe.kind,
            productId: updatedRecipe.productId ?? updatedRecipe.id,
            schemeName: updatedRecipe.schemeName ?? "主配方",
            schemeStatus: updatedRecipe.schemeStatus ?? "current",
          },
        },
      });
      const copied = await draftState.copyFromVersion(version.id);
      const closure = await loadRecipeVersionClosure(api, [
        ...copied.items.flatMap((item) =>
          item.kind === "recipe_version"
            ? [item.recipeVersionId]
            : [],
        ),
        version.id,
      ]);
      setReferencedVersions((current) =>
        mergeRecipeVersions(current, closure),
      );
      const refreshedRecipe = await api.getRecipe(recipe.id);
      onRecipeUpdated(refreshedRecipe);
      setVersionDialogOpen(false);
      setVersionPreparation(null);
      setVersionValidationIssues([]);
      setVersionNotice(
        `V${version.versionNumber} 已保存，已生成基于该版本的工作草稿`,
      );
    } catch (cause) {
      setVersionError(
        cause instanceof Error
          ? cause.message
          : "正式版本保存失败",
      );
    } finally {
      setVersionSaving(false);
    }
  }

  const inputMass = formulaInputMass(draft.items);
  const batchMassUnit =
    batchMassUnitOverride ?? preferredBatchMassUnit(inputMass);
  const displayedInputMass = displayBatchMass(inputMass, batchMassUnit);
  const visibleIssues = draft.calculationIssues.filter(
    (issue) =>
      issue.code !== "non_positive_value" || inputMass !== "0",
  );
  const finishedMassIssue = visibleIssues.find(
    (issue) =>
      issue.field === "finishedMassGrams" &&
      issue.severity === "error",
  );
  const calculation = draft.calculation;
  const missingData = collectMissingData(calculation, visibleIssues);
  const yieldLabel =
    calculation?.yieldPercent === null ||
    calculation?.yieldPercent === undefined
      ? "—"
      : `${displayNumber(calculation.yieldPercent)}%`;
  if (draftState.loading) {
    return (
      <section className="recipe-workbench recipe-workbench--loading">
        <p>正在恢复配方草稿…</p>
      </section>
    );
  }

  return (
    <section className={inactive ? "recipe-workbench is-read-only" : "recipe-workbench"}>
      <RecipeHeader
        draft={draft}
        hasFormulaInput={inputMass !== "0"}
        name={recipeName}
        onNameChange={setRecipeName}
        onNameCommit={() => void commitRecipeName()}
        onKindChange={(kind) => void changeRecipeKind(kind)}
        onBack={() => void returnToLibrary()}
        onOpenAgent={() => onOpenAgent?.()}
        onOpenSampleSheet={() =>
          onOpenSampleSheet?.({
            origin: "workbench",
            recipe,
            draft,
            referencedVersions,
          })
        }
        onSaveVersion={openVersionDialog}
        recipe={recipe}
        saveStatus={draftState.saveStatus}
        versionSaving={versionSaving}
      />

      <fieldset
        aria-label={inactive ? "已停用配方只读内容" : "配方编辑内容"}
        className="recipe-workbench__readonly-scope"
        disabled={inactive}
      >
      <div className="recipe-workbench__body">
        <div
          className={
            narrowView === "formula"
              ? "recipe-editor-pane is-active"
              : "recipe-editor-pane"
          }
        >
          {versionNotice ? (
            <p className="recipe-version-notice" role="status">
              <Icon name="check" size={16} />
              {versionNotice}
            </p>
          ) : null}
          <div className="recipe-batch-bar">
            <output
              aria-label="当前投料合计"
              className="recipe-batch-value recipe-batch-value--computed"
            >
              <span>投料合计</span>
              <strong>{displayedInputMass}</strong>
              <label className="recipe-batch-unit">
                <span>单位</span>
                <select
                  aria-label="批量单位"
                  onChange={(event) =>
                    setBatchMassUnitOverride(
                      event.target.value as BatchMassUnit,
                    )
                  }
                  value={batchMassUnit}
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </label>
              <em>由下方配方用量自动汇总</em>
            </output>
            <label>
              <span>出成重量</span>
              <FinishedMassInput
                error={finishedMassIssue?.message ?? null}
                key={batchMassUnit}
                onChange={(finishedMassGrams) =>
                  dispatch({
                    type: "patch",
                    patch: { finishedMassGrams },
                  })
                }
                placeholder="未填写"
                unit={batchMassUnit}
                valueGrams={draft.finishedMassGrams}
              />
              <small>{batchMassUnit}</small>
            </label>
            <span className="recipe-batch-value">
              <span>得率</span>
              <strong>{yieldLabel}</strong>
            </span>
            <p className="recipe-batch-help">
              单位只影响显示和输入，内部仍按克精确保存与计算；出成重量用于折算得率、每100g营养和单位成本，未填写时按投料合计计算。
            </p>
          </div>

          {editorError ? (
            <p className="recipe-editor-error" role="alert">
              <Icon name="warning" size={16} />
              {editorError}
            </p>
          ) : null}

          <NarrowTabs
            completeness={calculation?.completeness.percent ?? null}
            onChange={setNarrowView}
            value={narrowView}
          />

          <RecipeItemTable
            issues={draft.calculationIssues}
            items={draft.items}
            missingData={missingData}
            onAdd={() => setPickerOpen(true)}
            onAmountChange={(id, amount) => {
              const items = draft.items.map((item) =>
                item.id === id ? { ...item, amount } : item,
              );
              setItems(items);
            }}
            onMove={moveItem}
            onRemove={(id) =>
              setItems(draft.items.filter((item) => item.id !== id))
            }
            onReplaceMaterialNeed={(id) => void replaceMaterialNeed(id)}
            onUnitChange={(id, unit) => {
              const items = draft.items.map((item) =>
                item.id === id ? { ...item, unit } : item,
              );
              setItems(items);
            }}
            onUpgradeVersion={(id, version) =>
              void upgradeVersion(id, version)
            }
            onViewGaps={() => openGapReport()}
            onViewNutrition={openNutritionDetail}
            versionUpgrades={versionUpgrades}
          />

          <div className="recipe-lower-grid">
            <RecipeCostEditor
              additionalCosts={draft.additionalCosts}
              issues={draft.calculationIssues}
              onAdditionalCostsChange={(costs) =>
                dispatch({
                  type: "set_additional_costs",
                  costs,
                })
              }
              onPackagingCostsChange={(costs) =>
                dispatch({
                  type: "set_packaging_costs",
                  costs,
                })
              }
              packagingCosts={draft.packagingCosts}
            />
            <section className="recipe-notes-section">
              <h2>研发备注</h2>
              <textarea
                aria-label="研发备注"
                onChange={(event) =>
                  dispatch({
                    type: "patch",
                    patch: { markdownNotes: event.target.value },
                  })
                }
                placeholder="记录实验工艺、感官评价与调整原因…"
                value={draft.markdownNotes}
              />
              <small>支持 Markdown</small>
            </section>
          </div>
        </div>

        <RecipeResultsInspector
          activeView={narrowView}
          calculation={calculation}
          issues={visibleIssues}
          onViewGaps={() => openGapReport()}
          onViewNutrientGap={openGapReport}
        />
      </div>

      <div className="recipe-sticky-summary">
        <span>
          投料 {displayedInputMass}{batchMassUnit}
          <i />
          成本 ¥{displayNumber(calculation?.cost.batchTotal ?? "0")}
        </span>
        <button
          className="button button--secondary"
          onClick={() => setNarrowView("results")}
          type="button"
        >
          <Icon name="trend" size={17} />
          查看实时结果
        </button>
      </div>
      </fieldset>

      <DataQualityDrawer
        content={dataDrawer}
        onClose={() => setDataDrawer(null)}
        onEditIngredient={(entry) => void editIngredientFromGap(entry)}
      />

      <RecipeIngredientPicker
        api={api}
        onAddIngredient={addIngredient}
        onAddVersion={addVersion}
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
        recipeId={recipe.id}
      />
      <RecipeVersionDialog
        error={versionError}
        issues={versionValidationIssues}
        onClose={() => {
          if (versionSaving) return;
          setVersionDialogOpen(false);
          setVersionError(null);
        }}
        onConfirm={() => void confirmVersionSave()}
        onViewGaps={() => openGapReport()}
        open={versionDialogOpen}
        preparation={versionPreparation}
        saving={versionSaving}
        versionNumber={(recipe.latestVersionNumber ?? 0) + 1}
      />
    </section>
  );
}

interface NarrowTabsProps {
  completeness: number | null;
  value: NarrowView;
  onChange(value: NarrowView): void;
}

function NarrowTabs({
  completeness,
  value,
  onChange,
}: NarrowTabsProps) {
  return (
    <div
      aria-label="配方工作台视图"
      className="recipe-narrow-tabs"
      role="tablist"
    >
      <button
        aria-selected={value === "formula"}
        className={value === "formula" ? "is-active" : ""}
        onClick={() => onChange("formula")}
        role="tab"
        type="button"
      >
        配方
      </button>
      <button
        aria-selected={value === "results"}
        className={value === "results" ? "is-active" : ""}
        onClick={() => onChange("results")}
        role="tab"
        type="button"
      >
        实时结果
        {completeness === null ? null : (
          <span>数据完整度 {completeness}%</span>
        )}
      </button>
      <button
        aria-selected={value === "allergens"}
        className={value === "allergens" ? "is-active" : ""}
        onClick={() => onChange("allergens")}
        role="tab"
        type="button"
      >
        过敏原
      </button>
    </div>
  );
}

interface RecipeResultsInspectorProps {
  activeView: NarrowView;
  calculation: ReturnType<typeof useRecipeDraft>["draft"]["calculation"];
  issues: ReturnType<typeof useRecipeDraft>["draft"]["calculationIssues"];
  onViewGaps(): void;
  onViewNutrientGap(nutrientDefinitionId: string): void;
}

function RecipeResultsInspector({
  activeView,
  calculation,
  issues,
  onViewGaps,
  onViewNutrientGap,
}: RecipeResultsInspectorProps) {
  const visibleClass =
    activeView === "formula"
      ? "recipe-results-inspector"
      : `recipe-results-inspector is-narrow-active is-${activeView}`;
  return (
    <aside className={visibleClass} aria-label="实时结果">
      <header>
        <h2>
          {activeView === "allergens" ? "过敏原" : "实时结果"}
        </h2>
        {calculation ? (
          <a
            className="data-quality-trigger"
            href="#data-quality"
            onClick={(event) => {
              event.preventDefault();
              onViewGaps();
            }}
          >
            数据完整度{" "}
            <strong>{calculation.completeness.percent}%</strong>
          </a>
        ) : null}
      </header>
      {calculation === null ? (
        <div className="recipe-results-empty">
          <Icon name="recipe-workbench" size={27} />
          <strong>添加有效用量后显示结果</strong>
          <span>营养、成本和数据完整度会随配方实时更新。</span>
          {issues[0] ? <small>{issues[0].message}</small> : null}
        </div>
      ) : activeView === "allergens" ? (
        <ResultAllergens calculation={calculation} />
      ) : (
        <>
          <ResultNutrients
            nutrients={calculation.nutrients}
            onViewNutrientGap={onViewNutrientGap}
            title="营养"
          />
          <section className="recipe-result-section recipe-cost-preview">
            <h3>成本</h3>
            <dl>
              <div>
                <dt>原料</dt>
                <dd>{displayCurrency(calculation.cost.rawMaterialTotal)}</dd>
              </div>
              <div>
                <dt>包材</dt>
                <dd>{displayCurrency(calculation.cost.packagingTotal)}</dd>
              </div>
              <div>
                <dt>其他</dt>
                <dd>{displayCurrency(calculation.cost.additionalTotal)}</dd>
              </div>
              <div className="is-total">
                <dt>整批</dt>
                <dd>{displayCurrency(calculation.cost.batchTotal)}</dd>
              </div>
              <div>
                <dt>每100g</dt>
                <dd>{displayCurrency(calculation.cost.per100g)}</dd>
              </div>
              <div>
                <dt>每 kg</dt>
                <dd>{displayCurrency(calculation.cost.perKg)}</dd>
              </div>
            </dl>
          </section>
          <ResultAllergens calculation={calculation} />
        </>
      )}
    </aside>
  );
}

function ResultNutrients({
  nutrients,
  onViewNutrientGap,
  title,
}: {
  nutrients: RecipeCalculation["nutrients"];
  onViewNutrientGap(nutrientDefinitionId: string): void;
  title: string;
}) {
  return (
    <section className="recipe-result-section">
      <h3>{title}</h3>
      <ResultNutrientRows
        nutrients={nutrients}
        onViewNutrientGap={onViewNutrientGap}
      />
    </section>
  );
}

function ResultNutrientRows({
  nutrients,
  onViewNutrientGap,
}: {
  nutrients: RecipeCalculation["nutrients"];
  onViewNutrientGap(nutrientDefinitionId: string): void;
}) {
  return (
    <>
      <div className="recipe-nutrition-head">
        <span>项目</span>
        <span>每100g</span>
        <span>整批</span>
      </div>
      {nutrients.map((nutrient) => (
        <div className="recipe-nutrition-row" key={nutrient.nutrientDefinitionId}>
          {nutrient.status === "complete" ? (
            <span>{nutrient.name}</span>
          ) : (
            <a
              className="data-quality-trigger"
              href="#data-quality"
              onClick={(event) => {
                event.preventDefault();
                onViewNutrientGap(nutrient.nutrientDefinitionId);
              }}
            >
              {nutrient.name}
              <Icon name="warning" size={13} />
            </a>
          )}
          <span>{nutrientValue(nutrient, "per100g")}</span>
          <span>{nutrientValue(nutrient, "batch")}</span>
        </div>
      ))}
    </>
  );
}

function ResultAllergens({
  calculation,
}: {
  calculation: NonNullable<
    ReturnType<typeof useRecipeDraft>["draft"]["calculation"]
  >;
}) {
  return (
    <section className="recipe-result-section recipe-allergen-preview">
      <h3>过敏原</h3>
      <p className="contains">
        含有：
        {calculation.allergens.contains.join("、") || "无已知记录"}
      </p>
      <p className="may-contain">
        可能含有：
        {calculation.allergens.mayContain.join("、") || "无已知记录"}
      </p>
    </section>
  );
}

async function loadRecipeVersionClosure(
  api: DesktopApi,
  initialVersionIds: string[],
) {
  const loaded = new Map<string, RecipeVersion>();
  const pending = [...new Set(initialVersionIds)];
  while (pending.length > 0) {
    const versionId = pending.shift();
    if (versionId === undefined || loaded.has(versionId)) continue;
    const version = await api.getRecipeVersion(versionId);
    loaded.set(version.id, version);
    for (const item of version.snapshot.items) {
      if (
        item.kind === "recipe_version" &&
        !loaded.has(item.recipeVersion.id)
      ) {
        pending.push(item.recipeVersion.id);
      }
    }
  }
  return [...loaded.values()];
}

function mergeRecipeVersions(
  current: RecipeVersion[],
  additions: RecipeVersion[],
) {
  const versions = new Map(
    current.map((version) => [version.id, version]),
  );
  for (const version of additions) {
    versions.set(version.id, version);
  }
  return [...versions.values()];
}

function normalizePositions(items: RecipeDraftItem[]) {
  return items.map((item, position) => ({
    ...item,
    position,
    locked: false,
    autoFill: false,
  }));
}

function createItemId() {
  return globalThis.crypto?.randomUUID?.() ??
    `recipe-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FinishedMassInput({
  error,
  onChange,
  placeholder,
  unit,
  valueGrams,
}: {
  error: string | null;
  onChange(valueGrams: string | null): void;
  placeholder: string;
  unit: BatchMassUnit;
  valueGrams: string | null;
}) {
  const errorId = useId();
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayValue =
    editingValue ??
    (valueGrams === null ? "" : displayBatchMass(valueGrams, unit));

  return (
    <span className="recipe-finished-mass-input">
      <input
        aria-describedby={error === null ? undefined : errorId}
        aria-invalid={error === null ? undefined : "true"}
        aria-label="出成重量"
        inputMode="decimal"
        onBlur={() => setEditingValue(null)}
        onChange={(event) => {
          const nextValue = event.target.value;
          setEditingValue(nextValue);
          if (nextValue === "") {
            onChange(null);
            return;
          }
          const grams = batchMassToGrams(nextValue, unit);
          if (grams !== null) onChange(grams);
        }}
        onFocus={() => setEditingValue(displayValue)}
        placeholder={placeholder}
        value={displayValue}
      />
      {error === null ? null : (
        <small className="recipe-finished-mass-error" id={errorId} role="alert">
          {error}
        </small>
      )}
    </span>
  );
}

function preferredBatchMassUnit(grams: string): BatchMassUnit {
  try {
    return new Decimal(grams).gte(1000) ? "kg" : "g";
  } catch {
    return "g";
  }
}

function displayBatchMass(grams: string, unit: BatchMassUnit) {
  try {
    const value = new Decimal(grams);
    if (!value.isFinite()) return grams;
    return unit === "kg"
      ? value.dividedBy(1000).toDecimalPlaces(3).toString()
      : value.toDecimalPlaces(2).toString();
  } catch {
    return grams;
  }
}

function batchMassToGrams(value: string, unit: BatchMassUnit) {
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(normalized)) return null;
  try {
    const amount = new Decimal(normalized);
    if (!amount.isFinite()) return null;
    return (unit === "kg" ? amount.times(1000) : amount).toString();
  } catch {
    return null;
  }
}

function formulaInputMass(items: RecipeDraftItem[]) {
  let total = new Decimal(0);
  for (const item of items) {
    const density =
      item.kind === "ingredient"
        ? item.ingredientVariant.densityGPerMl ?? undefined
        : undefined;
    const converted = toGrams(
      { value: item.amount, unit: item.unit },
      density,
    );
    if (!converted.ok) return "—";
    total = total.add(converted.value);
  }
  return total.toString();
}

function collectMissingData(
  calculation: RecipeCalculation | null,
  issues: RecipeCalculationIssue[],
) {
  const result: Record<string, string[]> = {};
  const append = (itemId: string, label: string) => {
    const current = result[itemId] ?? [];
    if (!current.includes(label)) current.push(label);
    result[itemId] = current;
  };
  if (calculation !== null) {
    for (const itemId of calculation.cost.missingItemIds) {
      append(itemId, "价格");
    }
    for (const nutrient of calculation.nutrients) {
      for (const itemId of nutrient.missingItemIds) {
        append(itemId, nutrient.name);
      }
    }
  }
  for (const issue of issues) {
    if (issue.itemId === null) continue;
    if (issue.code === "missing_price") {
      append(issue.itemId, "价格");
    } else if (issue.code === "missing_density") {
      append(issue.itemId, "密度");
    }
  }
  return result;
}

function nutrientValue(
  nutrient: RecipeCalculation["nutrients"][number],
  basis: "per100g" | "batch",
) {
  if (nutrient.status === "unknown") return "—";
  const value =
    basis === "per100g"
      ? nutrient.per100gKnownAmount
      : nutrient.totalKnownAmount;
  const displayed = `${displayNumber(value)}${nutrient.unit}`;
  return nutrient.status === "partial" ? `已知部分 ${displayed}` : displayed;
}

function displayNumber(value: string) {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) return value;
    return decimal.toDecimalPlaces(2).toString();
  } catch {
    return value;
  }
}

function displayCurrency(value: string) {
  return `${new Decimal(value).toFixed(2)} 元`;
}
