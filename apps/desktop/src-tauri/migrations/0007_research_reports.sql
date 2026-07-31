CREATE TABLE research_reports (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL
    REFERENCES recipe_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  nutrition_label_version_id TEXT NOT NULL
    REFERENCES nutrition_label_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  document_schema_version INTEGER NOT NULL CHECK (document_schema_version > 0),
  document_json TEXT NOT NULL,
  svg_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX research_reports_recipe_version_idx
ON research_reports(recipe_version_id, created_at DESC, id);

CREATE INDEX research_reports_nutrition_label_version_idx
ON research_reports(nutrition_label_version_id);

CREATE TRIGGER research_reports_source_guard
BEFORE INSERT ON research_reports
BEGIN
  SELECT RAISE(ABORT, 'research report sources do not match')
  WHERE NOT EXISTS (
    SELECT 1
    FROM recipe_versions recipe_version
    JOIN nutrition_label_versions label_version
      ON label_version.recipe_version_id = recipe_version.id
    WHERE recipe_version.id = NEW.recipe_version_id
      AND label_version.id = NEW.nutrition_label_version_id
  );
END;

CREATE TRIGGER research_reports_no_update
BEFORE UPDATE ON research_reports
BEGIN
  SELECT RAISE(ABORT, 'research reports are immutable');
END;

CREATE TRIGGER research_reports_no_delete
BEFORE DELETE ON research_reports
BEGIN
  SELECT RAISE(ABORT, 'research reports are immutable');
END;
