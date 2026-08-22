use std::{collections::HashMap, path::Path};

use rust_xlsxwriter::{DataValidation, Workbook};
use thiserror::Error;

use crate::ingredients::model::NutrientDefinition;

use super::{
    IngestError,
    extractors::ExtractedTable,
    model::{
        ImportIssue, ImportIssueCode, ImportIssueSeverity, ImportedNutrientValue,
        IngredientExchangeFormat, ReviewedIngredientImportDraft,
    },
    validation::normalize_review,
};

pub const TEMPLATE_HEADERS: [&str; 21] = [
    "通用原料名称",
    "分类",
    "供应商名称",
    "型号/规格",
    "当前含税价",
    "价格单位",
    "密度(g/mL)",
    "营养基准",
    "能量(kJ)",
    "蛋白质(g)",
    "脂肪(g)",
    "饱和脂肪(g)",
    "碳水化合物(g)",
    "糖(g)",
    "膳食纤维(g)",
    "钠(mg)",
    "含有过敏原",
    "可能含有过敏原",
    "数据来源",
    "研发备注",
    "来源文件",
];

const CUSTOM_COLUMN_INSERT_INDEX: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq)]
struct CustomColumn {
    definition_id: Option<String>,
    category: Option<String>,
    name: String,
    unit: String,
    header: String,
}

const NUTRIENT_COLUMNS: [NutrientColumn; 8] = [
    NutrientColumn::new("能量(kJ)", "energy", "能量", "kJ"),
    NutrientColumn::new("蛋白质(g)", "protein", "蛋白质", "g"),
    NutrientColumn::new("脂肪(g)", "fat", "脂肪", "g"),
    NutrientColumn::new("饱和脂肪(g)", "saturated_fat", "饱和脂肪", "g"),
    NutrientColumn::new("碳水化合物(g)", "carbohydrate", "碳水化合物", "g"),
    NutrientColumn::new("糖(g)", "sugars", "糖", "g"),
    NutrientColumn::new("膳食纤维(g)", "dietary_fiber", "膳食纤维", "g"),
    NutrientColumn::new("钠(mg)", "sodium", "钠", "mg"),
];

struct NutrientColumn {
    definition_id: &'static str,
    header: &'static str,
    name: &'static str,
    unit: &'static str,
}

impl NutrientColumn {
    const fn new(
        header: &'static str,
        definition_id: &'static str,
        name: &'static str,
        unit: &'static str,
    ) -> Self {
        Self {
            definition_id,
            header,
            name,
            unit,
        }
    }
}

#[derive(Debug, Error)]
#[error("表格中有需要修正的数据")]
pub struct SpreadsheetImportError {
    pub issues: Vec<ImportIssue>,
}

pub fn parse_csv(
    input: &str,
) -> Result<Vec<ReviewedIngredientImportDraft>, SpreadsheetImportError> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(input.as_bytes());
    let rows = reader
        .records()
        .map(|record| {
            record
                .map(|record| record.iter().map(str::to_string).collect::<Vec<_>>())
                .map_err(|_| file_issue("CSV 文件已损坏或格式不正确"))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|issue| SpreadsheetImportError {
            issues: vec![issue],
        })?;
    parse_ingredient_table(&ExtractedTable { name: None, rows })
}

