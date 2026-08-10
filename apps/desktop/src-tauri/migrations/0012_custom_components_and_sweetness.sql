ALTER TABLE nutrient_definitions
ADD COLUMN category TEXT NOT NULL DEFAULT 'nutrition'
CHECK (category IN ('nutrition', 'research'));

ALTER TABLE nutrient_definitions
ADD COLUMN archived_at TEXT;

CREATE INDEX nutrient_definitions_category_archived_sort_idx
ON nutrient_definitions(category, archived_at, sort_order);

CREATE TABLE ingredient_variant_sweetness (
  ingredient_variant_id TEXT PRIMARY KEY
    REFERENCES ingredient_variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  basis TEXT NOT NULL
    CHECK (basis IN ('w_w_percent', 'w_v_per_100ml')),
  content TEXT,
  relative_factor TEXT
);
