# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the full dev stack (Vite + Tauri)
npm run tauri dev

# Frontend only (no Rust, no Tauri shell)
npm run dev

# Type-check + build frontend
npm run build

# Run frontend tests (Vitest)
npm test

# Run a single test file
npx vitest run src/lib/sendToClaudeCode.test.ts
```

Rust side: `cargo build` and `cargo test` run inside `../src-tauri/`.

## Frontend Architecture

The React frontend (`src/`) is a thin Zustand → Tauri bridge. Components never call `invoke()` directly — all side-effectful operations go through store actions.

### Store responsibilities

| Store | Owns |
|-------|------|
| `store/projects.ts` | Project list, active project ID, project CRUD |
| `store/workspace.ts` | Per-project panel state (active panel, open files, terminal ID, browser URL) |
| `store/environment.ts` | Named env sets, runtime tokens, variable resolution |

`switchProject` in `projects.ts` is the only place that orchestrates a full project transition — it saves current workspace, calls `open_project` on the Rust side, then loads the new workspace and environments in parallel.

### The one file that talks to Claude Code

`lib/sendToClaudeCode.ts` is the sole writer to PTY/inbox. It tries MCP first (`write_file` to `.claude/inbox/NNNN.md`) and falls back to `write_terminal` when no MCP session is detected. MCP active state is stored in `localStorage` under `monocode:mcp_active`.

### MCP from the frontend side

`lib/mcpBridge.ts` listens for `mcp:tool_call` Tauri events emitted by the Rust MCP sidecar and dispatches them to store/panel handlers. Results are emitted back as `mcp:tool_result`. `initMcpBridge()` is called once in `App.tsx`.

### Variable resolution order (frontend perspective)

1. Runtime tokens from `environmentStore.runtimeTokens` (captured this session)
2. Active environment plain values from `environmentStore.environments[active]`
3. Project secrets — resolved server-side by `commands/environment.rs`
4. Global secrets — resolved server-side

`lib/resolveVariables.ts` handles client-side substitution for steps 1–2 only. Secrets never reach the frontend.

## Key Conventions

- All status/enum strings must be named constants (`PANEL`, `SEND_TRANSPORT`, etc.) — no inline literals.
- Every non-trivial function needs a sibling `.test.ts` file covering happy path + at least one error case.
- Panels are self-contained — no cross-panel imports.
- The `WorkspaceDiskData` shape (snake_case) is the on-disk JSON format; the Zustand state shape (camelCase) is the in-memory format. The `loadFromDisk`/`saveToDisk` methods in `workspace.ts` handle the translation.
