import type {
  Category,
  DraftRecord,
  Ingredient,
  IngredientVariant,
  MaterialGroup,
  NutrientDefinition,
  Supplier,
} from "./types";
import type {
  IngredientImportDraft,
  IngredientImportJob,
  SourceAttachment,
} from "./import-types";
import type {
  AgentConversation,
  AgentMessage,
  AgentPreferences,
  AgentProviderConfig,
  AgentProviderKind,
  AgentProviderProtocol,
  AgentRun,
} from "./agent-types";
import type {
  Recipe,
  RecipeDraft,
  RecipeVersion,
} from "./recipe-types";
import type {
  NutritionLabel,
  NutritionLabelDraft,
  NutritionLabelVersion,
} from "./nutrition-label-types";
import type { ResearchReportRecord } from "./research-report-types";
import type {
  AgentRecipeProposal,
  MaterialNeed,
} from "./agent-recipe-types";
import Decimal from "decimal.js";

export const BROWSER_V1_KEY = "food-rd.browser-demo.v1";
export const BROWSER_V2_KEY = "food-rd.browser-demo.v2";
export const BROWSER_V3_KEY = "food-rd.browser-demo.v3";
export const BROWSER_V4_KEY = "food-rd.browser-demo.v4";
export const BROWSER_V5_KEY = "food-rd.browser-demo.v5";
export const BROWSER_V6_KEY = "food-rd.browser-demo.v6";
export const BROWSER_V7_KEY = "food-rd.browser-demo.v7";
export const BROWSER_V8_KEY = "food-rd.browser-demo.v8";
export const BROWSER_V9_KEY = "food-rd.browser-demo.v9";
export const BROWSER_V10_KEY = "food-rd.browser-demo.v10";
export const BROWSER_SCHEMA_VERSION = 10;

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

export interface BrowserStateV3 {
  schemaVersion: 3;
  categories: Category[];
  suppliers: Supplier[];
  materialGroups: MaterialGroup[];
  nutrientDefinitions: NutrientDefinition[];
  settings: Record<string, unknown>;
  drafts: Record<string, DraftRecord>;
  importJobs: Record<string, IngredientImportJob>;
  importDrafts: Record<string, IngredientImportDraft>;
  attachments: Record<string, SourceAttachment>;
}

export interface BrowserStateV4
  extends Omit<BrowserStateV3, "schemaVersion"> {
  schemaVersion: 4;
  agentPreferences: AgentPreferences;
  agentProviderConfigs: Record<string, AgentProviderConfig>;
  agentConversations: Record<string, AgentConversation>;
  agentMessages: Record<string, AgentMessage>;
  agentRuns: Record<string, AgentRun>;
}

export interface BrowserStateV5
  extends Omit<BrowserStateV4, "schemaVersion"> {
  schemaVersion: 5;
  recipes: Record<string, Recipe>;
  recipeDrafts: Record<string, RecipeDraft>;
  recipeVersions: Record<string, RecipeVersion>;
  recipeVersionDependencies: Record<string, string[]>;
}

export interface BrowserStateV6
  extends Omit<BrowserStateV5, "schemaVersion"> {
  schemaVersion: 6;
  nutritionLabels: Record<string, NutritionLabel>;
  nutritionLabelDrafts: Record<string, NutritionLabelDraft>;
  nutritionLabelVersions: Record<string, NutritionLabelVersion>;
}

export interface BrowserStateV7
  extends Omit<BrowserStateV6, "schemaVersion"> {
  schemaVersion: 7;
  researchReports: Record<string, ResearchReportRecord>;
}

export interface BrowserStateV8
  extends Omit<BrowserStateV7, "schemaVersion" | "recipes"> {
  schemaVersion: 8;
  recipes: Record<string, Recipe>;
}

export interface BrowserStateV9
  extends Omit<BrowserStateV8, "schemaVersion"> {
  schemaVersion: 9;
  agentRecipeProposals: Record<string, AgentRecipeProposal>;
  materialNeeds: Record<string, MaterialNeed>;
}

export interface BrowserStateV10
  extends Omit<BrowserStateV9, "schemaVersion"> {
  schemaVersion: 10;
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
    category: "nutrition",
    archivedAt: null,
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
      allergens: { contains: [], mayContain: [] },
      sourceAttachments: [],
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
    schemaVersion: 2,
    categories,
    suppliers: [supplier],
    materialGroups,
    nutrientDefinitions,
    settings: { ...legacy.settings },
    drafts: {},
  };
}

