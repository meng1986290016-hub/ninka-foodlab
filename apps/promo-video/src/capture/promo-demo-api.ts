import type {
  AgentConversationView,
  AgentModelDirectory,
  ArtifactManifest,
  HarnessHealth,
  HarnessTask,
  HarnessTaskEvent,
  HarnessTurn,
} from "../../../desktop/src/api/agent-harness-types";
import { BrowserDemoApi } from "../../../desktop/src/api/browser-demo-api";
import { builtInNutrients } from "../../../desktop/src/api/browser-schema";
import type { RecipeVersion } from "../../../desktop/src/api/recipe-types";
import { calculateRecipeDraft } from "../../../desktop/src/features/recipes/recipe-calculation";
import { prepareRecipeVersion } from "../../../desktop/src/features/recipes/recipe-versioning";

export type PromoAgentStage =
  | "input"
  | "progress"
  | "result"
  | "v02-capabilities"
  | "v02-input"
  | "v02-progress"
  | "v02-result";

export interface PromoDemoFixture {
  api: PromoDemoApi;
  recipeId: string;
  recipeVersionId: string;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function emptyDemoStorage() {
  const storage = new MemoryStorage();
  storage.setItem(
    "food-rd.browser-demo.v2",
    JSON.stringify({
      schemaVersion: 2,
      categories: [],
      suppliers: [],
      materialGroups: [],
      nutrientDefinitions: builtInNutrients(),
      settings: {},
      drafts: {},
    }),
  );
  return storage;
}

const PROMPT =
  "请基于现有原料，为低糖可可饮品生成待复核配方提案，并提示关键风险。";
const V02_CAPABILITY_PROMPT = "你能帮我干些什么？";
const V02_PROPOSAL_PROMPT =
  "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。";

const TASK_ID = "promo-agent-task";
const TURN_ID = "promo-agent-turn";
const ARTIFACT_ID = "promo-recipe-proposal";
const V02_TASK_ID = "promo-v02-agent-task";
const V02_CAPABILITY_TURN_ID = "promo-v02-capability-turn";
const V02_PROPOSAL_TURN_ID = "promo-v02-proposal-turn";
const V02_ARTIFACT_ID = "promo-v02-recipe-proposal";
const CREATED_AT = "2026-08-24T09:30:00.000Z";

function isV02Stage(stage: PromoAgentStage) {
  return stage.startsWith("v02-");
}

function isV02ProposalStage(stage: PromoAgentStage) {
  return stage === "v02-progress" || stage === "v02-result";
}

export class PromoDemoApi extends BrowserDemoApi {
  constructor(private readonly promoStage: PromoAgentStage) {
    let sequence = 0;
    super({
      storage: emptyDemoStorage(),
      createId: () => `promo-${++sequence}`,
      now: () => CREATED_AT,
      agentResponseDelayMs: 0,
    });
  }

  override async getHarnessHealth(): Promise<HarnessHealth> {
    return { status: "ready", lastError: null, reinstallRequired: false };
  }

  override async getAgentModelDirectory(): Promise<AgentModelDirectory> {
    return {
      current: {
        engine: "foodlab_runtime",
        provider: "demo",
        model: "demo-model",
      },
      routable: true,
      hasUsableProvider: true,
      currentUsable: true,
      groups: [
        {
          engine: "foodlab_runtime",
          provider: "demo",
          displayName: "演示模型",
          models: [{ id: "demo-model", name: "演示模型" }],
        },
      ],
      failures: [],
    };
  }

  override async listHarnessTasks(scope: "active" | "archived" = "active") {
    if (
      scope === "archived" ||
      (this.promoStage === "input" && !isV02Stage(this.promoStage))
    ) {
      return [];
    }
    return [this.task()];
  }

  override async getAgentConversationView(): Promise<AgentConversationView> {
    return {
      conversation: this.task(),
      activeTurns: this.turns(),
      queuedMessages: [],
      queuePaused: false,
    };
  }

  override async listHarnessTurns(): Promise<HarnessTurn[]> {
    return this.promoStage === "input" ? [] : this.turns();
  }

