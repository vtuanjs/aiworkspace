use crate::pty_manager::SharedPtyManager;
use tauri::{Emitter, State};

#[tauri::command]
pub fn create_terminal(
    app: tauri::AppHandle,
    pty: State<SharedPtyManager>,
    terminal_id: String,
    project_path: String,
) -> Result<String, String> {
    let session_name = pty
        .lock()
        .unwrap()
        .create(&terminal_id, &project_path)
        .map_err(|e| e.to_string())?;

    // Take the PTY reader and stream its output back to the frontend.
    let mut reader = pty
        .lock()
        .unwrap()
        .take_reader(&terminal_id)
        .map_err(|e| e.to_string())?;

    let tid = terminal_id.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF — PTY closed
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    app.emit(
                        "terminal:output",
                        serde_json::json!({ "terminal_id": &tid, "data": data }),
                    )
                    .ok();
                }
                Err(_) => break,
            }
        }
    });

    Ok(session_name)
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
