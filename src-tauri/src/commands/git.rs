use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct GitCommitEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[tauri::command]
pub fn git_status(project_path: String) -> Result<Vec<GitStatusEntry>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            // Porcelain format: "XY path" where XY are two status chars.
            let (status_chars, path) = if line.len() >= 3 {
                (line[..2].trim().to_string(), line[3..].to_string())
            } else {
                (line.trim().to_string(), String::new())
            };
            GitStatusEntry {
                path,
                status: status_chars,
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn git_log(
    project_path: String,
    limit: Option<u32>,
) -> Result<Vec<GitCommitEntry>, String> {
    let n = limit.unwrap_or(20).to_string();
    let output = Command::new("git")
        .args(["log", "--format=%H|%s|%an|%ci", "-n", &n])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git log failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() == 4 {
                Some(GitCommitEntry {
                    hash: parts[0].to_string(),
                    message: parts[1].to_string(),
                    author: parts[2].to_string(),
                    date: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn git_stage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    let mut args = vec!["add", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs.iter().copied());

    let output = Command::new("git")
        .args(&args)
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git add failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_commit(project_path: String, message: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&project_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    // Extract the short commit hash from the output line like "[branch abc1234] message"
    let stdout = String::from_utf8_lossy(&output.stdout);
    let hash = parse_commit_hash(&stdout).unwrap_or_else(|| "unknown".to_string());
    Ok(hash)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Parse the short commit hash from `git commit` output.
/// Example line: "[main abc1234] commit message"
fn parse_commit_hash(output: &str) -> Option<String> {
    for line in output.lines() {
        // Look for the "[branch hash]" pattern.
        if let Some(start) = line.find('[') {
            if let Some(end) = line.find(']') {
                let bracket_content = &line[start + 1..end];
                // bracket_content looks like "main abc1234"
                let parts: Vec<&str> = bracket_content.splitn(2, ' ').collect();
                if parts.len() == 2 {
                    return Some(parts[1].trim().to_string());
                }
            }
        }
    }
    None
}