pub fn parse_ingredient_table(
    table: &ExtractedTable,
) -> Result<Vec<ReviewedIngredientImportDraft>, SpreadsheetImportError> {
    let Some(header_row) = table.rows.first() else {
        return Err(SpreadsheetImportError {
            issues: vec![file_issue("表格缺少标题行")],
        });
    };
    let headers = header_row
        .iter()
        .enumerate()
        .map(|(index, header)| {
            let header = header.trim().trim_start_matches('\u{feff}').to_string();
            (header, index)
        })
        .collect::<HashMap<_, _>>();

    let mut issues = Vec::new();
    for (header, field) in [
        ("通用原料名称", "materialName"),
        ("供应商名称", "supplierName"),
        ("营养基准", "nutritionBasis"),
    ] {
        if !headers.contains_key(header) {
            issues.push(ImportIssue {
                code: ImportIssueCode::MissingRequired,
                severity: ImportIssueSeverity::Error,
                message: format!("缺少必填列“{header}”"),
                field_path: Some(field.into()),
                source_name: table.name.clone(),
                row: None,
                column: Some(header.into()),
            });
        }
    }
    if !issues.is_empty() {
        return Err(SpreadsheetImportError { issues });
    }
    let custom_columns = header_row
        .iter()
        .filter_map(|header| parse_custom_header(header.trim().trim_start_matches('\u{feff}')))
        .collect::<Vec<_>>();

    let mut drafts = Vec::new();
    for (row_index, row) in table.rows.iter().enumerate().skip(1) {
        if row.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }
        let human_row = (row_index + 1) as u64;
        let mut row_issues = Vec::new();
        let material_name = required_cell(
            row,
            &headers,
            "通用原料名称",
            "materialName",
            human_row,
            &mut row_issues,
        );
        let supplier_name = required_cell(
            row,
            &headers,
            "供应商名称",
            "supplierName",
            human_row,
            &mut row_issues,
        );
        let nutrition_basis = match cell(row, &headers, "营养基准").trim() {
            "每100g" | "per_100g" => Some("per_100g".to_string()),
            "每100mL" | "per_100ml" => Some("per_100ml".to_string()),
            _ => {
                row_issues.push(cell_issue(
                    ImportIssueCode::InvalidBasis,
                    human_row,
                    "营养基准",
                    "nutritionBasis",
                    "请选择每100g或每100mL",
                ));
                None
            }
        };

        let current_price = decimal_cell(
            row,
            &headers,
            "当前含税价",
            "currentPrice",
            human_row,
            &mut row_issues,
        );
        let density_g_per_ml = decimal_cell(
            row,
            &headers,
            "密度(g/mL)",
            "densityGPerMl",
            human_row,
            &mut row_issues,
        );
        let price_unit = match nullable_cell(row, &headers, "价格单位") {
            Some(unit) if matches!(unit.as_str(), "kg" | "g" | "L" | "mL") => Some(unit),
            Some(_) => {
                row_issues.push(cell_issue(
                    ImportIssueCode::InvalidUnit,
                    human_row,
                    "价格单位",
                    "priceUnit",
                    "价格单位必须为 kg、g、L 或 mL",
                ));
                None
            }
            None => {
                if current_price.is_some() {
                    row_issues.push(cell_issue(
                        ImportIssueCode::MissingRequired,
                        human_row,
                        "价格单位",
                        "priceUnit",
                        "填写价格后必须选择价格单位",
                    ));
                }
                None
            }
        };

        let mut nutrients = NUTRIENT_COLUMNS
            .iter()
            .filter(|nutrient| headers.contains_key(nutrient.header))
            .map(|nutrient| ImportedNutrientValue {
                definition_id: Some(nutrient.definition_id.into()),
                name: nutrient.name.into(),
                unit: nutrient.unit.into(),
                value: decimal_cell(
                    row,
                    &headers,
                    nutrient.header,
                    &format!("nutrients.{}.value", nutrient.definition_id),
                    human_row,
                    &mut row_issues,
                ),
                category: Some("nutrition".into()),
            })
            .collect::<Vec<_>>();
        for custom in &custom_columns {
            let raw = cell(row, &headers, &custom.header).trim();
            if raw.is_empty() {
                continue;
            }
            let value = if raw == "未知" {
                None
            } else if is_unsigned_decimal(raw) {
                Some(raw.to_string())
            } else {
                row_issues.push(cell_issue(
                    ImportIssueCode::InvalidDecimal,
                    human_row,
                    &custom.header,
                    &format!("nutrients.{}.value", custom.name),
                    "请输入不带单位的非负数字，或填写“未知”",
                ));
                None
            };
            nutrients.push(ImportedNutrientValue {
                definition_id: custom.definition_id.clone(),
                name: custom.name.clone(),
                unit: custom.unit.clone(),
                value,
                category: custom.category.clone(),
            });
        }

        let contains_allergens = split_allergens(cell(row, &headers, "含有过敏原"));
        let may_contain_allergens = split_allergens(cell(row, &headers, "可能含有过敏原"));
        let normalized_contains = contains_allergens
            .iter()
            .map(|allergen| allergen.to_lowercase())
            .collect::<Vec<_>>();
        for allergen in &may_contain_allergens {
            if normalized_contains.contains(&allergen.to_lowercase()) {
                row_issues.push(cell_issue(
                    ImportIssueCode::SourceConflict,
                    human_row,
                    "可能含有过敏原",
                    "mayContainAllergens",
                    &format!("“{allergen}”不能同时标记为含有和可能含有"),
                ));
            }
        }

        if !row_issues.is_empty() {
            issues.extend(row_issues);
            continue;
        }

        let mut review = ReviewedIngredientImportDraft {
            material_group_id: None,
            material_name,
            category_id: None,
            category_name: nullable_cell(row, &headers, "分类"),
            supplier_id: None,
            supplier_name,
            model_or_specification: cell(row, &headers, "型号/规格").trim().to_string(),
            current_price,
            price_unit,
            density_g_per_ml,
            nutrition_basis,
            nutrients,
            contains_allergens,
            may_contain_allergens,
            source: cell(row, &headers, "数据来源").trim().to_string(),
            research_notes: cell(row, &headers, "研发备注").trim().to_string(),
            duplicate_confirmed: false,
        };
        normalize_review(&mut review);
        drafts.push(review);
    }

    if issues.is_empty() {
        Ok(drafts)
    } else {
        Err(SpreadsheetImportError { issues })
    }
}

