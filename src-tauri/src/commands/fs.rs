use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
    /// true when this dir's children were not fetched because depth was exhausted
    pub truncated: bool,
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

// ── Search ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line: String,
    pub match_start: usize,
    pub match_end: usize,
}

const SKIP_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "dist", ".next", "build",
    ".aiworkspace", "__pycache__", ".cache", "coverage",
];

#[tauri::command]
pub fn search_in_files(
    project_path: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
) -> Result<Vec<SearchMatch>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    let pattern = if use_regex {
        query.clone()
    } else {
        regex::escape(&query)
    };

    let pattern = if whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    let re = if case_sensitive {
        Regex::new(&pattern)
    } else {
        Regex::new(&format!("(?i){}", pattern))
    }
    .map_err(|e| e.to_string())?;

    let mut results: Vec<SearchMatch> = Vec::new();
    search_dir(Path::new(&project_path), &re, &mut results, 0);
    Ok(results)
}

fn search_dir(dir: &Path, re: &Regex, results: &mut Vec<SearchMatch>, depth: u8) {
    if depth > 8 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || SKIP_DIRS.contains(&name) {
            continue;
        }
        if path.is_dir() {
            search_dir(&path, re, results, depth + 1);
        } else if path.is_file() {
            search_file(&path, re, results);
        }
    }
}

fn search_file(path: &Path, re: &Regex, results: &mut Vec<SearchMatch>) {
    // Skip likely binary files by extension
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    const BINARY_EXTS: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp",
        "pdf", "zip", "tar", "gz", "bz2", "7z", "rar",
        "exe", "dll", "so", "dylib", "a", "o",
        "woff", "woff2", "ttf", "otf", "eot",
        "mp3", "mp4", "mov", "avi", "webm",
        "lock",
    ];
    if BINARY_EXTS.contains(&ext) {
        return;
    }

    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };

    // Limit per-file results to avoid flooding
    let mut file_matches = 0;
    for (line_idx, line) in content.lines().enumerate() {
        for m in re.find_iter(line) {
            results.push(SearchMatch {
                file_path: path.to_string_lossy().into_owned(),
                line_number: line_idx + 1,
                line: line.to_string(),
                match_start: m.start(),
                match_end: m.end(),
            });
            file_matches += 1;
            if file_matches >= 100 {
                return;
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn build_tree(path: &str, depth: u8) -> anyhow::Result<DirEntry> {
    let p = Path::new(path);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    let is_dir = p.is_dir();

    let (children, truncated) = if is_dir && depth > 0 {
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

        (Some(entries), false)
    } else if is_dir {
        // Depth exhausted — children exist but were not fetched.
        (Some(vec![]), true)
    } else {
        (None, false)
    };

    Ok(DirEntry {
        name,
        path: path.to_string(),
        is_dir,
        truncated,
        children,
    })
}
