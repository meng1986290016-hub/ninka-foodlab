import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { DesktopApi } from "./desktop-api";
import type {
  Category,
  DatabaseStatus,
  DraftRecord,
  Ingredient,
  IngredientInput,
  IngredientListRequest,
  IngredientVariant,
  IngredientVariantInput,
  MaterialGroup,
  MaterialGroupInput,
  NutrientDefinition,
  Supplier,
  VariantComparison,
} from "./types";

type Invoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export class TauriDesktopApi implements DesktopApi {
  constructor(private readonly invoke: Invoke = tauriInvoke) {}

  listCategories() {
    return this.invoke<Category[]>("list_categories");
  }

  createCategory(name: string) {
    return this.invoke<Category>("create_category", { name });
  }

  renameCategory(id: string, name: string) {
    return this.invoke<Category>("rename_category", { id, name });
  }

  archiveCategory(id: string) {
    return this.invoke<void>("archive_category", { id });
  }

  listSuppliers(query?: string) {
    return this.invoke<Supplier[]>("list_suppliers", { query });
  }

  createSupplier(name: string, notes = "") {
    return this.invoke<Supplier>("create_supplier", { name, notes });
  }

  updateSupplier(id: string, name: string, notes: string) {
    return this.invoke<Supplier>("update_supplier", { id, name, notes });
  }

  archiveSupplier(id: string) {
    return this.invoke<void>("archive_supplier", { id });
  }

  listMaterialGroups(query?: string) {
    return this.invoke<MaterialGroup[]>("list_material_groups", { query });
  }

  createMaterialGroup(input: MaterialGroupInput) {
    return this.invoke<MaterialGroup>("create_material_group", { input });
  }

  updateMaterialGroup(id: string, input: MaterialGroupInput) {
    return this.invoke<MaterialGroup>("update_material_group", { id, input });
  }

  archiveMaterialGroup(id: string) {
    return this.invoke<void>("archive_material_group", { id });
  }

  saveIngredientVariant(input: IngredientVariantInput) {
    return this.invoke<IngredientVariant>("save_ingredient_variant", { input });
  }

  copyIngredientVariant(sourceId: string, supplierId: string) {
    return this.invoke<IngredientVariant>("copy_ingredient_variant", {
      sourceId,
      supplierId,
    });
  }

  archiveIngredientVariant(id: string) {
    return this.invoke<void>("archive_ingredient_variant", { id });
  }

  listNutrientDefinitions() {
    return this.invoke<NutrientDefinition[]>("list_nutrient_definitions");
  }

  createNutrientDefinition(name: string, unit: string) {
    return this.invoke<NutrientDefinition>("create_nutrient_definition", {
      name,
      unit,
    });
  }

  compareIngredientVariants(materialGroupId: string, variantIds: string[]) {
    return this.invoke<VariantComparison>("compare_ingredient_variants", {
      materialGroupId,
      variantIds,
    });
  }

  /** Temporary schema-v1 compatibility methods. */
  listIngredients(request: IngredientListRequest = {}) {
    return this.invoke<Ingredient[]>("list_ingredients", { request });
  }

  getIngredient(id: string) {
    return this.invoke<Ingredient>("get_ingredient", { id });
  }

  createIngredient(input: IngredientInput) {
    return this.invoke<Ingredient>("create_ingredient", { input });
  }

  updateIngredient(id: string, input: IngredientInput) {
    return this.invoke<Ingredient>("update_ingredient", { id, input });
  }

  archiveIngredient(id: string) {
    return this.invoke<void>("archive_ingredient", { id });
  }

  getSetting<T>(key: string) {
    return this.invoke<T | null>("get_setting", { key });
  }

  setSetting<T>(key: string, value: T) {
    return this.invoke<void>("set_setting", { key, value });
  }

  getDraft<T>(kind: string, key: string) {
    return this.invoke<DraftRecord<T> | null>("get_draft", { kind, key });
  }

  saveDraft<T>(
    kind: string,
    key: string,
    payloadVersion: number,
    payload: T,
  ) {
    return this.invoke<DraftRecord<T>>("save_draft", {
      kind,
      key,
      payloadVersion,
      payload,
    });
  }

  clearDraft(kind: string, key: string) {
    return this.invoke<void>("clear_draft", { kind, key });
  }

  getDatabaseStatus() {
    return this.invoke<DatabaseStatus>("database_status");
  }
}