export function migrateV2ToV3(state: BrowserStateV2): BrowserStateV3 {
  return {
    ...state,
    schemaVersion: 3,
    importJobs: {},
    importDrafts: {},
    attachments: {},
  };
}

export function migrateV3ToV4(
  state: BrowserStateV3,
  context: MigrationContext,
): BrowserStateV4 {
  return {
    ...state,
    schemaVersion: 4,
    agentPreferences: {
      enabled: true,
      visionProviderConfigId: null,
    },
    agentProviderConfigs: browserAgentProviderConfigs(context.now()),
    agentConversations: {},
    agentMessages: {},
    agentRuns: {},
  };
}

export function migrateV4ToV5(state: BrowserStateV4): BrowserStateV5 {
  return {
    ...state,
    schemaVersion: 5,
    recipes: {},
    recipeDrafts: {},
    recipeVersions: {},
    recipeVersionDependencies: {},
  };
}

export function migrateV5ToV6(state: BrowserStateV5): BrowserStateV6 {
  return {
    ...state,
    schemaVersion: 6,
    nutritionLabels: {},
    nutritionLabelDrafts: {},
    nutritionLabelVersions: {},
  };
}

export function migrateV6ToV7(state: BrowserStateV6): BrowserStateV7 {
  return {
    ...state,
    schemaVersion: 7,
    researchReports: {},
  };
}

export function migrateV7ToV8(state: BrowserStateV7): BrowserStateV8 {
  return {
    ...state,
    schemaVersion: 8,
    recipes: Object.fromEntries(
      Object.entries(state.recipes).map(([id, recipe]) => [
        id,
        {
          ...recipe,
          productId: recipe.productId ?? recipe.id,
          schemeName: recipe.schemeName?.trim() || "主配方",
          schemeStatus: recipe.schemeStatus ?? "current",
        },
      ]),
    ),
  };
}

export function migrateV8ToV9(state: BrowserStateV8): BrowserStateV9 {
  const extended = state as BrowserStateV8 &
    Partial<Pick<BrowserStateV9, "agentRecipeProposals" | "materialNeeds">>;
  return {
    ...state,
    schemaVersion: 9,
    materialGroups: state.materialGroups.map((group) => ({
      ...group,
      variants: group.variants.map((variant) => ({
        ...variant,
        allergens: variant.allergens ?? { contains: [], mayContain: [] },
      })),
    })),
    nutrientDefinitions: state.nutrientDefinitions.map((definition) => ({
      ...definition,
      category: definition.category ?? "nutrition",
      archivedAt: definition.archivedAt ?? null,
    })),
    agentRecipeProposals: extended.agentRecipeProposals ?? {},
    materialNeeds: extended.materialNeeds ?? {},
  };
}

const theoreticalSweetnessDefinition: NutrientDefinition = {
  id: "theoretical_sweetness",
  code: "theoretical_sweetness",
  name: "理论甜度（蔗糖=1）",
  unit: "倍",
  builtIn: true,
  sortOrder: 1000,
  category: "research",
  archivedAt: null,
};

function legacySweetnessFactor(
  variant: IngredientVariant & {
    sweetness?: {
      basis: "w_w_percent" | "w_v_per_100ml";
      content: string | null;
      relativeFactor: string | null;
    } | null;
  },
): string | null | undefined {
  const legacy = variant.sweetness;
  if (legacy === undefined || legacy === null) return undefined;
  if (legacy.content === null || legacy.relativeFactor === null) return null;
  try {
    const content = new Decimal(legacy.content);
    const factor = new Decimal(legacy.relativeFactor);
    if (legacy.basis === "w_w_percent") {
      return content.mul(factor).div(100).toString();
    }
    if (variant.densityGPerMl === null) return null;
    const density = new Decimal(variant.densityGPerMl);
    if (!density.isFinite() || !density.isPositive()) return null;
    return content.mul(factor).div(density).div(100).toString();
  } catch {
    return null;
  }
}

