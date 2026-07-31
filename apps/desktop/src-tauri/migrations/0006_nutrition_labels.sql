CREATE TABLE nutrition_labels (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL
    REFERENCES recipes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX nutrition_labels_recipe_idx
ON nutrition_labels(recipe_id, archived_at, updated_at DESC);

CREATE TABLE nutrition_label_drafts (
  id TEXT PRIMARY KEY,
  label_id TEXT NOT NULL UNIQUE
    REFERENCES nutrition_labels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  recipe_version_id TEXT NOT NULL
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  rule_pack_id TEXT NOT NULL
    CHECK (rule_pack_id IN ('gb-28050-2011', 'gb-28050-2025')),
  payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version > 0),
  payload_json TEXT NOT NULL,
  calculation_json TEXT,
  issues_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX nutrition_label_drafts_recipe_version_idx
ON nutrition_label_drafts(recipe_version_id);

CREATE TABLE nutrition_label_versions (
  id TEXT PRIMARY KEY,
  label_id TEXT NOT NULL
    REFERENCES nutrition_labels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  source_draft_id TEXT NOT NULL
    REFERENCES nutrition_label_drafts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  recipe_version_id TEXT NOT NULL
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  rule_pack_id TEXT NOT NULL
    CHECK (rule_pack_id IN ('gb-28050-2011', 'gb-28050-2025')),
  rule_pack_revision TEXT NOT NULL,
  snapshot_schema_version INTEGER NOT NULL CHECK (snapshot_schema_version > 0),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (label_id, version_number)
);

CREATE INDEX nutrition_label_versions_label_idx
ON nutrition_label_versions(label_id, version_number DESC);

CREATE INDEX nutrition_label_versions_recipe_version_idx
ON nutrition_label_versions(recipe_version_id);

CREATE TRIGGER nutrition_label_drafts_recipe_version_guard_insert
BEFORE INSERT ON nutrition_label_drafts
BEGIN
  SELECT RAISE(ABORT, 'label recipe version does not belong to label recipe')
  WHERE NOT EXISTS (
    SELECT 1
    FROM nutrition_labels label
    JOIN recipe_versions version ON version.recipe_id = label.recipe_id
    WHERE label.id = NEW.label_id
      AND version.id = NEW.recipe_version_id
  );
END;

CREATE TRIGGER nutrition_label_drafts_recipe_version_guard_update
BEFORE UPDATE ON nutrition_label_drafts
BEGIN
  SELECT RAISE(ABORT, 'label recipe version does not belong to label recipe')
  WHERE NOT EXISTS (
    SELECT 1
    FROM nutrition_labels label
    JOIN recipe_versions version ON version.recipe_id = label.recipe_id
    WHERE label.id = NEW.label_id
      AND version.id = NEW.recipe_version_id
  );
END;

CREATE TRIGGER nutrition_label_versions_source_guard
BEFORE INSERT ON nutrition_label_versions
BEGIN
  SELECT RAISE(ABORT, 'label version source does not match its draft')
  WHERE NOT EXISTS (
    SELECT 1
    FROM nutrition_label_drafts draft
    JOIN nutrition_labels label ON label.id = draft.label_id
    JOIN recipe_versions recipe_version
      ON recipe_version.id = NEW.recipe_version_id
     AND recipe_version.recipe_id = label.recipe_id
    WHERE draft.id = NEW.source_draft_id
      AND draft.label_id = NEW.label_id
      AND draft.recipe_version_id = NEW.recipe_version_id
      AND draft.rule_pack_id = NEW.rule_pack_id
  );
END;

CREATE TRIGGER nutrition_label_versions_no_update
BEFORE UPDATE ON nutrition_label_versions
BEGIN
  SELECT RAISE(ABORT, 'nutrition label versions are immutable');
END;

CREATE TRIGGER nutrition_label_versions_no_delete
BEFORE DELETE ON nutrition_label_versions
BEGIN
  SELECT RAISE(ABORT, 'nutrition label versions are immutable');
END;
