import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { RecipeDraft } from "../../api/recipe-types";
import {
  createEmptyRecipeDraft,
  createRecipeDraftEditorState,
  recipeDraftReducer,
  settleRecipeDraft,
  toRecipeDraftSaveInput,
  type RecipeDraftAction,
  type RecipeDraftCalculator,
  type RecipeDraftEditorState,
} from "./recipe-draft-state";

export const RECIPE_EDITOR_DRAFT_VERSION = 1;
export const RECIPE_EDITOR_DRAFT_KIND = "recipe-workbench";

export interface RecipeEditorDraftPayload {
  draft: RecipeDraft;
}

export type RecipeDraftSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "failed";

export interface UseRecipeDraftOptions {
  calculate?: RecipeDraftCalculator;
  debounceMs?: number;
  now?: () => string;
}

interface SaveSnapshot {
  revision: number;
  draft: RecipeDraft;
  canSaveFormalDraft: boolean;
}

interface EnqueuedSave {
  snapshot: SaveSnapshot;
  promise: Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 500;

export function useRecipeDraft(
  api: DesktopApi,
  recipeId: string,
  options: UseRecipeDraftOptions = {},
) {
  const now = options.now ?? (() => new Date().toISOString());
  const [state, dispatch] = useReducer(
    recipeDraftReducer,
    createRecipeDraftEditorState(
      createEmptyRecipeDraft(recipeId, now()),
    ),
  );
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] =
    useState<RecipeDraftSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const latestStateRef = useRef(state);
  const calculateRef = useRef(options.calculate);
  const timerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nextSaveTokenRef = useRef(0);
  const latestSaveTokenRef = useRef(0);
  const enqueuedRef = useRef<EnqueuedSave | null>(null);
  latestStateRef.current = state;
  calculateRef.current = options.calculate;

  const enqueueSave = useCallback(
    (
      snapshot: SaveSnapshot,
      reportToState = true,
    ): Promise<void> => {
      const existing = enqueuedRef.current;
      if (
        existing !== null &&
        existing.snapshot.revision === snapshot.revision &&
        existing.snapshot.draft === snapshot.draft
      ) {
        return existing.promise;
      }

      const token = ++nextSaveTokenRef.current;
      latestSaveTokenRef.current = token;
      if (reportToState && mountedRef.current) {
        setSaveStatus("saving");
        setError(null);
      }

      let savedDraft: RecipeDraft | null = null;
      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await api.saveDraft(
            RECIPE_EDITOR_DRAFT_KIND,
            recipeId,
            RECIPE_EDITOR_DRAFT_VERSION,
            { draft: snapshot.draft } satisfies RecipeEditorDraftPayload,
          );
          if (snapshot.canSaveFormalDraft) {
            savedDraft = await api.saveRecipeDraft(
              toRecipeDraftSaveInput(snapshot.draft),
            );
          }
        });
      saveQueueRef.current = operation.catch(() => undefined);

