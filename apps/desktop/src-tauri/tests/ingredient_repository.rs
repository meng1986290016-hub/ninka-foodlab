use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use std::time::{SystemTime, UNIX_EPOCH};

use food_rd_desktop::ingredients::{
    model::{
        IngredientVariantAllergens, IngredientVariantInput, MaterialGroupInput, VariantNutrition,
        VariantNutritionValue,
    },
    repository::IngredientRepository,
};
use serde_json::json;

struct Fixture {
    group_id: String,
    repo: IngredientRepository,
    supplier_id: String,
}

impl Fixture {
    fn new() -> Self {
        let clock_sequence = Arc::new(AtomicUsize::new(0));
        let id_sequence = Arc::new(AtomicUsize::new(0));
        let clock = {
            let sequence = Arc::clone(&clock_sequence);
            move || {
                let tick = sequence.fetch_add(1, Ordering::SeqCst);
                format!("2026-07-17T05:{tick:02}:00Z")
            }
        };
        let create_id = {
            let sequence = Arc::clone(&id_sequence);
            move || format!("test-id-{}", sequence.fetch_add(1, Ordering::SeqCst))
        };
        let mut repo = IngredientRepository::open_in_memory_with(clock, create_id).unwrap();
        let category = repo.create_category("乳制品").unwrap();
        let supplier = repo.create_supplier("供应商A", "").unwrap();
        let group = repo
            .create_material_group(MaterialGroupInput {
                name: "脱脂乳粉".into(),
                category_id: Some(category.id),
            })
            .unwrap();
        Self {
            group_id: group.id,
            repo,
            supplier_id: supplier.id,
        }
    }

    fn valid_input(&self) -> IngredientVariantInput {
        IngredientVariantInput {
            id: None,
            material_group_id: self.group_id.clone(),
            supplier_id: self.supplier_id.clone(),
            model_or_specification: "MD-300".into(),
            internal_code: None,
            current_price: Some("31.50".into()),
            price_unit: "kg".into(),
            density_g_per_ml: None,
            source: "供应商规格书".into(),
            research_notes: "溶解速度快".into(),
            nutrition: VariantNutrition {
                basis: "per_100g".into(),
                values: vec![
                    VariantNutritionValue {
                        nutrient_definition_id: "protein".into(),
                        value: Some("34.0".into()),
                    },
                    VariantNutritionValue {
                        nutrient_definition_id: "fat".into(),
                        value: Some("0".into()),
                    },
                ],
            },
            allergens: IngredientVariantAllergens::default(),
            duplicate_confirmed: false,
        }
    }
}

#[test]
fn migration_seeds_the_eight_builtin_nutrients() {
    let fixture = Fixture::new();
    let definitions = fixture.repo.list_nutrient_definitions().unwrap();
    assert_eq!(definitions.len(), 8);
    assert_eq!(definitions[0].id, "energy");
    assert_eq!(definitions[7].id, "sodium");
}

#[test]
fn variant_save_is_atomic_and_updates_time_only_after_commit() {
    let mut fixture = Fixture::new();
    let first = fixture.repo.save_variant(fixture.valid_input()).unwrap();
    let mut changed = fixture.valid_input();
    changed.id = Some(first.id.clone());
    changed.current_price = Some("99.00".into());
    changed.nutrition.values.push(VariantNutritionValue {
        nutrient_definition_id: "missing-nutrient".into(),
        value: Some("1".into()),
    });

    assert!(fixture.repo.save_variant(changed).is_err());

    let unchanged = fixture.repo.get_variant(&first.id).unwrap();
    assert_eq!(unchanged.updated_at, first.updated_at);
    assert_eq!(unchanged.current_price.as_deref(), Some("31.50"));
    assert_eq!(unchanged.nutrition.values, first.nutrition.values);
}

#[test]
fn unknown_and_confirmed_zero_round_trip_distinctly() {
    let mut fixture = Fixture::new();
    let mut input = fixture.valid_input();
    input.nutrition.values = vec![
        VariantNutritionValue {
            nutrient_definition_id: "protein".into(),
            value: None,
        },
        VariantNutritionValue {
            nutrient_definition_id: "fat".into(),
            value: Some("0".into()),
        },
    ];

    let saved = fixture.repo.save_variant(input).unwrap();
    let protein = saved
        .nutrition
        .values
        .iter()
        .find(|value| value.nutrient_definition_id == "protein")
        .unwrap();
    let fat = saved
        .nutrition
        .values
        .iter()
        .find(|value| value.nutrient_definition_id == "fat")
        .unwrap();
    assert_eq!(protein.value, None);
    assert_eq!(fat.value.as_deref(), Some("0"));
}

#[test]
fn active_references_are_protected_from_archiving() {
    let mut fixture = Fixture::new();
    let category_id = fixture
        .repo
        .list_categories()
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .id;
    let category_error = fixture.repo.archive_category(&category_id).unwrap_err();
    assert_eq!(category_error.code(), "reference_conflict");

    fixture.repo.save_variant(fixture.valid_input()).unwrap();
    let supplier_error = fixture
        .repo
        .archive_supplier(&fixture.supplier_id)
        .unwrap_err();
    assert_eq!(supplier_error.code(), "reference_conflict");
    let group_error = fixture
        .repo
        .archive_material_group(&fixture.group_id)
        .unwrap_err();
    assert_eq!(group_error.code(), "reference_conflict");
}

