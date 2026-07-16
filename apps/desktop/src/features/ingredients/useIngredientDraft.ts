import { useEffect, useRef, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type { IngredientVariantInput } from "../../api/types";

export const INGREDIENT_VARIANT_DRAFT_VERSION = 2;
export const INGREDIENT_VARIANT_DRAFT_KIND = "ingredient-variant-editor";

export interface IngredientVariantDraftPayload {
  input: IngredientVariantInput;
}

type DraftStatus = "idle" | "saving" | "saved" | "failed";

export function useIngredientDraft(
  api: DesktopApi,
  key: string,
  payload: IngredientVariantDraftPayload,
  enabled: boolean,
) {
  const [restorable, setRestorable] =
    useState<IngredientVariantDraftPayload | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const timerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .getDraft<IngredientVariantDraftPayload>(INGREDIENT_VARIANT_DRAFT_KIND, key)
      .then((draft) => {
        if (!active || draft === null) return;
        if (
          draft.payloadVersion === INGREDIENT_VARIANT_DRAFT_VERSION &&
          typeof draft.payload === "object" &&
          draft.payload !== null &&
          typeof draft.payload.input === "object" &&
          draft.payload.input !== null
        ) {
          setRestorable(draft.payload);
        }
      });
    return () => {
      active = false;
    };
  }, [api, key]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setStatus("saving");
    const timer = window.setTimeout(() => {
      timerRef.current = null;
      const save = api
        .saveDraft(
          INGREDIENT_VARIANT_DRAFT_KIND,
          key,
          INGREDIENT_VARIANT_DRAFT_VERSION,
          payload,
        )
        .then(() => {
          if (active) setStatus("saved");
        })
        .catch(() => {
          if (active) setStatus("failed");
        })
        .finally(() => {
          if (pendingSaveRef.current === save) pendingSaveRef.current = null;
        });
      pendingSaveRef.current = save;
    }, 500);
    timerRef.current = timer;

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [api, enabled, key, payload]);

  function restore() {
    const draft = restorable;
    setRestorable(null);
    return draft;
  }

  async function discard() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await pendingSaveRef.current?.catch(() => undefined);
    await api.clearDraft(INGREDIENT_VARIANT_DRAFT_KIND, key);
    setRestorable(null);
    setStatus("idle");
  }

  return { discard, restorable, restore, status };
}
