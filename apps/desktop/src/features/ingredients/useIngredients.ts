import { useCallback, useEffect, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  IngredientInput,
  IngredientVariant,
  MaterialGroup,
} from "../../api/types";

export function useIngredients(api: DesktopApi, query: string) {
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .listMaterialGroups(query)
      .then((result) => {
        if (active) setMaterialGroups(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "原料加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, query, revision]);

  const saveLegacyIngredient = useCallback(
    async (input: IngredientInput, id?: string) => {
      if (id === undefined) {
        await api.createIngredient(input);
      } else {
        await api.updateIngredient(id, input);
      }
      setRevision((value) => value + 1);
    },
    [api],
  );

  const archiveVariant = useCallback(
    async (variant: IngredientVariant) => {
      await api.archiveIngredientVariant(variant.id);
      setMaterialGroups((current) =>
        current.map((group) => ({
          ...group,
          variants: group.variants.filter(
            (candidate) => candidate.id !== variant.id,
          ),
        })),
      );
    },
    [api],
  );

  return {
    archiveVariant,
    error,
    loading,
    materialGroups,
    refresh: () => setRevision((value) => value + 1),
    saveLegacyIngredient,
  };
}
