// Tauri commands for environment and variable resolution.

use crate::config;
use std::collections::HashMap;

/// Return environments.json for the active project.
#[tauri::command]
pub fn get_environments(project_path: String) -> Result<serde_json::Value, String> {
    let env = config::read_environments(&project_path).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(env).map_err(|e| e.to_string())?)
}

/// Persist the active environment name.
#[tauri::command]
pub fn set_active_environment(project_path: String, env_name: String) -> Result<(), String> {
    let mut env = config::read_environments(&project_path).map_err(|e| e.to_string())?;
    env.active = env_name;
    config::write_environments(&project_path, &env).map_err(|e| e.to_string())
}

/// Resolve {{variable}} references in a string using the full 4-tier chain:
/// runtime tokens → active env plain values → project secrets → global secrets.
/// `runtime_tokens` is passed from the caller (Zustand) since runtime state
/// is held in React memory, not in Rust.
#[tauri::command]
pub fn resolve_variables(
    text: String,
    project_path: String,
    runtime_tokens: HashMap<String, String>,
) -> Result<String, String> {
    let env_data = config::read_environments(&project_path).map_err(|e| e.to_string())?;
    let project_secrets = config::read_project_secrets(&project_path).map_err(|e| e.to_string())?;
    let global_secrets = config::read_global_secrets().map_err(|e| e.to_string())?;

    let active_env_vars = env_data
        .environments
        .get(&env_data.active)
        .cloned()
        .unwrap_or_default();

    let resolved = resolve_string(
        &text,
        &runtime_tokens,
        &active_env_vars,
        &project_secrets.values,
        &global_secrets.values,
    );
    Ok(resolved)
}

fn resolve_string(
    text: &str,
    runtime_tokens: &HashMap<String, String>,
    env_vars: &HashMap<String, String>,
    project_secrets: &HashMap<String, String>,
    global_secrets: &HashMap<String, String>,
) -> String {
    let mut result = text.to_string();
    let mut i = 0;

    loop {
        if let Some(start) = result[i..].find("{{") {
            let abs_start = i + start;
            if let Some(end) = result[abs_start..].find("}}") {
                let abs_end = abs_start + end;
                let key = &result[abs_start + 2..abs_end].trim().to_string();

                let value = runtime_tokens
                    .get(key.as_str())
                    .or_else(|| env_vars.get(key.as_str()))
                    .or_else(|| project_secrets.get(key.as_str()))
                    .or_else(|| global_secrets.get(key.as_str()));

                if let Some(val) = value {
                    let replacement = val.clone();
                    result.replace_range(abs_start..abs_end + 2, &replacement);
                    i = abs_start + replacement.len();
                } else {
                    // Leave unresolved — advance past the opening {{ to avoid infinite loop
                    i = abs_start + 2;
                }
            } else {
                break;
            }
        } else {
            break;
        }
    }
    result
}

#[cfg(test)]
#[path = "environment_tests.rs"]
mod tests;
