import {
  useCallback,
  useEffect,
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
  RecipeTarget,
  RecipeVersion,
} from "../../api/recipe-types";
import type {
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
} from "../../api/types";
import { Icon } from "../../components/Icon";
import { calculateRecipeDraft } from "./recipe-calculation";
import { RecipeCostEditor } from "./RecipeCostEditor";
import { RecipeHeader } from "./RecipeHeader";
import { RecipeIngredientPicker } from "./RecipeIngredientPicker";
import { RecipeItemTable } from "./RecipeItemTable";
import { rebalanceDraftItems } from "./recipe-rebalance";
import { RecipeTargetEditor } from "./RecipeTargetEditor";
import { RecipeVersionDialog } from "./RecipeVersionDialog";
import {
  prepareRecipeVersion,
  type RecipeVersionPreparation,
  type RecipeVersionValidationIssue,
} from "./recipe-versioning";
import { useRecipeDraft } from "./useRecipeDraft";

interface RecipeWorkbenchProps {
  api: DesktopApi;
  recipeId?: string | null;
}

type NarrowView = "formula" | "results" | "targets";

export function RecipeWorkbench({
  api,
  recipeId = null,
}: RecipeWorkbenchProps) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
        summary.recipe.id === recipeId &&
        summary.recipe.archivedAt === null,
    ) ??
    recipes.find(
      (summary) =>
        summary.recipe.kind === "formula" &&
        summary.recipe.archivedAt === null,
    ) ??
    recipes.find((summary) => summary.recipe.archivedAt === null) ??
    null;

  async function createFirstRecipe() {
    setCreating(true);
    setError(null);
    try {
      await api.createRecipe({
        name: "未命名配方",
        code: null,
        tags: [],
        kind: "formula",
      });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "新配方无法创建",
      );
    } finally {
      setCreating(false);
    }
  }

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
          <Icon name="flask" size={32} />
          <h1>配方工作台</h1>
          <p>新建第一个配方，开始选择原料并记录研发调整。</p>
          {error ? (
            <p className="page-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button--primary"
            disabled={creating}
            onClick={() => void createFirstRecipe()}
            type="button"
          >
            <Icon name="plus" size={18} />
            {creating ? "正在创建…" : "新建配方"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <RecipeEditorLoader
      api={api}
      key={active.recipe.id}
      onRecipeUpdated={(recipe) =>
        setRecipes((current) =>
          current.map((summary) =>
            summary.recipe.id === recipe.id
              ? { ...summary, recipe }
              : summary,
          ),
        )
      }
      recipe={active.recipe}
    />
  );
}

interface RecipeEditorLoaderProps {
  api: DesktopApi;
  recipe: Recipe;
  onRecipeUpdated(recipe: Recipe): void;
}

function RecipeEditorLoader({
  api,
  recipe,
  onRecipeUpdated,
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
      onRecipeUpdated={onRecipeUpdated}
      recipe={recipe}
    />
  );
}

interface RecipeEditorProps {
  api: DesktopApi;
  initialVersions: RecipeVersion[];
  nutrientDefinitions: NutrientDefinition[];
  recipe: Recipe;
  onRecipeUpdated(recipe: Recipe): void;
}

function RecipeEditor({
  api,
  initialVersions,
  nutrientDefinitions,
  recipe,
  onRecipeUpdated,
}: RecipeEditorProps) {
  const [referencedVersions, setReferencedVersions] =
    useState(initialVersions);
  const [recipeName, setRecipeName] = useState(recipe.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rebalanceError, setRebalanceError] =
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
      const outputMass =
        version.snapshot.finishedMassGrams ??
        version.snapshot.targetBatchGrams;
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
      setRebalanceError(
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
      const outputMass =
        version.snapshot.finishedMassGrams ??
        version.snapshot.targetBatchGrams;
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
      setRebalanceError(
        cause instanceof Error
          ? cause.message
          : "半成品版本升级失败",
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

  function updateWithAutoFill(
    items: RecipeDraftItem[],
    editedItemId: string | null = null,
  ) {
    const filler = items.find((item) => item.autoFill);
    if (filler === undefined || filler.id === editedItemId) {
      setRebalanceError(null);
      setItems(items);
      return;
    }
    const result = rebalanceDraftItems(
      items,
      draft.targetBatchGrams,
      { type: "auto-fill", itemId: filler.id },
    );
    if (!result.ok) {
      setRebalanceError(result.message);
      setItems(items);
      return;
    }
    setRebalanceError(null);
    setItems(result.items);
  }

  function scaleToTarget() {
    const result = rebalanceDraftItems(
      draft.items,
      draft.targetBatchGrams,
      { type: "proportional" },
    );
    if (!result.ok) {
      setRebalanceError(result.message);
      return;
    }
    setRebalanceError(null);
    setItems(result.items);
  }

  function toggleAutoFill(id: string) {
    const selected = draft.items.find((item) => item.id === id);
    if (selected === undefined) return;
    if (selected.autoFill) {
      setRebalanceError(null);
      setItems(
        draft.items.map((item) =>
          item.id === id ? { ...item, autoFill: false } : item,
        ),
      );
      return;
    }
    const prepared = draft.items.map((item) => ({
      ...item,
      autoFill: item.id === id,
    }));
    const result = rebalanceDraftItems(
      prepared,
      draft.targetBatchGrams,
      { type: "auto-fill", itemId: id },
    );
    if (!result.ok) {
      setRebalanceError(result.message);
      return;
    }
    setRebalanceError(null);
    setItems(result.items);
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
  const visibleIssues = draft.calculationIssues.filter(
    (issue) =>
      issue.code !== "non_positive_value" || inputMass !== "0",
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
    <section className="recipe-workbench">
      <RecipeHeader
        draft={draft}
        hasFormulaInput={inputMass !== "0"}
        name={recipeName}
        onNameChange={setRecipeName}
        onNameCommit={() => void commitRecipeName()}
        onSaveVersion={openVersionDialog}
        recipe={recipe}
        saveStatus={draftState.saveStatus}
        versionSaving={versionSaving}
      />

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
            <label>
              <span>目标批量</span>
              <input
                aria-label="目标批量"
                inputMode="decimal"
                onChange={(event) => {
                  setRebalanceError(null);
                  dispatch({
                    type: "patch",
                    patch: {
                      targetBatchGrams: event.target.value,
                    },
                  });
                }}
                value={draft.targetBatchGrams}
              />
              <small>g</small>
            </label>
            <span className="recipe-batch-value">
              <span>投料合计</span>
              <strong>{inputMass}</strong>
              <small>g</small>
            </span>
            <label>
              <span>成品重量</span>
              <input
                aria-label="成品重量"
                inputMode="decimal"
                onChange={(event) =>
                  dispatch({
                    type: "patch",
                    patch: {
                      finishedMassGrams:
                        event.target.value === ""
                          ? null
                          : event.target.value,
                    },
                  })
                }
                placeholder="未填写"
                value={draft.finishedMassGrams ?? ""}
              />
              <small>g</small>
            </label>
            <span className="recipe-batch-value">
              <span>得率</span>
              <strong>{yieldLabel}</strong>
            </span>
            <button
              className="button button--secondary recipe-scale-button"
              disabled={draft.items.length === 0}
              onClick={scaleToTarget}
              type="button"
            >
              <Icon name="scale" size={17} />
              按比例调整
            </button>
          </div>

          {rebalanceError ? (
            <p className="recipe-rebalance-error" role="alert">
              <Icon name="warning" size={16} />
              {rebalanceError}
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
              updateWithAutoFill(items, id);
            }}
            onAutoFillChange={toggleAutoFill}
            onLockChange={(id) => {
              const items = draft.items.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      locked: !item.locked,
                      autoFill: !item.locked
                        ? false
                        : item.autoFill,
                    }
                  : item,
              );
              updateWithAutoFill(items);
            }}
            onMove={moveItem}
            onRemove={(id) =>
              updateWithAutoFill(
                draft.items.filter((item) => item.id !== id),
              )
            }
            onUnitChange={(id, unit) => {
              const items = draft.items.map((item) =>
                item.id === id ? { ...item, unit } : item,
              );
              updateWithAutoFill(items);
            }}
            onUpgradeVersion={(id, version) =>
              void upgradeVersion(id, version)
            }
            targetBatchGrams={draft.targetBatchGrams}
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
          nutrientDefinitions={nutrientDefinitions}
          onTargetsChange={(targets) =>
            dispatch({ type: "set_targets", targets })
          }
          targets={draft.targets}
        />
      </div>

      <div className="recipe-sticky-summary">
        <span>
          投料 {inputMass}g
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
        aria-selected={value === "targets"}
        className={value === "targets" ? "is-active" : ""}
        onClick={() => onChange("targets")}
        role="tab"
        type="button"
      >
        目标与过敏原
      </button>
    </div>
  );
}

interface RecipeResultsInspectorProps {
  activeView: NarrowView;
  calculation: ReturnType<typeof useRecipeDraft>["draft"]["calculation"];
  issues: ReturnType<typeof useRecipeDraft>["draft"]["calculationIssues"];
  nutrientDefinitions: NutrientDefinition[];
  targets: RecipeTarget[];
  onTargetsChange(targets: RecipeTarget[]): void;
}

function RecipeResultsInspector({
  activeView,
  calculation,
  issues,
  nutrientDefinitions,
  targets,
  onTargetsChange,
}: RecipeResultsInspectorProps) {
  const visibleClass =
    activeView === "formula"
      ? "recipe-results-inspector"
      : `recipe-results-inspector is-narrow-active is-${activeView}`;
  return (
    <aside className={visibleClass} aria-label="实时结果">
      <header>
        <h2>
          {activeView === "targets" ? "目标与过敏原" : "实时结果"}
        </h2>
        {calculation ? (
          <span>
            数据完整度{" "}
            <strong>{calculation.completeness.percent}%</strong>
          </span>
        ) : null}
      </header>
      {calculation === null ? (
        <div className="recipe-results-empty">
          <Icon name="formula" size={27} />
          <strong>添加有效用量后显示结果</strong>
          <span>营养、成本和数据完整度会随配方实时更新。</span>
          {issues[0] ? <small>{issues[0].message}</small> : null}
        </div>
      ) : activeView === "targets" ? (
        <>
          <RecipeTargetEditor
            evaluations={calculation.targets}
            nutrientDefinitions={nutrientDefinitions}
            onChange={onTargetsChange}
            targets={targets}
          />
          <ResultAllergens calculation={calculation} />
        </>
      ) : (
        <>
          <section className="recipe-result-section">
            <h3>营养</h3>
            <div className="recipe-nutrition-head">
              <span>项目</span>
              <span>每100g</span>
              <span>整批</span>
            </div>
            {calculation.nutrients.slice(0, 8).map((nutrient) => (
              <div className="recipe-nutrition-row" key={nutrient.nutrientDefinitionId}>
                <span>{nutrient.name}</span>
                <span>{nutrientValue(nutrient, "per100g")}</span>
                <span>{nutrientValue(nutrient, "batch")}</span>
              </div>
            ))}
          </section>
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
          <RecipeTargetEditor
            evaluations={calculation.targets}
            nutrientDefinitions={nutrientDefinitions}
            onChange={onTargetsChange}
            targets={targets}
          />
          <ResultAllergens calculation={calculation} />
        </>
      )}
    </aside>
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
  return items.map((item, position) => ({ ...item, position }));
}

function createItemId() {
  return globalThis.crypto?.randomUUID?.() ??
    `recipe-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  return displayNumber(total.toString());
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
  return `${nutrient.status === "partial" ? "≈" : ""}${displayNumber(value)}${nutrient.unit}`;
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
