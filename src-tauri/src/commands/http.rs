use crate::config;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpCollection {
    pub id: String,
    pub name: String,
    pub requests: Vec<serde_json::Value>,
}

#[tauri::command]
pub fn load_http_collections(project_path: String) -> Result<Vec<HttpCollection>, String> {
    let raw = config::read_http_collections(&project_path).map_err(|e| e.to_string())?;

    let collections = raw
        .collections
        .into_iter()
        .filter_map(|v| serde_json::from_value::<HttpCollection>(v).ok())
        .collect();

    Ok(collections)
}

#[tauri::command]
pub fn save_http_collections(
    project_path: String,
    collections: Vec<HttpCollection>,
) -> Result<(), String> {
    let raw_collections: Vec<serde_json::Value> = collections
        .into_iter()
        .filter_map(|c| serde_json::to_value(c).ok())
        .collect();

    let http_collections = config::HttpCollections {
        collections: raw_collections,
    };

    config::write_http_collections(&project_path, &http_collections).map_err(|e| e.to_string())
}
