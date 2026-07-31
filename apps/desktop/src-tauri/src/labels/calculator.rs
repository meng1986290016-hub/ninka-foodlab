use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};

use rust_decimal::{Decimal, RoundingStrategy};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalculationInput {
    rule_pack_id: String,
    basis: Basis,
    source_values: Vec<SourceValue>,
    optional_nutrient_codes: Vec<String>,
    rounding_mode: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Basis {
    kind: String,
    quantity: String,
    unit: String,
    serving_description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceValue {
    nutrient_code: String,
    value: Option<String>,
    unit: String,
    source_kind: String,
    source_reference: Option<String>,
    completeness: Option<String>,
}

#[derive(Clone, Copy)]
struct NutrientRule {
    code: &'static str,
    name: &'static str,
    unit: &'static str,
    nrv: Option<&'static str>,
    interval: &'static str,
    zero_threshold: &'static str,
}

struct RulePack {
    id: &'static str,
    revision: &'static str,
    standard_code: &'static str,
    published_on: &'static str,
    effective_from: &'static str,
    official_source_url: &'static str,
    mandatory_codes: &'static [&'static str],
    required_notice: Option<&'static str>,
}

const RULES: [NutrientRule; 8] = [
    NutrientRule {
        code: "energy",
        name: "能量",
        unit: "kJ",
        nrv: Some("8400"),
        interval: "1",
        zero_threshold: "17",
    },
    NutrientRule {
        code: "protein",
        name: "蛋白质",
        unit: "g",
        nrv: Some("60"),
        interval: "0.1",
        zero_threshold: "0.5",
    },
    NutrientRule {
        code: "fat",
        name: "脂肪",
        unit: "g",
        nrv: Some("60"),
        interval: "0.1",
        zero_threshold: "0.5",
    },
    NutrientRule {
        code: "saturated_fat",
        name: "饱和脂肪",
        unit: "g",
        nrv: Some("20"),
        interval: "0.1",
        zero_threshold: "0.1",
    },
    NutrientRule {
        code: "carbohydrate",
        name: "碳水化合物",
        unit: "g",
        nrv: Some("300"),
        interval: "0.1",
        zero_threshold: "0.5",
    },
    NutrientRule {
        code: "sugars",
        name: "糖",
        unit: "g",
        nrv: None,
        interval: "0.1",
        zero_threshold: "0.5",
    },
    NutrientRule {
        code: "dietary_fiber",
        name: "膳食纤维",
        unit: "g",
        nrv: Some("25"),
        interval: "0.1",
        zero_threshold: "0.5",
    },
    NutrientRule {
        code: "sodium",
        name: "钠",
        unit: "mg",
        nrv: Some("2000"),
        interval: "1",
        zero_threshold: "5",
    },
];

const GB_28050_2011_MANDATORY: &[&str] = &["energy", "protein", "fat", "carbohydrate", "sodium"];
const GB_28050_2025_MANDATORY: &[&str] = &[
    "energy",
    "protein",
    "fat",
    "saturated_fat",
    "carbohydrate",
    "sugars",
    "sodium",
];

struct ParsedSource {
    source: SourceValue,
    value: Option<Decimal>,
}

pub fn calculate(input: &Value) -> Result<Value, String> {
    let input: CalculationInput =
        serde_json::from_value(input.clone()).map_err(|_| "营养标签计算输入无效".to_string())?;
    let pack = rule_pack(&input.rule_pack_id)?;
    let rounding = rounding_strategy(&input.rounding_mode)?;
    let mut issues = Vec::new();
    let normalization_factor = basis_normalization_factor(&input.basis, &mut issues);
    let rule_by_code = RULES
        .iter()
        .map(|rule| (rule.code, *rule))
        .collect::<HashMap<_, _>>();
    let sources = collect_sources(input.source_values, &mut issues);
    let mut optional_codes = Vec::new();
    let mut optional_seen = HashSet::new();
    for code in input.optional_nutrient_codes {
        if !optional_seen.insert(code.clone()) {
            continue;
        }
        if !rule_by_code.contains_key(code.as_str()) {
            issues.push(issue(
                "unsupported_nutrient",
                "error",
                Some(&code),
                format!("规则包 {} 不支持营养项目 {code}", pack.standard_code),
            ));
            continue;
        }
        if !pack.mandatory_codes.contains(&code.as_str()) {
            optional_codes.push(code);
        }
    }
    let selected_codes = pack
        .mandatory_codes
        .iter()
        .map(|value| (*value).to_string())
        .chain(optional_codes.iter().cloned())
        .collect::<Vec<_>>();
    let mut parsed = HashMap::new();
    for code in &selected_codes {
        if code == "energy" {
            continue;
        }
        let Some(rule) = rule_by_code.get(code.as_str()) else {
            continue;
        };
        parsed.insert(
            code.clone(),
            parse_source(
                *rule,
                sources.get(code).cloned(),
                pack.mandatory_codes.contains(&code.as_str()),
                &mut issues,
            ),
        );
    }

    let mut rows = HashMap::new();
    if let Some(rule) = rule_by_code.get("energy") {
        rows.insert(
            "energy".to_string(),
            calculate_energy_row(
                *rule,
                &parsed,
                optional_codes.iter().any(|code| code == "dietary_fiber"),
                normalization_factor,
                rounding,
                &mut issues,
            ),
        );
    }
    for code in &selected_codes {
        if code == "energy" {
            continue;
        }
        let (Some(rule), Some(source)) = (rule_by_code.get(code.as_str()), parsed.get(code)) else {
            continue;
        };
        rows.insert(
            code.clone(),
            calculate_row(*rule, source, normalization_factor, rounding),
        );
    }
    let ordered_rows = selected_codes
        .iter()
        .filter_map(|code| rows.remove(code))
        .collect::<Vec<_>>();
    let publishable = !issues
        .iter()
        .any(|value| value.get("severity").and_then(Value::as_str) == Some("error"));

    Ok(json!({
        "rulePack": rule_pack_reference(pack),
        "basis": basis_value(&input.basis),
        "roundingMode": input.rounding_mode,
        "rows": ordered_rows,
        "issues": issues,
        "publishable": publishable,
        "requiredNotice": pack.required_notice,
    }))
}

fn rule_pack(id: &str) -> Result<&'static RulePack, String> {
    static RULE_PACKS: [RulePack; 2] = [
        RulePack {
            id: "gb-28050-2011",
            revision: "2011.1",
            standard_code: "GB 28050-2011",
            published_on: "2011-10-12",
            effective_from: "2013-01-01",
            official_source_url: "https://www.nhc.gov.cn/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml",
            mandatory_codes: GB_28050_2011_MANDATORY,
            required_notice: None,
        },
        RulePack {
            id: "gb-28050-2025",
            revision: "2025.1",
            standard_code: "GB 28050-2025",
            published_on: "2025-03-27",
            effective_from: "2027-03-16",
            official_source_url: "https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml",
            mandatory_codes: GB_28050_2025_MANDATORY,
            required_notice: Some("儿童青少年应避免过量摄入盐油糖"),
        },
    ];
    RULE_PACKS
        .iter()
        .find(|pack| pack.id == id)
        .ok_or_else(|| format!("未知营养标签规则包：{id}"))
}

