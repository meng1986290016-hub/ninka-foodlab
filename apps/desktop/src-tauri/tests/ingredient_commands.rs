use std::path::PathBuf;

use food_rd_desktop::{
    commands::{CommandError, REGISTERED_COMMANDS},
    ingredients::{
        model::{VariantNutrition, VariantNutritionValue},
        repository::RepositoryError,
    },
};
use serde_json::json;

#[test]
fn unknown_and_confirmed_zero_serialize_with_the_frontend_contract() {
    let nutrition = VariantNutrition {
        basis: "per_100g".into(),
        values: vec![
            VariantNutritionValue {
                nutrient_definition_id: "protein".into(),
                value: None,
            },
            VariantNutritionValue {
                nutrient_definition_id: "fat".into(),
                value: Some("0".into()),
            },
        ],
    };

    assert_eq!(
        serde_json::to_value(nutrition).unwrap(),
        json!({
            "basis": "per_100g",
            "values": [
                { "nutrientDefinitionId": "protein", "value": null },
                { "nutrientDefinitionId": "fat", "value": "0" }
            ]
        })
    );
}

#[test]
fn storage_errors_never_serialize_sql_or_local_paths() {
    let repository_error = RepositoryError::Storage(rusqlite::Error::InvalidPath(PathBuf::from(
        "/Users/private/secret.sqlite",
    )));
    let serialized = serde_json::to_value(CommandError::from(repository_error)).unwrap();

    assert_eq!(
        serialized,
        json!({
            "code": "storage_failure",
            "message": "数据库操作失败",
            "field": null
        })
    );
    assert!(!serialized.to_string().contains("secret.sqlite"));
    assert!(!serialized.to_string().contains("SELECT"));
}

#[test]
fn every_grouped_desktop_api_method_is_registered() {
    assert_eq!(REGISTERED_COMMANDS.len(), 24);
    for command in [
        "list_categories",
        "create_supplier",
        "list_material_groups",
        "save_ingredient_variant",
        "compare_ingredient_variants",
        "save_draft",
        "database_status",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}
