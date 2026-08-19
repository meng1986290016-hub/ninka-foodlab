import {
  calculateNutritionLabel as calculateCoreNutritionLabel,
  researchReportDocumentHash,
  type ResearchReportExportFormat,
} from "@food-rd/core";
import Decimal from "decimal.js";
import type {
  AgentEvent,
  AgentConversation,
  AgentMessage,
  AgentModelOption,
  AgentPreferences,
  AgentProviderConfig,
  AgentProviderConfigInput,
  AgentProviderSecretInput,
  AgentProviderTestResult,
  AgentRun,
  AgentRunRequest,
  CliDetectionResult,
} from "./agent-types";
import type { BrowserAgentEventSource } from "./agent-event-source";
import type {
  AcceptedAgentRecipeProposal,
  AgentRecipeProposal,
  AgentRecipeProposalAcceptInput,
  AgentRecipeProposalEvaluation,
  AgentRecipeProposalPayload,
  MaterialNeed,
  MaterialNeedStatus,
} from "./agent-recipe-types";
import { evaluateBrowserAgentRecipe } from "./browser-agent-recipe";
import type { DesktopApi } from "./desktop-api";
import type {
  BackupManifest,
  BackupPreflight,
  BackupRestoreResult,
} from "./backup-types";
import type {
  IngredientExchangeFormat,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ImportIssue,
  DraftSourceLink,
  ReviewedIngredientImportDraft,
  SourceAttachment,
} from "./import-types";
import {
  BROWSER_SCHEMA_VERSION,
  type BrowserStateV10 as BrowserStateV5,
  type LegacyState,
  readBrowserState,
  writeBrowserState,
} from "./browser-schema";
import type {
  NutritionLabel,
  NutritionLabelCalculation,
  NutritionLabelDraft,
  NutritionLabelDraftSaveInput,
  NutritionLabelInput,
  NutritionLabelVersion,
} from "./nutrition-label-types";
import type {
  Recipe,
  RecipeAlternativeCreateInput,
  RecipeDraft,
  RecipeDraftIngredientItem,
  RecipeDraftMaterialNeedItem,
  RecipeDraftItemInput,
  RecipeDraftSaveInput,
  RecipeDraftVersionItem,
  RecipeInput,
  RecipeSchemeUpdateInput,
  RecipeSummary,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionComparisonRow,
  RecipeVersionCreateInput,
  RecipeVersionItemChange,
  RecipeVersionReference,
  RecipeVersionSnapshot,
} from "./recipe-types";
import {
  recipeProductId,
  recipeSchemeStatus,
} from "./recipe-types";
import { recipeVersionOutputMass } from "./recipe-output-mass";
import type {
  ResearchReportExportRequest,
  ResearchReportRecord,
  ResearchReportRecordInput,
} from "./research-report-types";
import type { SampleSheetExportRequest } from "./sample-sheet-types";
import {
  DesktopApiError,
  type Category,
  type DatabaseStatus,
  type DraftRecord,
  type Ingredient,
  type IngredientInput,
  type IngredientListRequest,
  type IngredientVariant,
  type IngredientVariantInput,
  type MaterialGroup,
  type MaterialGroupInput,
  type NutrientDefinition,
  type Supplier,
  type VariantComparison,
} from "./types";
import {
  buildVariantComparison,
  calculateCompleteness,
} from "../features/ingredients/nutrition-model";

interface BrowserDemoApiOptions {
  storage?: Storage;
  createId?: () => string;
  now?: () => string;
  agentEvents?: BrowserAgentEventSource;
  agentResponseDelayMs?: number;
}

const seedIngredients: Ingredient[] = [
  {
    id: "demo-sugar",
    name: "白砂糖",
    internalCode: "RM-0001",
    category: "甜味原料",
    tags: ["常用"],
    notes: "浏览器演示原料",
    densityGPerMl: null,
    currentPrice: "6.80",
    priceUnit: "kg",
    priceUpdatedAt: "2026-07-14",
    source: "演示供应商规格书",
    sourceDate: "2026-07-01",
    completeness: 92,
    createdAt: "2026-07-14T02:30:00.000Z",
    updatedAt: "2026-07-14T02:30:00.000Z",
    archivedAt: null,
  },
  {
    id: "demo-milk-powder",
    name: "脱脂乳粉",
    internalCode: "RM-0002",
    category: "乳制品",
    tags: ["含乳"],
    notes: "浏览器演示原料",
    densityGPerMl: null,
    currentPrice: "31.50",
    priceUnit: "kg",
    priceUpdatedAt: "2026-07-13",
    source: "演示供应商规格书",
    sourceDate: "2026-06-28",
    completeness: 78,
    createdAt: "2026-07-13T08:45:00.000Z",
    updatedAt: "2026-07-13T08:45:00.000Z",
    archivedAt: null,
  },
  {
    id: "demo-lemon",
    name: "柠檬浓缩汁",
    internalCode: "RM-0003",
    category: "果蔬原料",
    tags: ["需冷藏"],
    notes: "浏览器演示原料",
    densityGPerMl: "1.16",
    currentPrice: "18.20",
    priceUnit: "kg",
    priceUpdatedAt: "2026-07-12",
    source: "演示供应商规格书",
    sourceDate: "2026-06-20",
    completeness: 64,
    createdAt: "2026-07-12T01:15:00.000Z",
    updatedAt: "2026-07-12T01:15:00.000Z",
    archivedAt: null,
  },
];

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;
const LEGACY_SUPPLIER_ID = "browser-legacy-unspecified-supplier";
const SUPPORTED_IMPORT_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "txt",
]);

function createInitialLegacyState(): LegacyState {
  return {
    schemaVersion: 1,
    ingredients: seedIngredients.map((ingredient) => ({ ...ingredient })),
    settings: {},
    drafts: {},
  };
}

function draftId(kind: string, key: string) {
  return `${kind}:${key}`;
}

