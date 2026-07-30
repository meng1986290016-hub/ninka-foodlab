CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL CHECK (kind IN ('formula', 'semi_finished')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX recipes_active_code_unique
ON recipes(lower(code))
WHERE archived_at IS NULL AND code IS NOT NULL;

CREATE INDEX recipes_active_updated_idx
ON recipes(archived_at, updated_at DESC);

CREATE TABLE recipe_drafts (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL UNIQUE
    REFERENCES recipes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  based_on_version_id TEXT
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'agent')),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  calculation_json TEXT,
  calculation_issues_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL
    REFERENCES recipes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  source_draft_id TEXT NOT NULL
    REFERENCES recipe_drafts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  based_on_version_id TEXT
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  snapshot_schema_version INTEGER NOT NULL CHECK (snapshot_schema_version > 0),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (recipe_id, version_number)
);

CREATE INDEX recipe_versions_recipe_idx
ON recipe_versions(recipe_id, version_number DESC);

CREATE TABLE recipe_version_dependencies (
  version_id TEXT NOT NULL
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  referenced_version_id TEXT NOT NULL
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (version_id, referenced_version_id),
  UNIQUE (version_id, position),
  CHECK (version_id <> referenced_version_id)
);

CREATE INDEX recipe_version_dependencies_reference_idx
ON recipe_version_dependencies(referenced_version_id);

CREATE TRIGGER recipe_versions_no_update
BEFORE UPDATE ON recipe_versions
BEGIN
  SELECT RAISE(ABORT, 'recipe versions are immutable');
END;

CREATE TRIGGER recipe_versions_no_delete
BEFORE DELETE ON recipe_versions
BEGIN
  SELECT RAISE(ABORT, 'recipe versions are immutable');
END;

CREATE TRIGGER recipe_version_dependencies_no_update
BEFORE UPDATE ON recipe_version_dependencies
BEGIN
  SELECT RAISE(ABORT, 'recipe version dependencies are immutable');
END;

CREATE TRIGGER recipe_version_dependencies_no_delete
BEFORE DELETE ON recipe_version_dependencies
BEGIN
  SELECT RAISE(ABORT, 'recipe version dependencies are immutable');
END;