pub fn write_template(
    path: &Path,
    format: IngredientExchangeFormat,
    definitions: &[NutrientDefinition],
) -> Result<(), IngestError> {
    let custom_columns = definitions
        .iter()
        .filter(|definition| {
            definition.archived_at.is_none()
                && !definition.built_in
                && definition.category == "nutrition"
        })
        .map(custom_column_from_definition)
        .collect::<Vec<_>>();
    let headers = headers_with_custom(&custom_columns);
    let sample = headers
        .iter()
        .map(|header| match header.as_str() {
            "通用原料名称" => "脱脂乳粉",
            "分类" => "乳制品",
            "供应商名称" => "供应商A",
            "型号/规格" => "MD-300",
            "当前含税价" => "31.50",
            "价格单位" => "kg",
            "密度(g/mL)" => "0.52",
            "营养基准" => "每100g",
            "能量(kJ)" => "1510",
            "蛋白质(g)" => "34.0",
            "脂肪(g)" => "0.8",
            "饱和脂肪(g)" => "0.5",
            "碳水化合物(g)" => "52.0",
            "糖(g)" => "52.0",
            "钠(mg)" => "420",
            "含有过敏原" => "乳及乳制品",
            "数据来源" => "供应商规格书",
            "研发备注" => "示例：每个供应商填写一行",
            _ => "",
        })
        .map(str::to_string)
        .collect();
    let rows = vec![headers, sample];
    write_rows(path, format, &rows, true)
}

pub fn write_library_export(
    path: &Path,
    format: IngredientExchangeFormat,
    reviews: &[ReviewedIngredientImportDraft],
) -> Result<(), IngestError> {
    let custom_columns = custom_columns_from_reviews(reviews);
    let mut rows = vec![headers_with_custom(&custom_columns)];
    rows.extend(
        reviews
            .iter()
            .map(|review| review_to_row(review, &custom_columns)),
    );
    write_rows(path, format, &rows, false)
}

fn review_to_row(
    review: &ReviewedIngredientImportDraft,
    custom_columns: &[CustomColumn],
) -> Vec<String> {
    let nutrient = |definition_id: &str| {
        review
            .nutrients
            .iter()
            .find(|value| value.definition_id.as_deref() == Some(definition_id))
            .and_then(|value| value.value.clone())
            .unwrap_or_default()
    };
    let mut row = vec![
        review.material_name.clone(),
        review.category_name.clone().unwrap_or_default(),
        review.supplier_name.clone(),
        review.model_or_specification.clone(),
        review.current_price.clone().unwrap_or_default(),
        review.price_unit.clone().unwrap_or_default(),
        review.density_g_per_ml.clone().unwrap_or_default(),
        match review.nutrition_basis.as_deref() {
            Some("per_100g") => "每100g".into(),
            Some("per_100ml") => "每100mL".into(),
            _ => String::new(),
        },
        nutrient("energy"),
        nutrient("protein"),
        nutrient("fat"),
        nutrient("saturated_fat"),
        nutrient("carbohydrate"),
        nutrient("sugars"),
        nutrient("dietary_fiber"),
        nutrient("sodium"),
    ];
    row.extend(custom_columns.iter().map(|column| {
        review
            .nutrients
            .iter()
            .find(|value| custom_value_matches(value, column))
            .map(|value| value.value.clone().unwrap_or_else(|| "未知".into()))
            .unwrap_or_default()
    }));
    row.extend([
        review.contains_allergens.join("、"),
        review.may_contain_allergens.join("、"),
        review.source.clone(),
        review.research_notes.clone(),
        String::new(),
    ]);
    row
}

