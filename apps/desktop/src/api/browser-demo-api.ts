import type { DesktopApi } from "./desktop-api";
import type {
  IngredientExchangeFormat,
  IngredientImportCommitResult,
  IngredientImportDraft,
  IngredientImportJob,
  IngredientImportJobRequest,
  ReviewedIngredientImportDraft,
} from "./import-types";
import {
  BROWSER_SCHEMA_VERSION,
  type BrowserStateV2,
  type LegacyState,
  readBrowserState,
  writeBrowserState,
} from "./browser-schema";
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

export class BrowserDemoApi implements DesktopApi {
  private readonly storage: Storage;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options: BrowserDemoApiOptions = {}) {
    this.storage = options.storage ?? defaultStorage();
    this.createId = options.createId ?? defaultId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private unsupportedImport<T>(): Promise<T> {
    return Promise.reject(
      new DesktopApiError(
        "unsupported_file",
        "浏览器演示模式暂不读取本机文件",
      ),
    );
  }

  createIngredientImportJob(_request: IngredientImportJobRequest) {
    return this.unsupportedImport<IngredientImportJob>();
  }

  getIngredientImportJob(_id: string) {
    return this.unsupportedImport<IngredientImportJob>();
  }

  listIngredientImportDrafts(_jobId: string) {
    return this.unsupportedImport<IngredientImportDraft[]>();
  }

  updateIngredientImportDraft(
    _id: string,
    _review: ReviewedIngredientImportDraft,
  ) {
    return this.unsupportedImport<IngredientImportDraft>();
  }

  discardIngredientImportDraft(_id: string) {
    return this.unsupportedImport<void>();
  }

  cancelIngredientImportJob(_id: string) {
    return this.unsupportedImport<IngredientImportJob>();
  }

  retryIngredientImportJob(_id: string) {
    return this.unsupportedImport<IngredientImportJob>();
  }

  commitIngredientImportJob(_id: string) {
    return this.unsupportedImport<IngredientImportCommitResult>();
  }

  commitReviewedIngredientImportDraft(
    _id: string,
    _review: ReviewedIngredientImportDraft,
  ) {
    return this.unsupportedImport<IngredientVariant>();
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
    return Promise.resolve(0);
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

  async createNutrientDefinition(name: string, unit: string) {
    const state = this.read();
    const trimmedName = this.requiredName(name, "请填写营养成分名称");
    const trimmedUnit = this.requiredName(unit, "请填写营养成分单位");
    this.assertUniqueName(state.nutrientDefinitions, trimmedName);
    const definition: NutrientDefinition = {
      id: this.createId(),
      code: `custom:${normalize(trimmedName)}`,
      name: trimmedName,
      unit: trimmedUnit,
      builtIn: false,
      sortOrder: state.nutrientDefinitions.length,
    };
    state.nutrientDefinitions = [...state.nutrientDefinitions, definition];
    this.write(state);
    return definition;
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

  private write(state: BrowserStateV2) {
    try {
      writeBrowserState(this.storage, state);
    } catch {
      throw new DesktopApiError("storage_failure", "浏览器演示数据无法保存");
    }
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

  private findCategory(state: BrowserStateV2, id: string) {
    const category = state.categories.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!category) throw new DesktopApiError("not_found", "找不到该分类");
    return category;
  }

  private findSupplier(state: BrowserStateV2, id: string) {
    const supplier = state.suppliers.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!supplier) throw new DesktopApiError("not_found", "找不到该供应商");
    return supplier;
  }

  private findGroup(state: BrowserStateV2, id: string) {
    const group = state.materialGroups.find(
      (candidate) => candidate.id === id && candidate.archivedAt === null,
    );
    if (!group) throw new DesktopApiError("not_found", "找不到该原料");
    return group;
  }

  private findVariant(state: BrowserStateV2, id: string) {
    for (const group of state.materialGroups) {
      const variant = group.variants.find(
        (candidate) => candidate.id === id && candidate.archivedAt === null,
      );
      if (variant) return { group, variant };
    }
    throw new DesktopApiError("not_found", "找不到该供应商版本");
  }

  private validateVariantInput(input: IngredientVariantInput) {
    this.validateDecimal(input.currentPrice, "currentPrice");
    this.validateDecimal(input.densityGPerMl, "densityGPerMl");
    for (const value of input.nutrition.values) {
      this.validateDecimal(value.value, value.nutrientDefinitionId);
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
    state: BrowserStateV2,
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
    state: BrowserStateV2,
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

  private ensureLegacySupplier(state: BrowserStateV2, timestamp: string) {
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
    state: BrowserStateV2,
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
