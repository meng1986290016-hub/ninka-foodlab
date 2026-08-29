use std::{
    collections::{BTreeMap, BTreeSet},
    str::FromStr,
};

use chrono::Utc;
use rust_decimal::Decimal;
use serde_json::{Value, json};

use crate::{
    agent_recipe::model::{AgentRecipeProposalItem, AgentRecipeProposalPayload},
    ingredients::{
        model::IngredientVariant,
        repository::{IngredientRepository, RepositoryError},
    },
};

pub fn normalize_and_evaluate(
    ingredients: &IngredientRepository,
    mut payload: AgentRecipeProposalPayload,
) -> Result<(AgentRecipeProposalPayload, Value), RepositoryError> {
    payload.recipe_code = payload.recipe_code.take().and_then(|code| {
        let code = code.trim();
        (!code.is_empty()).then(|| code.to_string())
    });
    validate_payload(&payload)?;
    for item in &mut payload.items {
        let AgentRecipeProposalItem::Ingredient {
            ingredient_variant_id,
            ingredient_updated_at,
            material_name,
            supplier_name,
            model_or_specification,
            ..
        } = item
        else {
            continue;
        };
        let variant = ingredients.get_variant(ingredient_variant_id)?;
        let canonical_material_name =
            ingredients.get_material_name_for_variant(ingredient_variant_id)?;
        if material_identity_key(material_name) != material_identity_key(&canonical_material_name) {
            return Err(domain(
                "提案原料名称与所选通用原料不一致；相似名称不能自动替换，请保留附件原名称并改为待补充原料需求",
            ));
        }
        *ingredient_updated_at = variant.updated_at.clone();
        *material_name = canonical_material_name;
        *supplier_name = variant.supplier_name.clone();
        *model_or_specification = variant.model_or_specification.clone();
    }
    let evaluation = evaluate(ingredients, &payload)?;
    Ok((payload, evaluation))
}