fn write_rows(
    path: &Path,
    format: IngredientExchangeFormat,
    rows: &[Vec<String>],
    add_validations: bool,
) -> Result<(), IngestError> {
    match format {
        IngredientExchangeFormat::Csv => {
            let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());
            for row in rows {
                writer
                    .write_record(row.iter().map(|value| safe_export_text(value)))
                    .map_err(|_| export_error())?;
            }
            let bytes = writer.into_inner().map_err(|_| export_error())?;
            std::fs::write(path, bytes).map_err(IngestError::attachment)
        }
        IngredientExchangeFormat::Xlsx => write_xlsx(path, rows, add_validations),
    }
}

fn write_xlsx(path: &Path, rows: &[Vec<String>], add_validations: bool) -> Result<(), IngestError> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("原料").map_err(|_| export_error())?;
    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            worksheet
                .write_string(
                    row_index as u32,
                    column_index as u16,
                    safe_export_text(value),
                )
                .map_err(|_| export_error())?;
        }
    }
    if add_validations {
        let price_units = DataValidation::new()
            .allow_list_strings(&["kg", "g", "L", "mL"])
            .map_err(|_| export_error())?;
        worksheet
            .add_data_validation(1, 5, 10_000, 5, &price_units)
            .map_err(|_| export_error())?;
        let bases = DataValidation::new()
            .allow_list_strings(&["每100g", "每100mL"])
            .map_err(|_| export_error())?;
        worksheet
            .add_data_validation(1, 7, 10_000, 7, &bases)
            .map_err(|_| export_error())?;
    }
    workbook.save(path).map_err(|_| export_error())
}

fn required_cell(
    row: &[String],
    headers: &HashMap<String, usize>,
    column: &str,
    field: &str,
    human_row: u64,
    issues: &mut Vec<ImportIssue>,
) -> String {
    let value = cell(row, headers, column).trim().to_string();
    if value.is_empty() {
        issues.push(cell_issue(
            ImportIssueCode::MissingRequired,
            human_row,
            column,
            field,
            &format!("请填写{column}"),
        ));
    }
    value
}

fn decimal_cell(
    row: &[String],
    headers: &HashMap<String, usize>,
    column: &str,
    field: &str,
    human_row: u64,
    issues: &mut Vec<ImportIssue>,
) -> Option<String> {
    let value = cell(row, headers, column).trim();
    if value.is_empty() {
        return None;
    }
    if !is_unsigned_decimal(value) {
        issues.push(cell_issue(
            ImportIssueCode::InvalidDecimal,
            human_row,
            column,
            field,
            "请输入不带单位的非负数字",
        ));
        None
    } else {
        Some(value.to_string())
    }
}

fn parse_custom_header(header: &str) -> Option<CustomColumn> {
    let (category, remainder) = if let Some(value) = header.strip_prefix("自定义含量[营养相关]:")
    {
        (Some("nutrition".to_string()), value)
    } else {
        let value = header.strip_prefix("自定义含量:")?;
        (None, value)
    };
    let unit_start = remainder.rfind('(')?;
    let name = remainder[..unit_start].trim();
    let unit = remainder[unit_start + 1..].strip_suffix(')')?.trim();
    if name.is_empty() || unit.is_empty() {
        return None;
    }
    Some(CustomColumn {
        definition_id: None,
        category,
        name: name.into(),
        unit: unit.into(),
        header: header.into(),
    })
}

