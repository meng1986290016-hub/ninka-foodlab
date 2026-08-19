DROP TRIGGER IF EXISTS recipe_versions_no_update;

UPDATE recipe_drafts
SET calculation_json = json_set(
  calculation_json,
  '$.nutrients',
  json(COALESCE((
    SELECT json_group_array(json(value))
    FROM json_each(recipe_drafts.calculation_json, '$.nutrients')
    WHERE COALESCE(json_extract(value, '$.category'), 'nutrition') <> 'research'
      AND json_extract(value, '$.nutrientDefinitionId') NOT IN (
        SELECT id FROM nutrient_definitions WHERE category = 'research'
      )
  ), '[]'))
)
WHERE calculation_json IS NOT NULL
  AND json_valid(calculation_json)
  AND json_type(calculation_json, '$.nutrients') = 'array';

UPDATE recipe_versions
SET snapshot_json = json_set(
  snapshot_json,
  '$.calculation.nutrients',
  json(COALESCE((
    SELECT json_group_array(json(value))
    FROM json_each(recipe_versions.snapshot_json, '$.calculation.nutrients')
    WHERE COALESCE(json_extract(value, '$.category'), 'nutrition') <> 'research'
      AND json_extract(value, '$.nutrientDefinitionId') NOT IN (
        SELECT id FROM nutrient_definitions WHERE category = 'research'
      )
  ), '[]')),
  '$.items',
  json(COALESCE((
    SELECT json_group_array(
      json(
        CASE
          WHEN json_extract(item.value, '$.kind') = 'ingredient' THEN
            json_set(
              item.value,
              '$.ingredient.nutrientsPer100g',
              json(COALESCE((
                SELECT json_group_object(entry.key, entry.value)
                FROM json_each(item.value, '$.ingredient.nutrientsPer100g') AS entry
                WHERE entry.key NOT IN (
                  SELECT id FROM nutrient_definitions WHERE category = 'research'
                )
              ), '{}')),
              '$.ingredient.nutrientUnits',
              json(COALESCE((
                SELECT json_group_object(entry.key, entry.value)
                FROM json_each(item.value, '$.ingredient.nutrientUnits') AS entry
                WHERE entry.key NOT IN (
                  SELECT id FROM nutrient_definitions WHERE category = 'research'
                )
              ), '{}'))
            )
          ELSE item.value
        END
      )
    )
    FROM json_each(recipe_versions.snapshot_json, '$.items') AS item
  ), '[]'))
)
WHERE json_valid(snapshot_json)
  AND (
    json_type(snapshot_json, '$.calculation.nutrients') = 'array'
    OR json_type(snapshot_json, '$.items') = 'array'
  );

UPDATE agent_recipe_proposals
SET payload_json = json_set(
      payload_json,
      '$.requirements',
      json(COALESCE((
        SELECT json_group_array(json(requirement.value))
        FROM json_each(agent_recipe_proposals.payload_json, '$.requirements') AS requirement
        WHERE json_extract(requirement.value, '$.nutrientDefinitionId') IS NULL
          OR json_extract(requirement.value, '$.nutrientDefinitionId') NOT IN (
            SELECT id FROM nutrient_definitions WHERE category = 'research'
          )
      ), '[]'))
    ),
    evaluation_json = json_set(
      evaluation_json,
      '$.requirementStatuses',
      json(COALESCE((
        SELECT json_group_array(json(status.value))
        FROM json_each(agent_recipe_proposals.evaluation_json, '$.requirementStatuses') AS status
        WHERE CAST(status.key AS INTEGER) IN (
          SELECT CAST(requirement.key AS INTEGER)
          FROM json_each(agent_recipe_proposals.payload_json, '$.requirements') AS requirement
          WHERE json_extract(requirement.value, '$.nutrientDefinitionId') IS NULL
            OR json_extract(requirement.value, '$.nutrientDefinitionId') NOT IN (
              SELECT id FROM nutrient_definitions WHERE category = 'research'
            )
        )
      ), '[]')),
      '$.calculation.nutrients',
      json(COALESCE((
        SELECT json_group_array(json(value))
        FROM json_each(agent_recipe_proposals.evaluation_json, '$.calculation.nutrients')
        WHERE COALESCE(json_extract(value, '$.category'), 'nutrition') <> 'research'
          AND json_extract(value, '$.nutrientDefinitionId') NOT IN (
            SELECT id FROM nutrient_definitions WHERE category = 'research'
          )
      ), '[]'))
    )
WHERE json_valid(payload_json)
  AND json_type(payload_json, '$.requirements') = 'array'
  AND json_valid(evaluation_json)
  AND json_type(evaluation_json, '$.requirementStatuses') = 'array'
  AND json_type(evaluation_json, '$.calculation.nutrients') = 'array';

DELETE FROM ingredient_nutrient_values
WHERE nutrient_definition_id IN (
  SELECT id FROM nutrient_definitions WHERE category = 'research'
);

DELETE FROM nutrient_definitions
WHERE category = 'research';

CREATE TRIGGER recipe_versions_no_update
BEFORE UPDATE ON recipe_versions
BEGIN
  SELECT RAISE(ABORT, 'recipe versions are immutable');
END;
