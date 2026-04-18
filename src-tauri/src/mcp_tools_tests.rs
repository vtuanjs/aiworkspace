use super::*;

#[test]
fn tool_name_spot_checks() {
    assert_eq!(tool_name(&McpTool::HttpRequest), "http_request");
    assert_eq!(tool_name(&McpTool::BrowserNavigate), "browser_navigate");
    assert_eq!(tool_name(&McpTool::DbQuery), "db_query");
    assert_eq!(tool_name(&McpTool::CacheFlush), "cache_flush");
    assert_eq!(tool_name(&McpTool::EnvSwitch), "env_switch");
    assert_eq!(tool_name(&McpTool::ContextPush), "context_push");
    assert_eq!(tool_name(&McpTool::TokenCapture), "token_capture");
}

#[test]
fn tool_schema_returns_some_for_all_listed_tools() {
    for tool in list_tools() {
        let name = tool["name"].as_str().unwrap();
        assert!(tool_schema(name).is_some(), "missing schema for tool: {}", name);
    }
}

#[test]
fn tool_schema_returns_none_for_unknown_name() {
    assert!(tool_schema("not_a_real_tool").is_none());
    assert!(tool_schema("").is_none());
}

#[test]
fn http_request_schema_requires_method_and_url() {
    let schema = tool_schema("http_request").unwrap();
    let required: Vec<&str> = schema["required"]
        .as_array().unwrap()
        .iter().map(|v| v.as_str().unwrap()).collect();
    assert!(required.contains(&"method"));
    assert!(required.contains(&"url"));
}

#[test]
fn db_query_schema_requires_connection_id_and_sql() {
    let schema = tool_schema("db_query").unwrap();
    let required: Vec<&str> = schema["required"]
        .as_array().unwrap()
        .iter().map(|v| v.as_str().unwrap()).collect();
    assert!(required.contains(&"connection_id"));
    assert!(required.contains(&"sql"));
}

#[test]
fn list_tools_returns_22_entries() {
    assert_eq!(list_tools().len(), 22);
}

#[test]
fn list_tools_entries_have_name_description_and_schema() {
    for tool in list_tools() {
        assert!(tool["name"].is_string(), "tool missing name");
        assert!(tool["description"].is_string(), "tool missing description: {:?}", tool["name"]);
        assert!(tool["inputSchema"].is_object(), "tool missing inputSchema: {:?}", tool["name"]);
    }
}

#[test]
fn list_tools_no_duplicate_names() {
    let tools = list_tools();
    let mut names = std::collections::HashSet::new();
    for tool in &tools {
        let name = tool["name"].as_str().unwrap();
        assert!(names.insert(name), "duplicate tool name: {}", name);
    }
}
