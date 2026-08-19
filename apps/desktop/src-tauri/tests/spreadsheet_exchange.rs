use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};

use calamine::{Reader, open_workbook_auto};
use food_rd_desktop::ingest::{
    extractors::ExtractedTable,
    model::{
        ImportIssueCode, ImportedNutrientValue, IngredientExchangeFormat,
        ReviewedIngredientImportDraft,
    },
    spreadsheet::{
        TEMPLATE_HEADERS, parse_csv, parse_ingredient_table, write_library_export, write_template,
    },
    validation::validate_review,
};
use uuid::Uuid;
use zip::ZipArchive;

struct OutputFixture {
    root: PathBuf,
}

impl OutputFixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("food-rd-sheet-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }

    fn path(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }
}

impl Drop for OutputFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn empty_and_zero_nutrient_cells_remain_distinct() {
    let drafts = parse_csv(
        "通用原料名称,供应商名称,营养基准,蛋白质(g),脂肪(g)\n脱脂乳粉,供应商A,每100g,,0\n",
    )
    .unwrap();

    assert_eq!(drafts[0].nutrients[0].value, None);
    assert_eq!(drafts[0].nutrients[1].value.as_deref(), Some("0"));
}

#[test]
fn multiple_suppliers_create_multiple_rows_under_one_material() {
    let drafts = parse_csv(include_str!("fixtures/imports/ingredient-template.csv")).unwrap();

    assert_eq!(drafts.len(), 2);
    assert_eq!(drafts[0].material_name, "脱脂乳粉");
    assert_ne!(drafts[0].supplier_name, drafts[1].supplier_name);
}

#[test]
fn allergen_conflicts_are_case_insensitive_for_unicode_names() {
    let error = parse_csv(
        "通用原料名称,供应商名称,营养基准,含有过敏原,可能含有过敏原\n脱脂乳粉,供应商A,每100g,Ä,ä\n",
    )
    .unwrap_err();

    assert_eq!(error.issues[0].code, ImportIssueCode::SourceConflict);
}

#[test]
fn errors_include_human_row_column_and_field() {
    let error =
        parse_csv("通用原料名称,供应商名称,营养基准,钠(mg)\n脱脂乳粉,供应商A,每100g,12mg\n")
            .unwrap_err();

    assert_eq!(error.issues[0].row, Some(2));
    assert_eq!(error.issues[0].column.as_deref(), Some("钠(mg)"));
    assert_eq!(
        error.issues[0].field_path.as_deref(),
        Some("nutrients.sodium.value")
    );
}

#[test]
fn csv_export_round_trip_preserves_reviewed_fields_and_formula_safety() {
    let fixture = OutputFixture::new();
    let path = fixture.path("library.csv");
    let mut review = valid_review();
    review.material_name = "=测试原料".into();
    review.nutrients[0].value = None;
    review.nutrients[1].value = Some("0".into());

    write_library_export(&path, IngredientExchangeFormat::Csv, &[review.clone()]).unwrap();

    let exported = fs::read_to_string(&path).unwrap();
    assert!(exported.contains("'=测试原料"));
    let imported = parse_csv(&exported).unwrap();
    assert_eq!(imported[0].material_name, "'=测试原料");
    assert_eq!(imported[0].contains_allergens, ["乳及乳制品"]);
    assert_eq!(imported[0].may_contain_allergens, ["大豆"]);
    assert_eq!(imported[0].source, "供应商规格书");
    assert_eq!(imported[0].research_notes, "溶解速度快");
    let protein = imported[0]
        .nutrients
        .iter()
        .find(|value| value.definition_id.as_deref() == Some("protein"))
        .unwrap();
    let fat = imported[0]
        .nutrients
        .iter()
        .find(|value| value.definition_id.as_deref() == Some("fat"))
        .unwrap();
    assert_eq!(protein.value, None);
    assert_eq!(fat.value.as_deref(), Some("0"));
}

#[test]
fn xlsx_export_round_trip_preserves_two_supplier_rows() {
    let fixture = OutputFixture::new();
    let path = fixture.path("library.xlsx");
    let first = valid_review();
    let mut second = valid_review();
    second.supplier_name = "供应商B".into();
    second.model_or_specification = "B-100".into();

    write_library_export(&path, IngredientExchangeFormat::Xlsx, &[first, second]).unwrap();
    let table = read_first_xlsx_table(&path);
    let imported = parse_ingredient_table(&table).unwrap();

    assert_eq!(imported.len(), 2);
    assert_eq!(imported[0].material_name, "脱脂乳粉");
    assert_eq!(imported[0].nutrition_basis.as_deref(), Some("per_100g"));
    assert_eq!(imported[1].supplier_name, "供应商B");
    assert_eq!(imported[1].model_or_specification, "B-100");
}

#[test]
fn template_uses_exact_headers_examples_and_xlsx_dropdowns() {
    let fixture = OutputFixture::new();
    let csv_path = fixture.path("template.csv");
    let xlsx_path = fixture.path("template.xlsx");

    write_template(&csv_path, IngredientExchangeFormat::Csv, &[]).unwrap();
    write_template(&xlsx_path, IngredientExchangeFormat::Xlsx, &[]).unwrap();

    let csv = fs::read_to_string(&csv_path).unwrap();
    assert_eq!(csv.lines().next().unwrap(), TEMPLATE_HEADERS.join(","));
    assert!(csv.lines().nth(1).is_some_and(|line| !line.is_empty()));

    let table = read_first_xlsx_table(&xlsx_path);
    assert_eq!(table.rows[0], TEMPLATE_HEADERS);
    assert!(!table.rows[1][0].is_empty());

    let archive = File::open(&xlsx_path).unwrap();
    let mut archive = ZipArchive::new(archive).unwrap();
    let mut worksheet_xml = String::new();
    archive
        .by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut worksheet_xml)
        .unwrap();
    assert!(worksheet_xml.contains("dataValidations"));
    assert!(worksheet_xml.contains("kg,g,L,mL"));
    assert!(worksheet_xml.contains("每100g,每100mL"));
}

