use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

#[tauri::command]
pub fn read_dir_tree(path: String, depth: Option<u8>) -> Result<DirEntry, String> {
    let max_depth = depth.unwrap_or(3);
    build_tree(&path, max_depth).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists.
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    if p.exists() {
        return Err(format!("Already exists: {}", path));
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_dir_entry(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err(format!("Already exists: {}", new_path));
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn build_tree(path: &str, depth: u8) -> anyhow::Result<DirEntry> {
    let p = Path::new(path);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    let is_dir = p.is_dir();

    let children = if is_dir && depth > 0 {
        let mut entries: Vec<DirEntry> = fs::read_dir(p)?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let child_path = e.path();
                let child_str = child_path.to_string_lossy().into_owned();
                // Skip hidden entries (starting with '.') to keep the tree clean.
                let child_name = child_path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if child_name.starts_with('.') {
                    return None;
                }
                build_tree(&child_str, depth - 1).ok()
            })
            .collect();

        // Directories before files, then alphabetical.
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.cmp(&b.name))
        });

        Some(entries)
    } else if is_dir {
        // Depth exhausted — signal there may be children without listing them.
        Some(vec![])
    } else {
        None
    };

    Ok(DirEntry {
        name,
        path: path.to_string(),
        is_dir,
        children,
    })
}
