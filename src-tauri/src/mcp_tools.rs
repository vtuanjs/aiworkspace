// MCP tool definitions and dispatch.
// Defines name, description, input/output schema for each tool Claude Code sees.

pub enum McpTool {
    HttpRequest,
    HttpGetCollections,
    HttpSaveToCollection,
    BrowserNavigate,
    BrowserScreenshot,
    BrowserGetConsoleLogs,
    BrowserGetDom,
    BrowserClick,
    BrowserFill,
    WorkspaceGetContext,
    DbQuery,
    DbListConnections,
    DbListTables,
    DbDescribeTable,
    CacheGet,
    CacheSet,
    CacheKeys,
    CacheFlush,
    EnvGetVariables,
    EnvSwitch,
    TokenCapture,
    ContextPush,
}

/// Map each McpTool variant to its canonical snake_case name.
pub fn tool_name(tool: &McpTool) -> &'static str {
    match tool {
        McpTool::HttpRequest => "http_request",
        McpTool::HttpGetCollections => "http_get_collections",
        McpTool::HttpSaveToCollection => "http_save_to_collection",
        McpTool::BrowserNavigate => "browser_navigate",
        McpTool::BrowserScreenshot => "browser_screenshot",
        McpTool::BrowserGetConsoleLogs => "browser_get_console_logs",
        McpTool::BrowserGetDom => "browser_get_dom",
        McpTool::BrowserClick => "browser_click",
        McpTool::BrowserFill => "browser_fill",
        McpTool::WorkspaceGetContext => "workspace_get_context",
        McpTool::DbQuery => "db_query",
        McpTool::DbListConnections => "db_list_connections",
        McpTool::DbListTables => "db_list_tables",
        McpTool::DbDescribeTable => "db_describe_table",
        McpTool::CacheGet => "cache_get",
        McpTool::CacheSet => "cache_set",
        McpTool::CacheKeys => "cache_keys",
        McpTool::CacheFlush => "cache_flush",
        McpTool::EnvGetVariables => "env_get_variables",
        McpTool::EnvSwitch => "env_switch",
        McpTool::TokenCapture => "token_capture",
        McpTool::ContextPush => "context_push",
    }
}

/// Return the JSON Schema (input_schema) for a tool by name, or None if unknown.
pub fn tool_schema(name: &str) -> Option<serde_json::Value> {
    let schema = match name {
        "http_request" => serde_json::json!({
            "type": "object",
            "required": ["method", "url"],
            "properties": {
                "method": { "type": "string", "enum": ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"] },
                "url":    { "type": "string", "description": "Full URL to request" },
                "headers": { "type": "object", "additionalProperties": { "type": "string" } },
                "body":   { "type": "string", "description": "Request body (raw)" }
            }
        }),
        "http_get_collections" => serde_json::json!({
            "type": "object",
            "properties": {}
        }),
        "http_save_to_collection" => serde_json::json!({
            "type": "object",
            "required": ["collection_id", "request"],
            "properties": {
                "collection_id": { "type": "string" },
                "request": { "type": "object" }
            }
        }),
        "browser_navigate" => serde_json::json!({
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": { "type": "string", "description": "URL to navigate to" }
            }
        }),
        "browser_screenshot" => serde_json::json!({
            "type": "object",
            "properties": {
                "selector": { "type": "string", "description": "Optional CSS selector to screenshot" }
            }
        }),
        "browser_get_console_logs" => serde_json::json!({
            "type": "object",
            "properties": {
                "level": {
                    "type": "string",
                    "enum": ["all", "log", "warn", "error"],
                    "default": "all"
                }
            }
        }),
        "browser_get_dom" => serde_json::json!({
            "type": "object",
            "properties": {
                "selector": { "type": "string", "description": "Optional CSS selector" }
            }
        }),
        "browser_click" => serde_json::json!({
            "type": "object",
            "required": ["selector"],
            "properties": {
                "selector": { "type": "string" }
            }
        }),
        "browser_fill" => serde_json::json!({
            "type": "object",
            "required": ["selector", "value"],
            "properties": {
                "selector": { "type": "string" },
                "value":    { "type": "string" }
            }
        }),
        "workspace_get_context" => serde_json::json!({
            "type": "object",
            "properties": {}
        }),
        "db_query" => serde_json::json!({
            "type": "object",
            "required": ["connection_id", "sql"],
            "properties": {
                "connection_id": { "type": "string" },
                "sql":           { "type": "string", "description": "SQL query to execute" },
                "params":        { "type": "array",  "items": {} }
            }
        }),
        "db_list_connections" => serde_json::json!({
            "type": "object",
            "properties": {}
        }),
        "db_list_tables" => serde_json::json!({
            "type": "object",
            "required": ["connection_id"],
            "properties": {
                "connection_id": { "type": "string" }
            }
        }),
        "db_describe_table" => serde_json::json!({
            "type": "object",
            "required": ["connection_id", "table"],
            "properties": {
                "connection_id": { "type": "string" },
                "table":         { "type": "string" }
            }
        }),
        "cache_get" => serde_json::json!({
            "type": "object",
            "required": ["connection_id", "key"],
            "properties": {
                "connection_id": { "type": "string" },
                "key":           { "type": "string" }
            }
        }),
        "cache_set" => serde_json::json!({
            "type": "object",
            "required": ["connection_id", "key", "value"],
            "properties": {
                "connection_id": { "type": "string" },
                "key":           { "type": "string" },
                "value":         { "type": "string" },
                "ttl_seconds":   { "type": "integer", "description": "Optional TTL in seconds" }
            }
        }),
        "cache_keys" => serde_json::json!({
            "type": "object",
            "required": ["connection_id"],
            "properties": {
                "connection_id": { "type": "string" },
                "pattern":       { "type": "string", "default": "*" }
            }
        }),
        "cache_flush" => serde_json::json!({
            "type": "object",
            "required": ["connection_id"],
            "properties": {
                "connection_id": { "type": "string" }
            }
        }),
        "env_get_variables" => serde_json::json!({
            "type": "object",
            "properties": {
                "environment": { "type": "string", "description": "Environment name; omit for active" }
            }
        }),
        "env_switch" => serde_json::json!({
            "type": "object",
            "required": ["environment"],
            "properties": {
                "environment": { "type": "string" }
            }
        }),
        "token_capture" => serde_json::json!({
            "type": "object",
            "required": ["name", "value"],
            "properties": {
                "name":  { "type": "string", "description": "Token name / variable key" },
                "value": { "type": "string", "description": "Token value captured at runtime" }
            }
        }),
        "context_push" => serde_json::json!({
            "type": "object",
            "required": ["content"],
            "properties": {
                "content": { "type": "string", "description": "Markdown content to push into Claude Code inbox" },
                "label":   { "type": "string", "description": "Optional human-readable label" }
            }
        }),
        _ => return None,
    };
    Some(schema)
}

