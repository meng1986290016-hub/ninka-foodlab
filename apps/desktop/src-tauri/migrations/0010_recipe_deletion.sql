DROP TRIGGER recipe_versions_no_delete;
DROP TRIGGER recipe_version_dependencies_no_delete;

CREATE TABLE recipe_deletion_authorizations (
  scope TEXT PRIMARY KEY CHECK (scope = 'repository')
);

CREATE TRIGGER recipe_versions_no_delete
BEFORE DELETE ON recipe_versions
WHEN NOT EXISTS (
  SELECT 1 FROM recipe_deletion_authorizations WHERE scope = 'repository'
)
BEGIN
  SELECT RAISE(ABORT, 'recipe versions are immutable');
END;

CREATE TRIGGER recipe_version_dependencies_no_delete
BEFORE DELETE ON recipe_version_dependencies
WHEN NOT EXISTS (
  SELECT 1 FROM recipe_deletion_authorizations WHERE scope = 'repository'
)
BEGIN
  SELECT RAISE(ABORT, 'recipe version dependencies are immutable');
END;

CREATE TABLE recipe_version_sequences (
  recipe_id TEXT PRIMARY KEY
    REFERENCES recipes(id) ON UPDATE CASCADE ON DELETE CASCADE,
  last_version_number INTEGER NOT NULL CHECK (last_version_number >= 0)
);

INSERT INTO recipe_version_sequences (recipe_id, last_version_number)
SELECT recipe.id, COALESCE(MAX(version.version_number), 0)
FROM recipes recipe
LEFT JOIN recipe_versions version ON version.recipe_id = recipe.id
GROUP BY recipe.id;
