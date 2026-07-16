# Supplier-Specific Ingredient Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat ingredient prototype with a supplier-specific ingredient library that groups supplier variants under a common material, records per-variant nutrition, supports custom categories and comparison, and persists the same contract in browser demo storage and SQLite.

**Architecture:** React consumes a revised `DesktopApi` and never accesses storage directly. The browser adapter migrates versioned localStorage data to schema v2 for immediate testing; the Tauri adapter maps the identical contract to Rust repositories backed by transactional SQLite. Nutrition normalization remains in `@food-rd/core`; persistence stores source values and preserves unknown separately from confirmed zero.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, Tauri 2, Rust stable, rusqlite 0.40.1 with bundled SQLite.

## Global Constraints

- A recipe must reference an `IngredientVariant`, never a `MaterialGroup`.
- `internalCode` is nullable, not required, and hidden from the default list.
- Tags are removed from the first version; classification uses one optional custom category and free-form research notes live only on supplier variants.
- `updatedAt` is generated only when a supplier-variant transaction commits; drafts and failed saves must not change it.
- Nutrient `null` means unknown and the decimal string `"0"` means confirmed zero.
- Nutrition basis is exactly `per_100g` or `per_100ml`; mass conversion for `per_100ml` requires `densityGPerMl`.
- Do not add procurement, contacts, inventory, approval, supplier qualification, or cross-material comparison.
- Preserve existing `@food-rd/core` behavior and its 27 tests.

---

### Task 1: Replace the flat ingredient contract with grouped supplier types

**Files:**
- Modify: `apps/desktop/src/api/types.ts`
- Modify: `apps/desktop/src/api/desktop-api.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.test.ts`
- Test: `apps/desktop/src/api/desktop-api-contract.test.ts`

**Interfaces:**
- Consumes: existing `DesktopApiError`, `DraftRecord`, and `DatabaseStatus`.
- Produces: `Category`, `Supplier`, `MaterialGroup`, `IngredientVariant`, `NutrientDefinition`, `VariantNutrition`, input types, comparison types, and revised `DesktopApi` signatures used by every later task.

- [x] **Step 1: Write the failing type-contract test**

```ts
import { describe, expectTypeOf, it } from "vitest";
import type { DesktopApi } from "./desktop-api";
import type {
  IngredientVariantInput,
  MaterialGroup,
  NutritionBasis,
  VariantComparison,
} from "./types";

describe("supplier-specific DesktopApi contract", () => {
  it("exposes grouped materials and supplier variants", () => {
    expectTypeOf<Awaited<ReturnType<DesktopApi["listMaterialGroups"]>>>().toEqualTypeOf<
      MaterialGroup[]
    >();
    expectTypeOf<Parameters<DesktopApi["saveIngredientVariant"]>[0]>().toEqualTypeOf<
      IngredientVariantInput
    >();
    expectTypeOf<Awaited<ReturnType<DesktopApi["compareIngredientVariants"]>>>().toEqualTypeOf<
      VariantComparison
    >();
    expectTypeOf<NutritionBasis>().toEqualTypeOf<"per_100g" | "per_100ml">();
  });
});
```

- [x] **Step 2: Run the test and verify the old contract fails**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts`

Expected: FAIL because `listMaterialGroups`, `saveIngredientVariant`, and the new types do not exist.

- [x] **Step 3: Define the complete public types**

```ts
export type EntityId = string;
export type PriceUnit = "kg" | "g" | "L" | "mL";
export type NutritionBasis = "per_100g" | "per_100ml";

