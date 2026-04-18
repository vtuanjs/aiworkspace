// MCP JSON-RPC 2.0 server over stdio.
// Receives tool calls from Claude Code, returns results. Stateless.

use std::io::{self, BufRead, Write};

const PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "monocode";
const SERVER_VERSION: &str = "0.1.0";

// JSON-RPC error codes
const ERR_PARSE_ERROR: i64 = -32700;
const ERR_INVALID_REQUEST: i64 = -32600;
const ERR_METHOD_NOT_FOUND: i64 = -32601;
const ERR_INVALID_PARAMS: i64 = -32602;
const ERR_INTERNAL_ERROR: i64 = -32603;

pub fn start() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                // If stdin closes, exit cleanly.
                if e.kind() == io::ErrorKind::UnexpectedEof {
                    break;
                }
                eprintln!("[mcp_server] stdin read error: {}", e);
                break;
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let request: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let response = error_response(
                    serde_json::Value::Null,
                    ERR_PARSE_ERROR,
                    &format!("Parse error: {}", e),
                );
                write_response(&mut out, &response)?;
                continue;
            }
        };

        // Validate JSON-RPC 2.0 envelope.
        if request.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0") {
            let id = request.get("id").cloned().unwrap_or(serde_json::Value::Null);
            let response = error_response(id, ERR_INVALID_REQUEST, "Invalid JSON-RPC version");
            write_response(&mut out, &response)?;
            continue;
        }

        let id = request.get("id").cloned().unwrap_or(serde_json::Value::Null);
        let method = match request.get("method").and_then(|v| v.as_str()) {
            Some(m) => m.to_string(),
            None => {
                let response = error_response(id, ERR_INVALID_REQUEST, "Missing method");
                write_response(&mut out, &response)?;
                continue;
            }
        };
        let params = request
            .get("params")
            .cloned()
            .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

        // Notifications (no "id") do not get a response.
        let is_notification = request.get("id").is_none();

        match method.as_str() {
            "initialize" => {
                if is_notification {
                    continue;
                }
                let result = serde_json::json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": SERVER_NAME,
                        "version": SERVER_VERSION
                    }
                });
                let response = ok_response(id, result);
                write_response(&mut out, &response)?;
            }

            "notifications/initialized" => {
                // Client notification — no response expected.
            }

            "tools/list" => {
                if is_notification {
                    continue;
                }
                let tools = crate::mcp_tools::list_tools();
                let result = serde_json::json!({ "tools": tools });
                let response = ok_response(id, result);
                write_response(&mut out, &response)?;
            }

            "tools/call" => {
                if is_notification {
                    continue;
                }

                let tool_name = match params.get("name").and_then(|v| v.as_str()) {
                    Some(n) => n.to_string(),
                    None => {
                        let response =
                            error_response(id, ERR_INVALID_PARAMS, "Missing params.name");
                        write_response(&mut out, &response)?;
                        continue;
                    }
                };

                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

                let mcp_tool = match name_to_tool(&tool_name) {
                    Some(t) => t,
                    None => {
                        let response = error_response(
                            id,
                            ERR_METHOD_NOT_FOUND,
                            &format!("Unknown tool: {}", tool_name),
                        );
                        write_response(&mut out, &response)?;
                        continue;
                    }
                };

                match crate::mcp_tools::dispatch(mcp_tool, arguments) {
                    Ok(tool_result) => {
                        // MCP tools/call result wraps the output in a content array.
                        let result = serde_json::json!({
                            "content": [
                                {
                                    "type": "text",
                                    "text": serde_json::to_string(&tool_result)
                                        .unwrap_or_else(|_| "{}".to_string())
                                }
                            ]
                        });
                        let response = ok_response(id, result);
                        write_response(&mut out, &response)?;
                    }
                    Err(e) => {
                        let response = error_response(
                            id,
                            ERR_INTERNAL_ERROR,
                            &format!("Tool execution error: {}", e),
                        );
                        write_response(&mut out, &response)?;
                    }
                }
            }

            other => {
                if is_notification {
                    // Unknown notifications are silently ignored per spec.
                    continue;
                }
                let response = error_response(
                    id,
                    ERR_METHOD_NOT_FOUND,
                    &format!("Method not found: {}", other),
                );
                write_response(&mut out, &response)?;
            }
        }
    }

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ok_response(id: serde_json::Value, result: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn error_response(id: serde_json::Value, code: i64, message: &str) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn write_response(out: &mut impl Write, response: &serde_json::Value) -> anyhow::Result<()> {
    let serialized = serde_json::to_string(response)?;
    out.write_all(serialized.as_bytes())?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

/// Map a tool name string back to the McpTool enum variant.
fn name_to_tool(name: &str) -> Option<crate::mcp_tools::McpTool> {
    use crate::mcp_tools::McpTool;
    match name {
        "http_request" => Some(McpTool::HttpRequest),
        "http_get_collections" => Some(McpTool::HttpGetCollections),
        "http_save_to_collection" => Some(McpTool::HttpSaveToCollection),
        "browser_navigate" => Some(McpTool::BrowserNavigate),
        "browser_screenshot" => Some(McpTool::BrowserScreenshot),
        "browser_get_console_logs" => Some(McpTool::BrowserGetConsoleLogs),
        "browser_get_dom" => Some(McpTool::BrowserGetDom),
        "browser_click" => Some(McpTool::BrowserClick),
        "browser_fill" => Some(McpTool::BrowserFill),
        "workspace_get_context" => Some(McpTool::WorkspaceGetContext),
        "db_query" => Some(McpTool::DbQuery),
        "db_list_connections" => Some(McpTool::DbListConnections),
        "db_list_tables" => Some(McpTool::DbListTables),
        "db_describe_table" => Some(McpTool::DbDescribeTable),
        "cache_get" => Some(McpTool::CacheGet),
        "cache_set" => Some(McpTool::CacheSet),
        "cache_keys" => Some(McpTool::CacheKeys),
        "cache_flush" => Some(McpTool::CacheFlush),
        "env_get_variables" => Some(McpTool::EnvGetVariables),
        "env_switch" => Some(McpTool::EnvSwitch),
        "token_capture" => Some(McpTool::TokenCapture),
        "context_push" => Some(McpTool::ContextPush),
        _ => None,
    }
}