export function migrateV9ToV10(state: BrowserStateV9): BrowserStateV10 {
  const preservedDefinitions = state.nutrientDefinitions.map((definition) =>
    definition.id !== theoreticalSweetnessDefinition.id &&
    definition.name === theoreticalSweetnessDefinition.name
      ? {
          ...definition,
          name: `${definition.name}（旧模板 ${definition.id}）`,
        }
      : definition,
  );
  return {
    ...state,
    schemaVersion: BROWSER_SCHEMA_VERSION,
    nutrientDefinitions: preservedDefinitions.some(
      (definition) => definition.id === theoreticalSweetnessDefinition.id,
    )
      ? preservedDefinitions.map((definition) =>
          definition.id === theoreticalSweetnessDefinition.id
            ? theoreticalSweetnessDefinition
            : definition,
        )
      : [...preservedDefinitions, theoreticalSweetnessDefinition],
    materialGroups: state.materialGroups.map((group) => ({
      ...group,
      variants: group.variants.map((variant) => {
        const legacyVariant = variant as IngredientVariant & {
          sweetness?: {
            basis: "w_w_percent" | "w_v_per_100ml";
            content: string | null;
            relativeFactor: string | null;
          } | null;
        };
        const migratedFactor = legacySweetnessFactor(legacyVariant);
        const { sweetness: _legacySweetness, ...cleanVariant } = legacyVariant;
        if (
          migratedFactor === undefined ||
          cleanVariant.nutrition.values.some(
            (value) => value.nutrientDefinitionId === theoreticalSweetnessDefinition.id,
          )
        ) {
          return cleanVariant;
        }
        return {
          ...cleanVariant,
          nutrition: {
            ...cleanVariant.nutrition,
            values: [
              ...cleanVariant.nutrition.values,
              {
                nutrientDefinitionId: theoreticalSweetnessDefinition.id,
                value: migratedFactor,
              },
            ],
          },
        };
      }),
    })),
  };
}

export function readBrowserState(
  storage: Storage,
  initialLegacyState: () => LegacyState,
  context: MigrationContext,
): BrowserStateV10 {
  const v10 = storage.getItem(BROWSER_V10_KEY);
  if (v10 !== null) {
    const parsed = JSON.parse(v10) as BrowserStateV10;
    if (parsed.schemaVersion !== BROWSER_SCHEMA_VERSION) {
      throw new Error("unsupported browser schema");
    }
    return parsed;
  }
  const v9 = storage.getItem(BROWSER_V9_KEY);
  if (v9 !== null) {
    const parsed = JSON.parse(v9) as BrowserStateV9;
    if (parsed.schemaVersion !== 9) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(parsed);
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v8 = storage.getItem(BROWSER_V8_KEY);
  if (v8 !== null) {
    const parsed = JSON.parse(v8) as BrowserStateV8;
    if (parsed.schemaVersion !== 8) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(parsed));
    if (
      !("agentRecipeProposals" in parsed) ||
      !("materialNeeds" in parsed)
    ) {
      writeBrowserState(storage, migrated);
    }
    return migrated;
  }

  const v7 = storage.getItem(BROWSER_V7_KEY);
  if (v7 !== null) {
    const parsed = JSON.parse(v7) as BrowserStateV7;
    if (parsed.schemaVersion !== 7) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(parsed)));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v6 = storage.getItem(BROWSER_V6_KEY);
  if (v6 !== null) {
    const parsed = JSON.parse(v6) as BrowserStateV6;
    if (parsed.schemaVersion !== 6) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(migrateV6ToV7(parsed))));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v5 = storage.getItem(BROWSER_V5_KEY);
  if (v5 !== null) {
    const parsed = JSON.parse(v5) as BrowserStateV5;
    if (parsed.schemaVersion !== 5) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(parsed)))));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v4 = storage.getItem(BROWSER_V4_KEY);
  if (v4 !== null) {
    const parsed = JSON.parse(v4) as BrowserStateV4;
    if (parsed.schemaVersion !== 4) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(
      migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(parsed))),
    )));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v3 = storage.getItem(BROWSER_V3_KEY);
  if (v3 !== null) {
    const parsed = JSON.parse(v3) as BrowserStateV3;
    if (parsed.schemaVersion !== 3) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(
      migrateV6ToV7(
        migrateV5ToV6(
          migrateV4ToV5(migrateV3ToV4(parsed, context)),
        ),
      ),
    )));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v2 = storage.getItem(BROWSER_V2_KEY);
  if (v2 !== null) {
    const parsed = JSON.parse(v2) as BrowserStateV2;
    if (parsed.schemaVersion !== 2) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(
      migrateV6ToV7(
        migrateV5ToV6(
          migrateV4ToV5(
            migrateV3ToV4(migrateV2ToV3(parsed), context),
          ),
        ),
      ),
    )));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v1 = storage.getItem(BROWSER_V1_KEY);
  const legacy = v1 === null
    ? initialLegacyState()
    : (JSON.parse(v1) as LegacyState);
  if (legacy.schemaVersion !== 1) {
    throw new Error("unsupported legacy browser schema");
  }
  const migrated = migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(
    migrateV6ToV7(
      migrateV5ToV6(
        migrateV4ToV5(
          migrateV3ToV4(
            migrateV2ToV3(migrateV1ToV2(legacy, context)),
            context,
          ),
        ),
      ),
    ),
  )));
  writeBrowserState(storage, migrated);
  return migrated;
}