export interface Category {
  id: EntityId;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Supplier {
  id: EntityId;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface NutrientDefinition {
  id: EntityId;
  code: string;
  name: string;
  unit: "kJ" | "g" | "mg" | string;
  builtIn: boolean;
  sortOrder: number;
}

export interface VariantNutritionValue {
  nutrientDefinitionId: EntityId;
  value: string | null;
}

export interface VariantNutrition {
  basis: NutritionBasis;
  values: VariantNutritionValue[];
}

export interface DataCompleteness {
  percent: number;
  missingFields: string[];
}

export interface IngredientVariant {
  id: EntityId;
  materialGroupId: EntityId;
  supplierId: EntityId;
  supplierName: string;
  modelOrSpecification: string;
  internalCode: string | null;
  currentPrice: string | null;
  priceUnit: PriceUnit;
  densityGPerMl: string | null;
  source: string;
  researchNotes: string;
  nutrition: VariantNutrition;
  completeness: DataCompleteness;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MaterialGroup {
  id: EntityId;
  name: string;
  categoryId: EntityId | null;
  categoryName: string | null;
  variants: IngredientVariant[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MaterialGroupInput {
  name: string;
  categoryId: EntityId | null;
}

export interface IngredientVariantInput {
  id?: EntityId;
  materialGroupId: EntityId;
  supplierId: EntityId;
  modelOrSpecification: string;
  internalCode: string | null;
  currentPrice: string | null;
  priceUnit: PriceUnit;
  densityGPerMl: string | null;
  source: string;
  researchNotes: string;
  nutrition: VariantNutrition;
  duplicateConfirmed?: boolean;
}

export interface VariantComparisonRow {
  key: string;
  label: string;
  unit: string | null;
  values: Record<EntityId, string | null>;
}

export interface VariantComparison {
  materialGroupId: EntityId;
  variants: IngredientVariant[];
  rows: VariantComparisonRow[];
}
```

Revise `DesktopApi` to expose these exact methods:

```ts
export interface DesktopApi {
  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: string, name: string): Promise<Category>;
  archiveCategory(id: string): Promise<void>;
  listSuppliers(query?: string): Promise<Supplier[]>;
  createSupplier(name: string, notes?: string): Promise<Supplier>;
  updateSupplier(id: string, name: string, notes: string): Promise<Supplier>;
  archiveSupplier(id: string): Promise<void>;
  listMaterialGroups(query?: string): Promise<MaterialGroup[]>;
  createMaterialGroup(input: MaterialGroupInput): Promise<MaterialGroup>;
  updateMaterialGroup(id: string, input: MaterialGroupInput): Promise<MaterialGroup>;
  archiveMaterialGroup(id: string): Promise<void>;
  saveIngredientVariant(input: IngredientVariantInput): Promise<IngredientVariant>;
  copyIngredientVariant(sourceId: string, supplierId: string): Promise<IngredientVariant>;
  archiveIngredientVariant(id: string): Promise<void>;
  listNutrientDefinitions(): Promise<NutrientDefinition[]>;
  createNutrientDefinition(name: string, unit: string): Promise<NutrientDefinition>;
  compareIngredientVariants(materialGroupId: string, variantIds: string[]): Promise<VariantComparison>;
  getSetting<T>(key: string): Promise<T | null>;
  setSetting<T>(key: string, value: T): Promise<void>;
  getDraft<T>(kind: string, key: string): Promise<DraftRecord<T> | null>;
  saveDraft<T>(kind: string, key: string, payloadVersion: number, payload: T): Promise<DraftRecord<T>>;
  clearDraft(kind: string, key: string): Promise<void>;
  getDatabaseStatus(): Promise<DatabaseStatus>;
}
```

- [x] **Step 4: Extend the structured error codes and map the Tauri adapter**

Add `duplicate_name`, `duplicate_variant`, `reference_conflict`, `invalid_decimal`, and `conversion_unavailable` to `DesktopErrorCode`. Replace each old ingredient invoke in `TauriDesktopApi` with the Task 1 command names and payloads. The Rust commands do not exist yet, but the TypeScript adapter must compile and its invoke-contract tests must pass; Task 10 supplies the server side.

- [x] **Step 5: Run the contract and Tauri-adapter tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/desktop-api-contract.test.ts src/api/tauri-desktop-api.test.ts`

Expected: both tests PASS. A full typecheck may still identify the old browser adapter; Task 2 replaces that adapter before its commit.

---

### Task 2: Implement browser schema v2 and preserve schema v1 records

**Files:**
- Modify: `apps/desktop/src/api/browser-demo-api.ts`
- Create: `apps/desktop/src/api/browser-schema.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.test.ts`

**Interfaces:**
- Consumes: Task 1 public types.
- Produces: `readBrowserState`, `writeBrowserState`, `migrateV1ToV2`, and a `BrowserDemoApi` that satisfies all non-comparison `DesktopApi` methods.

- [x] **Step 1: Write failing migration and CRUD tests**

```ts
it("migrates a flat v1 record without losing price, density, source or notes", async () => {
  storage.setItem("food-rd.browser-demo.v1", JSON.stringify(legacyState));
  const migrated = new BrowserDemoApi({ storage, now, createId });
  const groups = await migrated.listMaterialGroups("柠檬");
  expect(groups).toHaveLength(1);
  expect(groups[0].variants[0]).toMatchObject({
    currentPrice: "18.20",
    densityGPerMl: "1.16",
    source: "演示供应商规格书",
    researchNotes: "浏览器演示原料",
  });
  expect(storage.getItem("food-rd.browser-demo.v2")).not.toBeNull();
});

it("creates a custom category, supplier, group and supplier variant", async () => {
  const category = await api.createCategory("蛋白原料");
  const supplier = await api.createSupplier("供应商A");
  const group = await api.createMaterialGroup({ name: "脱脂乳粉", categoryId: category.id });
  const variant = await api.saveIngredientVariant(makeVariantInput(group.id, supplier.id));
  expect(variant.supplierName).toBe("供应商A");
  expect((await api.listMaterialGroups("供应商A"))[0].variants).toHaveLength(1);
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/browser-demo-api.test.ts`

Expected: FAIL because schema v2 and grouped methods are missing.

- [x] **Step 3: Add the versioned browser state and deterministic migration**

```ts
export interface BrowserStateV2 {
  schemaVersion: 2;
  categories: Category[];
  suppliers: Supplier[];
  materialGroups: MaterialGroup[];
  nutrientDefinitions: NutrientDefinition[];
  settings: Record<string, unknown>;
  drafts: Record<string, DraftRecord>;
}

export const BROWSER_V2_KEY = "food-rd.browser-demo.v2";

export function migrateV1ToV2(legacy: LegacyState, context: MigrationContext): BrowserStateV2 {
  const categories = uniqueCategories(legacy.ingredients, context);
  const supplier = makeSupplier("演示供应商", context);
  return {
    schemaVersion: 2,
    categories,
    suppliers: [supplier],
    materialGroups: legacy.ingredients.map((old) => ({
      id: context.id(`group:${old.id}`),
      name: old.name,
      categoryId: categoryIdFor(old.category, categories),
      categoryName: old.category || null,
      variants: [legacyVariant(old, supplier, context)],
      createdAt: old.createdAt,
      updatedAt: old.updatedAt,
      archivedAt: old.archivedAt,
    })),
    nutrientDefinitions: builtInNutrients(context),
    settings: legacy.settings,
    drafts: {},
  };
}
```

Migration IDs must be stable derivations of legacy IDs, not new random IDs on every read. Convert the removed `tags` into a comma-separated suffix in `researchNotes` only when non-empty. Ignore the two legacy manual dates because `updatedAt` already preserves the latest committed record time.

- [x] **Step 4: Implement category, supplier, group, and variant CRUD**

Use immutable array replacement and one `write` per successful operation. `saveIngredientVariant` must validate nullable decimals with `/^(0|[1-9]\d*)(\.\d+)?$/`, detect duplicate supplier/model within one group, compute a new `updatedAt` only immediately before the final write, and throw `DesktopApiError("duplicate_variant", ...)` unless `duplicateConfirmed` is true.

- [x] **Step 5: Run browser adapter tests and typecheck**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/browser-demo-api.test.ts && pnpm --filter @food-rd/desktop typecheck`

Expected: all browser adapter tests PASS and both adapters satisfy the same contract.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src/api
git commit -m "feat(ingredients): group supplier-specific browser records"
```

---

### Task 3: Calculate nutrition completeness and build supplier comparison rows

**Files:**
- Create: `apps/desktop/src/features/ingredients/nutrition-model.ts`
- Test: `apps/desktop/src/features/ingredients/nutrition-model.test.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.ts`

**Interfaces:**
- Consumes: `IngredientVariantInput`, `NutrientDefinition`, `VariantComparison`.
- Produces: `calculateCompleteness(input, definitions)` and `buildVariantComparison(group, ids, definitions)`.

- [x] **Step 1: Write failing unknown/zero and density tests**

```ts
it("counts confirmed zero as present and null as missing", () => {
  const result = calculateCompleteness(inputWith({
    nutrition: { basis: "per_100g", values: [value("protein", "0"), value("fat", null)] },
  }), definitions);
  expect(result.missingFields).toContain("脂肪");
  expect(result.missingFields).not.toContain("蛋白质");
});

it("requires density only for per-100ml source data", () => {
  expect(calculateCompleteness(inputWith({ nutrition: nutrition("per_100ml"), densityGPerMl: null }), definitions).missingFields)
    .toContain("密度");
  expect(calculateCompleteness(inputWith({ nutrition: nutrition("per_100g"), densityGPerMl: null }), definitions).missingFields)
    .not.toContain("密度");
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/nutrition-model.test.ts`

Expected: FAIL because `calculateCompleteness` does not exist.

- [x] **Step 3: Implement the exact completeness denominator**

The denominator is current price, source, eight built-in nutrient values, and density only for `per_100ml`. Optional model, internal code, research notes, and custom nutrients do not lower completeness.

```ts
export function calculateCompleteness(
  input: IngredientVariantInput,
  definitions: NutrientDefinition[],
): DataCompleteness {
  const builtIns = definitions.filter((item) => item.builtIn);
  const values = new Map(input.nutrition.values.map((item) => [item.nutrientDefinitionId, item.value]));
  const missingFields = [
    input.currentPrice === null ? "当前含税价" : null,
    input.source.trim() === "" ? "数据来源" : null,
    input.nutrition.basis === "per_100ml" && input.densityGPerMl === null ? "密度" : null,
    ...builtIns.map((item) => values.get(item.id) == null ? item.name : null),
  ].filter((value): value is string => value !== null);
  const total = 2 + builtIns.length + (input.nutrition.basis === "per_100ml" ? 1 : 0);
  return { percent: Math.round(((total - missingFields.length) / total) * 100), missingFields };
}
```

- [x] **Step 4: Build comparison rows without coercing unknown to zero**

Return fixed rows for price, density, completeness, latest update, source, and research notes followed by one row per nutrient definition. Keep missing cells as `null`; never call `Number(null)`.

- [x] **Step 5: Wire both functions into `BrowserDemoApi` and run tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/nutrition-model.test.ts src/api/browser-demo-api.test.ts`

Expected: both test files PASS.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src/features/ingredients/nutrition-model.ts apps/desktop/src/features/ingredients/nutrition-model.test.ts apps/desktop/src/api/browser-demo-api.ts
git commit -m "feat(ingredients): calculate variant data completeness"
```

---

### Task 4: Replace the flat table with expandable material groups

**Files:**
- Create: `docs/design/phase-2-supplier-ingredient-concept.png`
- Modify: `apps/desktop/src/features/ingredients/useIngredients.ts`
- Replace: `apps/desktop/src/features/ingredients/IngredientTable.tsx`
- Create: `apps/desktop/src/features/ingredients/MaterialGroupRow.tsx`
- Create: `apps/desktop/src/features/ingredients/VariantRow.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.test.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: `DesktopApi.listMaterialGroups`, `MaterialGroup`, and `IngredientVariant`.
- Produces: an expandable list with group-level name/category/count and variant-level supplier/model/price/completeness/updatedAt/actions.

- [x] **Step 1: Generate and inspect the updated visual concept**

Use the approved sage-green desktop visual language and generate one concept showing an expanded “脱脂乳粉” group, three indented supplier variants, supplier completeness, per-variant update dates, and a right-side comparison drawer. Inspect the image with `view_image` and save the accepted reference at the exact path above. Do not change the approved information architecture while translating the concept to code.

- [x] **Step 2: Rewrite the failing user-flow tests**

```tsx
it("expands a common material to show supplier-specific rows", async () => {
  render(<App api={api} />);
  await screen.findByText("脱脂乳粉");
  expect(screen.queryByText("供应商A")).toBeNull();
  await user.click(screen.getByRole("button", { name: "展开 脱脂乳粉" }));
  expect(await screen.findByText("供应商A")).not.toBeNull();
  expect(screen.getByText("3 家供应商")).not.toBeNull();
});

it("searches supplier, model and research notes", async () => {
  render(<App api={api} />);
  await user.type(screen.getByRole("searchbox", { name: "搜索原料" }), "溶解性好");
  expect(await screen.findByText("脱脂乳粉")).not.toBeNull();
});
```

- [x] **Step 3: Run tests and verify the flat table fails**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/IngredientLibrary.test.tsx`

Expected: FAIL because group expand controls and supplier rows are absent.

- [x] **Step 4: Implement focused group and variant row components**

`MaterialGroupRow` renders one `<tr>` with the accessible button name `展开 <name>` or `收起 <name>`. `VariantRow` renders a visually indented `<tr>` and accessible actions `编辑 <material> · <supplier>`, `复制 <material> · <supplier>`, and `归档 <material> · <supplier>`.

Do not display `MaterialGroup.updatedAt`; show `variant.updatedAt` only on variant rows. Preserve the horizontal table container on narrow viewports instead of converting rows to cards.

- [x] **Step 5: Update styling**

```css
.material-group-row { background: var(--color-surface-muted); font-weight: 650; }
.variant-row td:first-child { padding-left: 44px; }
.variant-count { color: var(--color-ink-muted); font-size: 12px; }
.variant-row--selected { box-shadow: inset 3px 0 var(--color-accent); }
```

- [x] **Step 6: Run interaction tests, typecheck, and build**

Run: `pnpm --filter @food-rd/desktop test && pnpm --filter @food-rd/desktop typecheck && pnpm --filter @food-rd/desktop build`

Expected: desktop tests PASS and build succeeds.

- [x] **Step 7: Commit**

```bash
git add docs/design/phase-2-supplier-ingredient-concept.png apps/desktop/src/features/ingredients apps/desktop/src/styles/app.css
git commit -m "feat(ingredients): show expandable supplier variants"
```

---

### Task 5: Build custom category and supplier creation controls

**Files:**
- Create: `apps/desktop/src/features/ingredients/CategoryCombobox.tsx`
- Create: `apps/desktop/src/features/ingredients/SupplierCombobox.tsx`
- Test: `apps/desktop/src/features/ingredients/reference-comboboxes.test.tsx`
- Create: `apps/desktop/src/features/ingredients/MaterialGroupEditor.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: category and supplier methods from `DesktopApi`.
- Produces: reusable accessible comboboxes and a group editor that returns `MaterialGroupInput`.

- [x] **Step 1: Write failing inline-create tests**

```tsx
it("creates and selects a custom category from the category control", async () => {
  render(<CategoryCombobox api={api} value={null} onChange={onChange} />);
  await user.type(screen.getByRole("combobox", { name: "分类" }), "蛋白原料");
  await user.click(screen.getByRole("button", { name: "创建分类 蛋白原料" }));
  expect(onChange).toHaveBeenCalledWith(expect.any(String));
  expect(await api.listCategories()).toContainEqual(expect.objectContaining({ name: "蛋白原料" }));
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/reference-comboboxes.test.tsx`

Expected: FAIL because both controls are missing.

- [x] **Step 3: Implement accessible listbox behavior**

Both controls must support typing, filtering, ArrowDown/ArrowUp, Enter selection, Escape close, loading, empty state, and one explicit create button. Trim names and surface `duplicate_name` errors inline. Do not create a category or supplier merely because free text was typed.

- [x] **Step 4: Build `MaterialGroupEditor`**

The editor contains only common material name and optional category. It must not render tags, notes, internal code, dates, price, density, supplier, or nutrition fields.

- [x] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/reference-comboboxes.test.tsx && pnpm --filter @food-rd/desktop typecheck`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src/features/ingredients apps/desktop/src/styles/app.css
git commit -m "feat(ingredients): create custom categories and suppliers"
```

---

### Task 6: Split supplier-version editing into basic and nutrition tabs

**Files:**
- Replace: `apps/desktop/src/features/ingredients/IngredientEditor.tsx`
- Create: `apps/desktop/src/features/ingredients/VariantEditor.tsx`
- Create: `apps/desktop/src/features/ingredients/VariantBasicFields.tsx`
- Create: `apps/desktop/src/features/ingredients/NutritionEditor.tsx`
- Test: `apps/desktop/src/features/ingredients/VariantEditor.test.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: `IngredientVariantInput`, supplier combobox, nutrient definitions, and `DesktopApi.saveIngredientVariant`.
- Produces: `VariantEditor` with tabs `基本信息` and `营养成分` and no user-editable date.

- [x] **Step 1: Write failing form and nutrition tests**

```tsx
it("keeps internal code optional and hides it under more fields", async () => {
  render(<VariantEditor api={api} group={group} variant={null} onSaved={onSaved} onCancel={noop} />);
  expect(screen.queryByLabelText("内部编号")).toBeNull();
  await user.click(screen.getByRole("button", { name: "更多字段" }));
  expect(screen.getByLabelText("内部编号")).not.toBeNull();
  await fillRequiredSupplierOnly(user);
  await user.click(screen.getByRole("button", { name: "保存供应商版本" }));
  expect(onSaved).toHaveBeenCalled();
});

it("preserves blank as unknown and typed zero as confirmed zero", async () => {
  renderEditor();
  await user.click(screen.getByRole("tab", { name: "营养成分" }));
  await user.type(screen.getByLabelText("蛋白质（g）"), "0");
  await save(user);
  expect(api.saveIngredientVariant).toHaveBeenCalledWith(expect.objectContaining({
    nutrition: expect.objectContaining({ values: expect.arrayContaining([
      expect.objectContaining({ nutrientDefinitionId: "protein", value: "0" }),
      expect.objectContaining({ nutrientDefinitionId: "fat", value: null }),
    ]) }),
  }));
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/VariantEditor.test.tsx`

Expected: FAIL because `VariantEditor` and tabs are missing.

- [x] **Step 3: Implement basic fields**

Render supplier, model/specification, current price, price unit, density, source, and research notes. Put nullable internal code behind `更多字段`. Render `最新更新日期` as read-only text only for an existing variant; never place `updatedAt` in form state or API input.

- [x] **Step 4: Implement the nutrition table**

Render the basis selector first, then one row per built-in definition with number input and fixed unit. Map `""` to `null` and preserve the string `"0"`. Add `添加自定义成分`, which creates a definition by name/unit and appends its row. For `per_100ml` with missing density, show a non-blocking warning: `可以保存原始营养数据，但无法换算为质量基准。`

- [x] **Step 5: Run tests, typecheck, and build**

Run: `pnpm --filter @food-rd/desktop test && pnpm --filter @food-rd/desktop typecheck && pnpm --filter @food-rd/desktop build`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src/features/ingredients apps/desktop/src/styles/app.css
git commit -m "feat(ingredients): edit supplier nutrition records"
```

---

### Task 7: Migrate autosave to supplier-version drafts

**Files:**
- Modify: `apps/desktop/src/features/ingredients/useIngredientDraft.ts`
- Modify: `apps/desktop/src/features/ingredients/IngredientDraftNotice.tsx`
- Modify: `apps/desktop/src/features/ingredients/ingredient-draft.test.tsx`
- Modify: `apps/desktop/src/features/ingredients/VariantEditor.tsx`

**Interfaces:**
- Consumes: `IngredientVariantInput` and existing draft API.
- Produces: draft kind `ingredient-variant-editor`, payload version 2, explicit restore/discard, and clear-after-commit behavior.

- [x] **Step 1: Write failing versioned-draft tests**

```tsx
it("does not apply a v1 flat ingredient draft to the v2 variant editor", async () => {
  await api.saveDraft("ingredient-editor", "new", 1, legacyPayload);
  renderEditor();
  expect(screen.queryByText("发现未完成的供应商版本草稿")).toBeNull();
});

it("restores a v2 draft only after confirmation and clears it after commit", async () => {
  await api.saveDraft("ingredient-variant-editor", "new", 2, v2Payload);
  renderEditor();
  await user.click(await screen.findByRole("button", { name: "恢复草稿" }));
  expect((screen.getByLabelText("供应商") as HTMLInputElement).value).toBe("供应商A");
  await save(user);
  expect(await api.getDraft("ingredient-variant-editor", "new")).toBeNull();
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/ingredient-draft.test.tsx`

Expected: FAIL because draft kind/version and payload remain v1.

- [x] **Step 3: Implement draft v2**

Use a 500ms debounce. The draft key is the variant ID or `new:<materialGroupId>`. Store supplier selection, basic fields, nutrition basis and nutrient strings. Saving a formal variant clears only its matching draft after the API commit resolves. Closing the editor does not clear it.

- [x] **Step 4: Run draft and editor tests**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/ingredient-draft.test.tsx src/features/ingredients/VariantEditor.test.tsx`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/features/ingredients
git commit -m "feat(ingredients): recover supplier variant drafts"
```

---

### Task 8: Add same-material supplier comparison

**Files:**
- Create: `apps/desktop/src/features/ingredients/VariantComparisonDrawer.tsx`
- Test: `apps/desktop/src/features/ingredients/VariantComparisonDrawer.test.tsx`
- Modify: `apps/desktop/src/features/ingredients/IngredientLibrary.tsx`
- Modify: `apps/desktop/src/features/ingredients/VariantRow.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Interfaces:**
- Consumes: `DesktopApi.compareIngredientVariants` and `VariantComparison`.
- Produces: group-scoped selection and a comparison drawer with rows for price, density, completeness, updated date, source, notes, and nutrients.

- [x] **Step 1: Write failing comparison tests**

```tsx
it("compares variants only within one common material", async () => {
  renderLibrary();
  await expand("脱脂乳粉");
  await selectVariant("供应商A");
  await selectVariant("供应商B");
  await user.click(screen.getByRole("button", { name: "比较 2 个供应商版本" }));
  expect(await screen.findByRole("dialog", { name: "供应商版本比较" })).not.toBeNull();
  expect(screen.getByRole("cell", { name: "未知" }).textContent).toBe("未知");
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/features/ingredients/VariantComparisonDrawer.test.tsx`

Expected: FAIL because comparison selection and drawer do not exist.

- [x] **Step 3: Implement scoped selection and comparison table**

Selecting a variant in another group clears the previous group selection after confirmation. Require at least two IDs. Render `null` cells as `未知`; do not apply numeric high/low styling when either compared cell is unknown. Allow two or more variant columns with horizontal scrolling.

- [x] **Step 4: Run comparison and full desktop tests**

Run: `pnpm --filter @food-rd/desktop test`

Expected: all desktop tests PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/features/ingredients apps/desktop/src/styles/app.css
git commit -m "feat(ingredients): compare supplier variants"
```

---

### Task 9: Persist the approved model in transactional SQLite

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0001_initial.sql`
- Create: `apps/desktop/src-tauri/src/database/mod.rs`
- Create: `apps/desktop/src-tauri/src/database/migrations.rs`
- Create: `apps/desktop/src-tauri/src/ingredients/model.rs`
- Create: `apps/desktop/src-tauri/src/ingredients/repository.rs`
- Create: `apps/desktop/src-tauri/tests/ingredient_repository.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 1 JSON field names and null semantics.
- Produces: `IngredientRepository` methods matching the grouped `DesktopApi` and one transaction for variant plus nutrient writes.

- [x] **Step 1: Install/verify Rust before writing Rust code**

Run: `rustc --version && cargo --version && xcode-select -p`

Expected: stable Rust, Cargo, and `/Library/Developer/CommandLineTools` are reported. If Rust is absent, obtain user approval and install stable Rust with rustfmt and Clippy; do not write untestable Rust first.

- [x] **Step 2: Write failing repository tests**

```rust
#[test]
fn variant_save_is_atomic_and_updates_time_only_after_commit() {
    let fixture = Fixture::new();
    let first = fixture.repo.save_variant(valid_variant_input()).unwrap();
    fixture.fail_next_nutrient_insert();
    assert!(fixture.repo.save_variant(changed_variant_input(first.id)).is_err());
    let unchanged = fixture.repo.get_variant(first.id).unwrap();
    assert_eq!(unchanged.updated_at, first.updated_at);
    assert_eq!(unchanged.current_price.as_deref(), Some("31.50"));
}

#[test]
fn unknown_and_confirmed_zero_round_trip_distinctly() {
    let fixture = Fixture::new();
    let saved = fixture.repo.save_variant(input_with_values(None, Some("0"))).unwrap();
    assert_eq!(saved.nutrition.values[0].value, None);
    assert_eq!(saved.nutrition.values[1].value.as_deref(), Some("0"));
}
```

- [x] **Step 3: Run tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ingredient_repository`

Expected: FAIL because migration and repository are missing.

- [x] **Step 4: Create the exact normalized schema**

The migration creates `categories`, `material_groups`, `suppliers`, `ingredient_variants`, `nutrient_definitions`, `ingredient_nutrient_values`, `app_settings`, `workspace_drafts`, and `schema_migrations`. Use `TEXT` for UUIDs, decimals, RFC3339 timestamps, basis and units; use nullable `TEXT` for unknown numeric values. Add foreign keys and indexes for group name, supplier name, variant group/supplier, category reference, archived status and updated time.

Seed the eight built-in nutrient definitions with stable IDs/codes: `energy`, `protein`, `fat`, `saturated_fat`, `carbohydrate`, `sugars`, `dietary_fiber`, and `sodium`.

- [x] **Step 5: Implement repository transactions**

`save_variant` validates decimal strings, begins a transaction, inserts/updates the variant, replaces its nutrient rows, calculates committed `updated_at` from the repository clock, and commits. On any error, rusqlite drop rollback preserves both data and timestamp. Category/supplier/group archive methods reject active references with structured error codes.

- [x] **Step 6: Run Rust quality gates**

Run: `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: fmt, Clippy, and all Rust tests PASS.

- [x] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri
git commit -m "feat(storage): persist supplier-specific ingredients"
```

---

### Task 10: Map Tauri commands and adapter to the grouped contract

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/ingredients.rs`
- Create: `apps/desktop/src-tauri/src/commands/mod.rs`
- Create: `apps/desktop/src-tauri/tests/ingredient_commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/api/tauri-desktop-api.test.ts`

**Interfaces:**
- Consumes: Rust repository and Task 1 `DesktopApi` methods.
- Produces: Tauri commands with snake_case command names and camelCase JSON payloads, verified against the already conforming `TauriDesktopApi` from Task 1.

- [ ] **Step 1: Write failing command-contract tests**

```ts
it("saves a supplier variant without sending updatedAt", async () => {
  const invoke = vi.fn().mockResolvedValue(savedVariant);
  const api = new TauriDesktopApi(invoke);
  await api.saveIngredientVariant(input);
  expect(invoke).toHaveBeenCalledWith("save_ingredient_variant", { input });
  expect(invoke.mock.calls[0][1].input).not.toHaveProperty("updatedAt");
});
```

Rust serialization tests must assert that unknown nutrient JSON is `null`, confirmed zero is `"0"`, and repository errors serialize as `{ code, message, field }` without a DB path or SQL.

- [ ] **Step 2: Run TypeScript and Rust tests and verify failure**

Run: `pnpm --filter @food-rd/desktop exec vitest run src/api/tauri-desktop-api.test.ts && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test ingredient_commands`

Expected: FAIL because commands and mappings are incomplete.

- [ ] **Step 3: Implement command handlers and adapter methods**

Commands perform deserialization, application-state lookup, repository call and structured error mapping only. Register every Task 1 method. Do not place nutrition calculations, completeness rules or UI defaults in Rust commands.

- [ ] **Step 4: Run all contract tests**

Run: `pnpm --filter @food-rd/desktop test && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: all TypeScript and Rust tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src apps/desktop/src-tauri/tests apps/desktop/src/api/tauri-desktop-api.test.ts
git commit -m "feat(desktop): expose supplier ingredient commands"
```

---

### Task 11: Verify migration, responsive UI, real Tauri persistence, and documentation

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `docs/testing/phase-2-browser-checklist.md`
- Create: `docs/testing/phase-2-supplier-ingredient-checklist.md`
- Replace: `docs/testing/screenshots/phase-2-ingredient-library.png`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: complete browser and Tauri implementations.
- Produces: reproducible verification evidence and updated user instructions.

- [ ] **Step 1: Run the full automated verification**

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: existing 27 core tests, all desktop tests, all Rust tests, typecheck, frontend build, fmt and Clippy PASS.

- [ ] **Step 2: Verify browser migration and workflow**

Start `pnpm dev:desktop`, load existing schema-v1 demo data, and confirm it becomes grouped schema-v2 data without loss. Create “脱脂乳粉”, custom category “蛋白原料”, three suppliers, three variants, distinct price/nutrition values, one confirmed zero and one unknown. Expand, search, copy, edit, compare, archive and recover a draft.

- [ ] **Step 3: Verify responsive rendering**

Use Browser/IAB first; if unavailable, record the failure and use Playwright Chromium. Capture 1280×800 with the group expanded and comparison drawer open, plus 620×800. Use `view_image` on the accepted concept and latest screenshots. Check group hierarchy, supplier rows, nutrition tab, palette, typography, table density, drawer width, focus states and horizontal overflow.

- [ ] **Step 4: Verify real Tauri persistence**

Start `pnpm tauri dev`, repeat create/edit in the native window, quit, reopen and verify SQLite data and timestamps persist. Deliberately leave a supplier draft, restart and confirm restore/discard. Confirm no shell permission and no unrestricted filesystem capability are enabled.

- [ ] **Step 5: Update CI and documentation**

CI runs pnpm install/test/typecheck/build and Rust fmt/clippy/test on macOS and Windows. README explains browser demo versus SQLite, custom category creation, supplier variants, nutrition null/zero behavior, database location and reset procedure.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml apps/desktop/README.md docs/testing
git commit -m "ci: verify supplier-specific ingredient library"
```