fn rule_pack_reference(pack: &RulePack) -> Value {
    json!({
        "id": pack.id,
        "revision": pack.revision,
        "standardCode": pack.standard_code,
        "publishedOn": pack.published_on,
        "effectiveFrom": pack.effective_from,
        "officialSourceUrl": pack.official_source_url,
    })
}

fn basis_value(basis: &Basis) -> Value {
    let mut value = json!({
        "kind": basis.kind,
        "quantity": basis.quantity,
        "unit": basis.unit,
    });
    if let Some(description) = basis.serving_description.as_ref() {
        value["servingDescription"] = Value::String(description.clone());
    }
    value
}

fn rounding_strategy(mode: &str) -> Result<RoundingStrategy, String> {
    match mode {
        "half_up" => Ok(RoundingStrategy::MidpointAwayFromZero),
        "half_even" => Ok(RoundingStrategy::MidpointNearestEven),
        _ => Err("营养标签修约方式无效".into()),
    }
}

fn collect_sources(
    values: Vec<SourceValue>,
    issues: &mut Vec<Value>,
) -> HashMap<String, SourceValue> {
    let mut sources = HashMap::new();
    let mut duplicates = HashSet::new();
    for source in values {
        if sources.contains_key(&source.nutrient_code) {
            if duplicates.insert(source.nutrient_code.clone()) {
                issues.push(issue(
                    "duplicate_nutrient",
                    "error",
                    Some(&source.nutrient_code),
                    format!("营养项目 {} 只能提供一个最终来源值", source.nutrient_code),
                ));
            }
            continue;
        }
        sources.insert(source.nutrient_code.clone(), source);
    }
    sources
}

