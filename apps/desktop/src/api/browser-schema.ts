import type {
  Category,
  DraftRecord,
  Ingredient,
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
  Supplier,
} from "./types";

export const BROWSER_V1_KEY = "food-rd.browser-demo.v1";
export const BROWSER_V2_KEY = "food-rd.browser-demo.v2";
export const BROWSER_SCHEMA_VERSION = 2;

export interface LegacyState {
  schemaVersion: 1;
  ingredients: Ingredient[];
  settings: Record<string, unknown>;
  drafts: Record<string, DraftRecord>;
}

export interface BrowserStateV2 {
  schemaVersion: 2;
  categories: Category[];
  suppliers: Supplier[];
  materialGroups: MaterialGroup[];
  nutrientDefinitions: NutrientDefinition[];
  settings: Record<string, unknown>;
  drafts: Record<string, DraftRecord>;
}

export interface MigrationContext {
  now(): string;
  id(scope: string, legacyId: string): string;
}

const builtInNutrientSeed = [
  ["energy", "能量", "kJ"],
  ["protein", "蛋白质", "g"],
  ["fat", "脂肪", "g"],
  ["saturated_fat", "饱和脂肪", "g"],
  ["carbohydrate", "碳水化合物", "g"],
  ["sugars", "糖", "g"],
  ["dietary_fiber", "膳食纤维", "g"],
  ["sodium", "钠", "mg"],
] as const;

export function builtInNutrients(): NutrientDefinition[] {
  return builtInNutrientSeed.map(([code, name, unit], index) => ({
    id: code,
    code,
    name,
    unit,
    builtIn: true,
    sortOrder: index,
  }));
}

function migratedNotes(ingredient: Ingredient) {
  const notes = ingredient.notes.trim();
  const tags = ingredient.tags.map((tag) => tag.trim()).filter(Boolean);
  const tagNote = tags.length > 0 ? `原标签：${tags.join("、")}` : "";
  return [notes, tagNote].filter(Boolean).join("；");
}

export function migrateV1ToV2(
  legacy: LegacyState,
  context: MigrationContext,
): BrowserStateV2 {
  const now = context.now();
  const categoryNames = [
    ...new Set(
      legacy.ingredients
        .map((ingredient) => ingredient.category.trim())
        .filter(Boolean),
    ),
  ];
  const categories = categoryNames.map((name, index): Category => ({
    id: context.id("category", name),
    name,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }));
  const categoryByName = new Map(
    categories.map((category) => [category.name, category]),
  );
  const supplierId = context.id("supplier", "legacy-demo");
  const supplier: Supplier = {
    id: supplierId,
    name: "演示供应商",
    notes: "由旧版浏览器数据迁移",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  const nutrientDefinitions = builtInNutrients();
  const materialGroups = legacy.ingredients.map((ingredient): MaterialGroup => {
    const category = categoryByName.get(ingredient.category.trim());
    const groupId = context.id("material-group", ingredient.id);
    const variant: IngredientVariant = {
      id: context.id("ingredient-variant", ingredient.id),
      materialGroupId: groupId,
      supplierId,
      supplierName: supplier.name,
      modelOrSpecification: "",
      internalCode: ingredient.internalCode.trim() || null,
      currentPrice: ingredient.currentPrice.trim() || null,
      priceUnit: ingredient.priceUnit,
      densityGPerMl: ingredient.densityGPerMl,
      source: ingredient.source,
      researchNotes: migratedNotes(ingredient),
      nutrition: {
        basis: "per_100g",
        values: nutrientDefinitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: null,
        })),
      },
      completeness: {
        percent: ingredient.completeness,
        missingFields: [],
      },
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
      archivedAt: ingredient.archivedAt,
    };
    return {
      id: groupId,
      name: ingredient.name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      variants: [variant],
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
      archivedAt: ingredient.archivedAt,
    };
  });

  return {
    schemaVersion: BROWSER_SCHEMA_VERSION,
    categories,
    suppliers: [supplier],
    materialGroups,
    nutrientDefinitions,
    settings: { ...legacy.settings },
    drafts: {},
  };
}

export function readBrowserState(
  storage: Storage,
  initialLegacyState: () => LegacyState,
  context: MigrationContext,
): BrowserStateV2 {
  const v2 = storage.getItem(BROWSER_V2_KEY);
  if (v2 !== null) {
    const parsed = JSON.parse(v2) as BrowserStateV2;
    if (parsed.schemaVersion !== BROWSER_SCHEMA_VERSION) {
      throw new Error("unsupported browser schema");
    }
    return parsed;
  }

  const v1 = storage.getItem(BROWSER_V1_KEY);
  const legacy = v1 === null
    ? initialLegacyState()
    : (JSON.parse(v1) as LegacyState);
  if (legacy.schemaVersion !== 1) {
    throw new Error("unsupported legacy browser schema");
  }
  const migrated = migrateV1ToV2(legacy, context);
  writeBrowserState(storage, migrated);
  return migrated;
}

export function writeBrowserState(storage: Storage, state: BrowserStateV2) {
  storage.setItem(BROWSER_V2_KEY, JSON.stringify(state));
}
