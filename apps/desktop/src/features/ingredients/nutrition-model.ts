import type {
  DataCompleteness,
  IngredientVariantInput,
  MaterialGroup,
  NutrientDefinition,
  VariantComparison,
} from "../../api/types";

export function calculateCompleteness(
  input: IngredientVariantInput,
  definitions: NutrientDefinition[],
): DataCompleteness {
  const builtIns = definitions
    .filter((definition) => definition.builtIn)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const values = new Map(
    input.nutrition.values.map((value) => [
      value.nutrientDefinitionId,
      value.value,
    ]),
  );
  const missingFields = [
    input.currentPrice === null ? "当前含税价" : null,
    input.source.trim() === "" ? "数据来源" : null,
    input.nutrition.basis === "per_100ml" && input.densityGPerMl === null
      ? "密度"
      : null,
    ...builtIns.map((definition) =>
      values.get(definition.id) == null ? definition.name : null,
    ),
  ].filter((value): value is string => value !== null);
  const total =
    2 +
    builtIns.length +
    (input.nutrition.basis === "per_100ml" ? 1 : 0);

  return {
    percent: Math.round(((total - missingFields.length) / total) * 100),
    missingFields,
  };
}

export function buildVariantComparison(
  group: MaterialGroup,
  variantIds: string[],
  definitions: NutrientDefinition[],
): VariantComparison {
  const selected = variantIds
    .map((id) =>
      group.variants.find(
        (variant) => variant.id === id && variant.archivedAt === null,
      ),
    )
    .filter((variant) => variant !== undefined);
  const valuesFor = (
    getValue: (variant: (typeof selected)[number]) => string | null,
  ) =>
    Object.fromEntries(
      selected.map((variant) => [variant.id, getValue(variant)]),
    );

  const rows = [
    {
      key: "currentPrice",
      label: "当前含税价",
      unit: null,
      values: valuesFor((variant) =>
        variant.currentPrice === null
          ? null
          : `${variant.currentPrice} 元/${variant.priceUnit}`,
      ),
    },
    {
      key: "densityGPerMl",
      label: "密度",
      unit: "g/mL",
      values: valuesFor((variant) => variant.densityGPerMl),
    },
    {
      key: "completeness",
      label: "数据完整度",
      unit: null,
      values: valuesFor((variant) => `${variant.completeness.percent}%`),
    },
    {
      key: "updatedAt",
      label: "最新更新日期",
      unit: null,
      values: valuesFor((variant) => variant.updatedAt),
    },
    {
      key: "source",
      label: "数据来源",
      unit: null,
      values: valuesFor((variant) => variant.source.trim() || null),
    },
    {
      key: "researchNotes",
      label: "研发备注",
      unit: null,
      values: valuesFor((variant) => variant.researchNotes.trim() || null),
    },
    ...definitions
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((definition) => ({
        key: `nutrient:${definition.id}`,
        label: definition.name,
        unit: definition.unit,
        values: valuesFor((variant) => {
          const value = variant.nutrition.values.find(
            (candidate) =>
              candidate.nutrientDefinitionId === definition.id,
          )?.value;
          return value == null || value === "" ? null : value;
        }),
      })),
  ];

  return {
    materialGroupId: group.id,
    variants: selected,
    rows,
  };
}
