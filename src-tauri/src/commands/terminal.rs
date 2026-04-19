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
        use std::sync::mpsc;
        use std::time::Duration;

        let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(256);

        // Reader thread: pushes raw bytes into channel without any emit overhead.
        let mut read_buf = [0u8; 4096];
        std::thread::spawn(move || loop {
            match reader.read(&mut read_buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(read_buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        });

        // Batcher: accumulates chunks for up to 16 ms then emits a single event.
        // This caps Tauri event rate at ~60/s regardless of PTY output volume,
        // preventing WKWebView message-handler bursts that block the JS thread.
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match rx.recv_timeout(Duration::from_millis(16)) {
                Ok(chunk) => {
                    pending.extend_from_slice(&chunk);
                    while let Ok(more) = rx.try_recv() {
                        pending.extend_from_slice(&more);
                    }
                    let data = String::from_utf8_lossy(&pending).to_string();
                    app.emit(
                        "terminal:output",
                        serde_json::json!({ "terminal_id": &tid, "data": data }),
                    )
                    .ok();
                    pending.clear();
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
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