fn parse_source(
    rule: NutrientRule,
    source: Option<SourceValue>,
    required: bool,
    issues: &mut Vec<Value>,
) -> ParsedSource {
    let source = source.unwrap_or_else(|| SourceValue {
        nutrient_code: rule.code.to_string(),
        value: None,
        unit: rule.unit.to_string(),
        source_kind: "recipe_estimate".into(),
        source_reference: None,
        completeness: Some("unknown".into()),
    });
    if !matches!(
        source.source_kind.as_str(),
        "recipe_estimate" | "lab_result" | "manual_confirmation"
    ) {
        issues.push(issue(
            "invalid_value",
            "error",
            Some(rule.code),
            format!("{}的数据来源类型无效", rule.name),
        ));
        return ParsedSource {
            source,
            value: None,
        };
    }
    if source.unit != rule.unit {
        issues.push(issue(
            "unit_mismatch",
            "error",
            Some(rule.code),
            format!(
                "{}必须使用 {}，当前为 {}",
                rule.name, rule.unit, source.unit
            ),
        ));
        return ParsedSource {
            source,
            value: None,
        };
    }
    let Some(raw) = source.value.as_deref() else {
        if required {
            issues.push(issue(
                "required_nutrient_unknown",
                "error",
                Some(rule.code),
                format!("{}缺少可用于正式标签的数据", rule.name),
            ));
        }
        return ParsedSource {
            source,
            value: None,
        };
    };
    let Ok(value) = Decimal::from_str(raw) else {
        issues.push(issue(
            "invalid_value",
            "error",
            Some(rule.code),
            format!("{}必须是大于等于 0 的有效数字", rule.name),
        ));
        return ParsedSource {
            source,
            value: None,
        };
    };
    if value.is_sign_negative() {
        issues.push(issue(
            "invalid_value",
            "error",
            Some(rule.code),
            format!("{}必须是大于等于 0 的有效数字", rule.name),
        ));
        return ParsedSource {
            source,
            value: None,
        };
    }
    if matches!(source.completeness.as_deref(), Some("partial" | "unknown")) {
        issues.push(issue(
            "incomplete_source",
            if required { "error" } else { "warning" },
            Some(rule.code),
            format!("{}的数据来源不完整", rule.name),
        ));
    }
    ParsedSource {
        source,
        value: Some(value),
    }
}

fn calculate_energy_row(
    rule: NutrientRule,
    parsed: &HashMap<String, ParsedSource>,
    include_fiber: bool,
    normalization_factor: Option<Decimal>,
    rounding: RoundingStrategy,
    issues: &mut Vec<Value>,
) -> Value {
    let mut component_codes = vec!["protein", "fat", "carbohydrate"];
    if include_fiber {
        component_codes.push("dietary_fiber");
    }
    let missing = component_codes
        .iter()
        .filter(|code| parsed.get(**code).and_then(|source| source.value).is_none())
        .copied()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        issues.push(issue(
            "required_nutrient_unknown",
            "error",
            Some("energy"),
            format!("能量缺少计算所需项目：{}", missing.join("、")),
        ));
        return json!({
            "nutrientCode": rule.code,
            "name": rule.name,
            "unit": rule.unit,
            "rawValue": null,
            "declaredValue": null,
            "nrvPercent": null,
            "sourceKind": "derived_calculation",
            "sourceReference": null,
        });
    }
    let factor = |code| match code {
        "protein" | "carbohydrate" => Decimal::from(17),
        "fat" => Decimal::from(37),
        "dietary_fiber" => Decimal::from(8),
        _ => Decimal::ZERO,
    };
    let raw = component_codes.iter().fold(Decimal::ZERO, |total, code| {
        total + parsed.get(*code).and_then(|source| source.value).unwrap() * factor(code)
    });
    row_from_value(
        rule,
        raw,
        normalization_factor,
        rounding,
        "derived_calculation",
        Some(format!("derived:{}", component_codes.join("+"))),
    )
}

fn calculate_row(
    rule: NutrientRule,
    parsed: &ParsedSource,
    normalization_factor: Option<Decimal>,
    rounding: RoundingStrategy,
) -> Value {
    let Some(value) = parsed.value else {
        return json!({
            "nutrientCode": rule.code,
            "name": rule.name,
            "unit": rule.unit,
            "rawValue": null,
            "declaredValue": null,
            "nrvPercent": null,
            "sourceKind": parsed.source.source_kind,
            "sourceReference": parsed.source.source_reference,
        });
    };
    row_from_value(
        rule,
        value,
        normalization_factor,
        rounding,
        &parsed.source.source_kind,
        parsed.source.source_reference.clone(),
    )
}