export function writeBrowserState(storage: Storage, state: BrowserStateV10) {
  // Keep the historical browser key readable by existing open-source demos,
  // while the in-memory schema and the payload fields are version 10.
  storage.setItem(
    BROWSER_V8_KEY,
    JSON.stringify({ ...state, schemaVersion: 8 }),
  );
}

function browserAgentProviderConfigs(
  updatedAt: string,
): Record<string, AgentProviderConfig> {
  const definitions: Array<
    [
      string,
      AgentProviderKind,
      string,
      AgentProviderProtocol,
      string,
      string,
      boolean,
    ]
  > = [
    ["openai", "openai", "OpenAI", "openai_responses", "https://api.openai.com/v1", "", true],
    ["anthropic", "anthropic", "Anthropic (Claude)", "anthropic_messages", "https://api.anthropic.com", "", true],
    ["gemini", "gemini", "Google (Gemini)", "gemini_generate_content", "https://generativelanguage.googleapis.com/v1beta", "", true],
    ["azure_openai", "azure_openai", "Azure OpenAI", "openai_responses", "", "", true],
    ["deepseek", "deepseek", "DeepSeek", "openai_compatible", "https://api.deepseek.com", "", false],
    ["kimi_cn", "kimi_cn", "Kimi (Moonshot 中国)", "openai_compatible", "https://api.moonshot.cn/v1", "", true],
    ["zhipu_glm", "zhipu_glm", "智谱 GLM", "openai_compatible", "https://open.bigmodel.cn/api/paas/v4", "", true],
    ["minimax_cn", "minimax_cn", "MiniMax (中国)", "openai_compatible", "https://api.minimaxi.com/v1", "", true],
    ["bailian", "bailian", "阿里百炼", "openai_compatible", "https://dashscope.aliyuncs.com/compatible-mode/v1", "", true],
    ["volcengine_ark", "volcengine_ark", "火山引擎 Ark", "openai_responses", "https://ark.cn-beijing.volces.com/api/v3", "", true],
    ["ollama", "ollama", "Ollama（浏览器演示模型）", "openai_compatible", "http://127.0.0.1:11434/v1", "food-rd-demo", false],
    ["custom", "custom", "自定义模型服务", "openai_compatible", "", "", false],
    ["codex_cli", "codex_cli", "Codex CLI（本地）", "codex_cli", "", "", true],
    ["claude_code_cli", "claude_code_cli", "Claude Code CLI（本地）", "claude_code_cli", "", "", true],
  ];
  return Object.fromEntries(
    definitions.map(
      ([id, kind, displayName, protocol, endpoint, model, images]) => [
        id,
        {
          id,
          kind,
          displayName,
          protocol,
          endpoint,
          model,
          contextWindow: kind === "claude_code_cli" ? 200_000 : 128_000,
          reasoningEffort: "auto",
          timeoutSeconds: 120,
          executablePath: null,
          enabled: id === "ollama",
          hasSecret: false,
          capabilities: {
            text: true,
            images,
            tools: true,
            structuredOutput: true,
            streaming: true,
          },
          updatedAt,
        } satisfies AgentProviderConfig,
      ],
    ),
  );
}
