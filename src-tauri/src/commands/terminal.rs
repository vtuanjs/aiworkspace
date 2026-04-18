use crate::pty_manager::SharedPtyManager;
use tauri::State;

#[tauri::command]
pub fn create_terminal(
    pty: State<SharedPtyManager>,
    terminal_id: String,
    project_path: String,
) -> Result<String, String> {
    pty.lock()
        .unwrap()
        .create(&terminal_id, &project_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_terminal(
    pty: State<SharedPtyManager>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    pty.lock()
        .unwrap()
        .write(&terminal_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_terminal(
    pty: State<SharedPtyManager>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty.lock()
        .unwrap()
        .resize(&terminal_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_terminal(
    pty: State<SharedPtyManager>,
    terminal_id: String,
) -> Result<(), String> {
    pty.lock()
        .unwrap()
        .close(&terminal_id)
        .map_err(|e| e.to_string())
}
