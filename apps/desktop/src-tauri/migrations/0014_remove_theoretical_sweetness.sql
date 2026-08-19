DROP TRIGGER IF EXISTS recipe_versions_no_update;

DELETE FROM ingredient_nutrient_values
WHERE nutrient_definition_id = 'theoretical_sweetness';

DELETE FROM nutrient_definitions
WHERE id = 'theoretical_sweetness';

UPDATE recipe_drafts
SET calculation_json = json_remove(calculation_json, '$.sweetness')
WHERE calculation_json IS NOT NULL
  AND json_valid(calculation_json)
  AND json_type(calculation_json, '$.sweetness') IS NOT NULL;

UPDATE recipe_versions
SET snapshot_json = json_remove(snapshot_json, '$.calculation.sweetness')
WHERE json_valid(snapshot_json)
  AND json_type(snapshot_json, '$.calculation.sweetness') IS NOT NULL;

UPDATE agent_recipe_proposals
SET evaluation_json = json_remove(evaluation_json, '$.calculation.sweetness')
WHERE json_valid(evaluation_json)
  AND json_type(evaluation_json, '$.calculation.sweetness') IS NOT NULL;

CREATE TRIGGER recipe_versions_no_update
BEFORE UPDATE ON recipe_versions
BEGIN
  SELECT RAISE(ABORT, 'recipe versions are immutable');
END;