  override async listHarnessEvents(): Promise<HarnessTaskEvent[]> {
    if (
      this.promoStage === "input" ||
      this.promoStage === "v02-capabilities" ||
      this.promoStage === "v02-input"
    ) {
      return [];
    }
    const events: HarnessTaskEvent[] = [
      this.event(1, "tool/call", "call-search", {
        data: { name: "mcp__food_rd__diagnose_recipe", argumentsRedacted: true },
      }),
      this.event(2, "tool/result", "call-search", {
        data: { message: { toolCallId: "call-search", isError: false } },
      }),
      this.event(3, "tool/call", "call-proposal", {
        data: {
          name: "mcp__food_rd__create_recipe_proposal",
          argumentsRedacted: true,
        },
      }),
    ];
    if (this.promoStage === "result" || this.promoStage === "v02-result") {
      events.push(
        this.event(4, "tool/result", "call-proposal", {
          data: { message: { toolCallId: "call-proposal", isError: false } },
        }),
      );
    }
    return events;
  }

  override async listHarnessArtifacts(): Promise<ArtifactManifest[]> {
    return this.promoStage === "result" || this.promoStage === "v02-result"
      ? [this.artifact()]
      : [];
  }

  override async syncHarnessTask(): Promise<HarnessTask> {
    return this.task();
  }

