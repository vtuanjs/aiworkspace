use crate::config::{self, ProjectEntry};
use uuid::Uuid;

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectEntry>, String> {
    config::read_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_project(id: String) -> Result<(), String> {
    let projects = config::read_projects().map_err(|e| e.to_string())?;

    let project = projects
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("project not found: {}", id))?;

    // Write .claude/mcp.json if it does not already exist.
    if !config::mcp_config_exists(&project.path) {
        config::write_mcp_config(&project.path).map_err(|e| e.to_string())?;
    }

    // Update last_opened timestamp in projects list.
    let now = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Format as a simple ISO-8601-ish string without chrono dependency.
        format_unix_timestamp(secs)
    };

    let updated: Vec<ProjectEntry> = projects
        .into_iter()
        .map(|mut p| {
            if p.id == id {
                p.last_opened = Some(now.clone());
            }
            p
        })
        .collect();

    config::write_projects(&updated).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_project(path: String, name: String, color: String) -> Result<ProjectEntry, String> {
    // Ensure the project .aiworkspace directory structure exists.
    config::init_project_dir(&path).map_err(|e| e.to_string())?;

    let entry = ProjectEntry {
        id: Uuid::new_v4().to_string(),
        name,
        path,
        color,
        last_opened: None,
    };

    let mut projects = config::read_projects().map_err(|e| e.to_string())?;
    projects.push(entry.clone());
    config::write_projects(&projects).map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub fn remove_project(id: String) -> Result<(), String> {
    let projects = config::read_projects().map_err(|e| e.to_string())?;
    let filtered: Vec<ProjectEntry> = projects.into_iter().filter(|p| p.id != id).collect();
    config::write_projects(&filtered).map_err(|e| e.to_string())?;
    config::delete_global_workspace_dir(&id).map_err(|e| e.to_string())
}

// ── Global workspace + panel state ────────────────────────────────────────────

#[tauri::command]
pub fn read_workspace_state(workspace_id: String) -> Result<String, String> {
    config::read_global_workspace_state(&workspace_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_workspace_state(workspace_id: String, content: String) -> Result<(), String> {
    config::write_global_workspace_state(&workspace_id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_panel_state(workspace_id: String, panel: String) -> Result<String, String> {
    if !config::VALID_PANEL_DIRS.contains(&panel.as_str()) {
        return Err(format!("unknown panel: {}", panel));
    }
    config::read_global_panel_state(&workspace_id, &panel).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_panel_state(workspace_id: String, panel: String, content: String) -> Result<(), String> {
    if !config::VALID_PANEL_DIRS.contains(&panel.as_str()) {
        return Err(format!("unknown panel: {}", panel));
    }
    config::write_global_panel_state(&workspace_id, &panel, &content).map_err(|e| e.to_string())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Format a Unix timestamp (seconds since epoch) as a naive UTC string
/// like "2026-04-18T12:34:56Z" without pulling in chrono.
fn format_unix_timestamp(secs: u64) -> String {
    // Days since epoch bookkeeping (Gregorian calendar, no leap-seconds).
    const SECS_PER_MIN: u64 = 60;
    const SECS_PER_HOUR: u64 = 3600;
    const SECS_PER_DAY: u64 = 86400;

    let time_of_day = secs % SECS_PER_DAY;
    let hour = time_of_day / SECS_PER_HOUR;
    let minute = (time_of_day % SECS_PER_HOUR) / SECS_PER_MIN;
    let second = time_of_day % SECS_PER_MIN;

    let mut days = (secs / SECS_PER_DAY) as i64; // days since 1970-01-01
    let mut year = 1970i64;

    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    let month_lengths = [
        31i64,
        if is_leap(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1i64;
    for &len in &month_lengths {
        if days < len {
            break;
        }
        days -= len;
        month += 1;
    }
    let day = days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

#[cfg(test)]
#[path = "projects_tests.rs"]
mod tests;
