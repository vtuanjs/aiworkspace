// All .aiworkspace JSON reads and writes go through here.
// No other module performs ad-hoc file I/O.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub color: String,
    pub last_opened: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct WorkspaceState {
    pub active_panel: Option<String>,
    pub browser_url: Option<String>,
    pub open_files: Vec<String>,
    pub active_terminal_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Terminals {
    pub sessions: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Environments {
    pub active: String,
    pub environments: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Secrets {
    pub values: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Connections {
    pub connections: Vec<ConnectionEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionEntry {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub connection_string: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct HttpCollections {
    pub collections: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct DbCollections {
    pub collections: Vec<serde_json::Value>,
}

// ── Path helpers ──────────────────────────────────────────────────────────────

fn aiworkspace_dir() -> anyhow::Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot find home directory"))?;
    Ok(home.join(".aiworkspace"))
}

fn project_aiworkspace_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".aiworkspace")
}

pub fn ensure_dir(path: &Path) -> anyhow::Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> anyhow::Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let data = serde_json::to_string_pretty(value)?;
    fs::write(path, data)?;
    Ok(())
}

#[cfg(unix)]
fn write_secrets_file(path: &Path, data: &str) -> anyhow::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(data.as_bytes())?;
    Ok(())
}

#[cfg(not(unix))]
fn write_secrets_file(path: &Path, data: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    fs::write(path, data)?;
    Ok(())
}

// ── Global projects.json ──────────────────────────────────────────────────────

pub fn read_projects() -> anyhow::Result<Vec<ProjectEntry>> {
    let dir = aiworkspace_dir()?;
    ensure_dir(&dir)?;
    read_json(&dir.join("projects.json"))
}

pub fn write_projects(projects: &[ProjectEntry]) -> anyhow::Result<()> {
    let dir = aiworkspace_dir()?;
    ensure_dir(&dir)?;
    write_json(&dir.join("projects.json"), &projects)
}

// ── Per-project workspace.json ────────────────────────────────────────────────

pub fn read_workspace(project_path: &str) -> anyhow::Result<WorkspaceState> {
    let dir = project_aiworkspace_dir(project_path);
    read_json(&dir.join("workspace.json"))
}

pub fn write_workspace(project_path: &str, state: &WorkspaceState) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path);
    ensure_dir(&dir)?;
    write_json(&dir.join("workspace.json"), state)
}

// ── Per-project terminals.json (gitignored) ───────────────────────────────────

pub fn read_terminals(project_path: &str) -> anyhow::Result<Terminals> {
    let dir = project_aiworkspace_dir(project_path);
    read_json(&dir.join("terminals.json"))
}

pub fn write_terminals(project_path: &str, terminals: &Terminals) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path);
    ensure_dir(&dir)?;
    write_json(&dir.join("terminals.json"), terminals)
}

// ── Per-project environments.json (git-tracked) ───────────────────────────────

pub fn read_environments(project_path: &str) -> anyhow::Result<Environments> {
    let dir = project_aiworkspace_dir(project_path);
    read_json(&dir.join("environments.json"))
}

pub fn write_environments(project_path: &str, env: &Environments) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path);
    ensure_dir(&dir)?;
    write_json(&dir.join("environments.json"), env)
}

// ── Secrets (0600, gitignored) ────────────────────────────────────────────────

pub fn read_project_secrets(project_path: &str) -> anyhow::Result<Secrets> {
    let path = project_aiworkspace_dir(project_path).join("secrets.json");
    if !path.exists() {
        return Ok(Secrets::default());
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

pub fn write_project_secrets(project_path: &str, secrets: &Secrets) -> anyhow::Result<()> {
    let path = project_aiworkspace_dir(project_path).join("secrets.json");
    let data = serde_json::to_string_pretty(secrets)?;
    write_secrets_file(&path, &data)
}

pub fn read_global_secrets() -> anyhow::Result<Secrets> {
    let path = aiworkspace_dir()?.join("secrets.json");
    if !path.exists() {
        return Ok(Secrets::default());
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

pub fn write_global_secrets(secrets: &Secrets) -> anyhow::Result<()> {
    let path = aiworkspace_dir()?.join("secrets.json");
    let data = serde_json::to_string_pretty(secrets)?;
    write_secrets_file(&path, &data)
}

// ── Per-project connections.json (gitignored) ─────────────────────────────────

pub fn read_connections(project_path: &str) -> anyhow::Result<Connections> {
    let dir = project_aiworkspace_dir(project_path);
    read_json(&dir.join("connections.json"))
}

pub fn write_connections(project_path: &str, conns: &Connections) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path);
    ensure_dir(&dir)?;
    write_json(&dir.join("connections.json"), conns)
}

// ── HTTP collections (git-tracked) ────────────────────────────────────────────

pub fn read_http_collections(project_path: &str) -> anyhow::Result<HttpCollections> {
    let dir = project_aiworkspace_dir(project_path).join("http");
    read_json(&dir.join("collections.json"))
}

pub fn write_http_collections(project_path: &str, col: &HttpCollections) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path).join("http");
    ensure_dir(&dir)?;
    write_json(&dir.join("collections.json"), col)
}

// ── DB collections (git-tracked) ──────────────────────────────────────────────

pub fn read_db_collections(project_path: &str) -> anyhow::Result<DbCollections> {
    let dir = project_aiworkspace_dir(project_path).join("db");
    read_json(&dir.join("collections.json"))
}

pub fn write_db_collections(project_path: &str, col: &DbCollections) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path).join("db");
    ensure_dir(&dir)?;
    write_json(&dir.join("collections.json"), col)
}

// ── Project setup ─────────────────────────────────────────────────────────────

pub fn init_project_dir(project_path: &str) -> anyhow::Result<()> {
    let dir = project_aiworkspace_dir(project_path);
    ensure_dir(&dir)?;
    ensure_dir(&dir.join("http"))?;
    ensure_dir(&dir.join("db"))?;

    let gitignore_path = Path::new(project_path).join(".gitignore");
    let gitignore_entries = [
        ".aiworkspace/connections.json",
        ".aiworkspace/terminals.json",
        ".aiworkspace/secrets.json",
        ".claude/mcp.json",
    ];
    let existing = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path)?
    } else {
        String::new()
    };
    let mut additions = String::new();
    for entry in &gitignore_entries {
        if !existing.contains(entry) {
            additions.push_str(entry);
            additions.push('\n');
        }
    }
    if !additions.is_empty() {
        let mut content = existing;
        if !content.ends_with('\n') && !content.is_empty() {
            content.push('\n');
        }
        content.push_str(&additions);
        fs::write(&gitignore_path, content)?;
    }
    Ok(())
}

// ── MCP config (.claude/mcp.json) ────────────────────────────────────────────

pub fn mcp_config_exists(project_path: &str) -> bool {
    Path::new(project_path)
        .join(".claude")
        .join("mcp.json")
        .exists()
}

pub fn write_mcp_config(project_path: &str) -> anyhow::Result<()> {
    let claude_dir = Path::new(project_path).join(".claude");
    ensure_dir(&claude_dir)?;
    let config = serde_json::json!({
        "mcpServers": {
            "aiworkspace": {
                "command": "aiworkspace-mcp",
                "args": ["--project", project_path]
            }
        }
    });
    write_json(&claude_dir.join("mcp.json"), &config)
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