fn material_identity_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn evaluate(
    ingredients: &IngredientRepository,
    payload: &AgentRecipeProposalPayload,
) -> Result<Value, RepositoryError> {
    validate_payload(payload)?;
    let definitions = ingredients
        .list_nutrient_definitions()?
        .into_iter()
        .filter(|definition| definition.category == "nutrition")
        .collect::<Vec<_>>();
    let mut total_mass = Decimal::ZERO;
    let mut known_cost = Decimal::ZERO;
    let mut missing_cost_ids = Vec::new();
    let mut nutrient_totals = BTreeMap::<String, Decimal>::new();
    let mut nutrient_known_mass = BTreeMap::<String, Decimal>::new();
    let mut nutrient_tracked_mass = BTreeMap::<String, Decimal>::new();
    let mut nutrient_missing = BTreeMap::<String, Vec<String>>::new();
    let mut tracked_nutrient_ids = definitions
        .iter()
        .filter(|definition| definition.built_in && definition.category == "nutrition")
        .map(|definition| definition.id.clone())
        .collect::<BTreeSet<_>>();
    let mut stale_item_ids = Vec::new();
    let mut contains = Vec::<String>::new();
    let mut may_contain = Vec::<String>::new();
    let mut issues = Vec::<Value>::new();

    for item in &payload.items {
        let mass = mass_grams(item.amount(), item.unit())?;
        total_mass += mass;
        match item {
            AgentRecipeProposalItem::MaterialNeed { id, .. } => {
                missing_cost_ids.push(id.clone());
                for definition in definitions
                    .iter()
                    .filter(|definition| definition.built_in && definition.category == "nutrition")
                {
                    *nutrient_tracked_mass
                        .entry(definition.id.clone())
                        .or_default() += mass;
                    nutrient_missing
                        .entry(definition.id.clone())
                        .or_default()
                        .push(id.clone());
                }
            }
            AgentRecipeProposalItem::Ingredient {
                id,
                ingredient_variant_id,
                ingredient_updated_at,
                ..
            } => {
                let variant = ingredients.get_variant(ingredient_variant_id)?;
                if variant.archived_at.is_some() || variant.updated_at != *ingredient_updated_at {
                    stale_item_ids.push(id.clone());
                }
                let density = optional_positive(variant.density_g_per_ml.as_deref());
                let provided = variant
                    .nutrition
                    .values
                    .iter()
                    .map(|value| {
                        (
                            value.nutrient_definition_id.as_str(),
                            value.value.as_deref(),
                        )
                    })
                    .collect::<BTreeMap<_, _>>();
                for definition in definitions.iter().filter(|definition| {
                    (definition.built_in && definition.category == "nutrition")
                        || provided.contains_key(definition.id.as_str())
                }) {
                    tracked_nutrient_ids.insert(definition.id.clone());
                    *nutrient_tracked_mass
                        .entry(definition.id.clone())
                        .or_default() += mass;
                    let converted = provided
                        .get(definition.id.as_str())
                        .copied()
                        .flatten()
                        .and_then(|value| Decimal::from_str(value).ok())
                        .and_then(|value| {
                            if variant.nutrition.basis == "per_100ml" {
                                density.map(|density| value / density)
                            } else {
                                Some(value)
                            }
                        });
                    if let Some(value) = converted {
                        *nutrient_totals.entry(definition.id.clone()).or_default() +=
                            value * mass / Decimal::from(100);
                        *nutrient_known_mass
                            .entry(definition.id.clone())
                            .or_default() += mass;
                    } else {
                        nutrient_missing
                            .entry(definition.id.clone())
                            .or_default()
                            .push(id.clone());
                    }
                }
                match price_per_kg(&variant, density) {
                    Some(price) => known_cost += price * mass / Decimal::from(1000),
                    None => missing_cost_ids.push(id.clone()),
                }
                for allergen in &variant.allergens.contains {
                    if !contains.contains(allergen) {
                        contains.push(allergen.clone());
                    }
                }
                for allergen in &variant.allergens.may_contain {
                    if !contains.contains(allergen) && !may_contain.contains(allergen) {
                        may_contain.push(allergen.clone());
                    }
                }
                if variant.nutrition.basis == "per_100ml" && density.is_none() {
                    issues.push(json!({
                        "code": "missing_density", "severity": "warning",
                        "message": "原料按每100mL记录营养，但缺少密度", "field": "densityGPerMl", "itemId": id
                    }));
                }
            }
        }
    }

    let basis = payload
        .finished_mass_grams
        .as_deref()
        .map(parse_positive)
        .transpose()?
        .unwrap_or(total_mass);
    let nutrients = definitions.iter().filter(|definition| {
        tracked_nutrient_ids.contains(&definition.id)
    }).map(|definition| {
        let total = nutrient_totals.get(&definition.id).copied().unwrap_or_default();
        let known_mass = nutrient_known_mass.get(&definition.id).copied().unwrap_or_default();
        let tracked_mass = nutrient_tracked_mass.get(&definition.id).copied().unwrap_or_default();
        let missing = nutrient_missing.get(&definition.id).cloned().unwrap_or_default();
        let status = if known_mass.is_zero() { "unknown" } else if missing.is_empty() { "complete" } else { "partial" };
        json!({
            "nutrientDefinitionId": definition.id,
            "name": definition.name,
            "unit": definition.unit,
            "totalKnownAmount": decimal(total),
            "per100gKnownAmount": decimal(if basis.is_zero() { Decimal::ZERO } else { total * Decimal::from(100) / basis }),
            "status": status,
            "completenessRatio": decimal(if tracked_mass.is_zero() { Decimal::ZERO } else { known_mass / tracked_mass }),
            "missingItemIds": missing,
            "category": definition.category,
        })
    }).collect::<Vec<_>>();
    for id in &missing_cost_ids {
        issues.push(json!({
            "code": "missing_price", "severity": "warning",
            "message": "原料缺少价格，成本结果为部分估算", "field": "currentPrice", "itemId": id
        }));
    }
    let nutrient_map = nutrients
        .iter()
        .filter_map(|row| {
            Some((
                row.get("nutrientDefinitionId")?.as_str()?.to_string(),
                row.get("per100gKnownAmount")?.as_str()?.to_string(),
            ))
        })
        .collect::<BTreeMap<_, _>>();
    let requirement_statuses = payload.requirements.iter().map(|requirement| {
        let observed = requirement.nutrient_definition_id.as_ref().and_then(|id| nutrient_map.get(id)).cloned();
        let status = requirement_status(observed.as_deref(), requirement.minimum.as_deref(), requirement.maximum.as_deref());
        json!({ "name": requirement.name, "unit": requirement.unit, "observed": observed, "status": status })
    }).collect::<Vec<_>>();
    let built_in_ids = definitions
        .iter()
        .filter(|definition| definition.built_in)
        .map(|definition| definition.id.as_str())
        .collect::<BTreeSet<_>>();
    let completeness_values = nutrients
        .iter()
        .filter(|row| {
            row.get("nutrientDefinitionId")
                .and_then(Value::as_str)
                .is_some_and(|id| built_in_ids.contains(id))
        })
        .filter_map(|row| {
            row.get("completenessRatio")?
                .as_str()?
                .parse::<Decimal>()
                .ok()
        })
        .collect::<Vec<_>>();
    let completeness = if completeness_values.is_empty() {
        Decimal::ZERO
    } else {
        completeness_values.iter().sum::<Decimal>()
            / Decimal::from(completeness_values.len() as u64)
    };
    let yield_percent = payload.finished_mass_grams.as_ref().and_then(|_| {
        (!total_mass.is_zero()).then(|| decimal(basis * Decimal::from(100) / total_mass))
    });
    let calculation = json!({
        "inputMassGrams": decimal(total_mass),
        "basisMassGrams": decimal(basis),
        "basis": if payload.finished_mass_grams.is_some() { "finished_mass" } else { "input_mass" },
        "yieldPercent": yield_percent,
        "nutrients": nutrients,
        "cost": {
            "rawMaterialTotal": decimal(known_cost), "packagingTotal": "0", "additionalTotal": "0",
            "batchTotal": decimal(known_cost),
            "perKg": decimal(if basis.is_zero() { Decimal::ZERO } else { known_cost * Decimal::from(1000) / basis }),
            "per100g": decimal(if basis.is_zero() { Decimal::ZERO } else { known_cost * Decimal::from(100) / basis }),
            "perServing": null, "perPackage": null,
            "status": if missing_cost_ids.is_empty() { "complete" } else { "partial" },
            "missingItemIds": missing_cost_ids, "breakdown": []
        },
        "targets": [],
        "allergens": { "contains": contains, "mayContain": may_contain, "sourceItemIds": {} },
        "completeness": {
            "percent": (completeness * Decimal::from(100)).round().to_string().parse::<i64>().unwrap_or(0),
            "missingFields": issues.iter().filter_map(|issue| issue.get("field").and_then(Value::as_str)).map(str::to_owned).collect::<Vec<_>>()
        },
        "calculatedAt": Utc::now().to_rfc3339()
    });
    Ok(json!({
        "calculation": calculation,
        "requirementStatuses": requirement_statuses,
        "staleItemIds": stale_item_ids,
        "issues": issues
    }))
}

