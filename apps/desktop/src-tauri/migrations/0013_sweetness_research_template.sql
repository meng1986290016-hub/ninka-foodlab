UPDATE nutrient_definitions
SET name = name || '（旧模板 ' || id || '）'
WHERE name = '理论甜度（蔗糖=1）'
  AND id <> 'theoretical_sweetness';

INSERT INTO nutrient_definitions
  (id, code, name, unit, built_in, sort_order, category, archived_at)
VALUES
  ('theoretical_sweetness', 'theoretical_sweetness', '理论甜度（蔗糖=1）', '倍', 1, 1000, 'research', NULL);

INSERT INTO ingredient_nutrient_values
  (ingredient_variant_id, nutrient_definition_id, value)
SELECT
  sweetness.ingredient_variant_id,
  'theoretical_sweetness',
  CASE
    WHEN sweetness.content IS NULL OR sweetness.relative_factor IS NULL THEN NULL
    WHEN sweetness.basis = 'w_w_percent' THEN
      CAST(
        CAST(sweetness.content AS REAL) * CAST(sweetness.relative_factor AS REAL) / 100.0
        AS TEXT
      )
    WHEN sweetness.basis = 'w_v_per_100ml'
      AND variants.density_g_per_ml IS NOT NULL
      AND CAST(variants.density_g_per_ml AS REAL) > 0 THEN
      CAST(
        CAST(sweetness.content AS REAL) * CAST(sweetness.relative_factor AS REAL)
          / CAST(variants.density_g_per_ml AS REAL) / 100.0
        AS TEXT
      )
    ELSE NULL
  END
FROM ingredient_variant_sweetness sweetness
JOIN ingredient_variants variants ON variants.id = sweetness.ingredient_variant_id;

DROP TABLE ingredient_variant_sweetness;
