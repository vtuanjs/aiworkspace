# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Run the full app (starts frontend dev server + Tauri)
cd .. && npm run tauri dev

# Build for production
cd .. && npm run tauri build

# Build only the Rust crates (no frontend)
cargo build

# Run Rust tests
cargo test

# Run a single test by name
cargo test <test_name>

# Run only tests in a specific module
cargo test mcp_bridge::tests

# Check for compile errors without building
cargo check
```

## Two Binaries

This crate produces **two separate binaries**:

| Binary | Entry point | Purpose |
|--------|-------------|---------|
| `monocode` | `src/main.rs` | Main Tauri desktop app |
| `monocode-mcp` | `src/mcp_main.rs` | Standalone MCP sidecar; no Tauri — communicates with Claude Code over stdio (JSON-RPC 2.0) |

`lib.rs` re-exports shared modules so both binaries can use them.

## Module Responsibilities

- **`config.rs`** — All `.monocode` JSON reads/writes. No other module does file I/O.
- **`pty_manager.rs`** — Owns all PTY handles (`SharedPtyManager` is Tauri managed state). Uses `portable-pty` + `tmux`. Closing a session drops the PTY but keeps tmux alive.
- **`mcp_server.rs`** — JSON-RPC 2.0 loop over stdio. Routes `tools/list` and `tools/call` to `mcp_tools`.
- **`mcp_tools.rs`** — `McpTool` enum, input schemas, and `dispatch()`. Add new MCP tools here.
- **`mcp_bridge.rs`** — Forwards commands to the main window over a Unix socket (`/tmp/monocode-ipc.sock`). Enforces the destructive-query gate (`is_destructive_query`). Redacts secrets via `redact_secrets`.
- **`commands/`** — Tauri `#[tauri::command]` functions, one file per domain. All `invoke()` calls from the frontend resolve here.

## Adding a New MCP Tool

1. Add a variant to `McpTool` in `mcp_tools.rs`.
2. Add a `tool_name` match arm returning the snake_case name.
3. Add an input schema in `tool_schema`.
4. Add a `dispatch` match arm with the implementation.
5. Add a `name_to_tool` match arm in `mcp_server.rs`.

## Destructive Query Gate

`mcp_bridge::is_destructive_query` blocks `DROP`, `TRUNCATE`, unbounded `DELETE`/`UPDATE`. This is checked before any `db_query` tool executes. The gate is regex-based on uppercased SQL — it is a UX guardrail, not a security boundary.

## Secret Redaction

`mcp_bridge::redact_secrets` recursively walks any outbound JSON and replaces values whose key matches a secret name with `{{KEY_NAME}}`. Call this before returning any variable or environment data to Claude Code.

## IPC Pattern

The MCP sidecar communicates back to the main Tauri window via a Unix domain socket at `/tmp/monocode-ipc.sock`. If the socket is unavailable (main window not running), `forward_to_frontend` returns `{"ok": false, "error": "..."}` — the sidecar must handle this gracefully.

## Config Structs (`config.rs`)

Key types used across modules:

- `ProjectEntry` — project list entry (`~/.monocode/projects.json`)
- `WorkspaceState` — per-project panel state (`.monocode/workspace.json`)
- `Environments` — named env var sets (`.monocode/environments.json`)
- `Secrets` — secret key/value store (never sent to Claude Code)
- `Connections` — DB/cache connection strings (`.monocode/connections.json`)