fn validate_payload(payload: &AgentRecipeProposalPayload) -> Result<(), RepositoryError> {
    if payload.product_name.trim().is_empty() {
        return Err(domain("请填写产品名称"));
    }
    if let Some(value) = payload.finished_mass_grams.as_deref() {
        parse_positive(value)?;
    }
    if payload.items.is_empty() {
        return Err(domain("配方提案至少需要一项原料"));
    }
    let mut ids = std::collections::HashSet::new();
    for item in &payload.items {
        if !ids.insert(item.id()) {
            return Err(domain("配方提案存在重复行"));
        }
        if item.position() < 0 {
            return Err(domain("配方提案顺序无效"));
        }
        mass_grams(item.amount(), item.unit())?;
    }
    Ok(())
}

fn mass_grams(value: &str, unit: &str) -> Result<Decimal, RepositoryError> {
    let value = parse_non_negative(value)?;
    match unit {
        "g" => Ok(value),
        "kg" => Ok(value * Decimal::from(1000)),
        _ => Err(domain("Agent 配方提案第一版只支持 g/kg")),
    }
}

fn parse_positive(value: &str) -> Result<Decimal, RepositoryError> {
    let value = Decimal::from_str(value).map_err(|_| domain("数值格式无效"))?;
    if value <= Decimal::ZERO {
        Err(domain("数值必须大于零"))
    } else {
        Ok(value)
    }
}

fn parse_non_negative(value: &str) -> Result<Decimal, RepositoryError> {
    let value = Decimal::from_str(value).map_err(|_| domain("数值格式无效"))?;
    if value < Decimal::ZERO {
        Err(domain("数值不能小于零"))
    } else {
        Ok(value)
    }
}

fn optional_positive(value: Option<&str>) -> Option<Decimal> {
    value
        .and_then(|v| Decimal::from_str(v).ok())
        .filter(|v| *v > Decimal::ZERO)
}

fn price_per_kg(variant: &IngredientVariant, density: Option<Decimal>) -> Option<Decimal> {
    let price = variant
        .current_price
        .as_deref()
        .and_then(|value| Decimal::from_str(value).ok())?;
    match variant.price_unit.as_str() {
        "kg" => Some(price),
        "g" => Some(price * Decimal::from(1000)),
        "L" => density.map(|density| price / density),
        "mL" => density.map(|density| price * Decimal::from(1000) / density),
        _ => None,
    }
}

fn requirement_status(
    observed: Option<&str>,
    minimum: Option<&str>,
    maximum: Option<&str>,
) -> &'static str {
    let Some(observed) = observed.and_then(|value| Decimal::from_str(value).ok()) else {
        return "unknown";
    };
    if minimum
        .and_then(|value| Decimal::from_str(value).ok())
        .is_some_and(|minimum| observed < minimum)
    {
        return "below";
    }
    if maximum
        .and_then(|value| Decimal::from_str(value).ok())
        .is_some_and(|maximum| observed > maximum)
    {
        return "above";
    }
    "met"
}

fn decimal(value: Decimal) -> String {
    value.normalize().to_string()
}
fn domain(message: &str) -> RepositoryError {
    RepositoryError::domain("invalid_input", message)
}
