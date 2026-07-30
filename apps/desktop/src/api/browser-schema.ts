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

export const BROWSER_V1_KEY = "food-rd.browser-demo.v1";
export const BROWSER_V2_KEY = "food-rd.browser-demo.v2";
export const BROWSER_V3_KEY = "food-rd.browser-demo.v3";
export const BROWSER_V4_KEY = "food-rd.browser-demo.v4";
export const BROWSER_V5_KEY = "food-rd.browser-demo.v5";
export const BROWSER_SCHEMA_VERSION = 5;

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
    schemaVersion: BROWSER_SCHEMA_VERSION,
    recipes: {},
    recipeDrafts: {},
    recipeVersions: {},
    recipeVersionDependencies: {},
  };
}

export function readBrowserState(
  storage: Storage,
  initialLegacyState: () => LegacyState,
  context: MigrationContext,
): BrowserStateV5 {
  const v5 = storage.getItem(BROWSER_V5_KEY);
  if (v5 !== null) {
    const parsed = JSON.parse(v5) as BrowserStateV5;
    if (parsed.schemaVersion !== BROWSER_SCHEMA_VERSION) {
      throw new Error("unsupported browser schema");
    }
    return parsed;
  }

  const v4 = storage.getItem(BROWSER_V4_KEY);
  if (v4 !== null) {
    const parsed = JSON.parse(v4) as BrowserStateV4;
    if (parsed.schemaVersion !== 4) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV4ToV5(parsed);
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v3 = storage.getItem(BROWSER_V3_KEY);
  if (v3 !== null) {
    const parsed = JSON.parse(v3) as BrowserStateV3;
    if (parsed.schemaVersion !== 3) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV4ToV5(migrateV3ToV4(parsed, context));
    writeBrowserState(storage, migrated);
    return migrated;
  }

  const v2 = storage.getItem(BROWSER_V2_KEY);
  if (v2 !== null) {
    const parsed = JSON.parse(v2) as BrowserStateV2;
    if (parsed.schemaVersion !== 2) {
      throw new Error("unsupported browser schema");
    }
    const migrated = migrateV4ToV5(
      migrateV3ToV4(migrateV2ToV3(parsed), context),
    );
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
  const migrated = migrateV4ToV5(
    migrateV3ToV4(
      migrateV2ToV3(migrateV1ToV2(legacy, context)),
      context,
    ),
  );
  writeBrowserState(storage, migrated);
  return migrated;
}

export function writeBrowserState(storage: Storage, state: BrowserStateV5) {
  storage.setItem(BROWSER_V5_KEY, JSON.stringify(state));
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
