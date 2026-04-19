// Entry point — command registration only. No logic lives here.

mod config;
mod pty_manager;
mod mcp_server;
mod mcp_tools;
mod mcp_bridge;
mod commands;

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixListener;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Listener};

const IPC_SOCKET_PATH: &str = "/tmp/aiworkspace-ipc.sock";

type PendingMap = Arc<Mutex<HashMap<String, std::sync::mpsc::SyncSender<serde_json::Value>>>>;

fn main() {
    let pty = pty_manager::new_shared();

    tauri::Builder::default()
        .manage(pty)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
            let pending_listener = pending.clone();

            // Route mcp:tool_result events from the React frontend back to waiting socket threads.
            app.handle().listen("mcp:tool_result", move |event| {
                if let Ok(result) =
                    serde_json::from_str::<serde_json::Value>(event.payload())
                {
                    if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                        if let Some(tx) = pending_listener.lock().unwrap().remove(id) {
                            let _ = tx.send(result);
                        }
                    }
                }
            });

            let app_handle = app.handle().clone();
            std::thread::spawn(move || run_ipc_server(app_handle, pending));

            // Browser devtools relay — receives events from the child webview init script
            let relay_handle = app.handle().clone();
            std::thread::spawn(move || commands::browser::run_browser_relay(relay_handle));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::open_project,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::read_workspace_state,
            commands::projects::write_workspace_state,
            commands::projects::read_panel_state,
            commands::projects::write_panel_state,
            commands::terminal::create_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::fs::read_dir_tree,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_file_entry,
            commands::fs::create_dir_entry,
            commands::fs::rename_entry,
            commands::fs::delete_entry,
            commands::fs::reveal_in_finder,
            commands::fs::search_in_files,
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_stage,
            commands::git::git_commit,
            commands::http::load_http_collections,
            commands::http::save_http_collections,
            commands::environment::get_environments,
            commands::environment::set_active_environment,
            commands::environment::resolve_variables,
            commands::settings::get_app_settings,
            commands::settings::save_app_settings,
            commands::browser::browser_open,
            commands::browser::browser_set_bounds,
            commands::browser::browser_close,
            commands::browser::browser_go_back,
            commands::browser::browser_open_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn run_ipc_server(app_handle: tauri::AppHandle, pending: PendingMap) {
    let _ = std::fs::remove_file(IPC_SOCKET_PATH);
    let listener = match UnixListener::bind(IPC_SOCKET_PATH) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[ipc_server] Failed to bind {}: {}", IPC_SOCKET_PATH, e);
            return;
        }
    };
    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            let handle = app_handle.clone();
            let pending = pending.clone();
            std::thread::spawn(move || handle_ipc_connection(stream, handle, pending));
        }
    }
}

fn handle_ipc_connection(
    stream: std::os::unix::net::UnixStream,
    app_handle: tauri::AppHandle,
    pending: PendingMap,
) {
    let writer_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut reader = BufReader::new(stream);
    let mut line = String::new();

    if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
        return;
    }

    let mut command: serde_json::Value = match serde_json::from_str(line.trim()) {
        Ok(v) => v,
        Err(_) => return,
    };

    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    pending.lock().unwrap().insert(id.clone(), tx);

    if let serde_json::Value::Object(ref mut map) = command {
        map.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }

    if app_handle.emit("mcp:tool_call", &command).is_err() {
        pending.lock().unwrap().remove(&id);
        write_ipc_response(writer_stream, serde_json::json!({"ok": false, "error": "emit failed"}));
        return;
    }

    let wrapped = rx
        .recv_timeout(std::time::Duration::from_secs(30))
        .unwrap_or_else(|_| serde_json::json!({"error": "timeout waiting for frontend"}));
    pending.lock().unwrap().remove(&id);

    // Unwrap {id, result?, error?} → just the value the MCP client expects
    let response = if let Some(err) = wrapped.get("error") {
        serde_json::json!({"ok": false, "error": err})
    } else {
        wrapped.get("result").cloned().unwrap_or(serde_json::json!({}))
    };

    write_ipc_response(writer_stream, response);
}

fn write_ipc_response(mut writer: std::os::unix::net::UnixStream, value: serde_json::Value) {
    let s = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string());
    let _ = writer.write_all(s.as_bytes());
    let _ = writer.write_all(b"\n");
    let _ = writer.flush();
}