fn row_from_value(
    rule: NutrientRule,
    raw_value: Decimal,
    normalization_factor: Option<Decimal>,
    rounding: RoundingStrategy,
    source_kind: &str,
    source_reference: Option<String>,
) -> Value {
    let raw = decimal_string(raw_value);
    let Some(normalization_factor) = normalization_factor else {
        return json!({
            "nutrientCode": rule.code,
            "name": rule.name,
            "unit": rule.unit,
            "rawValue": raw,
            "declaredValue": null,
            "nrvPercent": null,
            "sourceKind": source_kind,
            "sourceReference": source_reference,
        });
    };
    let zero_threshold = Decimal::from_str(rule.zero_threshold).unwrap();
    let is_zero = raw_value * normalization_factor <= zero_threshold;
    let declared = if is_zero {
        formatted_zero(rule.interval)
    } else {
        round_to_interval(raw_value, rule.interval, rounding)
    };
    let nrv_percent = rule.nrv.map(|nrv| {
        if is_zero {
            "0".to_string()
        } else {
            round_percentage(&declared, nrv, rounding)
        }
    });
    json!({
        "nutrientCode": rule.code,
        "name": rule.name,
        "unit": rule.unit,
        "rawValue": raw,
        "declaredValue": declared,
        "nrvPercent": nrv_percent,
        "sourceKind": source_kind,
        "sourceReference": source_reference,
    })
}

fn basis_normalization_factor(basis: &Basis, issues: &mut Vec<Value>) -> Option<Decimal> {
    let quantity = Decimal::from_str(&basis.quantity).ok();
    let Some(quantity) = quantity.filter(|value| *value > Decimal::ZERO) else {
        issues.push(issue(
            "unsupported_basis",
            "error",
            None,
            "营养标签基准数量必须大于 0",
        ));
        return None;
    };
    match basis.kind.as_str() {
        "per_100g" if basis.unit == "g" && quantity == Decimal::from(100) => Some(Decimal::ONE),
        "per_100ml" if basis.unit == "mL" && quantity == Decimal::from(100) => Some(Decimal::ONE),
        "per_serving" => Decimal::from(100).checked_div(quantity),
        "per_100g" => {
            issues.push(issue(
                "unsupported_basis",
                "error",
                None,
                "每 100g 标签必须使用 100 g 基准",
            ));
            None
        }
        "per_100ml" => {
            issues.push(issue(
                "unsupported_basis",
                "error",
                None,
                "每 100mL 标签必须使用 100 mL 基准",
            ));
            None
        }
        _ => {
            issues.push(issue(
                "unsupported_basis",
                "error",
                None,
                "营养标签标示基准无效",
            ));
            None
        }
    }
}

fn round_to_interval(value: Decimal, interval: &str, rounding: RoundingStrategy) -> String {
    let step = Decimal::from_str(interval).unwrap();
    let rounded = (value / step).round_dp_with_strategy(0, rounding) * step;
    format_decimal_places(rounded, decimal_places(interval))
}

fn round_percentage(value: &str, nrv: &str, rounding: RoundingStrategy) -> String {
    let value = Decimal::from_str(value).unwrap();
    let nrv = Decimal::from_str(nrv).unwrap();
    ((value / nrv) * Decimal::from(100))
        .round_dp_with_strategy(0, rounding)
        .to_string()
}

fn formatted_zero(interval: &str) -> String {
    format_decimal_places(Decimal::ZERO, decimal_places(interval))
}

fn decimal_places(value: &str) -> usize {
    value
        .split_once('.')
        .map(|(_, decimals)| decimals.len())
        .unwrap_or(0)
}

fn format_decimal_places(value: Decimal, places: usize) -> String {
    format!("{value:.places$}")
}

fn decimal_string(value: Decimal) -> String {
    value.normalize().to_string()
}

fn issue(
    code: &str,
    severity: &str,
    nutrient_code: Option<&str>,
    message: impl Into<String>,
) -> Value {
    let mut value = json!({
        "code": code,
        "severity": severity,
        "message": message.into(),
    });
    if let Some(code) = nutrient_code {
        value["nutrientCode"] = Value::String(code.to_string());
    }
    value
}
