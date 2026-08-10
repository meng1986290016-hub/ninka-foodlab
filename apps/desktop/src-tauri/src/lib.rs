pub mod agent;
pub mod agent_recipe;
pub mod backup;
pub mod commands;
pub mod database;
pub mod ingest;
pub mod ingredients;
pub mod labels;
pub mod recipes;
pub mod reports;

use commands::agent::{
    cancel_agent_run, clear_agent_provider_secret, create_agent_conversation,
    delete_agent_conversation, detect_cli_providers, get_agent_custom_provider_subconfig,
    get_agent_preferences, get_agent_run, list_agent_conversations, list_agent_import_drafts,
    list_agent_messages, list_agent_provider_configs, list_agent_provider_models,
    save_agent_preferences, save_agent_provider_config, set_agent_provider_secret, start_agent_run,
    test_agent_provider,
};
use commands::agent_recipes::{
    accept_agent_recipe_proposal, discard_agent_recipe_proposal, dismiss_material_need,
    evaluate_agent_recipe_proposal, get_agent_recipe_proposal, list_agent_recipe_proposals,
    list_material_needs, resolve_material_need, update_agent_recipe_proposal,
};
use commands::backup::{create_data_backup, inspect_data_backup, restore_data_backup};
use commands::ingest::{
    cancel_ingredient_import_job, cleanup_orphan_attachments, commit_ingredient_import_job,
    commit_reviewed_ingredient_import_draft, create_ingredient_import_job,
    discard_ingredient_import_draft, export_ingredient_library, export_ingredient_template,
    get_ingredient_import_job, list_ingredient_import_drafts, retry_ingredient_import_job,
    update_ingredient_import_draft,
};
use commands::ingredients::{
    archive_category, archive_ingredient_variant, archive_material_group, archive_supplier,
    clear_draft, compare_ingredient_variants, copy_ingredient_variant, create_category,
    create_material_group, create_nutrient_definition, create_supplier, database_status, get_draft,
    get_setting, list_categories, list_material_groups, list_nutrient_definitions, list_suppliers,
    rename_category, save_draft, save_ingredient_variant, set_setting, update_material_group,
    update_supplier,
};
use commands::labels::{
    calculate_nutrition_label_preview, create_nutrition_label, get_nutrition_label,
    get_nutrition_label_draft, get_nutrition_label_version, list_nutrition_label_versions,
    list_nutrition_labels, publish_nutrition_label, save_nutrition_label_draft,
};
use commands::recipes::{
    archive_recipe, compare_recipe_versions, copy_recipe_version_to_draft, create_recipe,
    create_recipe_alternative, create_recipe_version, delete_recipe_version, get_recipe,
    get_recipe_draft, get_recipe_version, list_recipe_versions, list_recipes,
    permanently_delete_recipe, restore_recipe, save_recipe_draft, update_recipe,
    update_recipe_scheme,
};
use commands::reports::{
    create_research_report, export_research_report, export_sample_sheet, get_research_report,
    list_research_reports,
};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let database_path = data_directory.join("food-rd.sqlite3");
            let attachment_root = data_directory.join("attachments");
            let coordinator = ingest::coordinator::IngredientIngestCoordinator::open(
                &database_path,
                &attachment_root,
            )?;
            agent::repository::AgentRepository::open(&database_path)?;
            app.manage(commands::AppState::new(
                coordinator,
                database_path,
                attachment_root,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_categories,
            create_category,
            rename_category,
            archive_category,
            list_suppliers,
            create_supplier,
            update_supplier,
            archive_supplier,
            list_material_groups,
            create_material_group,
            update_material_group,
            archive_material_group,
            save_ingredient_variant,
            copy_ingredient_variant,
            archive_ingredient_variant,
            list_nutrient_definitions,
            create_nutrient_definition,
            compare_ingredient_variants,
            get_setting,
            set_setting,
            get_draft,
            save_draft,
            clear_draft,
            database_status,
            create_ingredient_import_job,
            get_ingredient_import_job,
            list_ingredient_import_drafts,
            update_ingredient_import_draft,
            discard_ingredient_import_draft,
            cancel_ingredient_import_job,
            retry_ingredient_import_job,
            commit_ingredient_import_job,
            commit_reviewed_ingredient_import_draft,
            export_ingredient_template,
            export_ingredient_library,
            cleanup_orphan_attachments,
            get_agent_preferences,
            save_agent_preferences,
            list_agent_provider_configs,
            save_agent_provider_config,
            set_agent_provider_secret,
            clear_agent_provider_secret,
            list_agent_provider_models,
            get_agent_custom_provider_subconfig,
            test_agent_provider,
            detect_cli_providers,
            list_agent_conversations,
            create_agent_conversation,
            delete_agent_conversation,
            list_agent_messages,
            start_agent_run,
            cancel_agent_run,
            get_agent_run,
            list_agent_import_drafts,
            list_agent_recipe_proposals,
            get_agent_recipe_proposal,
            evaluate_agent_recipe_proposal,
            update_agent_recipe_proposal,
            accept_agent_recipe_proposal,
            discard_agent_recipe_proposal,
            list_material_needs,
            resolve_material_need,
            dismiss_material_need,
            list_recipes,
            get_recipe,
            create_recipe,
            create_recipe_alternative,
            update_recipe,
            update_recipe_scheme,
            archive_recipe,
            restore_recipe,
            permanently_delete_recipe,
            delete_recipe_version,
            get_recipe_draft,
            save_recipe_draft,
            list_recipe_versions,
            get_recipe_version,
            create_recipe_version,
            copy_recipe_version_to_draft,
            compare_recipe_versions,
            list_nutrition_labels,
            get_nutrition_label,
            create_nutrition_label,
            get_nutrition_label_draft,
            calculate_nutrition_label_preview,
            save_nutrition_label_draft,
            list_nutrition_label_versions,
            get_nutrition_label_version,
            publish_nutrition_label,
            create_research_report,
            list_research_reports,
            get_research_report,
            export_research_report,
            export_sample_sheet,
            create_data_backup,
            inspect_data_backup,
            restore_data_backup,
        ])
        .run(tauri::generate_context!())
        .expect("Ninka FoodLab 启动失败");
}
