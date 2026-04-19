# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What AIWorkspaces Is

A Tauri 2 desktop app that wraps Claude Code in a multi-panel workspace. Its sole purpose: close the feedback loop between runtime output (browser errors, HTTP responses, database results) and Claude Code — without copy-paste. Claude Code runs inside the terminal panel; AIWorkspaces feeds it context.

**Not a replacement for Claude Code. Not a general IDE. No Anthropic API calls.**

## Commands

```bash
# Full dev stack (Vite + Tauri)
npm run tauri dev

# Frontend only (no Rust/Tauri)
npm run dev

# Frontend tests (Vitest)
npm test
npx vitest run src/lib/sendToClaudeCode.test.ts   # single file

# Rust (run inside src-tauri/)
cargo check          # fast compile check
cargo test           # all tests
cargo test mcp_bridge::tests   # single module
```

## Architecture Source of Truth

`aiworkspaces-architecture.md` is the design source of truth. Before implementing any feature, read the relevant section. Key question to ask: *does this implementation match the architecture described here?*

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) |
| UI | React 18 + Vite |
| Terminal | xterm.js + portable-pty |
| Session persistence | tmux |
| Editor | Monaco Editor |
| State | Zustand |
| Storage | Plain JSON files (no database) |
| Claude Code integration | MCP (primary) + PTY write (fallback) |

## Project Structure

```
src-tauri/src/
  main.rs              # Entry point + command registration only
  config.rs            # All .aiworkspaces JSON reads/writes
  pty_manager.rs       # Terminal process lifecycle
  mcp_server.rs        # MCP protocol over stdio
  mcp_tools.rs         # MCP tool definitions and dispatch
  mcp_bridge.rs        # IPC bridge: MCP sidecar ↔ main Tauri window
  commands/
    projects.rs        # Open, list, switch projects
    terminal.rs        # Create, write, resize, close PTY
    fs.rs              # Read dir tree, read/write files
    git.rs             # Status, log, stage, commit
    http.rs            # Save/load HTTP collections

src/
  App.tsx              # Root: ProjectList + Workspace
  store/
    projects.ts        # Project list + active project ID
    workspace.ts       # Per-project panel state
    environment.ts     # Named env sets, runtime tokens, variable resolution
  components/
    ProjectList/       # Left sidebar project switcher
    Workspace/         # Right: 4 panels for active project
    panels/
      TerminalPanel/   # Claude Code lives here
      BrowserPanel/    # Embedded browser + console capture
      HttpPanel/       # HTTP client + request log
      DbPanel/         # Database/cache client + query log
      EditorPanel/     # Monaco file viewer/editor
  lib/
    sendToClaudeCode.ts  # THE core integration — only file that writes to PTY
    mcpBridge.ts         # React-side MCP command handler
    httpExecutor.ts      # HTTP request runner used by HttpPanel
    resolveVariables.ts  # Client-side variable substitution (steps 1–2 only)

scripts/setup.sh       # Bootstrap: install Rust, deps, env
```

The Rust crate produces **two binaries**: `aiworkspaces` (Tauri app, `src/main.rs`) and `aiworkspaces-mcp` (standalone MCP sidecar over stdio, `src/mcp_main.rs`). Shared modules are re-exported via `lib.rs`.

## Data Flow (One Direction Only)

```
User action → React component → Zustand store → Tauri invoke → Rust → Filesystem/PTY
```

## Hard Rules for Implementation

- **No component calls Tauri directly** — all `invoke()` calls go through Zustand store actions
- **No AI API calls anywhere** — Claude Code is the only AI; do not call Anthropic API
- **Panels are self-contained** — a panel must not import from another panel folder
- **`sendToClaudeCode.ts` is the only file that writes to PTY** — no other file does this
- **All config I/O through `config.rs`** — no ad-hoc file operations in other Rust modules
- **`projects.ts` = which projects exist; `workspace.ts` = per-project state** — never mix

## Storage Layout

```
~/.aiworkspaces/
  projects.json              # [{id, name, path, color, lastOpened}]
  secrets.json               # Global secrets — gitignored

<each-project>/.aiworkspaces/
  workspace.json             # activePanel, browserUrl, openFiles
  environments.json          # Named env var sets — git-tracked
  terminals.json             # tmux session names — gitignored
  connections.json           # DB connection strings — gitignored
  secrets.json               # Project secrets — gitignored
  http/
    collections.json         # Saved requests — git-tracked
    history.json             # Request log — gitignored
  db/
    collections.json         # Saved queries — git-tracked
    history.json             # Query log — gitignored
```

## Send to Claude Code

Primary transport is MCP `context_push` (writes to `.claude/inbox/NNNN.md`, emits MCP notification). PTY write is the fallback when no MCP session is detected — prepended with `——— AIWorkspaces context ———` marker.

```typescript
// lib/sendToClaudeCode.ts — core pattern
export async function sendToClaudeCode(context: WorkspaceContext) {
  const message = formatContext(context);
  await invoke("write_terminal", { terminalId: activeTerminalId, data: message });
}
```

## MCP Integration

AIWorkspaces starts a local MCP sidecar on launch and writes `.claude/mcp.json` automatically when a project is opened. Claude Code then drives browser, HTTP, and database panels autonomously.

Key MCP tools: `http_request`, `browser_navigate`, `browser_get_console_logs`, `browser_screenshot`, `db_query`, `db_describe_table`, `cache_get/set/flush`, `env_get_variables`, `env_switch`.

**Destructive query gate (enforced in `mcp_bridge.rs`, cannot be bypassed):**
- `UPDATE`/`DELETE` without `WHERE` → requires confirmation
- `DROP`, `TRUNCATE` → always requires confirmation
- `cache_flush` → always requires confirmation
- Developer-initiated queries in the editor are not gated

## Variable Resolution Order

```
1. Runtime tokens (captured this session — highest priority)
2. Active environment plain values (.aiworkspaces/environments.json)
3. Project secrets (.aiworkspaces/secrets.json)
4. Global secrets (~/.aiworkspaces/secrets.json)
```

Claude Code never receives secret values — MCP bridge redacts them as `{{SECRET_NAME}}`.

## Build Priority

| Priority | Component |
|----------|-----------|
| P0 | Project switching, Terminal panel, `sendToClaudeCode.ts` |
| P0 | MCP server + tools + bridge |
| P1 | Browser panel + console capture |
| P1 | HTTP panel + request executor + log |
| P1 | DB/cache panel + query executor + log |
| P2 | Monaco editor panel |
| P3 | Git panel |
| Do not build | AI chat panel, agent pipelines, full database client |

## Project Switching

Must complete in under 200ms. Flow:
1. Save current `workspace.json` to disk
2. Load new `workspace.json` from disk
3. Update Zustand store → triggers re-render
4. Terminal PTY stays alive in tmux — not killed, just hidden

## Key Risks to Keep in Mind

- **R1**: PTY stdin injection can interleave with Claude Code output → use MCP as primary transport
- **R2**: SQL regex gate is a UX speed bump, not a security boundary → require read-only DB credentials by default for MCP connections
- **R3**: Secrets can leak via MCP responses → outbound redactor in `mcp_bridge.rs`
- **R4**: tmux doesn't work on Windows → decide support explicitly before shipping
- **R5**: `.claude/mcp.json` auto-write can surprise teams → prompt on first open, respect existing config

## Security Model

- Browser panel runs in a separate WebView partition with IPC disabled
- Origin check on every Tauri `invoke()` from WebView content
- Secrets never logged, screenshotted, or sent to Claude Code
- MCP bridge strips secrets before returning any variable list to Claude Code