      const reported = operation
        .then(() => {
          if (!reportToState || !mountedRef.current) return;
          dispatch({
            type: "persisted",
            revision: snapshot.revision,
            savedDraft,
          });
          if (latestSaveTokenRef.current === token) {
            setSaveStatus("saved");
          }
        })
        .catch((cause: unknown) => {
          if (!reportToState || !mountedRef.current) return;
          if (latestSaveTokenRef.current === token) {
            setSaveStatus("failed");
            setError(
              cause instanceof Error
                ? cause.message
                : "配方草稿自动保存失败",
            );
          }
        })
        .finally(() => {
          if (enqueuedRef.current?.promise === reported) {
            enqueuedRef.current = null;
          }
        });
      enqueuedRef.current = { snapshot, promise: reported };
      return reported;
    },
    [api, recipeId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      api.getRecipeDraft(recipeId),
      api.getDraft<RecipeEditorDraftPayload>(
        RECIPE_EDITOR_DRAFT_KIND,
        recipeId,
      ),
    ])
      .then(([formalDraft, editorDraft]) => {
        if (!active) return;
        const restorable =
          editorDraft !== null &&
          editorDraft.payloadVersion === RECIPE_EDITOR_DRAFT_VERSION &&
          isRecipeEditorDraftPayload(editorDraft.payload, recipeId)
            ? editorDraft.payload.draft
            : null;
        const selectedDraft =
          restorable ??
          formalDraft ??
          createEmptyRecipeDraft(recipeId, now());
        const reconciled =
          restorable !== null && formalDraft !== null
            ? reconcileDraftReferences(restorable, formalDraft)
            : { draft: selectedDraft, changed: false };
        dispatch({
          type: "hydrate",
          draft: reconciled.draft,
          dirty:
            restorable !== null ||
            reconciled.changed ||
            hasIngredientUpdateAfterCalculation(reconciled.draft),
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "配方草稿无法读取",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, recipeId]);

  useEffect(() => {
    if (loading || state.evaluatedRevision === state.revision) return;
    const settled = settleRecipeDraft(
      state.draft,
      options.calculate,
    );
    dispatch({
      type: "evaluation_completed",
      revision: state.revision,
      draft: settled.draft,
      canSaveFormalDraft: settled.canSaveFormalDraft,
    });
  }, [
    loading,
    options.calculate,
    state.draft,
    state.evaluatedRevision,
    state.revision,
  ]);

  useEffect(() => {
    if (
      loading ||
      !state.dirty ||
      state.evaluatedRevision !== state.revision
    ) {
      return;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    const timer = window.setTimeout(() => {
      timerRef.current = null;
      void enqueueSave({
        revision: state.revision,
        draft: state.draft,
        canSaveFormalDraft: state.canSaveFormalDraft,
      });
    }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    timerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [
    enqueueSave,
    loading,
    options.debounceMs,
    state.canSaveFormalDraft,
    state.dirty,
    state.draft,
    state.evaluatedRevision,
    state.revision,
  ]);

  const saveNow = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = latestStateRef.current;
    if (!current.dirty) {
      await saveQueueRef.current;
      return;
    }
    const snapshot =
      current.evaluatedRevision === current.revision
        ? {
            revision: current.revision,
            draft: current.draft,
            canSaveFormalDraft: current.canSaveFormalDraft,
          }
        : snapshotAfterEvaluation(
            current,
            options.calculate,
          );
    if (current.evaluatedRevision !== current.revision) {
      dispatch({
        type: "evaluation_completed",
        revision: snapshot.revision,
        draft: snapshot.draft,
        canSaveFormalDraft: snapshot.canSaveFormalDraft,
      });
    }
    await enqueueSave(snapshot);
  }, [enqueueSave, options.calculate]);

  const copyFromVersion = useCallback(
    async (versionId: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await saveQueueRef.current;
      setError(null);
      setSaveStatus("saving");
      try {
        const copied = await api.copyRecipeVersionToDraft(versionId);
        await api.clearDraft(RECIPE_EDITOR_DRAFT_KIND, recipeId);
        dispatch({ type: "hydrate", draft: copied });
        setSaveStatus("saved");
        return copied;
      } catch (cause) {
        setSaveStatus("failed");
        setError(
          cause instanceof Error
            ? cause.message
            : "正式版本无法复制为草稿",
        );
        throw cause;
      }
    },
    [api, recipeId],
  );

  const clear = useCallback(() => {
    dispatch({ type: "clear", timestamp: now() });
  }, [now]);

  useEffect(() => {
    mountedRef.current = true;
    const flushLatest = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = latestStateRef.current;
      if (!current.dirty) return;
      const snapshot =
        current.evaluatedRevision === current.revision
          ? {
              revision: current.revision,
              draft: current.draft,
              canSaveFormalDraft: current.canSaveFormalDraft,
            }
          : snapshotAfterEvaluation(
              current,
              calculateRef.current,
            );
      void enqueueSave(snapshot, false);
    };
    window.addEventListener("beforeunload", flushLatest);
    return () => {
      window.removeEventListener("beforeunload", flushLatest);
      mountedRef.current = false;
      flushLatest();
    };
  }, [enqueueSave]);

  return {
    state,
    draft: state.draft,
    dispatch: dispatch as (action: RecipeDraftAction) => void,
    loading,
    saveStatus,
    error,
    saveNow,
    copyFromVersion,
    clear,
  };
}

function snapshotAfterEvaluation(
  state: RecipeDraftEditorState,
  calculate?: RecipeDraftCalculator,
): SaveSnapshot {
  const settled = settleRecipeDraft(state.draft, calculate);
  return {
    revision: state.revision,
    draft: settled.draft,
    canSaveFormalDraft: settled.canSaveFormalDraft,
  };
}

function isRecipeEditorDraftPayload(
  value: unknown,
  recipeId: string,
): value is RecipeEditorDraftPayload {
  if (typeof value !== "object" || value === null) return false;
  if (!("draft" in value)) return false;
  const draft = value.draft;
  return (
    typeof draft === "object" &&
    draft !== null &&
    "recipeId" in draft &&
    draft.recipeId === recipeId &&
    "items" in draft &&
    Array.isArray(draft.items)
  );
}

function reconcileDraftReferences(
  cachedDraft: RecipeDraft,
  materializedDraft: RecipeDraft,
) {
  const currentItems = new Map(
    materializedDraft.items.map((item) => [item.id, item]),
  );
  let changed = false;
  const items = cachedDraft.items.map((item) => {
    const current = currentItems.get(item.id);
    if (current?.kind !== item.kind) return item;
    if (item.kind === "ingredient" && current.kind === "ingredient") {
      if (
        item.materialName === current.materialName &&
        JSON.stringify(item.ingredientVariant) ===
          JSON.stringify(current.ingredientVariant)
      ) {
        return item;
      }
      changed = true;
      return {
        ...item,
        materialName: current.materialName,
        ingredientVariant: current.ingredientVariant,
      };
    }
    if (item.kind === "recipe_version" && current.kind === "recipe_version") {
      if (
        JSON.stringify(item.recipeVersion) ===
        JSON.stringify(current.recipeVersion)
      ) {
        return item;
      }
      changed = true;
      return { ...item, recipeVersion: current.recipeVersion };
    }
    if (item.kind === "material_need" && current.kind === "material_need") {
      if (
        JSON.stringify(item.materialNeed) ===
        JSON.stringify(current.materialNeed)
      ) {
        return item;
      }
      changed = true;
      return { ...item, materialNeed: current.materialNeed };
    }
    return item;
  });
  return {
    draft: changed ? { ...cachedDraft, items } : cachedDraft,
    changed,
  };
}

function hasIngredientUpdateAfterCalculation(draft: RecipeDraft) {
  const calculatedAt = draft.calculation?.calculatedAt;
  if (calculatedAt === undefined) {
    return draft.items.some((item) => item.kind === "ingredient");
  }
  const calculationTime = Date.parse(calculatedAt);
  if (!Number.isFinite(calculationTime)) return false;
  return draft.items.some(
    (item) =>
      item.kind === "ingredient" &&
      Date.parse(item.ingredientVariant.updatedAt) > calculationTime,
  );
}
