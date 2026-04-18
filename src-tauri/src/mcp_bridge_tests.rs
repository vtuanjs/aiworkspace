use super::*;

#[test]
fn drop_is_destructive() {
    assert!(is_destructive_query("DROP TABLE users"));
}

#[test]
fn delete_without_where_is_destructive() {
    assert!(is_destructive_query("DELETE FROM sessions"));
}

#[test]
fn delete_with_where_is_safe() {
    assert!(!is_destructive_query("DELETE FROM sessions WHERE id = 1"));
}

#[test]
fn update_without_where_is_destructive() {
    assert!(is_destructive_query("UPDATE users SET active = false"));
}

#[test]
fn update_with_where_is_safe() {
    assert!(!is_destructive_query(
        "UPDATE users SET active = false WHERE id = 1"
    ));
}

#[test]
fn select_is_safe() {
    assert!(!is_destructive_query("SELECT * FROM users"));
}

#[test]
fn truncate_is_destructive() {
    assert!(is_destructive_query("TRUNCATE TABLE users"));
}

#[test]
fn lowercase_drop_is_destructive() {
    assert!(is_destructive_query("drop table users"));
}

#[test]
fn drop_with_leading_whitespace_is_destructive() {
    assert!(is_destructive_query("  DROP TABLE users"));
}

#[test]
fn insert_is_safe() {
    assert!(!is_destructive_query("INSERT INTO users (name) VALUES ('bob')"));
}

#[test]
fn lowercase_delete_without_where_is_destructive() {
    assert!(is_destructive_query("delete from sessions"));
}

#[test]
fn lowercase_update_without_where_is_destructive() {
    assert!(is_destructive_query("update users set active = false"));
}

#[test]
fn redact_secrets_replaces_matching_keys() {
    let value = serde_json::json!({
        "db_password": "super-secret",
        "api_key": "also-secret",
        "username": "alice"
    });
    let keys = vec!["db_password".to_string(), "api_key".to_string()];
    let redacted = redact_secrets(value, &keys);
    assert_eq!(redacted["db_password"], "{{db_password}}");
    assert_eq!(redacted["api_key"], "{{api_key}}");
    assert_eq!(redacted["username"], "alice");
}

#[test]
fn redact_secrets_recurses_into_nested_objects() {
    let value = serde_json::json!({
        "outer": {
            "token": "my-token",
            "public": "visible"
        }
    });
    let keys = vec!["token".to_string()];
    let redacted = redact_secrets(value, &keys);
    assert_eq!(redacted["outer"]["token"], "{{token}}");
    assert_eq!(redacted["outer"]["public"], "visible");
}

#[test]
fn redact_secrets_recurses_into_arrays() {
    let value = serde_json::json!([
        { "secret": "hide-me", "safe": "show-me" }
    ]);
    let keys = vec!["secret".to_string()];
    let redacted = redact_secrets(value, &keys);
    assert_eq!(redacted[0]["secret"], "{{secret}}");
    assert_eq!(redacted[0]["safe"], "show-me");
}

#[test]
fn redact_secrets_deeply_nested_array() {
    let value = serde_json::json!({
        "results": [
            {"token": "abc123", "id": 1},
            {"token": "def456", "id": 2}
        ]
    });
    let keys = vec!["token".to_string()];
    let redacted = redact_secrets(value, &keys);
    assert_eq!(redacted["results"][0]["token"], "{{token}}");
    assert_eq!(redacted["results"][1]["token"], "{{token}}");
    assert_eq!(redacted["results"][0]["id"], 1);
}

#[test]
fn redact_secrets_empty_key_list_leaves_all_intact() {
    let value = serde_json::json!({"password": "secret", "user": "alice"});
    let redacted = redact_secrets(value, &[]);
    assert_eq!(redacted["password"], "secret");
    assert_eq!(redacted["user"], "alice");
}
