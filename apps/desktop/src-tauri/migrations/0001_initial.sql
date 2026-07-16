CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX categories_active_name_unique
ON categories(lower(name)) WHERE archived_at IS NULL;
CREATE INDEX categories_archived_sort_idx ON categories(archived_at, sort_order);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX suppliers_active_name_unique
ON suppliers(lower(name)) WHERE archived_at IS NULL;
CREATE INDEX suppliers_archived_name_idx ON suppliers(archived_at, name);

CREATE TABLE material_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX material_groups_active_name_unique
ON material_groups(lower(name)) WHERE archived_at IS NULL;
CREATE INDEX material_groups_category_idx ON material_groups(category_id);
CREATE INDEX material_groups_archived_name_idx ON material_groups(archived_at, name);

CREATE TABLE nutrient_definitions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  built_in INTEGER NOT NULL CHECK (built_in IN (0, 1)),
  sort_order INTEGER NOT NULL
);

CREATE UNIQUE INDEX nutrient_definitions_name_unique
ON nutrient_definitions(lower(name));
CREATE INDEX nutrient_definitions_sort_idx ON nutrient_definitions(sort_order);

CREATE TABLE ingredient_variants (
  id TEXT PRIMARY KEY,
  material_group_id TEXT NOT NULL REFERENCES material_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  model_or_specification TEXT NOT NULL DEFAULT '',
  internal_code TEXT,
  current_price TEXT,
  price_unit TEXT NOT NULL CHECK (price_unit IN ('kg', 'g', 'L', 'mL')),
  density_g_per_ml TEXT,
  source TEXT NOT NULL DEFAULT '',
  research_notes TEXT NOT NULL DEFAULT '',
  nutrition_basis TEXT NOT NULL CHECK (nutrition_basis IN ('per_100g', 'per_100ml')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX ingredient_variants_active_internal_code_unique
ON ingredient_variants(lower(internal_code))
WHERE archived_at IS NULL AND internal_code IS NOT NULL;
CREATE INDEX ingredient_variants_group_idx ON ingredient_variants(material_group_id, archived_at);
CREATE INDEX ingredient_variants_supplier_idx ON ingredient_variants(supplier_id, archived_at);
CREATE INDEX ingredient_variants_group_supplier_idx
ON ingredient_variants(material_group_id, supplier_id, archived_at);
CREATE INDEX ingredient_variants_updated_idx ON ingredient_variants(updated_at DESC);

CREATE TABLE ingredient_nutrient_values (
  ingredient_variant_id TEXT NOT NULL REFERENCES ingredient_variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  nutrient_definition_id TEXT NOT NULL REFERENCES nutrient_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  value TEXT,
  PRIMARY KEY (ingredient_variant_id, nutrient_definition_id)
);

CREATE INDEX ingredient_nutrient_values_definition_idx
ON ingredient_nutrient_values(nutrient_definition_id);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspace_drafts (
  kind TEXT NOT NULL,
  draft_key TEXT NOT NULL,
  payload_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, draft_key)
);

INSERT INTO nutrient_definitions (id, code, name, unit, built_in, sort_order) VALUES
  ('energy', 'energy', '能量', 'kJ', 1, 0),
  ('protein', 'protein', '蛋白质', 'g', 1, 1),
  ('fat', 'fat', '脂肪', 'g', 1, 2),
  ('saturated_fat', 'saturated_fat', '饱和脂肪', 'g', 1, 3),
  ('carbohydrate', 'carbohydrate', '碳水化合物', 'g', 1, 4),
  ('sugars', 'sugars', '糖', 'g', 1, 5),
  ('dietary_fiber', 'dietary_fiber', '膳食纤维', 'g', 1, 6),
  ('sodium', 'sodium', '钠', 'mg', 1, 7);