#[test]
fn custom_nutrition_columns_round_trip_and_retired_research_columns_are_omitted() {
    let fixture = OutputFixture::new();
    let path = fixture.path("custom-library.csv");
    let mut review = valid_review();
    review.nutrients.push(ImportedNutrientValue {
        definition_id: Some("custom-lactose".into()),
        name: "乳糖".into(),
        unit: "g".into(),
        value: None,
        category: Some("nutrition".into()),
    });
    review.nutrients.push(ImportedNutrientValue {
        definition_id: Some("custom-potassium".into()),
        name: "钾".into(),
        unit: "mg".into(),
        value: Some("0".into()),
        category: Some("nutrition".into()),
    });
    review.nutrients.push(ImportedNutrientValue {
        definition_id: Some("custom-polyphenol".into()),
        name: "总多酚".into(),
        unit: "mg".into(),
        value: Some("0".into()),
        category: Some("research".into()),
    });
    write_library_export(&path, IngredientExchangeFormat::Csv, &[review.clone()]).unwrap();
    let exported = fs::read_to_string(&path).unwrap();
    assert!(exported.contains("自定义含量[营养相关]:乳糖(g)"));
    assert!(exported.contains("自定义含量[营养相关]:钾(mg)"));
    assert!(!exported.contains("研发指标"));
    assert!(!exported.contains("总多酚"));
    assert!(exported.contains("未知"));

    let imported = parse_csv(&exported).unwrap();
    let lactose = imported[0]
        .nutrients
        .iter()
        .find(|nutrient| nutrient.name == "乳糖")
        .unwrap();
    let potassium = imported[0]
        .nutrients
        .iter()
        .find(|nutrient| nutrient.name == "钾")
        .unwrap();
    assert_eq!(lactose.value, None);
    assert_eq!(lactose.category.as_deref(), Some("nutrition"));
    assert_eq!(potassium.value.as_deref(), Some("0"));
    assert_eq!(potassium.category.as_deref(), Some("nutrition"));
    let xlsx_path = fixture.path("custom-library.xlsx");
    write_library_export(&xlsx_path, IngredientExchangeFormat::Xlsx, &[review]).unwrap();
    let xlsx_imported = parse_ingredient_table(&read_first_xlsx_table(&xlsx_path)).unwrap();
    assert!(xlsx_imported[0].nutrients.iter().any(|nutrient| {
        nutrient.name == "乳糖"
            && nutrient.value.is_none()
            && nutrient.category.as_deref() == Some("nutrition")
    }));
    assert!(xlsx_imported[0].nutrients.iter().any(|nutrient| {
        nutrient.name == "钾"
            && nutrient.value.as_deref() == Some("0")
            && nutrient.category.as_deref() == Some("nutrition")
    }));
    assert!(
        xlsx_imported[0]
            .nutrients
            .iter()
            .all(|nutrient| nutrient.name != "总多酚")
    );
}

#[test]
fn legacy_custom_column_requires_category_review() {
    let draft = parse_csv(
        "通用原料名称,供应商名称,营养基准,自定义含量:乳糖(g)\n脱脂乳粉,供应商A,每100g,2\n",
    )
    .unwrap()
    .remove(0);
    assert!(
        validate_review(&draft)
            .iter()
            .any(|issue| { issue.field_path.as_deref() == Some("nutrients.0.category") })
    );
}

fn valid_review() -> ReviewedIngredientImportDraft {
    ReviewedIngredientImportDraft {
        material_group_id: None,
        material_name: "脱脂乳粉".into(),
        category_id: None,
        category_name: Some("乳制品".into()),
        supplier_id: None,
        supplier_name: "供应商A".into(),
        model_or_specification: "MD-300".into(),
        current_price: Some("31.50".into()),
        price_unit: Some("kg".into()),
        density_g_per_ml: Some("0.52".into()),
        nutrition_basis: Some("per_100g".into()),
        nutrients: vec![
            nutrient("protein", "蛋白质", "g", Some("34.0")),
            nutrient("fat", "脂肪", "g", Some("0.8")),
        ],
        contains_allergens: vec!["乳及乳制品".into()],
        may_contain_allergens: vec!["大豆".into()],
        source: "供应商规格书".into(),
        research_notes: "溶解速度快".into(),
        duplicate_confirmed: false,
    }
}

fn nutrient(
    definition_id: &str,
    name: &str,
    unit: &str,
    value: Option<&str>,
) -> ImportedNutrientValue {
    ImportedNutrientValue {
        definition_id: Some(definition_id.into()),
        name: name.into(),
        unit: unit.into(),
        value: value.map(str::to_string),
        category: Some("nutrition".into()),
    }
}

fn read_first_xlsx_table(path: &Path) -> ExtractedTable {
    let mut workbook = open_workbook_auto(path).unwrap();
    let sheet_name = workbook.sheet_names()[0].clone();
    let range = workbook.worksheet_range(&sheet_name).unwrap();
    ExtractedTable {
        name: Some(sheet_name),
        rows: range
            .rows()
            .map(|row| row.iter().map(ToString::to_string).collect())
            .collect(),
    }
}
