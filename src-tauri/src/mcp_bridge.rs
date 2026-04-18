// IPC bridge: MCP sidecar <-> main Tauri window.
// Enforces destructive query gate. Redacts secrets from outbound responses.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;

const IPC_SOCKET_PATH: &str = "/tmp/aiworkspace-ipc.sock";

/// Forward a command to the main Tauri window over the Unix socket.
/// Serialises `command` to a single JSON line, writes it to the socket,
/// then reads one JSON response line back.
/// If the socket is not available (MCP sidecar running standalone, or
/// the main process has not started yet) a placeholder "offline" result
/// is returned so the MCP server can still respond gracefully.
pub fn forward_to_frontend(command: serde_json::Value) -> anyhow::Result<serde_json::Value> {
    // Attempt to connect; on failure return a graceful offline response.
    let stream = match UnixStream::connect(IPC_SOCKET_PATH) {
        Ok(s) => s,
        Err(_) => {
            return Ok(serde_json::json!({
                "ok": false,
                "error": "aiworkspace main window is not connected"
            }));
        }
    };

    let mut write_stream = stream.try_clone()?;
    let read_stream = stream;

    // Write the command as a single newline-terminated JSON line.
    let payload = serde_json::to_string(&command)?;
    write_stream.write_all(payload.as_bytes())?;
    write_stream.write_all(b"\n")?;
    write_stream.flush()?;

    // Read one response line.
    let mut reader = BufReader::new(read_stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)?;

    let response: serde_json::Value = serde_json::from_str(response_line.trim())?;
    Ok(response)
}

/// Recursively walk a JSON value and replace any string value whose key
/// appears in `secret_keys` with the placeholder `"{{KEY_NAME}}"`.
pub fn redact_secrets(value: serde_json::Value, secret_keys: &[String]) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let new_map = map
                .into_iter()
                .map(|(k, v)| {
                    if secret_keys.iter().any(|sk| sk == &k) {
                        // Replace the value with a redacted placeholder.
                        let placeholder = format!("{{{{{}}}}}", k);
                        (k, serde_json::Value::String(placeholder))
                    } else {
                        // Recurse into the value for nested objects/arrays.
                        (k, redact_secrets(v, secret_keys))
                    }
                })
                .collect();
            serde_json::Value::Object(new_map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(
                arr.into_iter()
                    .map(|v| redact_secrets(v, secret_keys))
                    .collect(),
            )
        }
        // Primitives (strings, numbers, booleans, null) are returned as-is;
        // only object keys matching secret_keys trigger redaction.
        other => other,
    }
}

pub fn is_destructive_query(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    let has_where = upper.contains("WHERE");

    if upper.starts_with("DROP") || upper.starts_with("TRUNCATE") {
        return true;
    }
    if upper.starts_with("DELETE") && !has_where {
        return true;
    }
    if upper.starts_with("UPDATE") && !has_where {
        return true;
    }
    false
}

#[cfg(test)]
#[path = "mcp_bridge_tests.rs"]
mod tests;
