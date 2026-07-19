pub mod commands;
pub mod database;
pub mod ingest;
pub mod ingredients;

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
            app.manage(commands::AppState::new(coordinator));
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
        ])
        .run(tauri::generate_context!())
        .expect("食研工作台启动失败");
}
