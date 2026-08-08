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
    assert_eq!(REGISTERED_COMMANDS.len(), 88);
    for command in [
        "list_categories",
        "create_supplier",
        "list_material_groups",
        "save_ingredient_variant",
        "compare_ingredient_variants",
        "save_draft",
        "create_recipe_alternative",
        "update_recipe_scheme",
        "restore_recipe",
        "permanently_delete_recipe",
        "delete_recipe_version",
        "export_sample_sheet",
        "database_status",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}

#[test]
fn every_backup_command_is_registered() {
    for command in [
        "create_data_backup",
        "inspect_data_backup",
        "restore_data_backup",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}

#[test]
fn every_research_report_command_is_registered() {
    for command in [
        "create_research_report",
        "list_research_reports",
        "get_research_report",
        "export_research_report",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}

#[test]
fn every_recipe_command_is_registered() {
    for command in [
        "list_recipes",
        "get_recipe",
        "create_recipe",
        "update_recipe",
        "archive_recipe",
        "get_recipe_draft",
        "save_recipe_draft",
        "list_recipe_versions",
        "get_recipe_version",
        "create_recipe_version",
        "copy_recipe_version_to_draft",
        "compare_recipe_versions",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}

#[test]
fn every_nutrition_label_command_is_registered() {
    for command in [
        "list_nutrition_labels",
        "get_nutrition_label",
        "create_nutrition_label",
        "get_nutrition_label_draft",
        "calculate_nutrition_label_preview",
        "save_nutrition_label_draft",
        "list_nutrition_label_versions",
        "get_nutrition_label_version",
        "publish_nutrition_label",
    ] {
        assert!(
            food_rd_desktop::commands::REGISTERED_COMMANDS.contains(&command),
            "missing command {command}"
        );
    }
}

#[test]
fn every_agent_command_is_registered() {
    for command in [
        "get_agent_preferences",
        "save_agent_preferences",
        "list_agent_provider_configs",
        "save_agent_provider_config",
        "set_agent_provider_secret",
        "clear_agent_provider_secret",
        "list_agent_provider_models",
        "get_agent_custom_provider_subconfig",
        "test_agent_provider",
        "detect_cli_providers",
        "list_agent_conversations",
        "create_agent_conversation",
        "delete_agent_conversation",
        "list_agent_messages",
        "start_agent_run",
        "cancel_agent_run",
        "get_agent_run",
        "list_agent_import_drafts",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}

#[test]
fn every_import_command_is_registered() {
    for command in [
        "create_ingredient_import_job",
        "get_ingredient_import_job",
        "list_ingredient_import_drafts",
        "update_ingredient_import_draft",
        "discard_ingredient_import_draft",
        "cancel_ingredient_import_job",
        "retry_ingredient_import_job",
        "commit_ingredient_import_job",
        "commit_reviewed_ingredient_import_draft",
        "export_ingredient_template",
        "export_ingredient_library",
        "cleanup_orphan_attachments",
    ] {
        assert!(REGISTERED_COMMANDS.contains(&command));
    }
}