function recipeVersionSequenceKey(recipeId: string) {
  return `recipe.version-sequence.${recipeId}`;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function nullableText(value: string | null) {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function defaultStorage() {
  if (typeof window === "undefined") {
    throw new DesktopApiError("storage_failure", "浏览器存储不可用");
  }
  return window.localStorage;
}

function defaultId() {
  return globalThis.crypto.randomUUID();
}

function legacyCompleteness(input: IngredientInput) {
  const values = [
    input.name,
    input.internalCode,
    input.category,
    input.currentPrice,
    input.priceUpdatedAt,
    input.source,
    input.sourceDate,
    input.densityGPerMl,
  ];
  const present = values.filter(
    (value) => value !== null && value.trim() !== "",
  );
  return Math.round((present.length / values.length) * 100);
}

function cloneBrowserState(state: BrowserStateV5): BrowserStateV5 {
  return JSON.parse(JSON.stringify(state)) as BrowserStateV5;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function versionReference(version: RecipeVersion): RecipeVersionReference {
  return {
    id: version.id,
    recipeId: version.recipeId,
    recipeName: version.snapshot.recipe.name,
    versionNumber: version.versionNumber,
    outputMassGrams: recipeVersionOutputMass(version.snapshot),
    createdAt: version.createdAt,
  };
}

function draftItemsFromSnapshot(
  snapshot: RecipeVersionSnapshot,
): RecipeDraftItemInput[] {
  return snapshot.items.map((item) =>
    item.kind === "ingredient"
      ? {
          id: item.id,
          position: item.position,
          kind: "ingredient",
          ingredientVariantId: item.ingredient.ingredientVariantId,
          amount: item.amount,
          unit: item.unit,
          locked: false,
          autoFill: false,
        }
      : {
          id: item.id,
          position: item.position,
          kind: "recipe_version",
          recipeVersionId: item.recipeVersion.id,
          amount: item.amount,
          unit: item.unit,
          locked: false,
          autoFill: false,
        },
  );
}

function comparisonRows(
  beforeValues: Map<string, { label: string; unit: string | null; value: string | null }>,
  afterValues: Map<string, { label: string; unit: string | null; value: string | null }>,
): RecipeVersionComparisonRow[] {
  return [...new Set([...beforeValues.keys(), ...afterValues.keys()])]
    .map((key) => {
      const before = beforeValues.get(key);
      const after = afterValues.get(key);
      return {
        key,
        label: after?.label ?? before?.label ?? key,
        unit: after?.unit ?? before?.unit ?? null,
        before: before?.value ?? null,
        after: after?.value ?? null,
      } satisfies RecipeVersionComparisonRow;
    })
    .filter((row) => row.before !== row.after);
}

function buildRecipeVersionComparison(
  before: RecipeVersion,
  after: RecipeVersion,
): RecipeVersionComparison {
  const beforeItems = new Map(before.snapshot.items.map((item) => [item.id, item]));
  const afterItems = new Map(after.snapshot.items.map((item) => [item.id, item]));
  const itemChanges: RecipeVersionItemChange[] = [];
  for (const itemId of new Set([...beforeItems.keys(), ...afterItems.keys()])) {
    const beforeItem = beforeItems.get(itemId);
    const afterItem = afterItems.get(itemId);
    const beforeLabel = beforeItem ? comparisonItemLabel(beforeItem) : null;
    const afterLabel = afterItem ? comparisonItemLabel(afterItem) : null;
    const label = afterLabel ?? beforeLabel ?? itemId;
    if (!beforeItem || !afterItem) {
      itemChanges.push({
        kind: beforeItem ? "removed" : "added",
        itemKey: itemId,
        label,
        beforeLabel,
        afterLabel,
        beforeAmountGrams: beforeItem?.massGrams ?? null,
        afterAmountGrams: afterItem?.massGrams ?? null,
      });
      continue;
    }
    const beforeReference = beforeItem.kind === "ingredient"
      ? `ingredient:${beforeItem.ingredient.ingredientVariantId}`
      : `recipe_version:${beforeItem.recipeVersion.id}`;
    const afterReference = afterItem.kind === "ingredient"
      ? `ingredient:${afterItem.ingredient.ingredientVariantId}`
      : `recipe_version:${afterItem.recipeVersion.id}`;
    if (beforeReference !== afterReference) {
      itemChanges.push({
        kind: "reference_changed",
        itemKey: itemId,
        label,
        beforeLabel: beforeLabel ?? label,
        afterLabel: afterLabel ?? label,
        beforeAmountGrams: beforeItem.massGrams,
        afterAmountGrams: afterItem.massGrams,
      });
    } else if (beforeItem.massGrams !== afterItem.massGrams) {
      itemChanges.push({
        kind: "amount_changed",
        itemKey: itemId,
        label,
        beforeLabel: beforeLabel ?? label,
        afterLabel: afterLabel ?? label,
        beforeAmountGrams: beforeItem.massGrams,
        afterAmountGrams: afterItem.massGrams,
      });
    }
  }

  const nutrients = (
    version: RecipeVersion,
    category: "nutrition" | "research",
  ) =>
    new Map(
      version.snapshot.calculation.nutrients
        .filter((nutrient) => (nutrient.category ?? "nutrition") === category)
        .map((nutrient) => [
        nutrient.nutrientDefinitionId,
        {
          label: nutrient.name,
          unit: nutrient.unit,
          value:
            nutrient.status === "unknown"
              ? "已选择，未知"
              : nutrient.per100gKnownAmount,
        },
      ]),
    );
  const costs = (version: RecipeVersion) =>
    new Map(
      [
        ["batchTotal", "整批成本", version.snapshot.calculation.cost.batchTotal],
        ["perKg", "每千克成本", version.snapshot.calculation.cost.perKg],
        ["per100g", "每100克成本", version.snapshot.calculation.cost.per100g],
        ["perServing", "每份成本", version.snapshot.calculation.cost.perServing],
        ["perPackage", "每包装成本", version.snapshot.calculation.cost.perPackage],
      ].map(([key, label, value]) => [
        key as string,
        { label: label as string, unit: "CNY", value: value as string | null },
      ]),
    );
  const targets = (version: RecipeVersion) =>
    new Map(
      version.snapshot.targets.map((target) => {
        const evaluation = version.snapshot.calculation.targets.find(
          (candidate) => candidate.targetId === target.id,
        );
        return [
          target.id,
          {
            label: comparisonTargetLabel(target),
            unit:
              target.metric.kind === "cost"
                ? "CNY"
                : target.metric.unit,
            value: [
              comparisonTargetRange(target),
              `实际 ${comparisonObservedValue(evaluation?.observed)}`,
              comparisonTargetStatus(evaluation?.status ?? "unknown"),
            ].join(" · "),
          },
        ];
      }),
    );
  const allergens = (version: RecipeVersion) =>
    new Map([
      [
        "contains",
        {
          label: "含有",
          unit: null,
          value: version.snapshot.calculation.allergens.contains.join("、"),
        },
      ],
      [
        "mayContain",
        {
          label: "可能含有",
          unit: null,
          value: version.snapshot.calculation.allergens.mayContain.join("、"),
        },
      ],
    ]);

  return {
    before: versionReference(before),
    after: versionReference(after),
    itemChanges,
    nutritionChanges: comparisonRows(
      nutrients(before, "nutrition"),
      nutrients(after, "nutrition"),
    ),
    researchChanges: comparisonRows(
      nutrients(before, "research"),
      nutrients(after, "research"),
    ),
    costChanges: comparisonRows(costs(before), costs(after)),
    targetChanges: comparisonRows(targets(before), targets(after)),
    allergenChanges: comparisonRows(allergens(before), allergens(after)),
    notesChanged:
      before.snapshot.markdownNotes !== after.snapshot.markdownNotes,
  };
}

function comparisonItemLabel(
  item: RecipeVersion["snapshot"]["items"][number],
) {
  return item.kind === "ingredient"
    ? [
        item.ingredient.materialName,
        item.ingredient.supplierName,
        item.ingredient.modelOrSpecification,
      ]
        .filter(Boolean)
        .join(" · ")
    : `${item.recipeVersion.recipeName} V${item.recipeVersion.versionNumber}`;
}

function comparisonTargetLabel(
  target: RecipeVersion["snapshot"]["targets"][number],
) {
  if (target.metric.kind === "nutrition_per_100g") {
    return `${target.metric.nutrientName}（每 100g）`;
  }
  const labels = {
    batch: "整批成本",
    per_kg: "每千克成本",
    per_100g: "每 100g 成本",
    per_serving: "每份成本",
    per_package: "每包装成本",
  };
  return labels[target.metric.basis];
}

function comparisonTargetRange(
  target: RecipeVersion["snapshot"]["targets"][number],
) {
  const unit =
    target.metric.kind === "cost" ? " 元" : ` ${target.metric.unit}`;
  if (target.minimum !== null && target.maximum !== null) {
    return `${target.minimum}–${target.maximum}${unit}`;
  }
  if (target.minimum !== null) return `≥ ${target.minimum}${unit}`;
  if (target.maximum !== null) return `≤ ${target.maximum}${unit}`;
  return "未设置范围";
}

function comparisonTargetStatus(
  status: "met" | "below" | "above" | "unknown",
) {
  return {
    met: "已达到",
    below: "低于目标",
    above: "高于目标",
    unknown: "待计算",
  }[status];
}

function comparisonObservedValue(value: string | null | undefined) {
  if (value === null || value === undefined) return "未知";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return numericValue.toFixed(4).replace(/\.?0+$/, "");
}

function demoMediaType(extension: string) {
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
    }[extension] ?? "application/octet-stream"
  );
}

function demoReview(
  fileName: string,
  definitions: NutrientDefinition[],
): ReviewedIngredientImportDraft {
  const displayName = fileName.split(/[\\/]/).pop() ?? fileName;
  const materialName = displayName.replace(/\.[^.]+$/, "").trim() || "演示原料";
  return {
    materialGroupId: null,
    materialName,
    categoryId: null,
    categoryName: "演示分类",
    supplierId: null,
    supplierName: "演示供应商",
    modelOrSpecification: "",
    currentPrice: null,
    priceUnit: "kg",
    densityGPerMl: null,
    nutritionBasis: "per_100g",
    nutrients: definitions.filter(
      (definition) => definition.builtIn && definition.category === "nutrition",
    ).map((definition) => ({
      definitionId: definition.id,
      name: definition.name,
      unit: definition.unit,
      value: null,
      category: definition.category,
    })),
    containsAllergens: [],
    mayContainAllergens: [],
    source: displayName,
    researchNotes: "浏览器演示草稿，请人工复核后保存",
    duplicateConfirmed: false,
  };
}

function demoSourceLinks(
  attachmentId: string,
  review: ReviewedIngredientImportDraft,
): DraftSourceLink[] {
  const links: DraftSourceLink[] = [
    {
      fieldPath: "materialName",
      attachmentId,
      sourceLocator: "文件名与原料标题",
      confidence: "high",
    },
    {
      fieldPath: "supplierName",
      attachmentId,
      sourceLocator: "供应商信息",
      confidence: "medium",
    },
    {
      fieldPath: "nutritionBasis",
      attachmentId,
      sourceLocator: "营养成分表",
      confidence: "low",
    },
    {
      fieldPath: "source",
      attachmentId,
      sourceLocator: "原始文件",
      confidence: "high",
    },
  ];
  if (review.modelOrSpecification) {
    links.push({
      fieldPath: "modelOrSpecification",
      attachmentId,
      sourceLocator: "产品规格",
      confidence: "high",
    });
  }
  if (review.currentPrice !== null) {
    links.push({
      fieldPath: "currentPrice",
      attachmentId,
      sourceLocator: "价格信息",
      confidence: "medium",
    });
  }
  for (const nutrient of review.nutrients) {
    if (nutrient.value !== null) {
      links.push({
        fieldPath: `nutrients.${nutrient.name}.value`,
        attachmentId,
        sourceLocator: "营养成分表",
        confidence: "high",
      });
    }
  }
  return links;
}

function normalizeImportReview(
  review: ReviewedIngredientImportDraft,
): ReviewedIngredientImportDraft {
  return {
    ...review,
    materialName: review.materialName.trim(),
    categoryName: nullableText(review.categoryName),
    supplierName: review.supplierName.trim(),
    modelOrSpecification: review.modelOrSpecification.trim(),
    currentPrice: nullableText(review.currentPrice),
    densityGPerMl: nullableText(review.densityGPerMl),
    nutrients: review.nutrients.map((nutrient) => ({
      ...nutrient,
      name: nutrient.name.trim(),
      unit: nutrient.unit.trim(),
      value: nullableText(nutrient.value),
      category: nutrient.category ?? null,
    })),
    containsAllergens: review.containsAllergens.map((value) => value.trim()).filter(Boolean),
    mayContainAllergens: review.mayContainAllergens
      .map((value) => value.trim())
      .filter(Boolean),
    source: review.source.trim(),
    researchNotes: review.researchNotes.trim(),
  };
}

function importIssues(review: ReviewedIngredientImportDraft): ImportIssue[] {
  const normalized = normalizeImportReview(review);
  const issues: ImportIssue[] = [];
  const add = (message: string, fieldPath: string) => {
    issues.push({
      code: "missing_required",
      severity: "error",
      message,
      fieldPath,
      sourceName: null,
      row: null,
      column: null,
    });
  };
  if (normalized.materialName === "") add("请填写原料名称", "materialName");
  if (normalized.supplierName === "" && normalized.supplierId === null) {
    add("请填写供应商", "supplierName");
  }
  if (normalized.priceUnit === null) add("请选择价格单位", "priceUnit");
  if (normalized.nutritionBasis === null) {
    add("请选择营养基准", "nutritionBasis");
  }
  normalized.nutrients.forEach((nutrient, index) => {
    if (
      nutrient.definitionId === null &&
      nutrient.category !== "nutrition" &&
      nutrient.category !== "research"
    ) {
      add("请选择自定义含量项分类", `nutrients.${index}.category`);
    }
  });
  for (const [fieldPath, value] of [
    ["currentPrice", normalized.currentPrice],
    ["densityGPerMl", normalized.densityGPerMl],
    ...normalized.nutrients.map(
      (nutrient) => [`nutrients.${nutrient.name}`, nutrient.value] as const,
    ),
  ] as const) {
    if (value !== null && !DECIMAL_PATTERN.test(value)) {
      issues.push({
        code: "invalid_decimal",
        severity: "error",
        message: "请输入不带单位的非负数值",
        fieldPath,
        sourceName: null,
        row: null,
        column: null,
      });
    }
  }
  return issues;
}

export class BrowserDemoApi implements DesktopApi {
  async createDataBackup(_destinationPath: string): Promise<BackupManifest> {
    throw browserBackupUnavailable();
  }

  async inspectDataBackup(_sourcePath: string): Promise<BackupPreflight> {
    throw browserBackupUnavailable();
  }

  async restoreDataBackup(
    _sourcePath: string,
    _confirmed: boolean,
  ): Promise<BackupRestoreResult> {
    throw browserBackupUnavailable();
  }

  private readonly storage: Storage;
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly agentEvents: BrowserAgentEventSource | undefined;
  private readonly agentResponseDelayMs: number;

  constructor(options: BrowserDemoApiOptions = {}) {
    this.storage = options.storage ?? defaultStorage();
    this.createId = options.createId ?? defaultId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.agentEvents = options.agentEvents;
    this.agentResponseDelayMs = Math.max(0, options.agentResponseDelayMs ?? 0);
  }

  private unsupportedImport<T>(): Promise<T> {
    return Promise.reject(
      new DesktopApiError(
        "unsupported_file",
        "浏览器演示模式暂不读取本机文件",
      ),
    );
  }

  async createResearchReport(
    input: ResearchReportRecordInput,
  ): Promise<ResearchReportRecord> {
    const state = this.read();
    const document = input.document;
    if (
      document.schemaVersion !== 1 ||
      document.id.trim() === "" ||
      document.title.trim() === ""
    ) {
      throw new DesktopApiError("invalid_input", "研发报告文档无效");
    }
    if (state.researchReports[document.id]) {
      throw new DesktopApiError("invalid_state", "该研发报告记录已存在");
    }
    const recipeVersion =
      state.recipeVersions[document.provenance.recipeVersionId];
    const labelVersion =
      state.nutritionLabelVersions[
        document.provenance.nutritionLabelVersionId
      ];
    if (
      !recipeVersion ||
      !labelVersion ||
      labelVersion.recipeVersionId !== recipeVersion.id ||
      document.recipe.versionId !== recipeVersion.id ||
      document.nutrition.labelVersionId !== labelVersion.id
    ) {
      throw new DesktopApiError(
        "missing_reference",
        "研发报告来源版本不一致",
      );
    }
    if (
      !input.svg.startsWith("<svg") ||
      /<script|<foreignObject|(?:href|src)=["']https?:/i.test(input.svg)
    ) {
      throw new DesktopApiError("invalid_input", "研发报告 SVG 无效");
    }
    const record: ResearchReportRecord = {
      id: document.id,
      recipeVersionId: recipeVersion.id,
      nutritionLabelVersionId: labelVersion.id,
      document: cloneValue(document),
      svg: input.svg,
      createdAt: this.now(),
    };
    state.researchReports[record.id] = record;
    this.write(state);
    return cloneValue(record);
  }

  async listResearchReports(
    recipeVersionId: string,
  ): Promise<ResearchReportRecord[]> {
    const state = this.read();
    this.findRecipeVersion(state, recipeVersionId);
    return Object.values(state.researchReports)
      .filter((report) => report.recipeVersionId === recipeVersionId)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map(cloneValue);
  }

  async getResearchReport(id: string): Promise<ResearchReportRecord> {
    const report = this.read().researchReports[id];
    if (!report) {
      throw new DesktopApiError("not_found", "找不到该研发报告记录");
    }
    return cloneValue(report);
  }

  async exportResearchReport(
    request: ResearchReportExportRequest,
  ): Promise<void> {
    const report = this.read().researchReports[request.reportId];
    if (!report) {
      throw new DesktopApiError("not_found", "找不到该研发报告记录");
    }
    const expectedHash = await researchReportDocumentHash(report.document);
    if (
      request.documentHash !== expectedHash ||
      !validExportFileName(request.fileName, request.format)
    ) {
      throw new DesktopApiError("invalid_input", "研发报告导出请求无效");
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(request.bytesBase64);
    } catch {
      throw new DesktopApiError("invalid_input", "研发报告导出数据无效");
    }
    if (!validExportBytes(request.format, bytes)) {
      throw new DesktopApiError("invalid_input", "研发报告导出数据无效");
    }
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer], {
      type: researchReportMimeType(request.format),
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.hidden = true;
    anchor.href = url;
    anchor.download = request.fileName;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  async exportSampleSheet(
    request: SampleSheetExportRequest,
  ): Promise<void> {
    if (!validExportFileName(request.fileName, "xlsx")) {
      throw new DesktopApiError("invalid_input", "打样配料单文件名无效");
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(request.bytesBase64);
    } catch {
      throw new DesktopApiError("invalid_input", "打样配料单导出数据无效");
    }
    if (!validExportBytes("xlsx", bytes)) {
      throw new DesktopApiError("invalid_input", "打样配料单导出数据无效");
    }
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer], {
      type: researchReportMimeType("xlsx"),
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.hidden = true;
    anchor.href = url;
    anchor.download = request.fileName;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  async listNutritionLabels(recipeId: string): Promise<NutritionLabel[]> {
    const state = this.read();
    this.findRecipe(state, recipeId);
    return Object.values(state.nutritionLabels)
      .filter((label) => label.recipeId === recipeId)
      .sort(
        (left, right) =>
          Number(left.archivedAt !== null) -
            Number(right.archivedAt !== null) ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.name.localeCompare(right.name, "zh-CN"),
      )
      .map(cloneValue);
  }

  async getNutritionLabel(id: string): Promise<NutritionLabel> {
    return cloneValue(this.findNutritionLabel(this.read(), id));
  }

  async createNutritionLabel(
    input: NutritionLabelInput,
  ): Promise<NutritionLabel> {
    const state = this.read();
    const recipe = this.findRecipe(state, input.recipeId);
    if (recipe.archivedAt !== null) {
      throw new DesktopApiError(
        "missing_reference",
        "找不到可用的配方",
      );
    }
    const timestamp = this.now();
    const label: NutritionLabel = {
      id: this.createId(),
      recipeId: recipe.id,
      name: this.requiredName(input.name, "请填写营养标签名称"),
      currentDraftId: null,
      latestVersionNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.nutritionLabels[label.id] = label;
    this.write(state);
    return cloneValue(label);
  }

  async getNutritionLabelDraft(
    labelId: string,
  ): Promise<NutritionLabelDraft | null> {
    const state = this.read();
    this.findNutritionLabel(state, labelId);
    const draft = state.nutritionLabelDrafts[labelId];
    return draft ? cloneValue(draft) : null;
  }

  async calculateNutritionLabelPreview(
    input: NutritionLabelDraftSaveInput,
  ): Promise<NutritionLabelCalculation> {
    const state = this.read();
    this.assertNutritionLabelInputReferences(state, input);
    try {
      return cloneValue(calculateCoreNutritionLabel({
        rulePackId: input.rulePackId,
        basis: cloneValue(input.basis),
        sourceValues: cloneValue(input.sourceValues),
        optionalNutrientCodes: [...input.optionalNutrientCodes],
        roundingMode: input.roundingMode,
      }));
    } catch {
      throw new DesktopApiError(
        "invalid_input",
        "营养标签计算输入无效",
      );
    }
  }

  async saveNutritionLabelDraft(
    input: NutritionLabelDraftSaveInput,
  ): Promise<NutritionLabelDraft> {
    const state = this.read();
    const label = this.assertNutritionLabelInputReferences(state, input);
    const calculation = await this.calculateNutritionLabelPreview(input);
    const existing = state.nutritionLabelDrafts[label.id];
    const timestamp = this.now();
    const draft: NutritionLabelDraft = {
      id: existing?.id ?? this.createId(),
      labelId: label.id,
      recipeVersionId: input.recipeVersionId,
      rulePackId: input.rulePackId,
      basis: cloneValue(input.basis),
      sourceValues: cloneValue(input.sourceValues),
      optionalNutrientCodes: [...input.optionalNutrientCodes],
      roundingMode: input.roundingMode,
      calculation,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    state.nutritionLabelDrafts[label.id] = draft;
    state.nutritionLabels[label.id] = {
      ...label,
      currentDraftId: draft.id,
      updatedAt: timestamp,
    };
    this.write(state);
    return cloneValue(draft);
  }

  async listNutritionLabelVersions(
    labelId: string,
  ): Promise<NutritionLabelVersion[]> {
    const state = this.read();
    this.findNutritionLabel(state, labelId);
    return Object.values(state.nutritionLabelVersions)
      .filter((version) => version.labelId === labelId)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map(cloneValue);
  }

  async getNutritionLabelVersion(
    id: string,
  ): Promise<NutritionLabelVersion> {
    return cloneValue(this.findNutritionLabelVersion(this.read(), id));
  }

  async publishNutritionLabel(
    labelId: string,
  ): Promise<NutritionLabelVersion> {
    const state = this.read();
    const label = this.findNutritionLabel(state, labelId);
    if (label.archivedAt !== null) {
      throw new DesktopApiError(
        "archived",
        "已归档营养标签不能发布正式版本",
      );
    }
    const draft = state.nutritionLabelDrafts[label.id];
    if (!draft || draft.id !== label.currentDraftId) {
      throw new DesktopApiError(
        "missing_reference",
        "找不到正式标签对应的草稿",
      );
    }
    const calculation = await this.calculateNutritionLabelPreview(draft);
    if (!calculation.publishable) {
      throw new DesktopApiError(
        "invalid_state",
        "营养标签仍有必填数据问题，不能发布正式版本",
      );
    }
    const versionNumber =
      Math.max(
        0,
        ...Object.values(state.nutritionLabelVersions)
          .filter((version) => version.labelId === label.id)
          .map((version) => version.versionNumber),
      ) + 1;
    const timestamp = this.now();
    const id = this.createId();
    const version: NutritionLabelVersion = {
      id,
      labelId: label.id,
      versionNumber,
      sourceDraftId: draft.id,
      recipeVersionId: draft.recipeVersionId,
      rulePackId: calculation.rulePack.id,
      rulePackRevision: calculation.rulePack.revision,
      snapshot: {
        schemaVersion: 1,
        id,
        labelId: label.id,
        labelVersionNumber: versionNumber,
        recipeId: label.recipeId,
        recipeVersionId: draft.recipeVersionId,
        rulePack: cloneValue(calculation.rulePack),
        basis: cloneValue(calculation.basis),
        sourceValues: cloneValue(draft.sourceValues),
        rows: cloneValue(calculation.rows),
        issues: cloneValue(calculation.issues),
        publishable: calculation.publishable,
        requiredNotice: calculation.requiredNotice,
        generatedAt: timestamp,
      },
      createdAt: timestamp,
    };
    state.nutritionLabelVersions[id] = version;
    state.nutritionLabels[label.id] = {
      ...label,
      latestVersionNumber: versionNumber,
      updatedAt: timestamp,
    };
    this.write(state);
    return cloneValue(version);
  }

  async listRecipes(): Promise<RecipeSummary[]> {
    const state = this.read();
    return Object.values(state.recipes)
      .sort(
        (left, right) =>
          Number(left.archivedAt !== null) -
            Number(right.archivedAt !== null) ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.name.localeCompare(right.name, "zh-CN"),
      )
      .map((recipe) => {
        const versions = Object.values(state.recipeVersions)
          .filter((version) => version.recipeId === recipe.id)
          .sort((left, right) => right.versionNumber - left.versionNumber);
        const latestVersion = versions[0];
        const referencedBy = new Set(
          Object.entries(state.recipeVersionDependencies)
            .filter(([, dependencyIds]) =>
              dependencyIds.some((dependencyId) =>
                versions.some((version) => version.id === dependencyId),
              ),
            )
            .map(([versionId]) => versionId),
        );
        return {
          recipe: cloneValue(recipe),
          draftUpdatedAt:
            state.recipeDrafts[recipe.id]?.updatedAt ?? null,
          latestVersion: latestVersion
            ? versionReference(latestVersion)
            : null,
          referencedByCount: referencedBy.size,
        };
      });
  }

  async getRecipe(id: string): Promise<Recipe> {
    return cloneValue(this.findRecipe(this.read(), id));
  }

  async createRecipe(input: RecipeInput): Promise<Recipe> {
    const state = this.read();
    const normalized = this.normalizeRecipeInput(input);
    this.assertUniqueRecipeCode(state, normalized.code);
    const timestamp = this.now();
    const id = this.createId();
    const recipe: Recipe = {
      id,
      ...normalized,
      currentDraftId: null,
      latestVersionNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      productId: id,
      schemeName: "主配方",
      schemeStatus: "current",
    };
    state.recipes[recipe.id] = recipe;
    this.write(state);
    return cloneValue(recipe);
  }

  async createRecipeAlternative(
    input: RecipeAlternativeCreateInput,
  ): Promise<Recipe> {
    const state = this.read();
    const sourceVersion = this.findRecipeVersion(state, input.sourceVersionId);
    const sourceRecipe = this.findRecipe(state, sourceVersion.recipeId);
    if (sourceRecipe.archivedAt !== null) {
      throw new DesktopApiError("archived", "已归档配方不能创建替代配方");
    }
    if (recipeSchemeStatus(sourceRecipe) === "inactive") {
      throw new DesktopApiError("invalid_state", "已停用配方不能创建替代配方");
    }
    const schemeName = this.requiredName(input.schemeName, "请填写替代配方名称");
    if (schemeName.length > 80) {
      throw new DesktopApiError("invalid_input", "替代配方名称不能超过 80 个字符");
    }
    this.assertUniqueRecipeSchemeName(
      state,
      recipeProductId(sourceRecipe),
      schemeName,
    );
    const timestamp = this.now();
    const id = this.createId();
    const draftId = this.createId();
    const snapshot = sourceVersion.snapshot;
    const draft = this.materializeRecipeDraft(state, {
      id: draftId,
      recipeId: id,
      basedOnVersionId: null,
      source: "manual",
      targetBatchGrams: snapshot.calculation.inputMassGrams,
      finishedMassGrams: snapshot.finishedMassGrams,
      servingMassGrams: snapshot.servingMassGrams,
      packageCount: snapshot.packageCount,
      items: draftItemsFromSnapshot(snapshot),
      packagingCosts: cloneValue(snapshot.packagingCosts),
      additionalCosts: cloneValue(snapshot.additionalCosts),
      targets: cloneValue(snapshot.targets),
      markdownNotes: snapshot.markdownNotes,
      calculation: cloneValue(snapshot.calculation),
      calculationIssues: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const recipe: Recipe = {
      id,
      name: sourceRecipe.name,
      code: null,
      tags: [...sourceRecipe.tags],
      kind: sourceRecipe.kind,
      currentDraftId: draftId,
      latestVersionNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      productId: recipeProductId(sourceRecipe),
      schemeName,
      schemeStatus: input.schemeStatus,
    };
    state.recipes[id] = recipe;
    state.recipeDrafts[id] = draft;
    this.write(state);
    return cloneValue(recipe);
  }

  async updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
    const state = this.read();
    const existing = this.findRecipe(state, id);
    if (existing.archivedAt !== null) {
      throw new DesktopApiError("archived", "已归档配方不能修改");
    }
    const normalized = this.normalizeRecipeInput(input);
    this.assertUniqueRecipeCode(state, normalized.code, id);
    const timestamp = this.now();
    const productId = recipeProductId(existing);
    for (const recipe of Object.values(state.recipes)) {
      if (recipeProductId(recipe) !== productId) continue;
      state.recipes[recipe.id] = {
        ...recipe,
        name: normalized.name,
        tags: [...normalized.tags],
        kind: normalized.kind,
        code: recipe.id === id ? normalized.code : recipe.code,
        updatedAt: timestamp,
      };
    }
    this.write(state);
    return cloneValue(this.findRecipe(state, id));
  }

  async updateRecipeScheme(
    id: string,
    input: RecipeSchemeUpdateInput,
  ): Promise<Recipe> {
    const state = this.read();
    const recipe = this.findRecipe(state, id);
    if (recipe.archivedAt !== null) {
      throw new DesktopApiError("archived", "已归档配方不能修改方案设置");
    }
    const schemeName = this.requiredName(input.schemeName, "请填写替代配方名称");
    if (schemeName.length > 80) {
      throw new DesktopApiError("invalid_input", "替代配方名称不能超过 80 个字符");
    }
    const productId = recipeProductId(recipe);
    this.assertUniqueRecipeSchemeName(state, productId, schemeName, id);
    const timestamp = this.now();
    if (input.schemeStatus === "current") {
      for (const candidate of Object.values(state.recipes)) {
        if (
          candidate.id !== id &&
          candidate.archivedAt === null &&
          recipeProductId(candidate) === productId &&
          recipeSchemeStatus(candidate) === "current"
        ) {
          state.recipes[candidate.id] = {
            ...candidate,
            schemeStatus: "approved",
            updatedAt: timestamp,
          };
        }
      }
    }
    state.recipes[id] = {
      ...recipe,
      schemeName,
      schemeStatus: input.schemeStatus,
      updatedAt: timestamp,
    };
    this.write(state);
    return cloneValue(state.recipes[id]);
  }

  async archiveRecipe(id: string): Promise<void> {
    const state = this.read();
    const recipe = this.findRecipe(state, id);
    if (recipe.archivedAt !== null) return;
    const ownVersionIds = new Set(
      Object.values(state.recipeVersions)
        .filter((version) => version.recipeId === id)
        .map((version) => version.id),
    );
    const referenced = Object.values(state.recipeVersionDependencies).some(
      (dependencyIds) =>
        dependencyIds.some((dependencyId) => ownVersionIds.has(dependencyId)),
    );
    if (referenced) {
      throw new DesktopApiError(
        "reference_conflict",
        "该配方版本仍被其他配方引用，暂时不能归档",
      );
    }
    const timestamp = this.now();
    state.recipes[id] = {
      ...recipe,
      archivedAt: timestamp,
      updatedAt: timestamp,
    };
    this.write(state);
  }

  async restoreRecipe(id: string): Promise<void> {
    const state = this.read();
    const recipe = this.findRecipe(state, id);
    if (recipe.archivedAt === null) return;
    const productId = recipeProductId(recipe);
    const hasCurrent = Object.values(state.recipes).some(
      (candidate) =>
        candidate.id !== id &&
        candidate.archivedAt === null &&
        recipeProductId(candidate) === productId &&
        recipeSchemeStatus(candidate) === "current",
    );
    state.recipes[id] = {
      ...recipe,
      archivedAt: null,
      schemeStatus:
        recipeSchemeStatus(recipe) === "current" && hasCurrent
          ? "approved"
          : recipeSchemeStatus(recipe),
      updatedAt: this.now(),
    };
    this.write(state);
  }

  async deleteDraftRecipe(id: string): Promise<void> {
    const state = this.read();
    const recipe = this.findRecipe(state, id);
    if (recipe.archivedAt !== null) {
      throw new DesktopApiError(
        "invalid_state",
        "已归档配方请从归档库永久删除",
      );
    }
    if (
      Object.values(state.recipeVersions).some(
        (version) => version.recipeId === id,
      )
    ) {
      throw new DesktopApiError(
        "invalid_state",
        "该配方已有正式版本，不能按工作草稿删除",
      );
    }
    if (
      Object.values(state.nutritionLabels).some(
        (label) => label.recipeId === id,
      )
    ) {
      throw new DesktopApiError(
        "reference_conflict",
        "该配方已生成营养标签，不能删除",
      );
    }

    delete state.recipeDrafts[id];
    delete state.recipes[id];
    delete state.settings[recipeVersionSequenceKey(id)];
    for (const proposal of Object.values(state.agentRecipeProposals)) {
      if (proposal.acceptedRecipeId === id) proposal.acceptedRecipeId = null;
    }
    for (const need of Object.values(state.materialNeeds)) {
      if (need.recipeId === id) need.recipeId = null;
    }
    this.write(state);
  }

  async permanentlyDeleteRecipe(
    id: string,
    confirmationName: string,
  ): Promise<void> {
    const state = this.read();
    const recipe = this.findRecipe(state, id);
    if (recipe.archivedAt === null) {
      throw new DesktopApiError(
        "invalid_state",
        "配方必须先归档，才能永久删除",
      );
    }
    if (confirmationName.trim() !== recipe.name) {
      throw new DesktopApiError(
        "confirmation_mismatch",
        "输入的配方名称不一致",
      );
    }
    const ownVersionIds = new Set(
      Object.values(state.recipeVersions)
        .filter((version) => version.recipeId === id)
        .map((version) => version.id),
    );
    if (
      Object.values(state.nutritionLabels).some(
        (label) => label.recipeId === id,
      ) || Object.values(state.researchReports).some(
        (report) => ownVersionIds.has(report.recipeVersionId),
      )
    ) {
      throw new DesktopApiError(
        "reference_conflict",
        "该配方已生成营养标签或研发报告，不能永久删除",
      );
    }
    const externallyReferenced = Object.entries(
      state.recipeVersionDependencies,
    ).some(([ownerId, dependencyIds]) => {
      const owner = state.recipeVersions[ownerId];
      return (
        owner?.recipeId !== id &&
        dependencyIds.some((dependencyId) => ownVersionIds.has(dependencyId))
      );
    }) || Object.values(state.recipeVersions).some(
      (version) =>
        version.recipeId !== id &&
        version.basedOnVersionId !== null &&
        ownVersionIds.has(version.basedOnVersionId),
    ) || Object.values(state.recipeDrafts).some(
      (draft) =>
        draft.recipeId !== id &&
        draft.basedOnVersionId !== null &&
        ownVersionIds.has(draft.basedOnVersionId),
    );
    if (externallyReferenced) {
      throw new DesktopApiError(
        "reference_conflict",
        "该配方版本仍被其他配方、替代草稿或正式版本引用，不能永久删除",
      );
    }

    for (const versionId of ownVersionIds) {
      delete state.recipeVersionDependencies[versionId];
      delete state.recipeVersions[versionId];
    }
    delete state.recipeDrafts[id];
    delete state.recipes[id];
    delete state.settings[recipeVersionSequenceKey(id)];
    for (const proposal of Object.values(state.agentRecipeProposals)) {
      if (proposal.acceptedRecipeId === id) proposal.acceptedRecipeId = null;
    }
    for (const need of Object.values(state.materialNeeds)) {
      if (need.recipeId === id) need.recipeId = null;
    }
    this.write(state);
  }

  async deleteRecipeVersion(id: string): Promise<void> {
    const state = this.read();
    const version = this.findRecipeVersion(state, id);
    const usedByLabel = Object.values(state.nutritionLabelDrafts).some(
      (draft) => draft.recipeVersionId === id,
    ) || Object.values(state.nutritionLabelVersions).some(
      (labelVersion) => labelVersion.recipeVersionId === id,
    ) || Object.values(state.researchReports).some(
      (report) => report.recipeVersionId === id,
    );
    if (usedByLabel) {
      throw new DesktopApiError(
        "reference_conflict",
        "该版本已用于营养标签或研发报告，不能永久删除",
      );
    }
    const usedAsIngredient = Object.values(
      state.recipeVersionDependencies,
    ).some((dependencyIds) => dependencyIds.includes(id));
    if (usedAsIngredient) {
      throw new DesktopApiError(
        "reference_conflict",
        "该版本仍被其他正式版本作为半成品引用，不能删除",
      );
    }
    const usedAsLineage = Object.values(state.recipeVersions).some(
      (candidate) => candidate.basedOnVersionId === id,
    ) || Object.values(state.recipeDrafts).some(
      (draft) =>
        draft.recipeId !== version.recipeId &&
        draft.basedOnVersionId === id,
    );
    if (usedAsLineage) {
      throw new DesktopApiError(
        "reference_conflict",
        "该版本仍是其他版本或工作草稿的来源，不能删除",
      );
    }

    const ownDraft = state.recipeDrafts[version.recipeId];
    if (ownDraft?.basedOnVersionId === id) {
      state.recipeDrafts[version.recipeId] = {
        ...ownDraft,
        basedOnVersionId: null,
        updatedAt: this.now(),
      };
    }
    delete state.recipeVersionDependencies[id];
    delete state.recipeVersions[id];
    const recipe = this.findRecipe(state, version.recipeId);
    const latestVersionNumber = Math.max(
      0,
      ...Object.values(state.recipeVersions)
        .filter((candidate) => candidate.recipeId === version.recipeId)
        .map((candidate) => candidate.versionNumber),
    );
    state.recipes[recipe.id] = {
      ...recipe,
      latestVersionNumber: latestVersionNumber || null,
      updatedAt: this.now(),
    };
    this.write(state);
  }

  async getRecipeDraft(recipeId: string): Promise<RecipeDraft | null> {
    const state = this.read();
    this.findRecipe(state, recipeId);
    const draft = state.recipeDrafts[recipeId];
    return draft ? cloneValue(this.materializeRecipeDraft(state, draft)) : null;
  }

  async saveRecipeDraft(input: RecipeDraftSaveInput): Promise<RecipeDraft> {
    const state = this.read();
    const recipe = this.findRecipe(state, input.recipeId);
    if (recipe.archivedAt !== null) {
      throw new DesktopApiError("archived", "已归档配方不能保存草稿");
    }
    if (recipeSchemeStatus(recipe) === "inactive") {
      throw new DesktopApiError("invalid_state", "已停用配方不能保存草稿");
    }
    assertFinishedMassWithinInput(
      input.finishedMassGrams,
      input.calculation?.inputMassGrams,
    );
    if (input.basedOnVersionId !== null) {
      const source = this.findRecipeVersion(state, input.basedOnVersionId);
      if (source.recipeId !== recipe.id) {
        throw new DesktopApiError("missing_reference", "找不到配方来源版本");
      }
    }
    const existing = state.recipeDrafts[recipe.id];
    const timestamp = this.now();
    const draft = this.materializeRecipeDraft(state, {
      ...cloneValue(input),
      id: existing?.id ?? this.createId(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    state.recipeDrafts[recipe.id] = draft;
    state.recipes[recipe.id] = {
      ...recipe,
      currentDraftId: draft.id,
      updatedAt: timestamp,
    };
    this.write(state);
    return cloneValue(draft);
  }

  async listRecipeVersions(recipeId: string): Promise<RecipeVersion[]> {
    const state = this.read();
    this.findRecipe(state, recipeId);
    return Object.values(state.recipeVersions)
      .filter((version) => version.recipeId === recipeId)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map(cloneValue);
  }

  async getRecipeVersion(id: string): Promise<RecipeVersion> {
    return cloneValue(this.findRecipeVersion(this.read(), id));
  }

  async createRecipeVersion(
    input: RecipeVersionCreateInput,
  ): Promise<RecipeVersion> {
    const state = this.read();
    const recipe = this.findRecipe(state, input.recipeId);
    if (recipe.archivedAt !== null) {
      throw new DesktopApiError(
        "archived",
        "已归档配方不能保存正式版本",
      );
    }
    if (recipeSchemeStatus(recipe) === "inactive") {
      throw new DesktopApiError(
        "invalid_state",
        "已停用配方不能保存正式版本",
      );
    }
    const draft = state.recipeDrafts[recipe.id];
    if (!draft || draft.id !== input.sourceDraftId) {
      throw new DesktopApiError(
        "missing_reference",
        "找不到正式版本对应的草稿",
      );
    }
    if (draft.items.some((item) => item.kind === "material_need")) {
      throw new DesktopApiError(
        "invalid_state",
        "待补充原料需要先关联并替换为真实供应商版本",
      );
    }
    if (
      input.basedOnVersionId !== null &&
      this.findRecipeVersion(state, input.basedOnVersionId).recipeId !==
        recipe.id
    ) {
      throw new DesktopApiError("missing_reference", "找不到配方来源版本");
    }
    if (
      input.snapshot.schemaVersion !== 1 ||
      input.snapshot.recipe.id !== recipe.id
    ) {
      throw new DesktopApiError("invalid_input", "配方版本快照无效");
    }
    assertFinishedMassWithinInput(
      input.snapshot.finishedMassGrams,
      input.snapshot.calculation.inputMassGrams,
    );
    if (new Set(input.dependencyVersionIds).size !== input.dependencyVersionIds.length) {
      throw new DesktopApiError("invalid_input", "半成品版本不能重复引用");
    }
    for (const dependencyId of input.dependencyVersionIds) {
      const dependency = this.findRecipeVersion(state, dependencyId);
      const dependencyRecipe = this.findRecipe(state, dependency.recipeId);
      if (dependencyRecipe.archivedAt !== null) {
        throw new DesktopApiError(
          "missing_reference",
          "找不到引用的半成品版本",
        );
      }
      if (
        dependencyReachesRecipe(
          state,
          dependencyId,
          recipe.id,
          new Set(),
        )
      ) {
        throw new DesktopApiError(
          "recipe_cycle",
          "不能引用当前配方自身或间接引用当前配方的半成品版本",
        );
      }
    }
    const sequenceKey = recipeVersionSequenceKey(recipe.id);
    const versionNumber =
      Math.max(
        Number(state.settings[sequenceKey]) || 0,
        ...Object.values(state.recipeVersions)
          .filter((version) => version.recipeId === recipe.id)
          .map((version) => version.versionNumber),
      ) + 1;
    const timestamp = this.now();
    const version: RecipeVersion = {
      id: this.createId(),
      recipeId: recipe.id,
      versionNumber,
      sourceDraftId: input.sourceDraftId,
      basedOnVersionId: input.basedOnVersionId,
      snapshot: cloneValue(input.snapshot),
      createdAt: timestamp,
    };
    state.recipeVersions[version.id] = version;
    state.recipeVersionDependencies[version.id] = [
      ...input.dependencyVersionIds,
    ];
    state.settings[sequenceKey] = versionNumber;
    state.recipes[recipe.id] = {
      ...recipe,
      latestVersionNumber: versionNumber,
      updatedAt: timestamp,
    };
    this.write(state);
    return cloneValue(version);
  }

  async copyRecipeVersionToDraft(versionId: string): Promise<RecipeDraft> {
    const version = this.findRecipeVersion(this.read(), versionId);
    const snapshot = version.snapshot;
    return this.saveRecipeDraft({
      recipeId: version.recipeId,
      basedOnVersionId: version.id,
      source: "manual",
      targetBatchGrams: snapshot.calculation.inputMassGrams,
      finishedMassGrams: snapshot.finishedMassGrams,
      servingMassGrams: snapshot.servingMassGrams,
      packageCount: snapshot.packageCount,
      items: draftItemsFromSnapshot(snapshot),
      packagingCosts: cloneValue(snapshot.packagingCosts),
      additionalCosts: cloneValue(snapshot.additionalCosts),
      targets: cloneValue(snapshot.targets),
      markdownNotes: snapshot.markdownNotes,
      calculation: cloneValue(snapshot.calculation),
      calculationIssues: [],
    });
  }

  async compareRecipeVersions(
    beforeVersionId: string,
    afterVersionId: string,
  ): Promise<RecipeVersionComparison> {
    const state = this.read();
    const before = this.findRecipeVersion(state, beforeVersionId);
    const after = this.findRecipeVersion(state, afterVersionId);
    if (before.recipeId !== after.recipeId) {
      throw new DesktopApiError(
        "invalid_input",
        "只能比较同一个配方的正式版本",
      );
    }
    return buildRecipeVersionComparison(before, after);
  }

  async getAgentPreferences(): Promise<AgentPreferences> {
    return { ...this.read().agentPreferences };
  }

  async saveAgentPreferences(input: AgentPreferences) {
    const state = this.read();
    state.agentPreferences = { ...input };
    this.write(state);
    return { ...state.agentPreferences };
  }

  async listAgentProviderConfigs() {
    return Object.values(this.read().agentProviderConfigs);
  }

  async saveAgentProviderConfig(input: AgentProviderConfigInput) {
    const state = this.read();
    const current = state.agentProviderConfigs[input.id];
    if (!current) {
      throw new DesktopApiError("not_found", "找不到该模型配置");
    }
    if (input.enabled) {
      for (const provider of Object.values(state.agentProviderConfigs)) {
        provider.enabled = false;
      }
    }
    const saved: AgentProviderConfig = {
      ...input,
      hasSecret: current.hasSecret,
      updatedAt: this.now(),
    };
    state.agentProviderConfigs[input.id] = saved;
    if (
      input.kind === "custom" &&
      (input.protocol === "openai_compatible" ||
        input.protocol === "anthropic_messages")
    ) {
      state.settings[`agent.custom.${input.protocol}`] = {
        endpoint: input.endpoint,
        model: input.model,
      };
    }
    this.write(state);
    return saved;
  }

  async setAgentProviderSecret(input: AgentProviderSecretInput) {
    if (input.apiKey.trim() === "") {
      throw new DesktopApiError("invalid_input", "API 密钥不能为空");
    }
    const state = this.read();
    const provider = state.agentProviderConfigs[input.providerId];
    if (!provider) {
      throw new DesktopApiError("not_found", "找不到该模型配置");
    }
    provider.hasSecret = true;
    provider.updatedAt = this.now();
    this.write(state);
  }

  async clearAgentProviderSecret(providerId: string) {
    const state = this.read();
    const provider = state.agentProviderConfigs[providerId];
    if (!provider) {
      throw new DesktopApiError("not_found", "找不到该模型配置");
    }
    provider.hasSecret = false;
    provider.updatedAt = this.now();
    this.write(state);
  }

  async listAgentProviderModels(providerId: string) {
    const provider = this.read().agentProviderConfigs[providerId];
    if (!provider) {
      throw new DesktopApiError("not_found", "找不到该模型配置");
    }
    const defaults: Record<string, string[]> = {
      openai: ["gpt-5.5", "gpt-5.4-mini"],
      anthropic: ["claude-sonnet-4.6", "claude-opus-4.6"],
      gemini: ["gemini-3.5-flash", "gemini-3.5-pro"],
      deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
      kimi_cn: ["kimi-k3", "kimi-k2.6"],
      zhipu_glm: ["glm-5.2", "glm-5v-turbo"],
      minimax_cn: ["MiniMax-M3", "MiniMax-M2.7"],
      bailian: ["qwen3.7-max", "qwen3-vl-plus"],
      volcengine_ark: ["doubao-seed-2-0-lite-260215"],
      ollama: ["food-rd-demo"],
    };
    const ids = [
      ...(provider.model.trim() ? [provider.model.trim()] : []),
      ...(defaults[provider.kind] ?? []),
    ];
    return [...new Set(ids)].map(
      (id): AgentModelOption => ({ id, label: id }),
    );
  }

  async getAgentCustomProviderSubconfig(
    protocol: "openai_compatible" | "anthropic_messages",
  ) {
    const state = this.read();
    const stored = state.settings[`agent.custom.${protocol}`] as
      | { endpoint?: unknown; model?: unknown }
      | undefined;
    const current = state.agentProviderConfigs.custom;
    if (current?.protocol === protocol) {
      return { endpoint: current.endpoint, model: current.model };
    }
    return {
      endpoint: typeof stored?.endpoint === "string" ? stored.endpoint : "",
      model: typeof stored?.model === "string" ? stored.model : "",
    };
  }

  async testAgentProvider(
    providerId: string,
    kind: AgentProviderTestResult["kind"],
  ) {
    const provider = this.read().agentProviderConfigs[providerId];
    if (!provider) {
      throw new DesktopApiError("not_found", "找不到该模型配置");
    }
    return {
      ok: true,
      kind,
      latencyMs: 0,
      message: "浏览器演示模型测试通过（未发起网络请求）",
    };
  }

  async detectCliProviders(): Promise<CliDetectionResult[]> {
    return [
      {
        kind: "codex_cli",
        executablePath: null,
        version: null,
        installed: false,
        authenticated: false,
        message: "浏览器演示模式不访问本机 CLI",
      },
      {
        kind: "claude_code_cli",
        executablePath: null,
        version: null,
        installed: false,
        authenticated: false,
        message: "浏览器演示模式不访问本机 CLI",
      },
    ];
  }

  async listAgentConversations() {
    return Object.values(this.read().agentConversations).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async createAgentConversation(title = "新对话") {
    const state = this.read();
    const timestamp = this.now();
    const conversation: AgentConversation = {
      id: this.createId(),
      title: title.trim() || "新对话",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.agentConversations[conversation.id] = conversation;
    this.write(state);
    return conversation;
  }

  async deleteAgentConversation(id: string) {
    const state = this.read();
    if (!state.agentConversations[id]) {
      throw new DesktopApiError("not_found", "找不到该对话");
    }
    delete state.agentConversations[id];
    for (const [messageId, message] of Object.entries(state.agentMessages)) {
      if (message.conversationId === id) delete state.agentMessages[messageId];
    }
    for (const [runId, run] of Object.entries(state.agentRuns)) {
      if (run.conversationId === id) delete state.agentRuns[runId];
    }
    for (const proposal of Object.values(state.agentRecipeProposals)) {
      if (proposal.conversationId === id) {
        proposal.conversationId = null;
        proposal.runId = null;
      }
    }
    this.write(state);
  }

  async listAgentMessages(conversationId: string) {
    const state = this.read();
    if (!state.agentConversations[conversationId]) {
      throw new DesktopApiError("not_found", "找不到该对话");
    }
    return Object.values(state.agentMessages)
      .filter((message) => message.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async startAgentRun(request: AgentRunRequest) {
    let state = this.read();
    if (!state.agentPreferences.enabled) {
      throw new DesktopApiError("invalid_state", "食品研发 Agent 已关闭");
    }
    if (!state.agentConversations[request.conversationId]) {
      throw new DesktopApiError("not_found", "找不到该对话");
    }
    if (
      !Object.values(state.agentProviderConfigs).some(
        (provider) => provider.enabled,
      )
    ) {
      throw new DesktopApiError(
        "provider_not_configured",
        "请先启用一个模型服务",
      );
    }
    if (
      request.retryRunId == null &&
      request.continueRunId == null &&
      request.content.trim() === "" &&
      request.files.length === 0
    ) {
      throw new DesktopApiError("invalid_input", "请输入问题或选择原料资料");
    }

    const normalizedRequest = request.content.trim().toLocaleLowerCase("zh-CN");
    const retrospectiveTask =
      request.recipeContext != null &&
      ["复盘", "研发记录", "下一轮打样"].some((keyword) =>
        normalizedRequest.includes(keyword),
      );
    const recipeTask = !retrospectiveTask && [
      "配方",
      "产品",
      "营养要求",
      "逆向",
      "配料表",
      "营养标签",
    ].some((keyword) => normalizedRequest.includes(keyword));
    const reverseTask = ["逆向", "配料表", "营养标签", "标签"].some(
      (keyword) => normalizedRequest.includes(keyword),
    );
    let job: IngredientImportJob;
    let reusedAttachmentIds: string[] | null = null;
    let content = request.content.trim();
    const reusedRunId = request.retryRunId ?? request.continueRunId;
    if (reusedRunId) {
      if (request.files.length > 0) {
        throw new DesktopApiError(
          "invalid_input",
          "继续处理会复用原任务附件，请勿再次选择文件",
        );
      }
      const previous = state.agentRuns[reusedRunId];
      if (
        !previous ||
        previous.conversationId !== request.conversationId ||
        (request.retryRunId
          ? !["failed", "cancelled"].includes(previous.status)
          : previous.status !== "completed") ||
        !previous.importJobId
      ) {
        throw new DesktopApiError("invalid_state", "原任务当前不能继续处理");
      }
      job = state.importJobs[previous.importJobId]!;
      const previousUser = Object.values(state.agentMessages).find(
        (message) =>
          message.runId === previous.id && message.role === "user",
      );
      if (!job || !previousUser) {
        throw new DesktopApiError("invalid_state", "原任务资料不完整");
      }
      reusedAttachmentIds = [...previousUser.attachmentIds];
      if (request.retryRunId) content ||= previousUser.content;
      if (!content) {
        throw new DesktopApiError("invalid_input", "请说明需要继续处理的草稿操作");
      }
    } else if (request.files.length > 0) {
      job = await this.createIngredientImportJob({
        sourceKind: "agent",
        files: request.files,
      });
      state = this.read();
      if (recipeTask) {
        for (const [draftId, draft] of Object.entries(state.importDrafts)) {
          if (draft.jobId === job.id) delete state.importDrafts[draftId];
        }
      }
    } else {
      const timestamp = this.now();
      job = {
        id: this.createId(),
        sourceKind: "agent",
        status: "drafts_ready",
        progressCurrent: 0,
        progressTotal: 0,
        errorSummary: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.importJobs[job.id] = job;
    }

    const timestamp = this.now();
    const runId = this.createId();
    const attachmentIds =
      reusedAttachmentIds ??
      Object.values(state.importDrafts)
        .filter((draft) => draft.jobId === job.id)
        .flatMap((draft) => draft.attachments.map((attachment) => attachment.id));
    const userMessage: AgentMessage = {
      id: this.createId(),
      conversationId: request.conversationId,
      runId,
      role: "user",
      content: content || "请识别所选原料资料",
      attachmentIds,
      status: "complete",
      createdAt: timestamp,
    };
    const draftCount = Object.values(state.importDrafts).filter(
      (draft) => draft.jobId === job.id,
    ).length;
    let proposal: AgentRecipeProposal | null = null;
    if (recipeTask) {
      const payload = this.browserDemoRecipeProposalPayload(state, reverseTask);
      const evaluated = evaluateBrowserAgentRecipe(
        payload,
        state.materialGroups,
        state.nutrientDefinitions,
        timestamp,
      );
      proposal = {
        id: this.createId(),
        conversationId: request.conversationId,
        runId,
        status: "pending_review",
        payloadVersion: 1,
        payload: evaluated.payload,
        evaluation: evaluated.evaluation,
        sourceAttachmentIds: attachmentIds,
        acceptedRecipeId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }
    const finalText = retrospectiveTask && request.recipeContext
      ? browserDemoRecipeRetrospective(
          state,
          request.recipeContext.recipeId,
        )
      : proposal
      ? reverseTask
        ? "我已根据同款产品资料生成一份可编辑的逆向估算配方。它不是原厂精确配方，请在提案卡中复核用量范围、可信度、加工失水和待补充原料。"
        : "我已结合原料库中的具体供应商版本生成配方提案，并用系统计算引擎完成营养、成本、投料和数据完整度试算。请在提案卡中复核后再创建工作草稿。"
      : draftCount > 0
        ? `已分别识别 ${request.files.length} 份原料资料，并生成 ${draftCount} 张待人工复核草稿。`
        : "这是浏览器离线演示模型。你可以上传演示原料资料，我会生成待人工复核草稿。";
    const assistantMessage: AgentMessage = {
      id: this.createId(),
      conversationId: request.conversationId,
      runId,
      role: "assistant",
      content: finalText,
      attachmentIds: [],
      status: "complete",
      createdAt: timestamp,
    };
    const run: AgentRun = {
      id: runId,
      conversationId: request.conversationId,
      providerConfigId:
        Object.values(state.agentProviderConfigs).find(
          (provider) => provider.enabled,
        )?.id ?? "ollama",
      importJobId: job.id,
      status: "completed",
      errorCode: null,
      errorSummary: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (this.agentResponseDelayMs > 0) {
      const runningRun: AgentRun = { ...run, status: "running" };
      state.agentRuns[runningRun.id] = runningRun;
      state.agentMessages[userMessage.id] = userMessage;
      state.agentConversations[request.conversationId]!.updatedAt = timestamp;
      this.write(state);

      globalThis.setTimeout(() => {
        const latest = this.read();
        const activeRun = latest.agentRuns[runId];
        if (!activeRun || !["queued", "running"].includes(activeRun.status)) {
          return;
        }

        latest.agentRuns[runId] = {
          ...activeRun,
          status: "completed",
          updatedAt: this.now(),
        };
        latest.agentMessages[assistantMessage.id] = assistantMessage;
        if (proposal) latest.agentRecipeProposals[proposal.id] = proposal;
        latest.agentConversations[request.conversationId]!.updatedAt =
          this.now();
        this.write(latest);

        this.emitAgentEvent({ type: "message_delta", runId, text: finalText });
        if (draftCount > 0) {
          this.emitAgentEvent({
            type: "drafts_changed",
            runId,
            importJobId: job.id,
          });
        }
        if (proposal) {
          this.emitAgentEvent({ type: "recipe_proposals_changed", runId });
        }
        this.emitAgentEvent({ type: "run_completed", runId });
      }, this.agentResponseDelayMs);

      return runningRun;
    }

    state.agentRuns[run.id] = run;
    state.agentMessages[userMessage.id] = userMessage;
    state.agentMessages[assistantMessage.id] = assistantMessage;
    if (proposal) state.agentRecipeProposals[proposal.id] = proposal;
    state.agentConversations[request.conversationId]!.updatedAt = timestamp;
    this.write(state);

    this.emitAgentEvent({ type: "message_delta", runId, text: finalText });
    if (draftCount > 0) {
      this.emitAgentEvent({
        type: "drafts_changed",
        runId,
        importJobId: job.id,
      });
    }
    if (proposal) {
      this.emitAgentEvent({ type: "recipe_proposals_changed", runId });
    }
    this.emitAgentEvent({ type: "run_completed", runId });
    return run;
  }

  async cancelAgentRun(id: string) {
    const state = this.read();
    const run = state.agentRuns[id];
    if (!run) throw new DesktopApiError("not_found", "找不到该 Agent 任务");
    if (run.status === "queued" || run.status === "running") {
      run.status = "cancelled";
      run.errorCode = "cancelled";
      run.errorSummary = "用户已取消本次 Agent 任务";
      run.updatedAt = this.now();
      this.write(state);
      this.emitAgentEvent({
        type: "run_failed",
        runId: id,
        code: "cancelled",
        message: run.errorSummary,
      });
    }
    return run;
  }

  async getAgentRun(id: string) {
    const run = this.read().agentRuns[id];
    if (!run) throw new DesktopApiError("not_found", "找不到该 Agent 任务");
    return run;
  }

  async listAgentImportDrafts(runId: string) {
    const run = await this.getAgentRun(runId);
    if (!run.importJobId) return [];
    return this.listIngredientImportDrafts(run.importJobId);
  }

  async listAgentRecipeProposals(conversationId: string) {
    const state = this.read();
    if (!state.agentConversations[conversationId]) {
      throw new DesktopApiError("not_found", "找不到该对话");
    }
    return Object.values(state.agentRecipeProposals)
      .filter((proposal) => proposal.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneValue);
  }

  async getAgentRecipeProposal(id: string) {
    const proposal = this.read().agentRecipeProposals[id];
    if (!proposal) {
      throw new DesktopApiError("not_found", "找不到配方提案");
    }
    return cloneValue(proposal);
  }

  async evaluateAgentRecipeProposal(input: AgentRecipeProposalPayload) {
    const state = this.read();
    return evaluateBrowserAgentRecipe(
      input,
      state.materialGroups,
      state.nutrientDefinitions,
      this.now(),
    ).evaluation;
  }

  async updateAgentRecipeProposal(
    id: string,
    input: AgentRecipeProposalPayload,
  ) {
    const state = this.read();
    const proposal = state.agentRecipeProposals[id];
    if (!proposal) {
      throw new DesktopApiError("not_found", "找不到配方提案");
    }
    if (proposal.status !== "pending_review") {
      throw new DesktopApiError("invalid_state", "只有待复核提案可以修改");
    }
    const evaluated = evaluateBrowserAgentRecipe(
      input,
      state.materialGroups,
      state.nutrientDefinitions,
      this.now(),
    );
    const updated: AgentRecipeProposal = {
      ...proposal,
      payload: evaluated.payload,
      evaluation: evaluated.evaluation,
      updatedAt: this.now(),
    };
    state.agentRecipeProposals[id] = updated;
    this.write(state);
    return cloneValue(updated);
  }

  async acceptAgentRecipeProposal(
    input: AgentRecipeProposalAcceptInput,
  ): Promise<AcceptedAgentRecipeProposal> {
    const state = this.read();
    const proposal = state.agentRecipeProposals[input.proposalId];
    if (!proposal) {
      throw new DesktopApiError("not_found", "找不到配方提案");
    }
    if (proposal.status !== "pending_review") {
      throw new DesktopApiError("invalid_state", "该提案当前不能创建工作草稿");
    }
    const staleIngredient = proposal.payload.items.find((item) => {
      if (item.kind !== "ingredient") return false;
      const current = state.materialGroups
        .flatMap((group) => group.variants)
        .find((variant) => variant.id === item.ingredientVariantId);
      return (
        !current ||
        current.archivedAt !== null ||
        current.updatedAt !== item.ingredientUpdatedAt
      );
    });
    if (staleIngredient) {
      throw new DesktopApiError(
        "invalid_state",
        "原料数据已更新或归档，请先重新试算提案",
      );
    }
    const evaluated = evaluateBrowserAgentRecipe(
      proposal.payload,
      state.materialGroups,
      state.nutrientDefinitions,
      this.now(),
    );
    if (evaluated.evaluation.staleItemIds.length > 0) {
      throw new DesktopApiError(
        "invalid_state",
        "原料数据已更新或归档，请先重新试算提案",
      );
    }

    const timestamp = this.now();
    const recipeId = this.createId();
    const draftId = this.createId();
    let name = evaluated.payload.productName.trim();
    let kind = evaluated.payload.recipeKind;
    let productId = recipeId;
    let schemeName = "主配方";
    let schemeStatus: Recipe["schemeStatus"] = "current";
    let basedOnVersionId: string | null = null;
    if (input.destination.kind === "alternative") {
      const sourceVersion = this.findRecipeVersion(
        state,
        input.destination.sourceVersionId,
      );
      const sourceRecipe = this.findRecipe(state, sourceVersion.recipeId);
      if (
        sourceRecipe.archivedAt !== null ||
        recipeSchemeStatus(sourceRecipe) === "inactive"
      ) {
        throw new DesktopApiError(
          "invalid_state",
          "已归档或停用的配方不能作为替代来源",
        );
      }
      schemeName = this.requiredName(
        input.destination.schemeName,
        "请填写替代配方名称",
      );
      this.assertUniqueRecipeSchemeName(
        state,
        recipeProductId(sourceRecipe),
        schemeName,
      );
      name = sourceRecipe.name;
      kind = sourceRecipe.kind;
      productId = recipeProductId(sourceRecipe);
      schemeStatus = "researching";
      basedOnVersionId = sourceVersion.id;
    }
    if (!name) {
      throw new DesktopApiError("invalid_input", "请填写产品名称");
    }

    const materialNeeds: MaterialNeed[] = [];
    const items: RecipeDraftItemInput[] = [...evaluated.payload.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => {
        if (item.kind === "ingredient") {
          this.findVariant(state, item.ingredientVariantId);
          return {
            id: item.id,
            position: item.position,
            kind: "ingredient" as const,
            ingredientVariantId: item.ingredientVariantId,
            amount: item.amount,
            unit: item.unit,
            locked: false,
            autoFill: false,
          };
        }
        const need: MaterialNeed = {
          id: this.createId(),
          proposalId: proposal.id,
          recipeId,
          materialName: item.materialName,
          purpose: item.purpose,
          desiredSpecification: item.desiredSpecification,
          missingReason: item.missingReason,
          suggestedAmount: item.amount,
          suggestedUnit: item.unit,
          status: "open",
          resolvedIngredientVariantId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        materialNeeds.push(need);
        return {
          id: item.id,
          position: item.position,
          kind: "material_need" as const,
          materialNeedId: need.id,
          amount: item.amount,
          unit: item.unit,
          locked: false,
          autoFill: false,
        };
      });
    for (const need of materialNeeds) state.materialNeeds[need.id] = need;

    const recipe: Recipe = {
      id: recipeId,
      name,
      code: null,
      tags: [],
      kind,
      currentDraftId: draftId,
      latestVersionNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      productId,
      schemeName,
      schemeStatus,
    };
    const notes = [
      evaluated.payload.markdownNotes.trim(),
      "## Agent 配方提案",
      evaluated.payload.assumptions.length > 0
        ? `关键假设：\n- ${evaluated.payload.assumptions.join("\n- ")}`
        : "",
      evaluated.payload.warnings.length > 0
        ? `风险提示：\n- ${evaluated.payload.warnings.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const draft = this.materializeRecipeDraft(state, {
      id: draftId,
      recipeId,
      basedOnVersionId,
      source: "agent",
      targetBatchGrams: evaluated.evaluation.calculation.inputMassGrams,
      finishedMassGrams: evaluated.payload.finishedMassGrams,
      servingMassGrams: null,
      packageCount: null,
      items,
      packagingCosts: [],
      additionalCosts: [],
      targets: [],
      markdownNotes: notes,
      calculation: null,
      calculationIssues: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    state.recipes[recipe.id] = recipe;
    state.recipeDrafts[recipe.id] = draft;
    state.agentRecipeProposals[proposal.id] = {
      ...proposal,
      payload: evaluated.payload,
      evaluation: evaluated.evaluation,
      status: "accepted",
      acceptedRecipeId: recipe.id,
      updatedAt: timestamp,
    };
    this.write(state);
    return { recipe: cloneValue(recipe), materialNeeds: cloneValue(materialNeeds) };
  }

  async discardAgentRecipeProposal(id: string) {
    const state = this.read();
    const proposal = state.agentRecipeProposals[id];
    if (!proposal) {
      throw new DesktopApiError("not_found", "找不到配方提案");
    }
    if (proposal.status === "accepted") {
      throw new DesktopApiError("invalid_state", "已创建草稿的提案不能放弃");
    }
    proposal.status = "discarded";
    proposal.updatedAt = this.now();
    this.write(state);
    return cloneValue(proposal);
  }

  async listMaterialNeeds(status?: MaterialNeedStatus) {
    return Object.values(this.read().materialNeeds)
      .filter((need) => status === undefined || need.status === status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneValue);
  }

  async resolveMaterialNeed(id: string, ingredientVariantId: string) {
    const state = this.read();
    const need = state.materialNeeds[id];
    if (!need) {
      throw new DesktopApiError("not_found", "找不到待补充原料需求");
    }
    this.findVariant(state, ingredientVariantId);
    const updated: MaterialNeed = {
      ...need,
      status: "resolved",
      resolvedIngredientVariantId: ingredientVariantId,
      updatedAt: this.now(),
    };
    state.materialNeeds[id] = updated;
    this.write(state);
    return cloneValue(updated);
  }

  async dismissMaterialNeed(id: string) {
    const state = this.read();
    const need = state.materialNeeds[id];
    if (!need) {
      throw new DesktopApiError("not_found", "找不到待补充原料需求");
    }
    if (need.status === "resolved") {
      throw new DesktopApiError("invalid_state", "已关联原料的需求不能直接关闭");
    }
    const updated: MaterialNeed = {
      ...need,
      status: "dismissed",
      updatedAt: this.now(),
    };
    state.materialNeeds[id] = updated;
    this.write(state);
    return cloneValue(updated);
  }

  async createIngredientImportJob(request: IngredientImportJobRequest) {
    if (request.files.length === 0) {
      throw new DesktopApiError("invalid_input", "请至少选择一个原料文件");
    }
    if (request.files.some((file) => file.kind !== "browser_demo")) {
      return this.unsupportedImport<IngredientImportJob>();
    }

    const state = this.read();
    const timestamp = this.now();
    const jobId = this.createId();
    const job: IngredientImportJob = {
      id: jobId,
      sourceKind: request.sourceKind,
      status: "drafts_ready",
      progressCurrent: request.files.length,
      progressTotal: request.files.length,
      errorSummary: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.importJobs[job.id] = job;

    request.files.forEach((file, position) => {
      const extension = file.value.split(".").pop()?.toLocaleLowerCase("zh-CN") ?? "";
      if (!SUPPORTED_IMPORT_EXTENSIONS.has(extension)) {
        throw new DesktopApiError(
          "unsupported_file",
          "仅支持 JPG、PNG、WebP、PDF、DOCX、XLSX、CSV 和 TXT 文件",
        );
      }
      const attachmentId = this.createId();
      const attachment: SourceAttachment = {
        id: attachmentId,
        originalName: file.value,
        mediaType: file.mediaType ?? demoMediaType(extension),
        byteSize: 0,
        sha256: `browser-demo:${file.value}`,
        createdAt: timestamp,
      };
      const draftId = this.createId();
      const review = demoReview(file.value, state.nutrientDefinitions);
      const issues = importIssues(review);
      state.attachments[attachmentId] = attachment;
      state.importDrafts[draftId] = {
        id: draftId,
        jobId,
        position,
        status: issues.some((issue) => issue.severity === "error")
          ? "needs_review"
          : "ready",
        review,
        issues,
        attachments: [attachment],
        sourceLinks: demoSourceLinks(attachmentId, review),
        importedVariantId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    this.write(state);
    return job;
  }

  async getIngredientImportJob(id: string) {
    const job = this.read().importJobs[id];
    if (!job) throw new DesktopApiError("not_found", "找不到该导入任务");
    return job;
  }

  async listIngredientImportDrafts(jobId: string) {
    const state = this.read();
    if (!state.importJobs[jobId]) {
      throw new DesktopApiError("not_found", "找不到该导入任务");
    }
    return Object.values(state.importDrafts)
      .filter((draft) => draft.jobId === jobId)
      .sort((left, right) => left.position - right.position);
  }

  async updateIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ) {
    const state = this.read();
    const draft = this.findImportDraft(state, id);
    if (draft.status === "imported" || draft.status === "discarded") {
      throw new DesktopApiError("invalid_state", "该草稿不能再修改");
    }
    const issues = importIssues(review);
    const updated: IngredientImportDraft = {
      ...draft,
      review: normalizeImportReview(review),
      issues,
      status: issues.some((issue) => issue.severity === "error")
        ? "needs_review"
        : "ready",
      updatedAt: this.now(),
    };
    state.importDrafts[id] = updated;
    this.write(state);
    return updated;
  }

  async discardIngredientImportDraft(id: string) {
    const state = this.read();
    const draft = this.findImportDraft(state, id);
    state.importDrafts[id] = {
      ...draft,
      status: "discarded",
      updatedAt: this.now(),
    };
    this.write(state);
  }

  async cancelIngredientImportJob(id: string) {
    const state = this.read();
    const job = this.findImportJob(state, id);
    const updated = { ...job, status: "cancelled" as const, updatedAt: this.now() };
    state.importJobs[id] = updated;
    this.write(state);
    return updated;
  }

  async retryIngredientImportJob(id: string) {
    const state = this.read();
    const job = this.findImportJob(state, id);
    if (job.status !== "cancelled" && job.status !== "failed") {
      throw new DesktopApiError("invalid_state", "当前任务不需要重试");
    }
    const updated = {
      ...job,
      status: "drafts_ready" as const,
      errorSummary: null,
      updatedAt: this.now(),
    };
    state.importJobs[id] = updated;
    this.write(state);
    return updated;
  }

  async commitIngredientImportJob(id: string) {
    const current = this.read();
    const state = cloneBrowserState(current);
    const job = this.findImportJob(state, id);
    if (job.status !== "drafts_ready" && job.status !== "partially_completed") {
      throw new DesktopApiError("invalid_state", "当前任务还不能保存");
    }
    const drafts = Object.values(state.importDrafts)
      .filter(
        (draft) =>
          draft.jobId === id &&
          draft.status !== "imported" &&
          draft.status !== "discarded",
      )
      .sort((left, right) => left.position - right.position);
    const variants = drafts.map((draft) =>
      this.materializeImportDraft(state, draft, draft.review),
    );
    const attachmentCount = new Set(
      drafts.flatMap((draft) => draft.attachments.map((attachment) => attachment.id)),
    ).size;
    this.write(state);
    return { jobId: id, variants, attachmentCount };
  }

  async commitReviewedIngredientImportDraft(
    id: string,
    review: ReviewedIngredientImportDraft,
  ) {
    const state = cloneBrowserState(this.read());
    const draft = this.findImportDraft(state, id);
    const variant = this.materializeImportDraft(state, draft, review);
    this.write(state);
    return variant;
  }

  exportIngredientTemplate(
    _format: IngredientExchangeFormat,
    _destinationPath: string,
  ) {
    return this.unsupportedImport<void>();
  }

  exportIngredientLibrary(
    _format: IngredientExchangeFormat,
    _destinationPath: string,
  ) {
    return this.unsupportedImport<void>();
  }

  cleanupOrphanAttachments() {
    const state = this.read();
    const referenced = new Set(
      Object.values(state.importDrafts)
        .filter((draft) =>
          draft.status === "needs_review" ||
          draft.status === "ready" ||
          draft.status === "failed"
        )
        .flatMap((draft) => draft.attachments.map((attachment) => attachment.id)),
    );
    for (const group of state.materialGroups) {
      for (const variant of group.variants) {
        for (const attachment of variant.sourceAttachments) referenced.add(attachment.id);
      }
    }
    let removed = 0;
    for (const id of Object.keys(state.attachments)) {
      if (!referenced.has(id)) {
        delete state.attachments[id];
        removed += 1;
      }
    }
    if (removed > 0) {
      state.importDrafts = Object.fromEntries(
        Object.entries(state.importDrafts).map(([id, draft]) => [
          id,
          {
            ...draft,
            attachments: draft.attachments.filter(
              (attachment) => state.attachments[attachment.id] !== undefined,
            ),
            sourceLinks: draft.sourceLinks.filter(
              (link) => state.attachments[link.attachmentId] !== undefined,
            ),
          },
        ]),
      );
      this.write(state);
    }
    return Promise.resolve(removed);
  }

  async listCategories() {
    return this.read().categories
      .filter((category) => category.archivedAt === null)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async createCategory(name: string) {
    const state = this.read();
    const trimmed = this.requiredName(name, "请填写分类名称");
    this.assertUniqueName(state.categories, trimmed);
    const timestamp = this.now();
    const category: Category = {
      id: this.createId(),
      name: trimmed,
      sortOrder: state.categories.length,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.categories = [...state.categories, category];
    this.write(state);
    return category;
  }

  async renameCategory(id: string, name: string) {
    const state = this.read();
    const category = this.findCategory(state, id);
    const trimmed = this.requiredName(name, "请填写分类名称");
    this.assertUniqueName(state.categories, trimmed, id);
    const timestamp = this.now();
    const updated = { ...category, name: trimmed, updatedAt: timestamp };
    state.categories = state.categories.map((item) =>
      item.id === id ? updated : item,
    );
    state.materialGroups = state.materialGroups.map((group) =>
      group.categoryId === id
        ? { ...group, categoryName: trimmed }
        : group,
    );
    this.write(state);
    return updated;
  }

  async archiveCategory(id: string) {
    const state = this.read();
    this.findCategory(state, id);
    if (
      state.materialGroups.some(
        (group) => group.archivedAt === null && group.categoryId === id,
      )
    ) {
      throw new DesktopApiError(
        "reference_conflict",
        "该分类仍被原料使用，暂时不能删除",
      );
    }
    const timestamp = this.now();
    state.categories = state.categories.map((category) =>
      category.id === id
        ? { ...category, archivedAt: timestamp, updatedAt: timestamp }
        : category,
    );
    this.write(state);
  }

  async listSuppliers(query = "") {
    const normalized = normalize(query);
    return this.read().suppliers.filter(
      (supplier) =>
        supplier.archivedAt === null &&
        (normalized === "" ||
          normalize(`${supplier.name} ${supplier.notes}`).includes(normalized)),
    );
  }

  async createSupplier(name: string, notes = "") {
    const state = this.read();
    const trimmed = this.requiredName(name, "请填写供应商名称");
    this.assertUniqueName(state.suppliers, trimmed);
    const timestamp = this.now();
    const supplier: Supplier = {
      id: this.createId(),
      name: trimmed,
      notes: notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.suppliers = [...state.suppliers, supplier];
    this.write(state);
    return supplier;
  }

  async updateSupplier(id: string, name: string, notes: string) {
    const state = this.read();
    const supplier = this.findSupplier(state, id);
    const trimmed = this.requiredName(name, "请填写供应商名称");
    this.assertUniqueName(state.suppliers, trimmed, id);
    const timestamp = this.now();
    const updated: Supplier = {
      ...supplier,
      name: trimmed,
      notes: notes.trim(),
      updatedAt: timestamp,
    };
    state.suppliers = state.suppliers.map((item) =>
      item.id === id ? updated : item,
    );
    state.materialGroups = state.materialGroups.map((group) => ({
      ...group,
      variants: group.variants.map((variant) =>
        variant.supplierId === id
          ? { ...variant, supplierName: trimmed }
          : variant,
      ),
    }));
    this.write(state);
    return updated;
  }

  async archiveSupplier(id: string) {
    const state = this.read();
    this.findSupplier(state, id);
    if (
      state.materialGroups.some((group) =>
        group.variants.some(
          (variant) =>
            variant.archivedAt === null && variant.supplierId === id,
        ),
      )
    ) {
      throw new DesktopApiError(
        "reference_conflict",
        "该供应商仍有原料版本，暂时不能删除",
      );
    }
    const timestamp = this.now();
    state.suppliers = state.suppliers.map((supplier) =>
      supplier.id === id
        ? { ...supplier, archivedAt: timestamp, updatedAt: timestamp }
        : supplier,
    );
    this.write(state);
  }

  async listMaterialGroups(query = "") {
    const normalized = normalize(query);
    return this.read().materialGroups
      .filter((group) => group.archivedAt === null)
      .map((group) => ({
        ...group,
        variants: group.variants.filter(
          (variant) => variant.archivedAt === null,
        ),
      }))
      .filter((group) => {
        if (normalized === "") return true;
        const groupText = `${group.name} ${group.categoryName ?? ""}`;
        const matchesVariant = group.variants.some((variant) =>
          normalize(
            `${variant.supplierName} ${variant.modelOrSpecification} ${variant.internalCode ?? ""} ${variant.source} ${variant.researchNotes}`,
          ).includes(normalized),
        );
        return normalize(groupText).includes(normalized) || matchesVariant;
      });
  }

  async createMaterialGroup(input: MaterialGroupInput) {
    const state = this.read();
    const name = this.requiredName(input.name, "请填写原料名称");
    this.assertUniqueName(state.materialGroups, name);
    const category = input.categoryId === null
      ? null
      : this.findCategory(state, input.categoryId);
    const timestamp = this.now();
    const group: MaterialGroup = {
      id: this.createId(),
      name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      variants: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.materialGroups = [...state.materialGroups, group];
    this.write(state);
    return group;
  }

  async updateMaterialGroup(id: string, input: MaterialGroupInput) {
    const state = this.read();
    const previous = this.findGroup(state, id);
    const name = this.requiredName(input.name, "请填写原料名称");
    this.assertUniqueName(state.materialGroups, name, id);
    const category = input.categoryId === null
      ? null
      : this.findCategory(state, input.categoryId);
    const updated: MaterialGroup = {
      ...previous,
      name,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      updatedAt: this.now(),
    };
    state.materialGroups = state.materialGroups.map((group) =>
      group.id === id ? updated : group,
    );
    this.write(state);
    return updated;
  }

  async archiveMaterialGroup(id: string) {
    const state = this.read();
    const group = this.findGroup(state, id);
    if (group.variants.some((variant) => variant.archivedAt === null)) {
      throw new DesktopApiError(
        "reference_conflict",
        "请先归档该原料下的供应商版本",
      );
    }
    const timestamp = this.now();
    state.materialGroups = state.materialGroups.map((item) =>
      item.id === id
        ? { ...item, archivedAt: timestamp, updatedAt: timestamp }
        : item,
    );
    this.write(state);
  }

  async saveIngredientVariant(input: IngredientVariantInput) {
    const state = this.read();
    const group = this.findGroup(state, input.materialGroupId);
    const supplier = this.findSupplier(state, input.supplierId);
    this.validateVariantInput(input);
    this.assertUniqueVariant(state, input);
    this.assertUniqueInternalCode(state, input.internalCode, input.id);
    const previous = input.id === undefined
      ? null
      : this.findVariant(state, input.id).variant;
    const normalizedInput: IngredientVariantInput = {
      ...input,
      modelOrSpecification: input.modelOrSpecification.trim(),
      internalCode: nullableText(input.internalCode),
      currentPrice: nullableText(input.currentPrice),
      densityGPerMl: nullableText(input.densityGPerMl),
      source: input.source.trim(),
      researchNotes: input.researchNotes.trim(),
      nutrition: {
        basis: input.nutrition.basis,
        values: input.nutrition.values.map((value) => ({
          ...value,
          value: nullableText(value.value),
        })),
      },
      allergens: {
        contains: [...(input.allergens?.contains ?? [])],
        mayContain: [...(input.allergens?.mayContain ?? [])],
      },
    };
    const completeness = calculateCompleteness(
      normalizedInput,
      state.nutrientDefinitions,
    );
    const timestamp = this.now();
    const variant: IngredientVariant = {
      id: previous?.id ?? this.createId(),
      materialGroupId: group.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      modelOrSpecification: normalizedInput.modelOrSpecification,
      internalCode: normalizedInput.internalCode,
      currentPrice: normalizedInput.currentPrice,
      priceUnit: normalizedInput.priceUnit,
      densityGPerMl: normalizedInput.densityGPerMl,
      source: normalizedInput.source,
      researchNotes: normalizedInput.researchNotes,
      nutrition: normalizedInput.nutrition,
      allergens: normalizedInput.allergens ?? { contains: [], mayContain: [] },
      sourceAttachments: previous?.sourceAttachments ?? [],
      completeness,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.materialGroups = state.materialGroups.map((item) => {
      const variants = item.variants.filter(
        (candidate) => candidate.id !== variant.id,
      );
      return item.id === group.id
        ? { ...item, variants: [...variants, variant] }
        : { ...item, variants };
    });
    this.write(state);
    return variant;
  }

  async copyIngredientVariant(sourceId: string, supplierId: string) {
    const state = this.read();
    const source = this.findVariant(state, sourceId).variant;
    return this.saveIngredientVariant({
      materialGroupId: source.materialGroupId,
      supplierId,
      modelOrSpecification: source.modelOrSpecification,
      internalCode: null,
      currentPrice: source.currentPrice,
      priceUnit: source.priceUnit,
      densityGPerMl: source.densityGPerMl,
      source: source.source,
      researchNotes: source.researchNotes,
      nutrition: source.nutrition,
      allergens: {
        contains: [...source.allergens.contains],
        mayContain: [...source.allergens.mayContain],
      },
    });
  }

  async archiveIngredientVariant(id: string) {
    const state = this.read();
    this.findVariant(state, id);
    const timestamp = this.now();
    state.materialGroups = state.materialGroups.map((group) => ({
      ...group,
      variants: group.variants.map((variant) =>
        variant.id === id
          ? { ...variant, archivedAt: timestamp, updatedAt: timestamp }
          : variant,
      ),
    }));
    this.write(state);
  }

  async listNutrientDefinitions() {
    const definitions = this.read().nutrientDefinitions;
    return definitions
      .filter((definition) => definition.builtIn)
      .concat(
        definitions.filter((definition) => !definition.builtIn),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async createNutrientDefinition(
    name: string,
    unit: string,
    category: NutrientDefinition["category"],
  ) {
    const state = this.read();
    const trimmedName = this.requiredName(name, "请填写自定义含量项名称");
    const trimmedUnit = this.requiredName(unit, "请填写自定义含量项单位");
    this.validateDefinitionCategory(category);
    this.assertUniqueName(state.nutrientDefinitions, trimmedName);
    const definition: NutrientDefinition = {
      id: this.createId(),
      code: `custom:${normalize(trimmedName)}`,
      name: trimmedName,
      unit: trimmedUnit,
      builtIn: false,
      sortOrder: state.nutrientDefinitions.length,
      category,
      archivedAt: null,
    };
    state.nutrientDefinitions = [...state.nutrientDefinitions, definition];
    this.write(state);
    return definition;
  }

  async updateNutrientDefinition(
    id: string,
    name: string,
    unit: string,
    category: NutrientDefinition["category"],
  ) {
    const state = this.read();
    const current = state.nutrientDefinitions.find((item) => item.id === id);
    if (!current) {
      throw new DesktopApiError("not_found", "找不到该自定义含量项模板");
    }
    if (current.builtIn) {
      throw new DesktopApiError(
        "unsupported_operation",
        "内置营养成分不能修改",
      );
    }
    const used = state.materialGroups.some((group) =>
      group.variants.some((variant) =>
        variant.nutrition.values.some(
          (value) => value.nutrientDefinitionId === id,
        ),
      ),
    );
    if (used) {
      throw new DesktopApiError(
        "reference_conflict",
        "该模板已经被原料使用，不能修改名称、单位或分类",
      );
    }
    const trimmedName = this.requiredName(name, "请填写自定义含量项名称");
    const trimmedUnit = this.requiredName(unit, "请填写自定义含量项单位");
    this.validateDefinitionCategory(category);
    this.assertUniqueName(
      state.nutrientDefinitions.filter((item) => item.id !== id),
      trimmedName,
    );
    const updated: NutrientDefinition = {
      ...current,
      name: trimmedName,
      unit: trimmedUnit,
      category,
    };
    state.nutrientDefinitions = state.nutrientDefinitions.map((item) =>
      item.id === id ? updated : item,
    );
    this.write(state);
    return updated;
  }

  async archiveNutrientDefinition(id: string) {
    const state = this.read();
    const current = state.nutrientDefinitions.find((item) => item.id === id);
    if (!current) {
      throw new DesktopApiError("not_found", "找不到该自定义含量项模板");
    }
    if (current.builtIn) {
      throw new DesktopApiError(
        "unsupported_operation",
        "内置营养成分不能停用",
      );
    }
    state.nutrientDefinitions = state.nutrientDefinitions.map((item) =>
      item.id === id ? { ...item, archivedAt: this.now() } : item,
    );
    this.write(state);
  }

  async compareIngredientVariants(
    materialGroupId: string,
    variantIds: string[],
  ): Promise<VariantComparison> {
    const state = this.read();
    const group = this.findGroup(state, materialGroupId);
    return buildVariantComparison(
      group,
      variantIds,
      state.nutrientDefinitions,
    );
  }

  async getSetting<T>(key: string) {
    const value = this.read().settings[key];
    return value === undefined ? null : (value as T);
  }

  async setSetting<T>(key: string, value: T) {
    const state = this.read();
    state.settings = { ...state.settings, [key]: value };
    this.write(state);
  }

  async getDraft<T>(kind: string, key: string) {
    const draft = this.read().drafts[draftId(kind, key)];
    return draft === undefined ? null : (draft as DraftRecord<T>);
  }

  async saveDraft<T>(
    kind: string,
    key: string,
    payloadVersion: number,
    payload: T,
  ) {
    const state = this.read();
    const draft: DraftRecord<T> = {
      kind,
      key,
      payloadVersion,
      payload,
      updatedAt: this.now(),
    };
    state.drafts = { ...state.drafts, [draftId(kind, key)]: draft };
    this.write(state);
    return draft;
  }

  async clearDraft(kind: string, key: string) {
    const state = this.read();
    delete state.drafts[draftId(kind, key)];
    this.write(state);
  }

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    return {
      mode: "browser-demo",
      schemaVersion: BROWSER_SCHEMA_VERSION,
      healthy: true,
    };
  }

  /** Temporary schema-v1 compatibility methods for the current screen. */
  async listIngredients(request: IngredientListRequest = {}) {
    const groups = await this.listMaterialGroups(request.query ?? "");
    return groups
      .map((group) => this.toLegacyIngredient(group))
      .filter((ingredient): ingredient is Ingredient => ingredient !== null);
  }

  async getIngredient(id: string) {
    const group = this.read().materialGroups.find(
      (candidate) =>
        candidate.id === id ||
        candidate.variants.some((variant) => variant.id === id),
    );
    if (!group || group.archivedAt !== null) {
      throw new DesktopApiError("not_found", "找不到该原料");
    }
    const ingredient = this.toLegacyIngredient(group);
    if (ingredient === null) {
      throw new DesktopApiError("not_found", "找不到该原料版本");
    }
    return ingredient;
  }

  async createIngredient(input: IngredientInput) {
    this.validateLegacyInput(input);
    const state = this.read();
    this.assertUniqueInternalCode(state, input.internalCode);
    const timestamp = this.now();
    const groupId = this.createId();
    const supplier = this.ensureLegacySupplier(state, timestamp);
    const category = this.ensureLegacyCategory(state, input.category, timestamp);
    const variant: IngredientVariant = {
      id: `${groupId}:variant`,
      materialGroupId: groupId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      modelOrSpecification: "",
      internalCode: input.internalCode.trim(),
      currentPrice: nullableText(input.currentPrice),
      priceUnit: input.priceUnit,
      densityGPerMl: nullableText(input.densityGPerMl),
      source: input.source.trim(),
      researchNotes: [
        input.notes.trim(),
        input.tags.length > 0 ? `原标签：${input.tags.join("、")}` : "",
      ].filter(Boolean).join("；"),
      nutrition: { basis: "per_100g", values: [] },
      allergens: { contains: [], mayContain: [] },
      sourceAttachments: [],
      completeness: {
        percent: legacyCompleteness(input),
        missingFields: [],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    const group: MaterialGroup = {
      id: groupId,
      name: input.name.trim(),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      variants: [variant],
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.materialGroups = [...state.materialGroups, group];
    this.write(state);
    return this.toLegacyIngredient(group) as Ingredient;
  }

  async updateIngredient(id: string, input: IngredientInput) {
    this.validateLegacyInput(input);
    const state = this.read();
    const group = this.findGroup(state, id);
    const variant = group.variants.find((item) => item.archivedAt === null);
    if (!variant) {
      throw new DesktopApiError("not_found", "找不到该原料版本");
    }
    this.assertUniqueInternalCode(state, input.internalCode, variant.id);
    const timestamp = this.now();
    const category = this.ensureLegacyCategory(state, input.category, timestamp);
    const updatedVariant: IngredientVariant = {
      ...variant,
      internalCode: input.internalCode.trim(),
      currentPrice: nullableText(input.currentPrice),
      priceUnit: input.priceUnit,
      densityGPerMl: nullableText(input.densityGPerMl),
      source: input.source.trim(),
      researchNotes: input.notes.trim(),
      completeness: {
        percent: legacyCompleteness(input),
        missingFields: [],
      },
      updatedAt: timestamp,
    };
    const updatedGroup: MaterialGroup = {
      ...group,
      name: input.name.trim(),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      variants: group.variants.map((item) =>
        item.id === variant.id ? updatedVariant : item,
      ),
      updatedAt: timestamp,
    };
    state.materialGroups = state.materialGroups.map((item) =>
      item.id === id ? updatedGroup : item,
    );
    this.write(state);
    return this.toLegacyIngredient(updatedGroup) as Ingredient;
  }

  async archiveIngredient(id: string) {
    const state = this.read();
    this.findGroup(state, id);
    const timestamp = this.now();
    state.materialGroups = state.materialGroups.map((group) =>
      group.id === id
        ? {
            ...group,
            archivedAt: timestamp,
            updatedAt: timestamp,
            variants: group.variants.map((variant) => ({
              ...variant,
              archivedAt: timestamp,
              updatedAt: timestamp,
            })),
          }
        : group,
    );
    this.write(state);
  }

  private read() {
    try {
      return readBrowserState(
        this.storage,
        createInitialLegacyState,
        {
          now: this.now,
          id: (scope, legacyId) => `migrated:${scope}:${legacyId}`,
        },
      );
    } catch (error) {
      if (error instanceof DesktopApiError) throw error;
      throw new DesktopApiError("storage_failure", "浏览器演示数据无法读取");
    }
  }

  private write(state: BrowserStateV5) {
    try {
      writeBrowserState(this.storage, state);
    } catch {
      throw new DesktopApiError("storage_failure", "浏览器演示数据无法保存");
    }
  }

  private emitAgentEvent(event: AgentEvent) {
    this.agentEvents?.emit(event);
  }

  private browserDemoRecipeProposalPayload(
    state: BrowserStateV5,
    reverse: boolean,
  ): AgentRecipeProposalPayload {
    const variants = state.materialGroups
      .flatMap((group) =>
        group.variants
          .filter((variant) => variant.archivedAt === null)
          .map((variant) => ({ group, variant })),
      )
      .slice(0, 3);
    const amounts = reverse ? ["560", "180", "110"] : ["650", "120", "80"];
    const items: AgentRecipeProposalPayload["items"] = variants.map(
      ({ group, variant }, position) => ({
        id: this.createId(),
        position,
        kind: "ingredient",
        ingredientVariantId: variant.id,
        ingredientUpdatedAt: variant.updatedAt,
        materialName: group.name,
        supplierName: variant.supplierName,
        modelOrSpecification: variant.modelOrSpecification,
        amount: amounts[position] ?? "50",
        unit: "g",
        estimatedMinimum: reverse ? String(Number(amounts[position] ?? "50") * 0.8) : null,
        estimatedMaximum: reverse ? String(Number(amounts[position] ?? "50") * 1.2) : null,
        confidence: position === 0 ? "high" : "medium",
        selectionReason: reverse
          ? "根据配料顺序与营养标签约束估算，并匹配原料库中的具体供应商版本"
          : "原料库中数据较完整，营养与成本适合本次产品定位试算",
      }),
    );
    items.push({
      id: this.createId(),
      position: items.length,
      kind: "material_need",
      materialName: reverse ? "可可粉" : "乳化稳定剂",
      purpose: reverse ? "形成巧克力风味与色泽" : "改善体系稳定性与口感",
      desiredSpecification: reverse ? "食品级，需确认脂肪含量及碱化程度" : "适用于冷冻饮品的复配型号",
      missingReason: "当前原料库没有可用的具体供应商版本",
      amount: reverse ? "70" : "5",
      unit: "g",
      estimatedMinimum: reverse ? "45" : "3",
      estimatedMaximum: reverse ? "90" : "8",
      confidence: "low",
    });
    return {
      productName: reverse ? "巧克力冰淇淋（逆向估算）" : "低糖乳味冷冻甜品",
      recipeKind: "formula",
      mode: reverse ? "label_reverse" : "goal_design",
      finishedMassGrams: null,
      yieldAssumption: "assumed_100_percent",
      items,
      requirements: reverse
        ? []
        : [
            {
              nutrientDefinitionId: "sugars",
              name: "糖",
              unit: "g",
              minimum: null,
              maximum: "12",
              origin: "user",
              rationale: "按每100g产品试算的研发约束，不构成法规声称",
            },
          ],
      assumptions: reverse
        ? ["配料表顺序大体反映投料量递减", "营养标签存在修约和检测误差"]
        : ["第一轮按约1000g基准组织配方", "尚未提供实际工艺得率"],
      warnings: reverse
        ? ["复合配料及加工失水无法仅凭标签准确拆分", "逆向结果不是原厂精确配方"]
        : ["营养建议仅用于研发试算，不自动生成营养声称"],
      markdownNotes: reverse
        ? "根据演示配料表与营养标签生成的逆向估算。"
        : "根据产品定位、营养约束与现有原料库生成的第一轮提案。",
    };
  }

  private requiredName(value: string, message: string) {
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new DesktopApiError("invalid_input", message);
    }
    return trimmed;
  }

  private assertUniqueName<T extends { id: string; name: string; archivedAt?: string | null }>(
    values: T[],
    name: string,
    exceptId?: string,
  ) {
    if (
      values.some(
        (item) =>
          item.id !== exceptId &&
          (item.archivedAt === undefined || item.archivedAt === null) &&
          normalize(item.name) === normalize(name),
      )
    ) {
      throw new DesktopApiError("duplicate_name", "名称已存在");
    }
  }

  private normalizeRecipeInput(input: RecipeInput): RecipeInput {
    const name = this.requiredName(input.name, "请填写配方名称");
    const code = nullableText(input.code);
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const rawTag of input.tags) {
      const tag = rawTag.trim();
      const key = normalize(tag);
      if (tag !== "" && !seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    }
    return { name, code, tags, kind: input.kind };
  }

  private assertUniqueRecipeCode(
    state: BrowserStateV5,
    code: string | null,
    exceptId?: string,
  ) {
    if (code === null) return;
    if (
      Object.values(state.recipes).some(
        (recipe) =>
          recipe.id !== exceptId &&
          recipe.archivedAt === null &&
          normalize(recipe.code ?? "") === normalize(code),
      )
    ) {
      throw new DesktopApiError("duplicate_code", "配方编号已存在");
    }
  }

  private assertUniqueRecipeSchemeName(
    state: BrowserStateV5,
    productId: string,
    schemeName: string,
    exceptId?: string,
  ) {
    if (
      Object.values(state.recipes).some(
        (recipe) =>
          recipe.id !== exceptId &&
          recipeProductId(recipe) === productId &&
          normalize(recipe.schemeName ?? "主配方") === normalize(schemeName),
      )
    ) {
      throw new DesktopApiError(
        "duplicate_name",
        "同一产品下已存在同名替代配方",
      );
    }
  }

  private findRecipe(state: BrowserStateV5, id: string) {
    const recipe = state.recipes[id];
    if (!recipe) throw new DesktopApiError("not_found", "找不到该配方");
    return recipe;
  }

  private findRecipeVersion(state: BrowserStateV5, id: string) {
    const version = state.recipeVersions[id];
    if (!version) {
      throw new DesktopApiError("not_found", "找不到该配方版本");
    }
    return version;
  }

  private findNutritionLabel(state: BrowserStateV5, id: string) {
    const label = state.nutritionLabels[id];
    if (!label) {
      throw new DesktopApiError("not_found", "找不到该营养标签");
    }
    return label;
  }

  private findNutritionLabelVersion(state: BrowserStateV5, id: string) {
    const version = state.nutritionLabelVersions[id];
    if (!version) {
      throw new DesktopApiError("not_found", "找不到该营养标签版本");
    }
    return version;
  }

  private assertNutritionLabelInputReferences(
    state: BrowserStateV5,
    input: NutritionLabelDraftSaveInput,
  ) {
    const label = this.findNutritionLabel(state, input.labelId);
    if (label.archivedAt !== null) {
      throw new DesktopApiError(
        "archived",
        "已归档营养标签不能保存草稿",
      );
    }
    const recipeVersion = this.findRecipeVersion(
      state,
      input.recipeVersionId,
    );
    if (recipeVersion.recipeId !== label.recipeId) {
      throw new DesktopApiError(
        "missing_reference",
        "找不到该配方的正式版本",
      );
    }
    return label;
  }

  private materializeRecipeDraft(
    state: BrowserStateV5,
    draft: Omit<RecipeDraft, "items"> & { items: RecipeDraftItemInput[] },
  ): RecipeDraft {
    const items = draft.items.map((item) => {
      if (item.kind === "ingredient") {
        for (const group of state.materialGroups) {
          const variant = group.variants.find(
            (candidate) => candidate.id === item.ingredientVariantId,
          );
          if (variant) {
            return {
              ...item,
              materialName: group.name,
              ingredientVariant: cloneValue(variant),
            } satisfies RecipeDraftIngredientItem;
          }
        }
        throw new DesktopApiError(
          "missing_reference",
          "找不到配方中的供应商原料版本",
        );
      }
      if (item.kind === "material_need") {
        const materialNeed = state.materialNeeds[item.materialNeedId];
        if (!materialNeed) {
          throw new DesktopApiError(
            "missing_reference",
            "找不到配方中的待补充原料需求",
          );
        }
        return {
          ...item,
          materialNeed: cloneValue(materialNeed),
        } satisfies RecipeDraftMaterialNeedItem;
      }
      const version = this.findRecipeVersion(state, item.recipeVersionId);
      return {
        ...item,
        recipeVersion: versionReference(version),
      } satisfies RecipeDraftVersionItem;
    });
    return { ...draft, items };
  }

  private findCategory(state: BrowserStateV5, id: string) {
    const category = state.categories.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!category) throw new DesktopApiError("not_found", "找不到该分类");
    return category;
  }

  private findSupplier(state: BrowserStateV5, id: string) {
    const supplier = state.suppliers.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!supplier) throw new DesktopApiError("not_found", "找不到该供应商");
    return supplier;
  }

  private findGroup(state: BrowserStateV5, id: string) {
    const group = state.materialGroups.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!group) throw new DesktopApiError("not_found", "找不到该原料");
    return group;
  }

  private findVariant(state: BrowserStateV5, id: string) {
    for (const group of state.materialGroups) {
      const variant = group.variants.find(
        (candidate) => candidate.id === id && candidate.archivedAt === null,
      );
      if (variant) return { group, variant };
    }
    throw new DesktopApiError("not_found", "找不到该供应商版本");
  }

  private findImportJob(state: BrowserStateV5, id: string) {
    const job = state.importJobs[id];
    if (!job) throw new DesktopApiError("not_found", "找不到该导入任务");
    return job;
  }

  private findImportDraft(state: BrowserStateV5, id: string) {
    const draft = state.importDrafts[id];
    if (!draft) throw new DesktopApiError("not_found", "找不到该导入草稿");
    return draft;
  }

  private materializeImportDraft(
    state: BrowserStateV5,
    draft: IngredientImportDraft,
    requestedReview: ReviewedIngredientImportDraft,
  ) {
    if (draft.status === "imported" || draft.status === "discarded") {
      throw new DesktopApiError("invalid_state", "该草稿不能再导入");
    }
    const review = normalizeImportReview(requestedReview);
    const issues = importIssues(review);
    const blocking = issues.find((issue) => issue.severity === "error");
    if (blocking) {
      throw new DesktopApiError("import_failure", blocking.message, blocking.fieldPath ?? undefined);
    }
    const timestamp = this.now();

    let category = review.categoryId === null
      ? null
      : this.findCategory(state, review.categoryId);
    if (category === null && review.categoryName !== null) {
      category = state.categories.find(
        (candidate) =>
          candidate.archivedAt === null &&
          normalize(candidate.name) === normalize(review.categoryName ?? ""),
      ) ?? null;
      if (category === null) {
        category = {
          id: this.createId(),
          name: review.categoryName,
          sortOrder: state.categories.length,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
        };
        state.categories.push(category);
      }
    }

    let supplier = review.supplierId === null
      ? null
      : this.findSupplier(state, review.supplierId);
    supplier ??= state.suppliers.find(
      (candidate) =>
        candidate.archivedAt === null &&
        normalize(candidate.name) === normalize(review.supplierName),
    ) ?? null;
    if (supplier === null) {
      supplier = {
        id: this.createId(),
        name: review.supplierName,
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      state.suppliers.push(supplier);
    }

    let group = review.materialGroupId === null
      ? null
      : this.findGroup(state, review.materialGroupId);
    group ??= state.materialGroups.find(
      (candidate) =>
        candidate.archivedAt === null &&
        normalize(candidate.name) === normalize(review.materialName),
    ) ?? null;
    if (group === null) {
      group = {
        id: this.createId(),
        name: review.materialName,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        variants: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      state.materialGroups.push(group);
    }

    const nutritionValues = review.nutrients.map((nutrient) => {
      let definition = nutrient.definitionId === null
        ? null
        : state.nutrientDefinitions.find((candidate) => candidate.id === nutrient.definitionId) ?? null;
      definition ??= state.nutrientDefinitions.find(
        (candidate) =>
          normalize(candidate.name) === normalize(nutrient.name) &&
          candidate.unit === nutrient.unit,
      ) ?? null;
      if (definition === null) {
        definition = {
          id: this.createId(),
          code: `custom:${this.createId()}`,
          name: nutrient.name,
          unit: nutrient.unit,
          builtIn: false,
          sortOrder: state.nutrientDefinitions.length,
          category: nutrient.category ?? "nutrition",
          archivedAt: null,
        };
        state.nutrientDefinitions.push(definition);
      }
      return { nutrientDefinitionId: definition.id, value: nutrient.value };
    });
    const input: IngredientVariantInput = {
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: review.modelOrSpecification,
      internalCode: null,
      currentPrice: review.currentPrice,
      priceUnit: review.priceUnit ?? "kg",
      densityGPerMl: review.densityGPerMl,
      source: review.source,
      researchNotes: review.researchNotes,
      nutrition: {
        basis: review.nutritionBasis ?? "per_100g",
        values: nutritionValues,
      },
      allergens: {
        contains: review.containsAllergens,
        mayContain: review.mayContainAllergens,
      },
      duplicateConfirmed: review.duplicateConfirmed,
    };
    this.assertUniqueVariant(state, input);
    const variant: IngredientVariant = {
      id: this.createId(),
      materialGroupId: group.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      modelOrSpecification: input.modelOrSpecification,
      internalCode: null,
      currentPrice: input.currentPrice,
      priceUnit: input.priceUnit,
      densityGPerMl: input.densityGPerMl,
      source: input.source,
      researchNotes: input.researchNotes,
      nutrition: input.nutrition,
      allergens: input.allergens ?? { contains: [], mayContain: [] },
      sourceAttachments: draft.attachments.map((attachment) => ({ ...attachment })),
      completeness: calculateCompleteness(input, state.nutrientDefinitions),
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    group.variants.push(variant);
    group.updatedAt = timestamp;
    state.importDrafts[draft.id] = {
      ...draft,
      review,
      issues: [],
      status: "imported",
      importedVariantId: variant.id,
      updatedAt: timestamp,
    };
    const remaining = Object.values(state.importDrafts).some(
      (candidate) =>
        candidate.jobId === draft.jobId &&
        (candidate.status === "ready" || candidate.status === "needs_review"),
    );
    if (remaining && state.importJobs[draft.jobId]?.status === "drafts_ready") {
      const job = state.importJobs[draft.jobId];
      if (!job) throw new DesktopApiError("not_found", "找不到该导入任务");
      state.importJobs[draft.jobId] = {
        ...job,
        status: "partially_completed",
        updatedAt: timestamp,
      };
    }
    return variant;
  }

  private validateVariantInput(input: IngredientVariantInput) {
    this.validateDecimal(input.currentPrice, "currentPrice");
    this.validateDecimal(input.densityGPerMl, "densityGPerMl");
    for (const value of input.nutrition.values) {
      this.validateDecimal(value.value, value.nutrientDefinitionId);
    }
  }

  private validateDefinitionCategory(
    category: NutrientDefinition["category"],
  ) {
    if (category !== "nutrition" && category !== "research") {
      throw new DesktopApiError("invalid_input", "自定义含量项分类无效");
    }
  }

  private validateDecimal(value: string | null, field: string) {
    const normalized = nullableText(value);
    if (normalized !== null && !DECIMAL_PATTERN.test(normalized)) {
      throw new DesktopApiError(
        "invalid_decimal",
        "请输入不带单位的非负数值",
        field,
      );
    }
  }

  private assertUniqueVariant(
    state: BrowserStateV5,
    input: IngredientVariantInput,
  ) {
    if (input.duplicateConfirmed) return;
    const group = this.findGroup(state, input.materialGroupId);
    const model = normalize(input.modelOrSpecification);
    if (
      group.variants.some(
        (variant) =>
          variant.id !== input.id &&
          variant.archivedAt === null &&
          variant.supplierId === input.supplierId &&
          normalize(variant.modelOrSpecification) === model,
      )
    ) {
      throw new DesktopApiError(
        "duplicate_variant",
        "该供应商和型号规格已经存在，是否仍要保存？",
      );
    }
  }

  private assertUniqueInternalCode(
    state: BrowserStateV5,
    internalCode: string | null,
    exceptId?: string,
  ) {
    const code = nullableText(internalCode);
    if (code === null) return;
    if (
      state.materialGroups.some((group) =>
        group.variants.some(
          (variant) =>
            variant.id !== exceptId &&
            variant.archivedAt === null &&
            normalize(variant.internalCode ?? "") === normalize(code),
        ),
      )
    ) {
      throw new DesktopApiError("duplicate_code", "内部编号已存在");
    }
  }

  private validateLegacyInput(input: IngredientInput) {
    this.requiredName(input.name, "请填写原料名称");
    this.requiredName(input.internalCode, "请填写内部编号");
  }

  private ensureLegacySupplier(state: BrowserStateV5, timestamp: string) {
    const existing = state.suppliers.find(
      (supplier) => supplier.id === LEGACY_SUPPLIER_ID,
    );
    if (existing) return existing;
    const supplier: Supplier = {
      id: LEGACY_SUPPLIER_ID,
      name: "未指定供应商",
      notes: "旧版编辑器临时兼容记录",
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.suppliers = [...state.suppliers, supplier];
    return supplier;
  }

  private ensureLegacyCategory(
    state: BrowserStateV5,
    name: string,
    timestamp: string,
  ) {
    const trimmed = name.trim();
    if (trimmed === "") return null;
    const existing = state.categories.find(
      (category) =>
        category.archivedAt === null && normalize(category.name) === normalize(trimmed),
    );
    if (existing) return existing;
    const category: Category = {
      id: `legacy-category:${normalize(trimmed)}`,
      name: trimmed,
      sortOrder: state.categories.length,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    state.categories = [...state.categories, category];
    return category;
  }

  private toLegacyIngredient(group: MaterialGroup): Ingredient | null {
    const variant = group.variants.find((item) => item.archivedAt === null);
    if (!variant) return null;
    return {
      id: group.id,
      name: group.name,
      internalCode: variant.internalCode ?? "",
      category: group.categoryName ?? "",
      tags: [],
      notes: variant.researchNotes,
      densityGPerMl: variant.densityGPerMl,
      currentPrice: variant.currentPrice ?? "",
      priceUnit: variant.priceUnit,
      priceUpdatedAt: variant.updatedAt.slice(0, 10),
      source: variant.source,
      sourceDate: variant.updatedAt.slice(0, 10),
      completeness: variant.completeness.percent,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
      archivedAt: group.archivedAt,
    };
  }
}

function assertFinishedMassWithinInput(
  finishedMassGrams: string | null,
  inputMassGrams: string | null | undefined,
) {
  if (finishedMassGrams === null) return;
  if (inputMassGrams == null) {
    throw new DesktopApiError("invalid_input", "配方实际投料合计无效");
  }
  try {
    const finishedMass = new Decimal(finishedMassGrams);
    const inputMass = new Decimal(inputMassGrams);
    if (!finishedMass.isFinite() || !inputMass.isFinite()) {
      throw new DesktopApiError("invalid_input", "配方重量数据无效");
    }
    if (finishedMass.gt(inputMass)) {
      throw new DesktopApiError(
        "invalid_input",
        "出成重量不能大于投料合计",
      );
    }
  } catch (cause) {
    if (cause instanceof DesktopApiError) throw cause;
    throw new DesktopApiError("invalid_input", "配方重量数据无效");
  }
}

function validExportFileName(
  fileName: string,
  format: ResearchReportExportFormat,
) {
  return (
    fileName.trim() !== "" &&
    !/[\\/\u0000-\u001f]/.test(fileName) &&
    fileName.toLowerCase().endsWith(`.${format}`)
  );
}

function validExportBytes(
  format: ResearchReportExportFormat,
  bytes: Uint8Array,
) {
  if (format === "png") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (format === "pdf") {
    return startsWithText(bytes, "%PDF-");
  }
  if (format === "xlsx") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      kind?: unknown;
    };
    return value.kind === "food-rd-research-report";
  } catch {
    return false;
  }
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function startsWithText(bytes: Uint8Array, value: string) {
  const expected = new TextEncoder().encode(value);
  return (
    bytes.length >= expected.length &&
    expected.every((byte, index) => bytes[index] === byte)
  );
}

function researchReportMimeType(format: ResearchReportExportFormat) {
  if (format === "png") return "image/png";
  if (format === "pdf") return "application/pdf";
  if (format === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/json";
}

function dependencyReachesRecipe(
  state: BrowserStateV5,
  versionId: string,
  recipeId: string,
  visited: Set<string>,
): boolean {
  if (visited.has(versionId)) return false;
  visited.add(versionId);
  const version = state.recipeVersions[versionId];
  if (version === undefined) return false;
  if (version.recipeId === recipeId) return true;
  return (state.recipeVersionDependencies[versionId] ?? []).some(
    (dependencyId) =>
      dependencyReachesRecipe(
        state,
        dependencyId,
        recipeId,
        visited,
      ),
  );
}

function browserDemoRecipeRetrospective(
  state: BrowserStateV5,
  recipeId: string,
) {
  const recipe = state.recipes[recipeId];
  const draft = state.recipeDrafts[recipeId];
  if (!recipe || !draft) {
    return "当前工作台没有可复盘的配方草稿。请先进入研发中的配方并保存草稿。";
  }
  const calculation = draft.calculation;
  const facts = [
    `配方：${recipe.name}`,
    `当前投料：${calculation?.inputMassGrams ?? "未完成计算"} g`,
    `出成重量：${draft.finishedMassGrams ?? "未记录"}${draft.finishedMassGrams ? " g" : ""}`,
    `得率：${calculation?.yieldPercent ? `${conciseRetrospectiveDecimal(calculation.yieldPercent)}%` : "未记录"}`,
    `批次成本：${calculation ? `¥${calculation.cost.batchTotal}` : "未完成计算"}`,
    `数据完整度：${calculation ? `${calculation.completeness.percent}%` : "未完成计算"}`,
    `研发备注：${draft.markdownNotes.trim() || "未记录"}`,
  ];
  const confirmations: string[] = [];
  if (draft.finishedMassGrams === null) {
    confirmations.push("实际出成重量未记录，暂时不能复核加工损耗和真实得率。");
  }
  if (!draft.markdownNotes.trim()) {
    confirmations.push("本轮工艺、感官结果和调整原因均未记录，Agent 不会代为猜测。");
  }
  if ((calculation?.completeness.percent ?? 0) < 80) {
    confirmations.push("营养或价格数据完整度偏低，结论只能作为当前已知数据的研发参考。");
  }
  if (draft.calculationIssues.length > 0) {
    confirmations.push(
      ...draft.calculationIssues.slice(0, 3).map((issue) => issue.message),
    );
  }
  const suggestions = [
    draft.finishedMassGrams === null
      ? "打样结束后称量并记录实际出成重量。"
      : "保持本轮出成记录方式，复核得率是否可重复。",
    !draft.markdownNotes.trim()
      ? "在现有研发备注框补记本轮工艺参数、感官表现、异常和调整原因。"
      : "下一轮只改变少量关键变量，并在同一备注框记录调整原因和结果。",
    (calculation?.completeness.percent ?? 0) < 80
      ? "优先补齐高占比或高成本原料的营养与价格数据后再比较结果。"
      : "使用同一批量口径复算营养和成本，再决定是否保存正式版本。",
  ];
  return [
    "研发复盘（仅基于当前草稿）",
    "",
    "已记录事实",
    ...facts.map((item) => `- ${item}`),
    "",
    "需要确认",
    ...(confirmations.length > 0
      ? confirmations.map((item) => `- ${item}`)
      : ["- 当前确定性数据未发现明显缺口，仍需结合实际打样复核。"]),
    "",
    "下一轮打样建议",
    ...suggestions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "以上是研发建议，不会自动修改配方或保存正式版本。",
  ].join("\n");
}

function conciseRetrospectiveDecimal(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function browserBackupUnavailable() {
  return new DesktopApiError(
    "unsupported_operation",
    "浏览器演示模式不执行真实本机备份或恢复，请使用桌面版",
  );
}
