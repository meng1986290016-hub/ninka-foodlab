ALTER TABLE recipes ADD COLUMN product_id TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN scheme_name TEXT NOT NULL DEFAULT '主配方';
ALTER TABLE recipes ADD COLUMN scheme_status TEXT NOT NULL DEFAULT 'current'
  CHECK (scheme_status IN ('current', 'approved', 'researching', 'inactive'));

UPDATE recipes SET product_id = id WHERE product_id = '';

CREATE INDEX recipes_product_idx
ON recipes(product_id, archived_at, updated_at DESC);

CREATE UNIQUE INDEX recipes_product_scheme_name_unique
ON recipes(product_id, lower(scheme_name));

CREATE UNIQUE INDEX recipes_product_current_unique
ON recipes(product_id)
WHERE archived_at IS NULL AND scheme_status = 'current';
