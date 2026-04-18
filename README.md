# MonoCode

A Tauri 2 desktop app that wraps Claude Code in a multi-panel workspace — terminal, browser, HTTP client, and database viewer side by side. Its one job: pipe runtime context (console errors, HTTP responses, query results) directly into Claude Code without copy-paste.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| Rust + Cargo | stable | https://rustup.rs |
| tmux | any | `brew install tmux` (macOS) |
| Claude Code | latest | `npm i -g @anthropic-ai/claude-code` |

On macOS you also need Xcode Command Line Tools:

```bash
xcode-select --install
```

## Setup

```bash
# Clone and bootstrap
git clone <repo-url> monocode
cd monocode
bash scripts/setup.sh
```

`setup.sh` installs Rust (if missing) and runs `npm install`. After it completes you are ready to run.

## Run in Development

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and opens the native Tauri window. Hot-reload works for the React frontend; Rust changes require a restart.

**Frontend only** (no native window, useful for UI work):

```bash
npm run dev
# open http://localhost:1420 in your browser
```

## Build for Production

```bash
npm run tauri build
```

The installer / app bundle is written to `src-tauri/target/release/bundle/`.

## Running Tests

**Frontend (Vitest):**

```bash
npm test                                              # watch mode
npx vitest run                                        # single run (CI)
npx vitest run src/lib/sendToClaudeCode.test.ts       # single file
```

**Rust:**

```bash
cd src-tauri
cargo test                        # all tests
cargo test mcp_bridge::tests      # single module
cargo test is_destructive_query   # single test by name
cargo check                       # fast compile check, no output artifacts
```

## How to Use It

1. Launch the app with `npm run tauri dev`.
2. Add a project — click **+** in the left sidebar and point it at any local folder.
3. The terminal panel opens automatically. Start Claude Code there: `claude`.
4. Open the browser, HTTP, or database panels and load your app.
5. When something goes wrong (console error, bad HTTP response), click **Send to Claude Code** — MonoCode formats the context and writes it directly into the Claude Code session.

## Project Layout

```
src/                   React frontend
src-tauri/src/         Rust backend (two binaries — see below)
scripts/setup.sh       One-shot bootstrap
monocode-architecture.md  Full design document
```

The Rust crate produces two binaries:

- **`monocode`** — the Tauri desktop app
- **`monocode-mcp`** — a standalone MCP sidecar that Claude Code connects to over stdio; gives Claude Code direct control of the browser, HTTP, and database panels

## Key Constraints

- No Anthropic API calls — Claude Code is the only AI in the loop.
- All data is stored as plain JSON files on disk (`~/.monocode/` and `<project>/.monocode/`).
- Secrets are never sent to Claude Code — the MCP bridge redacts them.
- tmux keeps terminal sessions alive when you switch between projects.
