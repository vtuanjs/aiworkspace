use crate::config::{read_app_settings, write_app_settings, AppSettings};

#[tauri::command]
pub fn get_app_settings() -> Result<AppSettings, String> {
    read_app_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    write_app_settings(&settings).map_err(|e| e.to_string())
}
