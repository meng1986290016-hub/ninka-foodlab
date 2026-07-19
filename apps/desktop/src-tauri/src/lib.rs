pub mod commands;
pub mod database;
pub mod ingest;
pub mod ingredients;

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
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("food-rd.sqlite3");
            let repository = ingredients::repository::IngredientRepository::open(&database_path)?;
            app.manage(commands::AppState::new(repository));
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
        ])
        .run(tauri::generate_context!())
        .expect("食研工作台启动失败");
}