fn custom_column_from_definition(definition: &NutrientDefinition) -> CustomColumn {
    let category = Some(definition.category.clone());
    CustomColumn {
        definition_id: Some(definition.id.clone()),
        header: custom_header(&definition.category, &definition.name, &definition.unit),
        category,
        name: definition.name.clone(),
        unit: definition.unit.clone(),
    }
}

fn custom_columns_from_reviews(reviews: &[ReviewedIngredientImportDraft]) -> Vec<CustomColumn> {
    let mut columns = Vec::new();
    for nutrient in reviews
        .iter()
        .flat_map(|review| review.nutrients.iter())
        .filter(|nutrient| {
            !NUTRIENT_COLUMNS
                .iter()
                .any(|built_in| nutrient.definition_id.as_deref() == Some(built_in.definition_id))
                && nutrient.category.as_deref().unwrap_or("nutrition") == "nutrition"
        })
    {
        let category = nutrient.category.as_deref().unwrap_or("nutrition");
        let candidate = CustomColumn {
            definition_id: nutrient.definition_id.clone(),
            category: Some(category.into()),
            name: nutrient.name.clone(),
            unit: nutrient.unit.clone(),
            header: custom_header(category, &nutrient.name, &nutrient.unit),
        };
        if !columns
            .iter()
            .any(|existing| custom_columns_match(existing, &candidate))
        {
            columns.push(candidate);
        }
    }
    columns
}

fn custom_header(category: &str, name: &str, unit: &str) -> String {
    let _ = category;
    format!("自定义含量[营养相关]:{name}({unit})")
}

fn headers_with_custom(custom_columns: &[CustomColumn]) -> Vec<String> {
    let mut headers = TEMPLATE_HEADERS[..CUSTOM_COLUMN_INSERT_INDEX]
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    headers.extend(custom_columns.iter().map(|column| column.header.clone()));
    headers.extend(
        TEMPLATE_HEADERS[CUSTOM_COLUMN_INSERT_INDEX..]
            .iter()
            .map(ToString::to_string),
    );
    headers
}

fn custom_value_matches(value: &ImportedNutrientValue, column: &CustomColumn) -> bool {
    match (&value.definition_id, &column.definition_id) {
        (Some(left), Some(right)) => left == right,
        _ => {
            value.name.eq_ignore_ascii_case(&column.name)
                && value.unit == column.unit
                && value.category == column.category
        }
    }
}

fn custom_columns_match(left: &CustomColumn, right: &CustomColumn) -> bool {
    match (&left.definition_id, &right.definition_id) {
        (Some(left_id), Some(right_id)) => left_id == right_id,
        _ => {
            left.name.eq_ignore_ascii_case(&right.name)
                && left.unit == right.unit
                && left.category == right.category
        }
    }
}

fn nullable_cell(row: &[String], headers: &HashMap<String, usize>, column: &str) -> Option<String> {
    let value = cell(row, headers, column).trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn cell<'a>(row: &'a [String], headers: &HashMap<String, usize>, column: &str) -> &'a str {
    headers
        .get(column)
        .and_then(|index| row.get(*index))
        .map(String::as_str)
        .unwrap_or_default()
}

fn split_allergens(value: &str) -> Vec<String> {
    value
        .split(['、', ',', '，', ';'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn cell_issue(
    code: ImportIssueCode,
    row: u64,
    column: &str,
    field: &str,
    message: &str,
) -> ImportIssue {
    ImportIssue {
        code,
        severity: ImportIssueSeverity::Error,
        message: message.into(),
        field_path: Some(field.into()),
        source_name: None,
        row: Some(row),
        column: Some(column.into()),
    }
}

fn file_issue(message: &str) -> ImportIssue {
    ImportIssue {
        code: ImportIssueCode::DamagedFile,
        severity: ImportIssueSeverity::Error,
        message: message.into(),
        field_path: None,
        source_name: None,
        row: None,
        column: None,
    }
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

fn safe_export_text(value: &str) -> String {
    if value
        .chars()
        .next()
        .is_some_and(|first| matches!(first, '=' | '+' | '-' | '@'))
    {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

fn export_error() -> IngestError {
    IngestError::domain("import_failure", "表格文件无法写入")
}
