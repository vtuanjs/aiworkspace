use super::*;
use std::collections::HashMap;

#[test]
fn resolves_from_env_vars() {
    let mut env = HashMap::new();
    env.insert("base_url".to_string(), "http://localhost:3000".to_string());
    let result = resolve_string("{{base_url}}/users", &HashMap::new(), &env, &HashMap::new(), &HashMap::new());
    assert_eq!(result, "http://localhost:3000/users");
}

#[test]
fn runtime_tokens_take_priority() {
    let mut runtime = HashMap::new();
    runtime.insert("token".to_string(), "runtime-value".to_string());
    let mut env = HashMap::new();
    env.insert("token".to_string(), "env-value".to_string());
    let result = resolve_string("{{token}}", &runtime, &env, &HashMap::new(), &HashMap::new());
    assert_eq!(result, "runtime-value");
}

#[test]
fn unresolved_variables_are_left_as_is() {
    let result = resolve_string("{{unknown}}", &HashMap::new(), &HashMap::new(), &HashMap::new(), &HashMap::new());
    assert_eq!(result, "{{unknown}}");
}

#[test]
fn multiple_variables_resolved() {
    let mut env = HashMap::new();
    env.insert("host".to_string(), "example.com".to_string());
    env.insert("port".to_string(), "8080".to_string());
    let result = resolve_string("{{host}}:{{port}}", &HashMap::new(), &env, &HashMap::new(), &HashMap::new());
    assert_eq!(result, "example.com:8080");
}

#[test]
fn project_secrets_used_when_no_runtime_or_env() {
    let mut project_secrets = HashMap::new();
    project_secrets.insert("DB_PASS".to_string(), "secret-val".to_string());
    let result = resolve_string("{{DB_PASS}}", &HashMap::new(), &HashMap::new(), &project_secrets, &HashMap::new());
    assert_eq!(result, "secret-val");
}

#[test]
fn global_secrets_used_as_last_fallback() {
    let mut global_secrets = HashMap::new();
    global_secrets.insert("GLOBAL_KEY".to_string(), "global-val".to_string());
    let result = resolve_string("{{GLOBAL_KEY}}", &HashMap::new(), &HashMap::new(), &HashMap::new(), &global_secrets);
    assert_eq!(result, "global-val");
}

#[test]
fn env_vars_take_priority_over_project_secrets() {
    let mut env = HashMap::new();
    env.insert("KEY".to_string(), "env-val".to_string());
    let mut project_secrets = HashMap::new();
    project_secrets.insert("KEY".to_string(), "secret-val".to_string());
    let result = resolve_string("{{KEY}}", &HashMap::new(), &env, &project_secrets, &HashMap::new());
    assert_eq!(result, "env-val");
}

#[test]
fn project_secrets_take_priority_over_global_secrets() {
    let mut project_secrets = HashMap::new();
    project_secrets.insert("KEY".to_string(), "project-val".to_string());
    let mut global_secrets = HashMap::new();
    global_secrets.insert("KEY".to_string(), "global-val".to_string());
    let result = resolve_string("{{KEY}}", &HashMap::new(), &HashMap::new(), &project_secrets, &global_secrets);
    assert_eq!(result, "project-val");
}

#[test]
fn text_with_no_variables_unchanged() {
    let result = resolve_string("hello world", &HashMap::new(), &HashMap::new(), &HashMap::new(), &HashMap::new());
    assert_eq!(result, "hello world");
}

#[test]
fn empty_string_unchanged() {
    let result = resolve_string("", &HashMap::new(), &HashMap::new(), &HashMap::new(), &HashMap::new());
    assert_eq!(result, "");
}

#[test]
fn partial_braces_left_unchanged() {
    let result = resolve_string("{ not a var }", &HashMap::new(), &HashMap::new(), &HashMap::new(), &HashMap::new());
    assert_eq!(result, "{ not a var }");
}
