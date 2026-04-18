use super::*;
use std::collections::HashMap;

fn tmp_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().to_str().unwrap().to_string();
    (dir, path)
}

#[test]
fn read_missing_projects_returns_default() {
    assert!(read_projects().is_ok());
}

#[test]
fn workspace_round_trip() {
    let (_dir, path) = tmp_path();
    let state = WorkspaceState {
        active_panel: Some("terminal".to_string()),
        browser_url: Some("http://localhost:3000".to_string()),
        open_files: vec!["src/main.rs".to_string()],
        active_terminal_id: Some("term-1".to_string()),
    };
    write_workspace(&path, &state).unwrap();
    let loaded = read_workspace(&path).unwrap();
    assert_eq!(loaded.active_panel.as_deref(), Some("terminal"));
    assert_eq!(loaded.browser_url.as_deref(), Some("http://localhost:3000"));
    assert_eq!(loaded.open_files, vec!["src/main.rs"]);
    assert_eq!(loaded.active_terminal_id.as_deref(), Some("term-1"));
}

#[test]
fn read_missing_workspace_returns_default() {
    let (_dir, path) = tmp_path();
    let state = read_workspace(&path).unwrap();
    assert!(state.active_panel.is_none());
    assert!(state.open_files.is_empty());
}

#[test]
fn environments_round_trip() {
    let (_dir, path) = tmp_path();
    let mut vars = HashMap::new();
    vars.insert("API_URL".to_string(), "https://staging.example.com".to_string());
    let mut envs = Environments {
        active: "staging".to_string(),
        environments: HashMap::new(),
    };
    envs.environments.insert("staging".to_string(), vars);
    write_environments(&path, &envs).unwrap();
    let loaded = read_environments(&path).unwrap();
    assert_eq!(loaded.active, "staging");
    assert_eq!(loaded.environments["staging"]["API_URL"], "https://staging.example.com");
}

#[test]
fn connections_round_trip() {
    let (_dir, path) = tmp_path();
    let conn = ConnectionEntry {
        id: "c1".to_string(),
        name: "local-pg".to_string(),
        kind: "postgres".to_string(),
        connection_string: "postgres://localhost/dev".to_string(),
    };
    let conns = Connections { connections: vec![conn] };
    write_connections(&path, &conns).unwrap();
    let loaded = read_connections(&path).unwrap();
    assert_eq!(loaded.connections.len(), 1);
    assert_eq!(loaded.connections[0].id, "c1");
    assert_eq!(loaded.connections[0].kind, "postgres");
}

#[test]
fn http_collections_round_trip() {
    let (_dir, path) = tmp_path();
    let col = HttpCollections {
        collections: vec![serde_json::json!({"id": "col1", "name": "Auth"})],
    };
    write_http_collections(&path, &col).unwrap();
    let loaded = read_http_collections(&path).unwrap();
    assert_eq!(loaded.collections.len(), 1);
    assert_eq!(loaded.collections[0]["id"], "col1");
}

#[test]
fn db_collections_round_trip() {
    let (_dir, path) = tmp_path();
    let col = DbCollections {
        collections: vec![serde_json::json!({"id": "q1", "name": "List users"})],
    };
    write_db_collections(&path, &col).unwrap();
    let loaded = read_db_collections(&path).unwrap();
    assert_eq!(loaded.collections.len(), 1);
    assert_eq!(loaded.collections[0]["name"], "List users");
}

#[test]
fn terminals_round_trip() {
    let (_dir, path) = tmp_path();
    let mut t = Terminals::default();
    t.sessions.insert("term-1".to_string(), "tmux-abc".to_string());
    write_terminals(&path, &t).unwrap();
    let loaded = read_terminals(&path).unwrap();
    assert_eq!(loaded.sessions["term-1"], "tmux-abc");
}

#[test]
fn project_secrets_round_trip() {
    let (_dir, path) = tmp_path();
    let mut secrets = Secrets::default();
    secrets.values.insert("DB_PASS".to_string(), "hunter2".to_string());
    write_project_secrets(&path, &secrets).unwrap();
    let loaded = read_project_secrets(&path).unwrap();
    assert_eq!(loaded.values["DB_PASS"], "hunter2");
}

#[test]
fn read_missing_project_secrets_returns_default() {
    let (_dir, path) = tmp_path();
    let loaded = read_project_secrets(&path).unwrap();
    assert!(loaded.values.is_empty());
}

#[test]
fn init_project_dir_creates_expected_subdirs() {
    let (_dir, path) = tmp_path();
    init_project_dir(&path).unwrap();
    let base = std::path::Path::new(&path).join(".monocode");
    assert!(base.exists());
    assert!(base.join("http").exists());
    assert!(base.join("db").exists());
}

#[test]
fn init_project_dir_writes_gitignore_entries() {
    let (_dir, path) = tmp_path();
    init_project_dir(&path).unwrap();
    let gitignore = std::fs::read_to_string(
        std::path::Path::new(&path).join(".gitignore")
    ).unwrap();
    assert!(gitignore.contains(".monocode/connections.json"));
    assert!(gitignore.contains(".monocode/terminals.json"));
    assert!(gitignore.contains(".monocode/secrets.json"));
    assert!(gitignore.contains(".claude/mcp.json"));
}

#[test]
fn init_project_dir_does_not_duplicate_gitignore_entries() {
    let (_dir, path) = tmp_path();
    init_project_dir(&path).unwrap();
    init_project_dir(&path).unwrap();
    let gitignore = std::fs::read_to_string(
        std::path::Path::new(&path).join(".gitignore")
    ).unwrap();
    assert_eq!(gitignore.matches(".monocode/connections.json").count(), 1);
}

#[test]
fn mcp_config_exists_false_when_absent() {
    let (_dir, path) = tmp_path();
    assert!(!mcp_config_exists(&path));
}

#[test]
fn write_mcp_config_creates_valid_json() {
    let (_dir, path) = tmp_path();
    write_mcp_config(&path).unwrap();
    assert!(mcp_config_exists(&path));
    let content = std::fs::read_to_string(
        std::path::Path::new(&path).join(".claude/mcp.json")
    ).unwrap();
    let json: serde_json::Value = serde_json::from_str(&content).unwrap();
    assert_eq!(json["mcpServers"]["monocode"]["command"], "monocode-mcp");
}
