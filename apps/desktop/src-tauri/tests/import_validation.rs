use food_rd_desktop::ingest::{
    model::{ImportIssueCode, ImportedNutrientValue, ReviewedIngredientImportDraft},
    validation::{normalize_review, validate_review},
};

fn nutrient(name: &str, unit: &str, value: Option<&str>) -> ImportedNutrientValue {
    ImportedNutrientValue {
        definition_id: None,
        name: name.into(),
        unit: unit.into(),
        value: value.map(str::to_string),
        category: Some("nutrition".into()),
    }
}

fn valid_review() -> ReviewedIngredientImportDraft {
    ReviewedIngredientImportDraft {
        material_group_id: None,
        material_name: "脱脂乳粉".into(),
        category_id: None,
        category_name: Some("乳制品".into()),
        supplier_id: None,
        supplier_name: "供应商 A".into(),
        model_or_specification: "MD-300".into(),
        current_price: Some("31.50".into()),
        price_unit: Some("kg".into()),
        density_g_per_ml: None,
        nutrition_basis: Some("per_100g".into()),
        nutrients: vec![nutrient("蛋白质", "g", Some("34.0"))],
        contains_allergens: vec!["乳及乳制品".into()],
        may_contain_allergens: Vec::new(),
        source: "供应商规格书".into(),
        research_notes: String::new(),
        duplicate_confirmed: false,
    }
}

#[test]
fn validation_preserves_unknown_and_confirmed_zero_in_camel_case_json() {
    let mut review = valid_review();
    review.nutrients = vec![
        nutrient("蛋白质", "g", None),
        nutrient("脂肪", "g", Some("0")),
    ];

    let issues = validate_review(&review);

    assert!(
        !issues
            .iter()
            .any(|issue| issue.field_path.as_deref() == Some("nutrients.1.value"))
    );
    let json = serde_json::to_value(review).unwrap();
    assert_eq!(json["nutritionBasis"], "per_100g");
    assert_eq!(json["nutrients"][0]["value"], serde_json::Value::Null);
    assert_eq!(json["nutrients"][1]["value"], "0");
}

#[test]
fn validation_requires_explicit_basis_and_price_unit() {
    let mut review = valid_review();
    review.nutrition_basis = None;
    review.current_price = Some("31.50".into());
    review.price_unit = None;

    let fields = validate_review(&review)
        .into_iter()
        .filter_map(|issue| issue.field_path)
        .collect::<Vec<_>>();

    assert!(fields.contains(&"nutritionBasis".to_string()));
    assert!(fields.contains(&"priceUnit".to_string()));
}

#[test]
fn normalization_trims_text_and_deduplicates_allergens_case_insensitively() {
    let mut review = valid_review();
    review.material_name = "  脱脂乳粉  ".into();
    review.category_name = Some(" 乳制品 ".into());
    review.current_price = Some(" 31.50 ".into());
    review.contains_allergens = vec![
        "  Milk ".into(),
        "milk".into(),
        "乳及乳制品".into(),
        "乳及乳制品 ".into(),
    ];

    normalize_review(&mut review);

    assert_eq!(review.material_name, "脱脂乳粉");
    assert_eq!(review.category_name.as_deref(), Some("乳制品"));
    assert_eq!(review.current_price.as_deref(), Some("31.50"));
    assert_eq!(review.contains_allergens, ["Milk", "乳及乳制品"]);
}

#[test]
fn normalization_accepts_common_agent_nutrition_basis_aliases() {
    for (input, expected) in [
        ("per100g", "per_100g"),
        ("per-100-g", "per_100g"),
        ("每100克", "per_100g"),
        ("per100ml", "per_100ml"),
        ("每100毫升", "per_100ml"),
    ] {
        let mut review = valid_review();
        review.nutrition_basis = Some(input.into());

        normalize_review(&mut review);

        assert_eq!(review.nutrition_basis.as_deref(), Some(expected));
        assert!(validate_review(&review).is_empty());
    }
}

#[test]
fn validation_rejects_cross_list_allergen_conflicts() {
    let mut review = valid_review();
    review.contains_allergens = vec!["Milk".into()];
    review.may_contain_allergens = vec![" milk ".into()];

    let issues = validate_review(&review);

    assert!(issues.iter().any(|issue| {
        issue.code == ImportIssueCode::SourceConflict
            && issue.field_path.as_deref() == Some("mayContainAllergens")
    }));
}

#[test]
fn validation_rejects_blank_names_invalid_units_and_invalid_decimals() {
    let mut review = valid_review();
    review.material_name = "   ".into();
    review.supplier_name = "\n".into();
    review.price_unit = Some("斤".into());
    review.current_price = Some("031.5".into());
    review.density_g_per_ml = Some("-1".into());
    review.nutrients[0].value = Some("34g".into());

    let issues = validate_review(&review);
    let fields = issues
        .iter()
        .filter_map(|issue| issue.field_path.as_deref())
        .collect::<Vec<_>>();

    assert!(fields.contains(&"materialName"));
    assert!(fields.contains(&"supplierName"));
    assert!(fields.contains(&"priceUnit"));
    assert!(fields.contains(&"currentPrice"));
    assert!(fields.contains(&"densityGPerMl"));
    assert!(fields.contains(&"nutrients.0.value"));
}
