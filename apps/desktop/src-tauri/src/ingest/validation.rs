use std::collections::HashSet;

use super::model::{
    ImportIssue, ImportIssueCode, ImportIssueSeverity, ReviewedIngredientImportDraft,
};

pub fn normalize_review(review: &mut ReviewedIngredientImportDraft) {
    review.material_group_id = nullable_text(review.material_group_id.take());
    review.material_name = review.material_name.trim().to_string();
    review.category_id = nullable_text(review.category_id.take());
    review.category_name = nullable_text(review.category_name.take());
    review.supplier_id = nullable_text(review.supplier_id.take());
    review.supplier_name = review.supplier_name.trim().to_string();
    review.model_or_specification = review.model_or_specification.trim().to_string();
    review.current_price = nullable_text(review.current_price.take());
    review.price_unit = nullable_text(review.price_unit.take());
    review.density_g_per_ml = nullable_text(review.density_g_per_ml.take());
    review.nutrition_basis = normalized_nutrition_basis(review.nutrition_basis.take());
    review.source = review.source.trim().to_string();
    review.research_notes = review.research_notes.trim().to_string();

    for nutrient in &mut review.nutrients {
        nutrient.definition_id = nullable_text(nutrient.definition_id.take());
        nutrient.name = nutrient.name.trim().to_string();
        nutrient.unit = nutrient.unit.trim().to_string();
        nutrient.value = nullable_text(nutrient.value.take());
        nutrient.category =
            nullable_text(nutrient.category.take()).map(|category| category.to_lowercase());
    }

    if let Some(sweetness) = &mut review.sweetness {
        sweetness.content = nullable_text(sweetness.content.take());
        sweetness.relative_factor = nullable_text(sweetness.relative_factor.take());
    }

    review.contains_allergens = normalized_unique(&review.contains_allergens);
    review.may_contain_allergens = normalized_unique(&review.may_contain_allergens);
}

pub fn validate_review(review: &ReviewedIngredientImportDraft) -> Vec<ImportIssue> {
    let mut review = review.clone();
    normalize_review(&mut review);

    let mut issues = Vec::new();
    required(
        &review.material_name,
        "materialName",
        "请填写通用原料名称",
        &mut issues,
    );
    required(
        &review.supplier_name,
        "supplierName",
        "请填写供应商名称",
        &mut issues,
    );

    if !matches!(
        review.nutrition_basis.as_deref(),
        Some("per_100g" | "per_100ml")
    ) {
        error(
            ImportIssueCode::InvalidBasis,
            "nutritionBasis",
            "请选择每100g或每100mL",
            &mut issues,
        );
    }

    match review.price_unit.as_deref() {
        None if review.current_price.is_some() => error(
            ImportIssueCode::MissingRequired,
            "priceUnit",
            "填写价格后必须选择价格单位",
            &mut issues,
        ),
        Some(unit) if !matches!(unit, "kg" | "g" | "L" | "mL") => error(
            ImportIssueCode::InvalidUnit,
            "priceUnit",
            "价格单位必须为 kg、g、L 或 mL",
            &mut issues,
        ),
        _ => {}
    }

    for (field, value) in [
        ("currentPrice", review.current_price.as_deref()),
        ("densityGPerMl", review.density_g_per_ml.as_deref()),
    ] {
        if value.is_some_and(|item| !is_unsigned_decimal(item)) {
            error(
                ImportIssueCode::InvalidDecimal,
                field,
                "请输入非负十进制数",
                &mut issues,
            );
        }
    }

    for (index, nutrient) in review.nutrients.iter().enumerate() {
        if nutrient
            .value
            .as_deref()
            .is_some_and(|item| !is_unsigned_decimal(item))
        {
            error(
                ImportIssueCode::InvalidDecimal,
                &format!("nutrients.{index}.value"),
                "营养值格式无效",
                &mut issues,
            );
        }
        if nutrient.definition_id.is_none()
            && !matches!(nutrient.category.as_deref(), Some("nutrition" | "research"))
        {
            error(
                ImportIssueCode::MissingRequired,
                &format!("nutrients.{index}.category"),
                "请选择自定义含量项分类",
                &mut issues,
            );
        }
    }

    if let Some(sweetness) = &review.sweetness {
        if !matches!(sweetness.basis.as_str(), "w_w_percent" | "w_v_per_100ml") {
            error(
                ImportIssueCode::InvalidBasis,
                "sweetness.basis",
                "甜度含量基准必须为 w/w 或 w/v",
                &mut issues,
            );
        }
        for (field, value) in [
            ("sweetness.content", sweetness.content.as_deref()),
            (
                "sweetness.relativeFactor",
                sweetness.relative_factor.as_deref(),
            ),
        ] {
            if value.is_some_and(|item| !is_unsigned_decimal(item)) {
                error(
                    ImportIssueCode::InvalidDecimal,
                    field,
                    "请输入非负十进制数",
                    &mut issues,
                );
            }
        }
    }

    let contains = review
        .contains_allergens
        .iter()
        .map(|name| name.to_lowercase())
        .collect::<HashSet<_>>();
    for allergen in &review.may_contain_allergens {
        if contains.contains(&allergen.to_lowercase()) {
            error(
                ImportIssueCode::SourceConflict,
                "mayContainAllergens",
                &format!("“{allergen}”不能同时标记为含有和可能含有"),
                &mut issues,
            );
        }
    }

    issues
}

fn nullable_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn normalized_nutrition_basis(value: Option<String>) -> Option<String> {
    nullable_text(value).map(|basis| {
        let compact = basis
            .chars()
            .filter(|character| !matches!(character, '_' | '-' | ' '))
            .collect::<String>()
            .to_lowercase();
        match compact.as_str() {
            "per100g" | "100g" | "每100g" | "每100克" => "per_100g".into(),
            "per100ml" | "100ml" | "每100ml" | "每100毫升" => "per_100ml".into(),
            _ => basis,
        }
    })
}

fn normalized_unique(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .filter_map(|value| {
            let value = value.trim();
            if value.is_empty() || !seen.insert(value.to_lowercase()) {
                None
            } else {
                Some(value.to_string())
            }
        })
        .collect()
}

fn required(value: &str, field: &str, message: &str, issues: &mut Vec<ImportIssue>) {
    if value.is_empty() {
        error(ImportIssueCode::MissingRequired, field, message, issues);
    }
}

fn error(code: ImportIssueCode, field: &str, message: &str, issues: &mut Vec<ImportIssue>) {
    issues.push(ImportIssue {
        code,
        severity: ImportIssueSeverity::Error,
        message: message.into(),
        field_path: Some(field.into()),
        source_name: None,
        row: None,
        column: None,
    });
}

fn is_unsigned_decimal(value: &str) -> bool {
    let mut parts = value.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if parts.next().is_some() || integer.is_empty() || !integer.chars().all(|c| c.is_ascii_digit())
    {
        return false;
    }
    if integer.len() > 1 && integer.starts_with('0') {
        return false;
    }
    fraction.is_none_or(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}