  private task(): HarnessTask {
    const v02 = isV02Stage(this.promoStage);
    const running =
      this.promoStage === "progress" || this.promoStage === "v02-progress";
    const result =
      this.promoStage === "result" || this.promoStage === "v02-result";
    return {
      id: v02 ? V02_TASK_ID : TASK_ID,
      harnessSessionId: v02 ? V02_TASK_ID : TASK_ID,
      title: v02 ? "食品研发助手对话" : "低糖可可饮品提案",
      workflow: "recipe_proposal",
      status: running ? "running" : result ? "needs_review" : "completed",
      taskContract: {
        workflow: "recipe_proposal",
        allowedTools: [
          "search_material_groups",
          "search_supplier_variants",
          "evaluate_recipe_proposal",
          "create_recipe_proposal",
          "request_open_recipe_proposal_review",
        ],
        requiredSteps: ["evaluate_recipe_proposal", "create_recipe_proposal"],
        requiredArtifactKinds: ["recipe_proposal"],
        approvalPolicy: "review_before_commit",
        completionPredicate: "a validated proposal exists in needs_review state",
      },
      activeRecipeId: null,
      activeRecipeName: null,
      activeLeafTurnId: v02
        ? isV02ProposalStage(this.promoStage)
          ? V02_PROPOSAL_TURN_ID
          : V02_CAPABILITY_TURN_ID
        : TURN_ID,
      lastEventSeq: running ? 3 : result ? 4 : 0,
      errorCode: null,
      errorSummary: null,
      activeRoute: {
        engine: "foodlab_runtime",
        provider: "demo",
        model: "demo-model",
      },
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  private turns(): HarnessTurn[] {
    if (!isV02Stage(this.promoStage)) return [this.legacyTurn()];
    return isV02ProposalStage(this.promoStage)
      ? [this.v02CapabilityTurn(), this.v02ProposalTurn()]
      : [this.v02CapabilityTurn()];
  }

  private legacyTurn(): HarnessTurn {
    const running = this.promoStage === "progress";
    return {
      id: TURN_ID,
      taskId: TASK_ID,
      harnessTurnId: "0",
      parentTurnId: null,
      status: running ? "running" : "needs_review",
      userContent: PROMPT,
      contentBlocks: running
        ? []
        : [
            {
              type: "markdown",
              text:
                "已结合原料库中的具体供应商版本，并使用系统计算引擎完成营养、成本和投料试算。\n\n**需要人工复核**\n\n- ‘低糖’声称需按适用标准与产品类别复核\n- 复配稳定剂的适用范围与用量需人工确认\n- 得率和工艺损耗需结合打样结果确认",
            },
            { type: "artifact_ref", artifactId: ARTIFACT_ID },
            {
              type: "action",
              action: "打开完整配方提案复核层",
              requiresApproval: true,
            },
          ],
      route: {
        engine: "foodlab_runtime",
        provider: "demo",
        model: "demo-model",
      },
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  private v02CapabilityTurn(): HarnessTurn {
    return {
      id: V02_CAPABILITY_TURN_ID,
      taskId: V02_TASK_ID,
      harnessTurnId: "0",
      parentTurnId: null,
      status: "completed",
      userContent: V02_CAPABILITY_PROMPT,
      contentBlocks: [
        {
          type: "markdown",
          text:
            "我可以帮你：\n\n- **整理原料资料**：从标签、规格书或表格建立待复核原料草稿\n- **生成配方提案**：结合原料库试算投料、营养、成本与数据完整度\n- **逆向产品标签**：给出可编辑估算并标明关键假设\n- **复盘研发记录**：整理已记录事实、待确认项与下一轮打样建议\n\n正式写入前，需要你确认。",
        },
      ],
      route: {
        engine: "foodlab_runtime",
        provider: "demo",
        model: "demo-model",
      },
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  private v02ProposalTurn(): HarnessTurn {
    const running = this.promoStage === "v02-progress";
    return {
      id: V02_PROPOSAL_TURN_ID,
      taskId: V02_TASK_ID,
      harnessTurnId: "1",
      parentTurnId: V02_CAPABILITY_TURN_ID,
      status: running ? "running" : "needs_review",
      userContent: V02_PROPOSAL_PROMPT,
      contentBlocks: running
        ? []
        : [
            {
              type: "markdown",
              text:
                "已结合原料库中的具体供应商版本，完成投料、营养和成本试算，并生成一份可编辑配方提案。",
            },
            {
              type: "table",
              columns: [
                { key: "material", label: "原料" },
                { key: "amount", label: "演示用量" },
              ],
              rows: [
                ["饮用水", "894 g"],
                ["脱脂乳粉", "50 g"],
                ["可可粉", "28 g"],
                ["赤藓糖醇", "25 g"],
                ["白砂糖", "2 g"],
                ["复配稳定剂", "1 g"],
                ["合计", "1000 g"],
              ],
            },
            { type: "artifact_ref", artifactId: V02_ARTIFACT_ID },
            {
              type: "action",
              action: "打开完整配方提案复核层",
              requiresApproval: true,
            },
          ],
      route: {
        engine: "foodlab_runtime",
        provider: "demo",
        model: "demo-model",
      },
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  private artifact(): ArtifactManifest {
    const v02 = this.promoStage === "v02-result";
    return {
      id: v02 ? V02_ARTIFACT_ID : ARTIFACT_ID,
      taskId: v02 ? V02_TASK_ID : TASK_ID,
      turnId: v02 ? V02_PROPOSAL_TURN_ID : TURN_ID,
      toolCallId: "call-proposal",
      kind: "recipe_proposal",
      title: "低糖可可饮品（演示）",
      domainRef: "demo:recipe-proposal",
      logicalPath: null,
      mimeType: "application/json",
      sha256: null,
      byteSize: null,
      status: "needs_review",
      provenance: { source: "synthetic_demo", requiresHumanConfirmation: true },
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }

  private event(
    seq: number,
    eventType: string,
    callId: string,
    payload: unknown,
  ): HarnessTaskEvent {
    const v02 = isV02Stage(this.promoStage);
    return {
      taskId: v02 ? V02_TASK_ID : TASK_ID,
      seq,
      eventType,
      turnId: v02 ? V02_PROPOSAL_TURN_ID : TURN_ID,
      stepId: String(seq),
      callId,
      payload,
      createdAt: CREATED_AT,
    };
  }
}

interface MaterialSeed {
  name: string;
  category: string;
  supplier: "演示供应商 A" | "演示供应商 B" | "演示供应商 C";
  specification: string;
  internalCode: string;
  price: string;
  density: string | null;
  notes: string;
  allergens?: { contains: string[]; mayContain: string[] };
  nutrients: Record<string, string>;
}

const materialSeeds: MaterialSeed[] = [
  {
    name: "饮用水",
    category: "基础原料",
    supplier: "演示供应商 A",
    specification: "配方用水 · 演示规格",
    internalCode: "DEMO-RM-001",
    price: "0.80",
    density: "1",
    notes: "合成演示数据，用于配方质量平衡。",
    nutrients: { energy: "0", protein: "0", fat: "0", carbohydrate: "0", sodium: "0" },
  },
  {
    name: "脱脂乳粉",
    category: "乳制品",
    supplier: "演示供应商 A",
    specification: "低脂乳粉 SMP-D",
    internalCode: "DEMO-RM-002",
    price: "31.50",
    density: null,
    notes: "合成演示规格；用于展示含乳原料、营养和成本联动。",
    allergens: { contains: ["乳及乳制品"], mayContain: [] },
    nutrients: { energy: "1500", protein: "34", fat: "1", carbohydrate: "52", sodium: "500" },
  },
  {
    name: "可可粉",
    category: "风味原料",
    supplier: "演示供应商 B",
    specification: "低脂可可粉 CP-10",
    internalCode: "DEMO-RM-003",
    price: "48.00",
    density: null,
    notes: "合成演示规格；颜色与风味强度需结合打样复核。",
    nutrients: { energy: "1300", protein: "22", fat: "11", carbohydrate: "15", sodium: "30" },
  },
  {
    name: "赤藓糖醇",
    category: "甜味原料",
    supplier: "演示供应商 B",
    specification: "结晶型 E-100",
    internalCode: "DEMO-RM-004",
    price: "19.80",
    density: null,
    notes: "合成演示规格；法规适用范围与标签标示需人工复核。",
    nutrients: { energy: "0", protein: "0", fat: "0", carbohydrate: "0", sodium: "0" },
  },
  {
    name: "白砂糖",
    category: "甜味原料",
    supplier: "演示供应商 C",
    specification: "一级白砂糖",
    internalCode: "DEMO-RM-005",
    price: "6.80",
    density: null,
    notes: "合成演示规格；用于展示少量糖的营养计算。",
    nutrients: { energy: "1700", protein: "0", fat: "0", carbohydrate: "100", sodium: "0" },
  },
  {
    name: "复配稳定剂",
    category: "食品添加剂",
    supplier: "演示供应商 C",
    specification: "饮品用 ST-02",
    internalCode: "DEMO-RM-006",
    price: "36.00",
    density: null,
    notes: "合成演示规格；适用范围和使用量需按产品类别人工确认。",
    nutrients: { energy: "0", protein: "0", fat: "0", carbohydrate: "0", sodium: "100" },
  },
];

export async function createPromoDemoApi(
  stage: PromoAgentStage,
): Promise<PromoDemoFixture> {
  const api = new PromoDemoApi(stage);
  const definitions = await api.listNutrientDefinitions();
  const categoryIds = new Map<string, string>();
  const supplierIds = new Map<string, string>();

  for (const seed of materialSeeds) {
    if (!categoryIds.has(seed.category)) {
      const category = await api.createCategory(seed.category);
      categoryIds.set(seed.category, category.id);
    }
    if (!supplierIds.has(seed.supplier)) {
      const supplier = await api.createSupplier(
        seed.supplier,
        "仅用于宣传片隔离环境的合成演示供应商",
      );
      supplierIds.set(seed.supplier, supplier.id);
    }
  }

  const variantIds = new Map<string, string>();
  for (const seed of materialSeeds) {
    const group = await api.createMaterialGroup({
      name: seed.name,
      categoryId: categoryIds.get(seed.category) ?? null,
    });
    const variant = await api.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplierIds.get(seed.supplier)!,
      modelOrSpecification: seed.specification,
      internalCode: seed.internalCode,
      currentPrice: seed.price,
      priceUnit: "kg",
      densityGPerMl: seed.density,
      source: "合成演示规格书（非真实供应商数据）",
      researchNotes: seed.notes,
      nutrition: {
        basis: "per_100g",
        values: definitions.map((definition) => ({
          nutrientDefinitionId: definition.id,
          value: seed.nutrients[definition.id] ?? "0",
        })),
      },
      allergens: seed.allergens ?? { contains: [], mayContain: [] },
    });
    variantIds.set(seed.name, variant.id);
  }

  const recipe = await api.createRecipe({
    name: "低糖可可饮品（演示）",
    code: "DEMO-COCOA-01",
    tags: ["演示数据", "待复核"],
    kind: "formula",
  });
  const amounts: Array<[string, string]> = [
    ["饮用水", "894"],
    ["脱脂乳粉", "50"],
    ["可可粉", "28"],
    ["赤藓糖醇", "25"],
    ["白砂糖", "2"],
    ["复配稳定剂", "1"],
  ];
  let draft = await api.saveRecipeDraft({
    recipeId: recipe.id,
    basedOnVersionId: null,
    source: "agent",
    targetBatchGrams: "1000",
    finishedMassGrams: null,
    servingMassGrams: "250",
    packageCount: "4",
    items: amounts.map(([name, amount], index) => ({
      id: `promo-item-${index + 1}`,
      position: index,
      kind: "ingredient" as const,
      ingredientVariantId: variantIds.get(name)!,
      amount,
      unit: "g" as const,
      locked: false,
      autoFill: false,
    })),
    packagingCosts: [],
    additionalCosts: [],
    targets: [],
    markdownNotes:
      "合成演示配方。低糖声称、稳定剂适用范围及得率与工艺损耗均需人工复核。",
    calculation: null,
    calculationIssues: [],
  });

  const provisionalCalculation = calculateRecipeDraft({
    draft,
    referencedVersions: [],
    nutrientDefinitions: definitions,
    calculatedAt: CREATED_AT,
  });
  if (!provisionalCalculation.ok) {
    throw new Error(`演示配方无法计算：${provisionalCalculation.issues.map((item) => item.message).join("；")}`);
  }
  draft = await api.saveRecipeDraft({
    ...draft,
    finishedMassGrams: "1000",
    items: draft.items.map((item) =>
      item.kind === "ingredient"
        ? {
            id: item.id,
            position: item.position,
            kind: item.kind,
            ingredientVariantId: item.ingredientVariantId,
            amount: item.amount,
            unit: item.unit,
            locked: item.locked,
            autoFill: item.autoFill,
          }
        : item.kind === "recipe_version"
          ? {
              id: item.id,
              position: item.position,
              kind: item.kind,
              recipeVersionId: item.recipeVersionId,
              amount: item.amount,
              unit: item.unit,
              locked: item.locked,
              autoFill: item.autoFill,
            }
          : {
              id: item.id,
              position: item.position,
              kind: item.kind,
              materialNeedId: item.materialNeedId,
              amount: item.amount,
              unit: item.unit,
              locked: item.locked,
              autoFill: item.autoFill,
            },
    ),
    calculation: provisionalCalculation.value.calculation,
    calculationIssues: provisionalCalculation.warnings,
  });

  const calculation = calculateRecipeDraft({
    draft,
    referencedVersions: [],
    nutrientDefinitions: definitions,
    calculatedAt: CREATED_AT,
  });
  if (!calculation.ok) {
    throw new Error(`演示成品质量无法计算：${calculation.issues.map((item) => item.message).join("；")}`);
  }
  draft = await api.saveRecipeDraft({
    ...draft,
    items: draft.items.map((item) =>
      item.kind === "ingredient"
        ? {
            id: item.id,
            position: item.position,
            kind: item.kind,
            ingredientVariantId: item.ingredientVariantId,
            amount: item.amount,
            unit: item.unit,
            locked: item.locked,
            autoFill: item.autoFill,
          }
        : item.kind === "recipe_version"
          ? {
              id: item.id,
              position: item.position,
              kind: item.kind,
              recipeVersionId: item.recipeVersionId,
              amount: item.amount,
              unit: item.unit,
              locked: item.locked,
              autoFill: item.autoFill,
            }
          : {
              id: item.id,
              position: item.position,
              kind: item.kind,
              materialNeedId: item.materialNeedId,
              amount: item.amount,
              unit: item.unit,
              locked: item.locked,
              autoFill: item.autoFill,
            },
    ),
    calculation: calculation.value.calculation,
    calculationIssues: calculation.warnings,
  });

  const preparation = prepareRecipeVersion({
    recipe,
    recipeName: recipe.name,
    draft,
    sourceDraftId: draft.id,
    calculation,
  });
  if (!preparation.ok) {
    throw new Error(`演示正式版本无法创建：${preparation.issues.map((item) => item.message).join("；")}`);
  }
  const version: RecipeVersion = await api.createRecipeVersion(
    preparation.value.input,
  );

  return {
    api,
    recipeId: recipe.id,
    recipeVersionId: version.id,
  };
}

export {
  PROMPT as PROMO_AGENT_PROMPT,
  V02_CAPABILITY_PROMPT as PROMO_V02_CAPABILITY_PROMPT,
  V02_PROPOSAL_PROMPT as PROMO_V02_PROPOSAL_PROMPT,
};
