import { beforeEach, describe, expect, it } from "vitest";

import { BrowserDemoApi } from "./browser-demo-api";
import { builtInNutrients } from "./browser-schema";
import { DesktopApiError } from "./types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  writeCount = 0;

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
    this.writeCount += 1;
    this.values.set(key, value);
  }
}

function emptyV2Storage() {
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

describe("BrowserDemoApi", () => {
  let storage: MemoryStorage;
  let api: BrowserDemoApi;

  beforeEach(() => {
    storage = new MemoryStorage();
    api = new BrowserDemoApi({
      storage,
      createId: () => "ingredient-new",
      now: () => "2026-07-16T01:00:00.000Z",
    });
  });

  it("rejects native import paths instead of attempting filesystem access", async () => {
    await expect(
      api.createIngredientImportJob({
        sourceKind: "spreadsheet",
        files: [{ kind: "native_path", value: "/private/source.xlsx" }],
      }),
    ).rejects.toMatchObject({ code: "unsupported_file" });
  });

  it("creates deterministic demo drafts without native file access", async () => {
    const job = await api.createIngredientImportJob({
      sourceKind: "spreadsheet",
      files: [{ kind: "browser_demo", value: "演示原料.xlsx" }],
    });
    const drafts = await api.listIngredientImportDrafts(job.id);

    expect(job.status).toBe("drafts_ready");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.attachments[0]?.originalName).toBe("演示原料.xlsx");
    expect(drafts[0]?.review).toMatchObject({
      materialName: "演示原料",
      supplierName: "演示供应商",
    });
    expect(drafts[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "materialName",
          attachmentId: drafts[0]?.attachments[0]?.id,
          confidence: "high",
        }),
        expect.objectContaining({
          fieldPath: "supplierName",
          attachmentId: drafts[0]?.attachments[0]?.id,
          confidence: "medium",
        }),
        expect.objectContaining({
          fieldPath: "nutritionBasis",
          attachmentId: drafts[0]?.attachments[0]?.id,
          confidence: "low",
        }),
      ]),
    );
  });

  it("migrates v2 storage to v7 without changing ingredient data", async () => {
    const v2 = emptyV2Storage();
    const migrated = new BrowserDemoApi({ storage: v2 });

    expect(await migrated.listMaterialGroups()).toEqual([]);
    const stored = JSON.parse(
      v2.getItem("food-rd.browser-demo.v8") ?? "null",
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({
      schemaVersion: 8,
      categories: [],
      suppliers: [],
      materialGroups: [],
      importJobs: {},
      importDrafts: {},
      attachments: {},
      agentPreferences: {
        enabled: true,
        visionProviderConfigId: null,
      },
      agentConversations: {},
      agentMessages: {},
      agentRuns: {},
      recipes: {},
      recipeDrafts: {},
      recipeVersions: {},
      researchReports: {},
      recipeVersionDependencies: {},
      nutritionLabels: {},
      nutritionLabelDrafts: {},
      nutritionLabelVersions: {},
    });
  });

  it("repairs supplier variants saved before allergen fields were introduced", async () => {
    await api.listMaterialGroups();
    const stored = JSON.parse(
      storage.getItem("food-rd.browser-demo.v8") ?? "null",
    ) as {
      materialGroups: Array<{
        variants: Array<{ allergens?: unknown }>;
      }>;
    };
    delete stored.materialGroups[0]?.variants[0]?.allergens;
    storage.setItem("food-rd.browser-demo.v8", JSON.stringify(stored));

    const reopened = new BrowserDemoApi({ storage });
    const groups = await reopened.listMaterialGroups();

    expect(groups[0]?.variants[0]?.allergens).toEqual({
      contains: [],
      mayContain: [],
    });
  });

  it("removes legacy research metrics from browser storage", async () => {
    await api.listMaterialGroups();
    const stored = JSON.parse(
      storage.getItem("food-rd.browser-demo.v8") ?? "null",
    ) as {
      nutrientDefinitions: Array<{
        id: string;
        code?: string;
        name?: string;
        unit?: string;
        builtIn?: boolean;
        sortOrder?: number;
        category?: string;
        archivedAt?: string | null;
      }>;
      materialGroups: Array<{
        variants: Array<{
          sweetness?: unknown;
          nutrition: {
            values: Array<{
              nutrientDefinitionId: string;
              value: string | null;
            }>;
          };
        }>;
      }>;
    };
    stored.nutrientDefinitions.push(
      { id: "theoretical_sweetness" },
      {
        id: "polyphenol",
        code: "custom:polyphenol",
        name: "总多酚",
        unit: "mg",
        builtIn: false,
        sortOrder: 1001,
        category: "research",
        archivedAt: null,
      },
    );
    const variant = stored.materialGroups[0]?.variants[0];
    if (variant === undefined) throw new Error("missing demo variant");
    variant.sweetness = {
      basis: "w_w_percent",
      content: "10",
      relativeFactor: "2",
    };
    variant.nutrition.values.push({
      nutrientDefinitionId: "theoretical_sweetness",
      value: "0.2",
    });
    variant.nutrition.values.push({
      nutrientDefinitionId: "polyphenol",
      value: "20",
    });
    storage.setItem("food-rd.browser-demo.v8", JSON.stringify(stored));

    const reopened = new BrowserDemoApi({ storage });
    const groups = await reopened.listMaterialGroups();
    const migrated = groups[0]?.variants[0];

    for (const id of ["theoretical_sweetness", "polyphenol"]) {
      expect(migrated?.nutrition.values).not.toContainEqual(
        expect.objectContaining({ nutrientDefinitionId: id }),
      );
      expect(await reopened.listNutrientDefinitions()).not.toContainEqual(
        expect.objectContaining({ id }),
      );
    }
    expect("sweetness" in (migrated ?? {})).toBe(false);
  });

  it("commits every ready demo draft with one atomic browser write", async () => {
    let sequence = 0;
    const atomicApi = new BrowserDemoApi({
      storage,
      createId: () => `import-${++sequence}`,
      now: () => "2026-07-19T10:00:00.000Z",
    });
    const job = await atomicApi.createIngredientImportJob({
      sourceKind: "spreadsheet",
      files: [
        { kind: "browser_demo", value: "演示原料A.xlsx" },
        { kind: "browser_demo", value: "演示原料B.xlsx" },
      ],
    });
    const writesBeforeCommit = storage.writeCount;

    const result = await atomicApi.commitIngredientImportJob(job.id);

    expect(result.variants).toHaveLength(2);
    expect(storage.writeCount - writesBeforeCommit).toBe(1);
  });

  it("starts with realistic Chinese demonstration ingredients", async () => {
    const ingredients = await api.listIngredients();

    expect(ingredients.map((ingredient) => ingredient.name)).toEqual([
      "白砂糖",
      "脱脂乳粉",
      "柠檬浓缩汁",
    ]);
  });

  it("creates, searches, updates and archives ingredients", async () => {
    const created = await api.createIngredient({
      name: "海藻糖",
      internalCode: "RM-0004",
      category: "甜味原料",
      tags: ["减糖"],
      notes: "测试批次",
      densityGPerMl: null,
      currentPrice: "13.80",
      priceUnit: "kg",
      priceUpdatedAt: "2026-07-16",
      source: "供应商规格书",
      sourceDate: "2026-07-10",
    });

    expect(created.id).toBe("ingredient-new");
    expect(await api.listIngredients({ query: "RM-0004" })).toHaveLength(1);

    const updated = await api.updateIngredient(created.id, {
      ...created,
      name: "结晶海藻糖",
    });
    expect(updated.name).toBe("结晶海藻糖");

    await api.archiveIngredient(created.id);
    expect(await api.listIngredients({ query: "海藻糖" })).toEqual([]);
  });

  it("persists versioned settings and recoverable drafts", async () => {
    await api.setSetting("appearance.compact", true);
    await api.saveDraft("ingredient-editor", "new", 1, {
      name: "未保存原料",
    });

    const reopened = new BrowserDemoApi({ storage });

    expect(await reopened.getSetting("appearance.compact")).toBe(true);
    expect(await reopened.getDraft("ingredient-editor", "new")).toMatchObject({
      payloadVersion: 1,
      payload: { name: "未保存原料" },
    });

    await reopened.clearDraft("ingredient-editor", "new");
    expect(await reopened.getDraft("ingredient-editor", "new")).toBeNull();
  });

  it("migrates a flat v1 record without losing supplier data", async () => {
    storage.setItem(
      "food-rd.browser-demo.v1",
      JSON.stringify({
        schemaVersion: 1,
        ingredients: [
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
        ],
        settings: { "appearance.compact": true },
        drafts: {},
      }),
    );

    const migrated = new BrowserDemoApi({ storage });
    const groups = await migrated.listMaterialGroups("柠檬");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.variants[0]).toMatchObject({
      allergens: { contains: [], mayContain: [] },
      currentPrice: "18.20",
      densityGPerMl: "1.16",
      source: "演示供应商规格书",
      researchNotes: "浏览器演示原料；原标签：需冷藏",
      sourceAttachments: [],
      updatedAt: "2026-07-12T01:15:00.000Z",
    });
    expect(storage.getItem("food-rd.browser-demo.v8")).not.toBeNull();
    expect(await migrated.getSetting("appearance.compact")).toBe(true);
  });

  it("creates and searches a category, supplier, group and supplier variant", async () => {
    let sequence = 0;
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `new-${++sequence}`,
      now: () => "2026-07-16T02:00:00.000Z",
    });

    const category = await groupedApi.createCategory("蛋白原料");
    const supplier = await groupedApi.createSupplier("供应商A");
    const group = await groupedApi.createMaterialGroup({
      name: "脱脂乳粉",
      categoryId: category.id,
    });
    const variant = await groupedApi.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: "31.50",
      priceUnit: "kg",
      densityGPerMl: null,
      source: "供应商规格书",
      researchNotes: "溶解性好",
      nutrition: { basis: "per_100g", values: [] },
      allergens: { contains: ["乳"], mayContain: [] },
    });

    expect(variant.supplierName).toBe("供应商A");
    expect(variant.allergens).toEqual({ contains: ["乳"], mayContain: [] });
    expect(variant.sourceAttachments).toEqual([]);
    await groupedApi.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: "速溶型",
      internalCode: null,
      currentPrice: "32.00",
      priceUnit: "kg",
      densityGPerMl: null,
      source: "供应商规格书",
      researchNotes: "同供应商的另一型号",
      nutrition: { basis: "per_100g", values: [] },
    });
    expect(
      (await groupedApi.listMaterialGroups("供应商A"))[0]?.variants,
    ).toHaveLength(2);
    expect((await groupedApi.listMaterialGroups("低热型"))[0]?.id).toBe(group.id);
    expect((await groupedApi.listMaterialGroups("溶解性好"))[0]?.id).toBe(group.id);
  });

  it("warns before allowing a duplicate supplier and model combination", async () => {
    let sequence = 0;
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `duplicate-${++sequence}`,
      now: () => "2026-07-16T03:00:00.000Z",
    });
    const supplier = await groupedApi.createSupplier("供应商A");
    const group = await groupedApi.createMaterialGroup({
      name: "脱脂乳粉",
      categoryId: null,
    });
    const input = {
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: null,
      priceUnit: "kg" as const,
      densityGPerMl: null,
      source: "",
      researchNotes: "",
      nutrition: { basis: "per_100g" as const, values: [] },
    };

    await groupedApi.saveIngredientVariant(input);
    await expect(groupedApi.saveIngredientVariant(input)).rejects.toMatchObject({
      code: "duplicate_variant",
    } satisfies Partial<DesktopApiError>);

    const confirmed = await groupedApi.saveIngredientVariant({
      ...input,
      duplicateConfirmed: true,
    });
    expect(confirmed.supplierId).toBe(supplier.id);
  });

  it("rejects non-decimal price input", async () => {
    let sequence = 0;
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `decimal-${++sequence}`,
    });
    const supplier = await groupedApi.createSupplier("供应商A");
    const group = await groupedApi.createMaterialGroup({
      name: "脱脂乳粉",
      categoryId: null,
    });

    await expect(
      groupedApi.saveIngredientVariant({
        materialGroupId: group.id,
        supplierId: supplier.id,
        modelOrSpecification: "",
        internalCode: null,
        currentPrice: "31元",
        priceUnit: "kg",
        densityGPerMl: null,
        source: "",
        researchNotes: "",
        nutrition: { basis: "per_100g", values: [] },
      }),
    ).rejects.toMatchObject({ code: "invalid_decimal", field: "currentPrice" });
  });

  it("rejects duplicate custom nutrient names", async () => {
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => "custom-lactose",
    });

    await groupedApi.createNutrientDefinition("乳糖", "g", "nutrition");

    await expect(
      groupedApi.createNutrientDefinition(" 乳糖 ", "g", "nutrition"),
    ).rejects.toMatchObject({ code: "duplicate_name" });
  });

  it("keeps category and supplier references consistent across edits", async () => {
    let sequence = 0;
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `reference-${++sequence}`,
      now: () => "2026-07-16T04:00:00.000Z",
    });
    const category = await groupedApi.createCategory("乳制品");
    const supplier = await groupedApi.createSupplier("供应商A");
    const group = await groupedApi.createMaterialGroup({
      name: "脱脂乳粉",
      categoryId: category.id,
    });
    const variant = await groupedApi.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplier.id,
      modelOrSpecification: "低热型",
      internalCode: null,
      currentPrice: "31.50",
      priceUnit: "kg",
      densityGPerMl: null,
      source: "规格书",
      researchNotes: "",
      nutrition: { basis: "per_100g", values: [] },
    });

    await groupedApi.renameCategory(category.id, "乳基原料");
    await groupedApi.updateSupplier(supplier.id, "供应商甲", "");
    await groupedApi.updateMaterialGroup(group.id, {
      name: "低脂乳粉",
      categoryId: category.id,
    });
    const updated = (await groupedApi.listMaterialGroups("供应商甲"))[0];
    expect(updated).toMatchObject({
      name: "低脂乳粉",
      categoryName: "乳基原料",
    });
    expect(updated?.variants[0]?.supplierName).toBe("供应商甲");
    await expect(groupedApi.archiveCategory(category.id)).rejects.toMatchObject({
      code: "reference_conflict",
    });
    await expect(groupedApi.archiveSupplier(supplier.id)).rejects.toMatchObject({
      code: "reference_conflict",
    });
    await expect(groupedApi.archiveMaterialGroup(group.id)).rejects.toMatchObject({
      code: "reference_conflict",
    });

    await groupedApi.archiveIngredientVariant(variant.id);
    await groupedApi.archiveMaterialGroup(group.id);
    await groupedApi.archiveSupplier(supplier.id);
    await groupedApi.archiveCategory(category.id);
    expect(await groupedApi.listMaterialGroups()).toEqual([]);
  });

  it("calculates completeness and comparison rows from saved source values", async () => {
    let sequence = 0;
    const groupedApi = new BrowserDemoApi({
      storage: emptyV2Storage(),
      createId: () => `comparison-${++sequence}`,
      now: () => "2026-07-16T05:00:00.000Z",
    });
    const supplierA = await groupedApi.createSupplier("供应商A");
    const supplierB = await groupedApi.createSupplier("供应商B");
    const group = await groupedApi.createMaterialGroup({
      name: "脱脂乳粉",
      categoryId: null,
    });
    const nutritionValues = builtInNutrients().map((definition) => ({
      nutrientDefinitionId: definition.id,
      value: definition.id === "fat" ? null : "0",
    }));
    const variantA = await groupedApi.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplierA.id,
      modelOrSpecification: "A型",
      internalCode: null,
      currentPrice: "31.50",
      priceUnit: "kg",
      densityGPerMl: null,
      source: "规格书A",
      researchNotes: "",
      nutrition: { basis: "per_100g", values: nutritionValues },
    });
    const variantB = await groupedApi.saveIngredientVariant({
      materialGroupId: group.id,
      supplierId: supplierB.id,
      modelOrSpecification: "B型",
      internalCode: null,
      currentPrice: null,
      priceUnit: "kg",
      densityGPerMl: null,
      source: "规格书B",
      researchNotes: "",
      nutrition: {
        basis: "per_100g",
        values: nutritionValues.map((value) =>
          value.nutrientDefinitionId === "protein"
            ? { ...value, value: null }
            : value,
        ),
      },
    });

    expect(variantA.completeness).toMatchObject({
      percent: 90,
      missingFields: ["脂肪"],
    });
    const comparison = await groupedApi.compareIngredientVariants(group.id, [
      variantA.id,
      variantB.id,
    ]);
    expect(
      comparison.rows.find((row) => row.key === "nutrient:protein")?.values,
    ).toEqual({
      [variantA.id]: "0",
      [variantB.id]: null,
    });
  });
});