#[test]
fn duplicate_supplier_and_model_requires_explicit_confirmation() {
    let mut fixture = Fixture::new();
    fixture.repo.save_variant(fixture.valid_input()).unwrap();

    let duplicate_error = fixture
        .repo
        .save_variant(fixture.valid_input())
        .unwrap_err();
    assert_eq!(duplicate_error.code(), "duplicate_variant");

    let mut confirmed = fixture.valid_input();
    confirmed.duplicate_confirmed = true;
    assert!(fixture.repo.save_variant(confirmed).is_ok());
}

#[test]
fn invalid_decimals_are_rejected_before_writing() {
    let mut fixture = Fixture::new();
    let mut input = fixture.valid_input();
    input.current_price = Some("31元".into());

    let error = fixture.repo.save_variant(input).unwrap_err();
    assert_eq!(error.code(), "invalid_decimal");
    assert_eq!(error.field(), Some("currentPrice"));
    assert!(
        fixture.repo.list_material_groups("").unwrap()[0]
            .variants
            .is_empty()
    );
}

#[test]
fn copy_archive_and_reference_lifecycle_are_consistent() {
    let mut fixture = Fixture::new();
    let first = fixture.repo.save_variant(fixture.valid_input()).unwrap();
    let supplier_b = fixture.repo.create_supplier("供应商B", "").unwrap();
    let copied = fixture
        .repo
        .copy_variant(&first.id, &supplier_b.id)
        .unwrap();
    assert_eq!(copied.supplier_name, "供应商B");
    assert_eq!(copied.nutrition, first.nutrition);
    assert_eq!(copied.internal_code, None);

    fixture.repo.archive_variant(&first.id).unwrap();
    fixture.repo.archive_variant(&copied.id).unwrap();
    fixture.repo.archive_supplier(&fixture.supplier_id).unwrap();
    fixture.repo.archive_supplier(&supplier_b.id).unwrap();
    fixture
        .repo
        .archive_material_group(&fixture.group_id)
        .unwrap();
    let category_id = fixture.repo.list_categories().unwrap()[0].id.clone();
    fixture.repo.archive_category(&category_id).unwrap();
}

#[test]
fn search_includes_supplier_model_source_and_research_notes() {
    let mut fixture = Fixture::new();
    fixture.repo.save_variant(fixture.valid_input()).unwrap();

    assert_eq!(
        fixture.repo.list_material_groups("md-300").unwrap().len(),
        1
    );
    assert_eq!(
        fixture.repo.list_material_groups("供应商a").unwrap().len(),
        1
    );
    assert_eq!(
        fixture.repo.list_material_groups("溶解速度").unwrap().len(),
        1
    );
    assert!(
        fixture
            .repo
            .list_material_groups("不存在")
            .unwrap()
            .is_empty()
    );
}

#[test]
fn comparison_preserves_unknown_separately_from_confirmed_zero() {
    let mut fixture = Fixture::new();
    let mut first_input = fixture.valid_input();
    first_input.nutrition.values[0].value = None;
    let first = fixture.repo.save_variant(first_input).unwrap();
    let supplier_b = fixture.repo.create_supplier("供应商B", "").unwrap();
    let mut second_input = fixture.valid_input();
    second_input.supplier_id = supplier_b.id;
    second_input.model_or_specification = "MD-400".into();
    second_input.nutrition.values[0].value = Some("0".into());
    let second = fixture.repo.save_variant(second_input).unwrap();

    let comparison = fixture
        .repo
        .compare_variants(&fixture.group_id, &[first.id.clone(), second.id.clone()])
        .unwrap();
    let protein = comparison
        .rows
        .iter()
        .find(|row| row.key == "nutrient:protein")
        .unwrap();
    assert_eq!(protein.values[&first.id], None);
    assert_eq!(protein.values[&second.id].as_deref(), Some("0"));
}

#[test]
fn settings_drafts_and_database_status_round_trip_json() {
    let mut fixture = Fixture::new();
    fixture
        .repo
        .set_setting("appearance", &json!({ "theme": "light" }))
        .unwrap();
    assert_eq!(
        fixture.repo.get_setting("appearance").unwrap(),
        Some(json!({ "theme": "light" }))
    );

    let draft = fixture
        .repo
        .save_draft(
            "ingredient-variant-editor",
            "new:milk",
            2,
            &json!({ "currentPrice": "31.50" }),
        )
        .unwrap();
    assert_eq!(draft.payload_version, 2);
    assert_eq!(
        fixture
            .repo
            .get_draft("ingredient-variant-editor", "new:milk")
            .unwrap()
            .unwrap()
            .payload,
        json!({ "currentPrice": "31.50" })
    );
    fixture
        .repo
        .clear_draft("ingredient-variant-editor", "new:milk")
        .unwrap();
    assert!(
        fixture
            .repo
            .get_draft("ingredient-variant-editor", "new:milk")
            .unwrap()
            .is_none()
    );

    let status = fixture.repo.database_status().unwrap();
    assert_eq!(status.mode, "sqlite");
    assert_eq!(status.schema_version, 6);
    assert!(status.healthy);
}

#[test]
fn file_database_reopens_without_losing_committed_records() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "food-rd-persistence-{}-{suffix}.sqlite3",
        std::process::id()
    ));
    {
        let mut repository = IngredientRepository::open(&path).unwrap();
        repository.create_category("重启持久化分类").unwrap();
        repository
            .set_setting("restart-check", &json!({ "persisted": true }))
            .unwrap();
    }
    {
        let repository = IngredientRepository::open(&path).unwrap();
        assert_eq!(
            repository.list_categories().unwrap()[0].name,
            "重启持久化分类"
        );
        assert_eq!(
            repository.get_setting("restart-check").unwrap(),
            Some(json!({ "persisted": true }))
        );
    }
    std::fs::remove_file(path).unwrap();
}