/// Description for each tool — used in the tools/list response.
fn tool_description(name: &str) -> &'static str {
    match name {
        "http_request" => "Execute an HTTP request and return status, headers, and body.",
        "http_get_collections" => "Return all saved HTTP request collections for the active project.",
        "http_save_to_collection" => "Save a request to an HTTP collection.",
        "browser_navigate" => "Navigate the embedded browser to a URL.",
        "browser_screenshot" => "Take a screenshot of the current browser page or a CSS-selected element.",
        "browser_get_console_logs" => "Retrieve browser console log entries (log/warn/error).",
        "browser_get_dom" => "Return the DOM HTML of the current page or a CSS-selected subtree.",
        "browser_click" => "Click a DOM element matched by a CSS selector.",
        "browser_fill" => "Fill a form field matched by a CSS selector.",
        "workspace_get_context" => "Return the current workspace state (active panel, open files, browser URL).",
        "db_query" => "Execute a SQL query against a registered database connection.",
        "db_list_connections" => "List registered database connections for the active project.",
        "db_list_tables" => "List tables in a database connection.",
        "db_describe_table" => "Return column definitions for a database table.",
        "cache_get" => "Get a value from a cache (Redis/Memcached) by key.",
        "cache_set" => "Set a key-value pair in a cache with optional TTL.",
        "cache_keys" => "List cache keys matching a glob pattern.",
        "cache_flush" => "Flush all keys from a cache connection (requires confirmation).",
        "env_get_variables" => "Return environment variables for the active (or named) environment.",
        "env_switch" => "Switch the active environment for the project.",
        "token_capture" => "Capture a runtime token (e.g. auth bearer) for variable resolution.",
        "context_push" => "Push context into Claude Code's inbox (.claude/inbox/NNNN.md).",
        _ => "",
    }
}

/// Build the MCP tools/list response array.
pub fn list_tools() -> Vec<serde_json::Value> {
    let names = [
        "http_request",
        "http_get_collections",
        "http_save_to_collection",
        "browser_navigate",
        "browser_screenshot",
        "browser_get_console_logs",
        "browser_get_dom",
        "browser_click",
        "browser_fill",
        "workspace_get_context",
        "db_query",
        "db_list_connections",
        "db_list_tables",
        "db_describe_table",
        "cache_get",
        "cache_set",
        "cache_keys",
        "cache_flush",
        "env_get_variables",
        "env_switch",
        "token_capture",
        "context_push",
    ];

    names
        .iter()
        .map(|&name| {
            serde_json::json!({
                "name": name,
                "description": tool_description(name),
                "inputSchema": tool_schema(name).unwrap_or(serde_json::json!({"type":"object","properties":{}}))
            })
        })
        .collect()
}

#[cfg(test)]
#[path = "mcp_tools_tests.rs"]
mod tests;

/// Dispatch a tool call to the frontend via the IPC bridge.
pub fn dispatch(tool: McpTool, params: serde_json::Value) -> anyhow::Result<serde_json::Value> {
    let name = tool_name(&tool);
    let command = serde_json::json!({
        "tool": name,
        "params": params
    });
    crate::mcp_bridge::forward_to_frontend(command)
}
