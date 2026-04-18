# ▦ MONOCODE

**Architecture & Design Document**

*One window. Claude Code. Every tool you need.*

Version 1.0 · April 2026

# 1. Purpose & Problem Statement

MonoCode is a self-hosted, open-source desktop application that wraps Claude Code in a productive multi-panel environment. It is not an AI coding assistant — Claude Code already does that job. It is the shell that makes Claude Code faster by closing the feedback loop between code edits and runtime output.

> **Problem:**  Claude Code edits your code, it works blind on the runtime side. It cannot see browser console errors, HTTP response failures, or live UI rendering. The developer must manually copy-paste errors between Chrome DevTools, the terminal, and Claude Code — an interruption that happens 20–40 times per day.

> **Solution:** One workspace window with an embedded browser, HTTP client, and terminal side by side. A single "Send to Claude Code" action pipes runtime context directly into the active Claude Code session — no copy-paste, no context switching.

## What this is NOT

- Not a replacement for Claude Code — Claude Code runs inside our terminal panel

- Not an AI chat interface — we do not call the Anthropic API directly

- Not a general IDE — VS Code is better for pure editing; we complement it

- Not a cloud product — everything runs locally, all data stays on disk as plain files

# 2. Core Features

## 2.1 Multi-Project Workspace

Projects are the top-level concept in the application. Each project maps to a folder on disk and has a fully isolated workspace: its own terminal sessions, browser URL, HTTP collections, and editor state. Switching projects is instant — it swaps the entire workspace state without killing background processes.

**Feature**
| **Behavior** | **Why** |
| --- | --- | --- |
| Project list | Left sidebar, always visible | Switch context without losing anything |
| Isolated terminal | Separate tmux session per project | Claude Code runs per-project, never bleeds across |
| Isolated browser | Remembers last URL per project | Frontend dev on port 3000, API on port 8080 simultaneously |
| Isolated HTTP | Separate collection per project | API calls organized by project, not globally |
| Background persistence | tmux keeps terminal alive when switching | Claude Code keeps working in background projects |

## 2.2 Send to Claude Code — The Core Integration

This is the single most important feature. It is the reason this application exists. Every other panel exists to produce context that gets sent here.

**From Browser Panel**
- Console errors (JS exceptions, network failures)
- Current URL and page title
- Screenshot with annotation
- One click → formatted message written into Claude Code terminal

**From HTTP Panel**
- Full request (method, URL, headers, body)
- Full response (status, headers, body)
- Response time
- One click → formatted message written into Claude Code terminal


> **How it works technically:** The Send to Claude Code button writes a formatted string directly into the active PTY session via the pty_manager. Claude Code reads it as terminal input — the same as if the developer had typed or pasted it. No API calls, no plugins, no special Claude Code integration needed.

## 2.3 Terminal Panel

The terminal panel hosts Claude Code. It is built on xterm.js (the same terminal engine VS Code uses) with PTY processes managed by the Rust backend via the portable-pty crate. Multiple terminal tabs are supported per project. Sessions persist across app restarts via tmux — Claude Code keeps running even when the app is closed.

## 2.4 Embedded Browser

An embedded WebView panel that previews the running application. The key capability beyond a basic iframe is console log capture: JavaScript errors and network failures are intercepted and displayed in a sidebar, with a Send to Claude Code button next to each one. The browser also remembers its URL per project.

## 2.5 HTTP Client

A Postman-equivalent HTTP client with four surfaces: a request editor, a collections sidebar, a history list, and a query log. Requests support environment variables ({{base_url}}, {{auth_token}}) that resolve from the active environment at fire time. Collections are git-tracked and shareable. History persists across restarts but is gitignored.

| **Surface** | **Purpose** | **Who uses it** |
| --- | --- | --- |
| Request editor | Build and fire requests manually | Developer |
| Collection sidebar | Save and reload named requests | Developer + Claude Code (read) |
| Request log | Full history of all requests this session with source label | Developer observes Claude Code's requests in real time |

> **Design principle:** Claude Code and the developer share the same HTTP executor. A request fired by Claude Code via MCP appears in the panel identically to one the developer fired manually — except for a small [Claude Code] label. This gives the developer full observability into what Claude Code is testing.

## 2.6 Database & Cache Panel

A unified panel for querying relational databases (PostgreSQL, MySQL), document stores (MongoDB), and cache layers (Redis, Valkey). Queries support environment variables ({{db_host}}, {{db_name}}) resolved from the active environment. Like the HTTP client, it has a query editor, collections, persistent history, and a query log — all sharing the same environment and secret resolution system.

> **Safety gate:** Claude Code is never allowed to execute destructive queries (DROP, DELETE without WHERE, TRUNCATE, UPDATE without WHERE) autonomously. MonoCode detects these patterns and surfaces a confirmation dialog to the developer before executing. This rule is enforced in the MCP bridge layer — Claude Code cannot bypass it.

## 2.7 Editor Panel (Monaco)

A Monaco-based code editor for quick file viewing and editing alongside the terminal. This is deliberately not a full IDE replacement — its purpose is to let the developer read the file Claude Code just edited without leaving the workspace. VS Code remains the primary editor for serious editing work.

# 3. Architecture

## 3.1 Technology Choices

| **Layer** | **Technology** | **Reason** |
| --- | --- | --- |
| Desktop shell | Tauri 2 (Rust) | Native OS APIs, 10× smaller binary than Electron, handles PTY reliably |
| UI framework | React 18 + Vite | Component model for panels, fast HMR in development |
| Editor | Monaco Editor | Same engine as VS Code, MIT licensed, handles all languages |
| Terminal | xterm.js + portable-pty | Full PTY support, same terminal as VS Code |
| Session persistence | tmux | Terminals survive app restarts, background projects stay alive |
| State management | Zustand | Lightweight, no boilerplate, per-slice persistence |
| Storage | Plain JSON files | No database. Git-friendly. Human-readable. VS Code does the same. |

## 3.2 Project Structure

The structure follows one rule: one concern, one place. Any developer opening the repo should understand the layout in under two minutes.

```
monocode/
├── src-tauri/                   # Rust — OS, PTY, filesystem only
│   └── src/
│       ├── main.rs              # Entry point, command registration only
│       ├── config.rs            # Read/write .monocode JSON files
│       ├── pty_manager.rs       # Terminal process lifecycle
│       └── commands/
│           ├── projects.rs      # Open, list, switch projects
│           ├── terminal.rs      # Create, write, resize, close PTY
│           ├── fs.rs            # Read dir tree, read/write files
│           ├── git.rs           # Status, log, stage, commit
│           └── http.rs          # Save/load HTTP collections
│
├── src/                         # React — UI only
│   ├── App.tsx                  # Root: ProjectList + Workspace
│   ├── store/
│   │   ├── projects.ts          # Project list, active project ID
│   │   └── workspace.ts         # Per-project panel state
│   ├── components/
│   │   ├── ProjectList/         # Left sidebar — project switcher
│   │   ├── Workspace/           # Right — 4 panels for active project
│   │   └── panels/
│   │       ├── TerminalPanel/   # Claude Code lives here
│   │       ├── BrowserPanel/    # Embedded browser + Send to CC
│   │       ├── HttpPanel/       # HTTP client + Send to CC
│   │       └── EditorPanel/     # Monaco file viewer/editor
│   └── lib/
│       └── sendToClaudeCode.ts  # Core integration — pipes to PTY
│
└── scripts/setup.sh             # Bootstrap: Rust, deps, .env
```

## 3.3 Data Flow

Data flows in one direction only. No component calls Tauri directly. No store calls components. No Rust layer knows about UI state.

```
User action (click, keypress)
    ↓
React component (panels/)
    ↓
Zustand store (projects.ts / workspace.ts)
    ↓
Tauri invoke (commands/)
    ↓
Rust (config.rs / pty_manager.rs)
    ↓
Filesystem (.monocode/*.json) or PTY process
```
## 3.4 Storage — No Database

The application uses plain JSON files, identical to how VS Code stores its state. There is no SQLite, no embedded database, no migration system to maintain.

```
~/.monocode/
├── projects.json              # [{id, name, path, color, lastOpened}]
└── secrets.json               # global personal secrets (gitignored)

<each-project>/.monocode/
├── workspace.json             # activePanel, browserUrl, openFiles
├── terminals.json             # tmux session names          [gitignored]
├── connections.json           # DB connection strings        [gitignored]
├── secrets.json               # project secrets              [gitignored]
├── environments.json          # env variable sets            [git-tracked]
├── http/
│   ├── collections.json       # saved + named requests       [git-tracked]
│   └── history.json           # all requests ever fired      [gitignored]
└── db/
    ├── collections.json       # saved + named queries        [git-tracked]
    └── history.json           # all queries ever fired       [gitignored]
```

> **Sharing model:** environments.json and collections.json are git-tracked — commit them and teammates get the full request/query library and environment structure automatically. secrets.json is always gitignored — each developer supplies their own values locally. This is the .env + .env.example pattern built into MonoCode.

> **Why no database?** None of this data is relational. There are no joins, no complex queries, no transactions. JSON files are diffable, portable, human-readable, and require zero infrastructure. VS Code uses the same approach.

# 4. Send to Claude Code — Design Detail

This feature is the reason the application exists. The design must be simple enough that a developer uses it reflexively, without thinking.

## 4.1 What it sends

| **Source** | **Content sent to Claude Code** | **Format** |
| --- | --- | --- |
| Browser — JS error | Error message, stack trace, URL, line number | Fenced code block with context |
| Browser — Network fail | URL, method, status code, response body | Structured text |
| Browser — Screenshot | Annotated PNG + URL description | Image path + description |
| HTTP — Response | Method, URL, status, headers, body, time | Structured text |
| HTTP — Error | Full request + error response | Structured text |

## 4.2 How it writes to Claude Code

The sendToClaudeCode function writes directly into the active terminal PTY session. It does not use the Anthropic API. It does not require any Claude Code plugin or extension. It works because Claude Code reads from stdin like any CLI tool.

```typescript
// lib/sendToClaudeCode.ts
export async function sendToClaudeCode(context: WorkspaceContext) {
  const message = formatContext(context);
  // Write into the active PTY session — same as typing in the terminal
  await invoke("write_terminal", {
    terminalId: activeTerminalId,
    data: message,
  });
}

function formatContext(ctx: WorkspaceContext): string {
  // Produces a clean, structured message Claude Code can act on
  // Example output:
  // "Browser error at http://localhost:3000/dashboard:
  //  TypeError: Cannot read property 'map' of undefined
  //  at Dashboard.tsx:42"
}
```

## 4.3 UX requirement

- One click only — no confirmation dialog, no modal

- Button visible immediately when an error appears in browser console

- Button visible on every HTTP response in the response viewer

- After sending, terminal panel scrolls into view automatically

- Visual confirmation: button flashes green for 1 second after send

# 5. Multi-Project Design Detail

## 5.1 Project switching

When the user clicks a project in the sidebar, the application saves the current project state to disk, loads the new project state from disk, and swaps all four panels simultaneously. The switch must complete in under 200ms to feel instant.

```
switchProject(newProjectId):
  1. Save current workspace state → <current>/.monocode/workspace.json
  2. Load new workspace state    ← <new>/.monocode/workspace.json
  3. Update Zustand store        → triggers React re-render
  4. Panels read from store      → each panel restores its last state
  (Terminal PTY stays alive in tmux — not killed, just hidden)
```

## 5.2 Project state isolation

| **State** | **Where stored** | **Survives switch?** | **Survives restart?** |
| --- | --- | --- | --- |
| Terminal session | tmux (OS process) | Yes — runs in background | Yes — tmux persists |
| Browser URL | workspace.json | Yes — restored on switch back | Yes |
| Open files | workspace.json | Yes — restored on switch back | Yes |
| HTTP collections | http/collections.json | Yes — per project | Yes |
| Active panel | workspace.json | Yes — restored on switch back | Yes |

## 5.3 Adding a project

- User clicks + in the project list sidebar

- Tauri opens native folder picker dialog

- Selected folder path added to ~/.monocode/projects.json

- .monocode/ directory created inside the project folder

- .gitignore updated automatically to exclude connections.json and terminals.json

- Project immediately selected and workspace loads

# 6. Build Priority

Claude Code already handles: code generation, multi-file edits, git operations, terminal commands, and debugging via text. Build only what Claude Code cannot do.

| **Component** | **Priority** | **Reason** |
| --- | --- | --- |
| Project list + switching | P0 — build first | Core concept, everything else depends on it |
| Terminal panel (xterm.js) | P0 — build first | Claude Code needs a home |
| sendToClaudeCode.ts | P0 — build first | The reason the app exists |
| Browser panel + console capture | P1 | Most common debug loop: UI error → Claude Code |
| HTTP panel + Send to CC | P1 | Second most common: API error → Claude Code |
| DB & cache panel + Send to CC | P1 | Third most common debug loop: data bug → Claude Code |
| Monaco editor panel | P2 | Useful but VS Code covers this; lower urgency |
| Git panel | P3 | Claude Code handles git via terminal; visual layer is nice-to-have |
| AI chat panel | Do not build | Claude Code is the AI; do not duplicate it |
| Agent pipelines | Do not build | Out of scope; Claude Code handles multi-step workflows |
| Database client | Do not build | Separate tool; not part of the core feedback loop |

# 7. Guidance for AI-Assisted Implementation

This document is the source of truth. When using an AI coding assistant to implement components, provide this document as context alongside the relevant section. The AI should ask: does this implementation match the architecture described here?

## Key rules to enforce during implementation

- No component calls Tauri (invoke) directly — all Tauri calls go through the Zustand store actions

- No AI API calls anywhere in the codebase — the only AI is Claude Code in the terminal

- Each panel folder is self-contained — a panel must not import from another panel folder

- sendToClaudeCode.ts is the only file that writes to the PTY — no other file does this

- All config reads/writes go through config.rs — no ad-hoc file operations in other Rust modules

- projects.ts store = which projects exist. workspace.ts store = what each project looks like. Never mix these.

## Questions to ask before implementing any feature

- Does Claude Code already handle this? If yes, do not build it.

- Does this help close the feedback loop between runtime output and Claude Code? If no, defer it.

- Where does the data live? Does it go in ~/.monocode or <project>/.monocode?

- Which store slice owns this state? projects.ts or workspace.ts?

> **Reminder:** The goal is a lean, maintainable shell. Every feature added is a feature that must be maintained forever. When in doubt, do not add it.

# 8. MCP Integration — Claude Code Controls MonoCode

MCP (Model Context Protocol) is an open standard that lets Claude Code call custom tools. MonoCode ships a local MCP server that exposes the browser and HTTP client as tools Claude Code can drive autonomously. This is MonoCode's strongest differentiator.

> **Shift in mental model:** Without MCP: developer sees an error, clicks Send to Claude Code, Claude Code fixes it. With MCP: Claude Code navigates the browser itself, reads console errors itself, fires HTTP requests itself — and fixes issues without waiting for the developer to feed it context.

## 8.1 Architecture

MonoCode starts a local MCP server as a Tauri sidecar process on launch. Claude Code connects to it via a .claude/mcp.json config file that MonoCode writes automatically when a project is opened. All communication is over stdio — no network port, no authentication needed.

```
Claude Code (terminal)
    ↓  calls MCP tool
MonoCode MCP Server  (sidecar process, stdio)
    ↓  sends command via Tauri IPC
Tauri backend (Rust)
    ↓  controls panel state
Browser Panel  /  HTTP Panel
    ↓  returns result
MCP Server  →  Claude Code
```
## 8.2 MCP Tools

These are the tools MonoCode exposes to Claude Code. Each tool maps directly to a panel action the developer would otherwise do manually.

| **Tool** | **Parameters** | **Returns** | **Panel** |
| --- | --- | --- | --- |
| http_request | method, url, headers, body | status, headers, body, time_ms | HTTP Client — appears in request log |
| http_get_collections | — | saved collections for active project | HTTP Client |
| http_save_to_collection | name, request | success bool | HTTP Client — saves a request Claude Code found useful |
| browser_navigate | url | final_url, page_title | Browser |
| browser_screenshot | selector? (optional) | base64 PNG | Browser |
| browser_get_console_logs | since? (timestamp) | array of {level, message, source, line} | Browser |
| browser_get_dom | selector? (optional) | HTML string of page or element | Browser |
| browser_click | selector | success bool, error? | Browser |
| browser_fill | selector, value | success bool, error? | Browser |
| workspace_get_context | — | active file, open files, project path | Editor |
| db_query | connection_id, sql, params? | rows, row_count, execution_time_ms | DB Panel — appears in query log |
| db_list_connections | — | saved connections for active project | DB Panel |
| db_list_tables | connection_id | table names + row counts | DB Panel |
| db_describe_table | connection_id, table | columns, types, indexes, constraints | DB Panel |
| cache_get | connection_id, key | value, ttl_remaining | DB Panel |
| cache_set | connection_id, key, value, ttl? | success bool | DB Panel |
| cache_keys | connection_id, pattern? | matching keys | DB Panel |
| cache_flush | connection_id, pattern? | keys_deleted count | DB Panel — requires confirmation |
| env_get_variables | environment? | all non-secret variables for active env | Environment system |
| env_switch | environment_name | success, new active environment | Environment system |
| token_capture | variable_name, value, ttl? | success bool | Environment system — stores runtime token |

## 8.3 Project Auto-Configuration

When a project is opened in MonoCode, the application automatically writes a .claude/mcp.json file into the project root. This means Claude Code connects to MonoCode with zero manual setup from the developer.

```json
// Written to <project>/.claude/mcp.json automatically on project open
{
  "mcpServers": {
    "monocode": {
      "command": "monocode-mcp",
      "args": ["--project", "/path/to/project", "--port", "auto"]
    }
  }
}
```

> **Gitignore:** `.claude`/mcp.json is added to .gitignore automatically — it contains machine-specific paths and should not be committed.

## 8.4 Example Claude Code Sessions

### Debugging a UI error

```
> fix the dashboard crash
Claude Code:
  1. calls browser_navigate({ url: "localhost:3000/dashboard" })
  2. calls browser_get_console_logs()
     → TypeError: Cannot read property 'map' of undefined at Dashboard.tsx:42
  3. reads Dashboard.tsx line 42
  4. fixes the null check
  5. calls browser_screenshot() to verify the fix
  Done — no developer copy-paste involved
```
### Debugging an API failure

```
> the user creation endpoint is broken
Claude Code:
  1. calls http_request({ method: "POST", url: "localhost:3000/api/users",
       body: { name: "", email: "test@test.com" } })
     → 422 { "error": "name is required" }
  2. checks the validation schema in the codebase
  3. finds the frontend is not validating before submit
  4. fixes the frontend form validation
  5. calls http_request() again to verify
     → 201 { "id": "abc123", "name": "..." }
  Done — Claude Code found and fixed the root cause autonomously
```
## 8.5 Implementation

The MCP server is a separate Rust binary that ships alongside the main MonoCode app. It communicates with the main Tauri process via a local Unix socket (or named pipe on Windows).

```
src-tauri/
└── src/
    ├── mcp_server.rs        # MCP protocol handler (stdio)
    ├── mcp_tools.rs         # Tool definitions and dispatch
    └── mcp_bridge.rs        # IPC bridge to main Tauri window

src/
└── lib/
    └── mcpBridge.ts         # Receives tool commands, updates panel state
```

| **File** | **Responsibility** |
| --- | --- |
| mcp_server.rs | Speaks the MCP protocol over stdio. Receives tool calls from Claude Code, returns results. Stateless. |
| mcp_tools.rs | Defines each tool: name, description, input schema, output schema. This is what Claude Code sees when it lists available tools. |
| mcp_bridge.rs | IPC bridge between the MCP sidecar and the main Tauri window. Forwards commands to the browser/HTTP panels and returns results. |
| mcpBridge.ts | React-side handler. Listens for MCP commands from Rust via Tauri events, executes them against panel state (navigate browser, fire HTTP, capture screenshot), returns results. |

## 8.6 Send to Claude Code vs MCP — When to use each

Both mechanisms coexist. They serve different situations.

Unified routing model. Both mechanisms share a single transport underneath: an MCP tool called context_push. Send to Claude Code and autonomous MCP calls differ only in who initiates them (developer vs. Claude Code) and what payload is sent. The PTY-write path described in §4.2 becomes a fallback used only when Claude Code is not connected to the MCP server — not the default. This removes the stdin-injection fragility (interleaved output, paste-mode corruption, no ack) from the happy path.

Primary transport: MCP context_push. MonoCode writes the formatted context into a project-scoped inbox (.claude/inbox/NNNN.md) and emits an MCP notification. Claude Code reads the inbox on notification or at next turn. This gives acknowledgement, retry, idempotency, and survives Claude Code being mid-response.

Fallback transport: PTY write. Used only when no MCP session is detected on the active terminal. Prepended with a visible marker (——— MonoCode context ———) so interleaving with model output is at least legible. The UI surfaces which transport was used on each send (small badge: MCP or PTY).

| **Situation** | **Mechanism** | **Why** |
| --- | --- | --- |
| Developer spots an error and wants Claude Code to fix it now | Send to Claude Code (manual) | Faster for one-off, developer-initiated fixes |
| Claude Code is working autonomously on a feature | MCP (automatic) | Claude Code drives its own feedback loop without interrupting the developer |
| Developer wants to share a specific annotated screenshot | Send to Claude Code (manual) | Annotation and context selection is human-curated |
| Claude Code needs to verify its own fix worked | MCP (automatic) | Claude Code navigates and screenshots without asking |
| Iterating rapidly on a bug fix | MCP (automatic) | Claude Code can loop: fix → verify → fix → verify autonomously |

# 9. HTTP Panel — Detailed Design

## 9.1 Three surfaces

| **Request Editor** Method selector (GET, POST, PUT, PATCH, DELETE) URL input with history autocomplete Headers editor (key/value rows, enable/disable toggle) Body editor with type selector: none, JSON, form, raw Send button — fires request, adds to log Save button — adds to collection

**Collection Sidebar**
Tree of saved requests grouped by collection name Per-project — stored in .monocode/http/collections.json Claude Code can read collections via http_get_collections MCP tool Claude Code can save useful requests via http_save_to_collection Click to load into request editor

## 9.2 Request Log — The Key Feature

The request log is a chronological list of every request fired this session. It is the surface that makes Claude Code's HTTP activity visible and trustworthy to the developer.

```
Request Log
─────────────────────────────────────────────────
[Claude Code]  POST  /api/users          422   143ms
               → body: { name: "" }
               → response: { error: "name is required" }
[You]          GET   /api/users           200   89ms
               → response: [{ id: "abc", name: "..." }]
[Claude Code]  POST  /api/users          201   201ms
               → body: { name: "Test User", email: "..." }
               → response: { id: "xyz123" }
─────────────────────────────────────────────────
Click any entry → loads into request editor for replay or modification
```
```

| **Log entry field** | **Value** | **Why** |
| --- | --- | --- |
| Source label | [Claude Code] or [You] | Developer knows who fired the request |
| Method + URL | POST /api/users | Quick scan of what was called |
| Status + time | 422  143ms | Immediate pass/fail signal |
| Request body | Collapsible preview | Verify what Claude Code actually sent |
| Response body | Collapsible preview | See what the server returned |
| Timestamp | Relative (2s ago) | Understand sequence of requests |
| Click to load | Loads into editor | Developer can replay or modify any request |

## 9.3 Data flow for MCP-triggered requests

When Claude Code calls http_request via MCP, the request passes through the same executor as a manually fired request. The only difference is the source label attached to the log entry.

```
Claude Code → MCP tool call: http_request({ method, url, headers, body })
    ↓
mcp_tools.rs → forwards to mcp_bridge.rs
    ↓
Tauri event → mcpBridge.ts in React
    ↓
httpExecutor.ts → fires the actual fetch()
    ↓  (same function used by Send button)
Request log updated with source: "claude-code"
Response panel updates
    ↓
Result returned → mcp_bridge.rs → MCP server → Claude Code
```
> **Key rule:** There is one HTTP executor — httpExecutor.ts. Both the Send button and the MCP bridge call it. The source parameter ("you" or "claude-code") is the only difference. This guarantees Claude Code and the developer see identical results from the same code path.

## 9.4 Session vs persistence

| **Data** | **Persists?** | **Where** |
| --- | --- | --- |
| Request log | Session only — cleared on app restart | Zustand store (memory) |
| Collections | Permanent | .monocode/http/collections.json |
| Last request in editor | Per session | Zustand store (memory) |
| Active collection | Per project | .monocode/workspace.json |

The request log is intentionally not persisted to disk. It is a live debugging surface, not a history archive. Collections are the persistence mechanism — if Claude Code or the developer finds a request worth keeping, they save it to a collection explicitly.

# 10. Database & Cache Panel — Detailed Design

## 10.1 Supported engines

| **Category** | **Engines** | **Protocol** |
| --- | --- | --- |
| Relational | PostgreSQL, MySQL, MariaDB, SQLite | SQL |
| Document | MongoDB | MQL / aggregation pipeline |
| Cache / KV | Redis, Valkey, KeyDB | Redis protocol (RESP) |

Connection strings are stored in <project>/.monocode/connections.json which is gitignored automatically. Credentials never touch the architecture document, the query log export, or any shareable surface.

## 10.2 Four surfaces

**Query Editor**
- SQL / MQL input with syntax highlighting
- Connection selector dropdown
- Parameter binding (safe, no string interpolation)
- Run button — executes, adds to query log
- Results grid — sortable, filterable columns
- Export to JSON / CSV

**Schema Browser**
- Tree: connection → database → table → columns
- Column types, nullable, default values
- Indexes and foreign keys
- Row count per table
- Read-only — no schema edits via this panel
- Claude Code can read via `db_describe_table` MCP tool

## 10.3 Query Log — same pattern as HTTP

Every query fired this session appears in the query log, whether triggered by the developer or Claude Code. The source label and destructive query highlighting are the two additions on top of the HTTP panel pattern.

```
Query Log
───────────────────────────────────────────────────────────────────────
[Claude Code]  postgres-local  SELECT * FROM users LIMIT 5
               → 0 rows  12ms
[Claude Code]  postgres-local  SELECT * FROM users WHERE email = $1
               params: ["test@test.com"]
               → 1 row  9ms   { id: "abc", email_verified: false }
[You]          postgres-local  SELECT COUNT(*) FROM orders
               → 1 row  8ms   { count: 1482 }
[BLOCKED]      postgres-local  DELETE FROM sessions   ← destructive gate
               → awaiting developer approval
───────────────────────────────────────────────────────────────────────
Click any entry → loads into query editor for replay or modification
```
## 10.4 Destructive query safety gate

This is a hard rule enforced in the MCP bridge layer. Claude Code cannot bypass it. The gate applies to all MCP-triggered queries — developer-initiated queries in the editor are not gated (the developer is already present and intentional).

**Pattern**
| **Gated?** | **Why** |
| --- | --- | --- |
| SELECT, EXPLAIN, SHOW | No | Read-only, safe to run autonomously |
| INSERT | No | Additive, generally safe |
| UPDATE ... WHERE ... | No | Scoped update, Claude Code has context |
| UPDATE (no WHERE) | Yes — confirmation required | Affects all rows, likely a mistake |
| DELETE ... WHERE ... | Yes — confirmation required | Irreversible, developer must approve |
| DELETE (no WHERE) | Yes — confirmation required | Wipes table, never autonomous |
| DROP, TRUNCATE | Yes — confirmation required | Irreversible schema or data destruction |
| cache_flush | Yes — confirmation required | Can break running application |

```rust
// mcp_bridge.rs — destructive query gate
fn is_destructive(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    let patterns = ["DROP ", "TRUNCATE ", "DELETE ", "UPDATE "];
    let safe_update = upper.contains("WHERE");
    patterns.iter().any(|p| upper.starts_with(p))
        && !(upper.starts_with("UPDATE") && safe_update)
        && !(upper.starts_with("DELETE") && safe_update)
}
// If destructive → emit Tauri event to frontend → show confirmation dialog
// Developer approves or rejects → result returned to Claude Code
```

## 10.5 Cache panel

Redis and compatible caches share the same panel as relational/document databases. The query editor becomes a command input (GET, SET, KEYS, TTL, DEL). The schema browser becomes a key browser with pattern search. The same query log and destructive gate apply — cache_flush always requires confirmation.

| **Claude Code cache use cases** Read cached values to verify caching is working Check TTL on a key that should have expired Scan keys matching a pattern to debug cache pollution Set a cache value to test downstream behavior Flush specific keys after fixing a caching bug

**Developer cache use cases**
Inspect cache state during debugging Manually flush a stale key Browse keys to understand cache structure Monitor key count and memory usage Replay a cache command Claude Code ran

## 10.6 Session vs persistence

| **Data** | **Persists?** | **Where** |
| --- | --- | --- |
| Query log | Session only — cleared on restart | Zustand store (memory) |
| Connection strings | Permanent | .monocode/connections.json (gitignored) |
| Last query in editor | Per session | Zustand store (memory) |
| Schema browser expand state | Per project | .monocode/workspace.json |
| Active connection | Per project | .monocode/workspace.json |

# 11. Environments & Token Reuse

Environments are named sets of variables that change per context — local, staging, production. Every request, query, and connection string in MonoCode supports variable interpolation. Switching the active environment instantly re-resolves all variables everywhere without editing individual requests.

## 11.1 Two tiers of values

Environment values are split into two tiers: plain values that are safe to commit, and secrets that are never committed. A plain value can reference a secret with {{SECRET_NAME}} — the environments file is shareable, the secrets file is personal.

| **Tier** | **Example values** | **Stored in** | **Gitignored?** |
| --- | --- | --- | --- |
| Plain values | base_url, db_host, api_version | .monocode/environments.json | No — safe to commit |
| Project secrets | api_key, db_password, jwt_secret | .monocode/secrets.json | Yes — always |
| Global secrets | Personal API keys reused across projects | ~/.monocode/secrets.json | Yes — always |
| Runtime tokens | Auth tokens captured from login responses | Memory only (Zustand) | N/A — not persisted |

```json
// .monocode/environments.json  (git-tracked, safe to commit)
{
  "active": "local",
  "environments": {
    "local": {
      "base_url":  "http://localhost:3000",
      "db_host":   "localhost:5432",
      "db_name":   "myapp_dev",
      "api_key":   "{{API_KEY}}"          // references secrets.json
    },
    "staging": {
      "base_url":  "https://staging.myapp.com",
      "db_host":   "staging-db.internal:5432",
      "db_name":   "myapp_staging",
      "api_key":   "{{API_KEY}}"
    },
    "production": {
      "base_url":  "https://myapp.com",
      "db_host":   "prod-db.internal:5432",
      "db_name":   "myapp_prod",
      "api_key":   "{{API_KEY}}"
    }
  }
}
// .monocode/secrets.json  (gitignored, personal)
{
  "API_KEY": "sk-live-abc123...",
  "db_password": "supersecret"
}
```

## 11.2 Variable resolution order

When MonoCode resolves a {{variable}} in a request, query, header, or connection string, it walks this resolution chain and returns the first match.

```
Resolution order for {{variable_name}}:
  1. Runtime tokens (captured this session — highest priority)
  2. Active environment plain values (.monocode/environments.json)
  3. Project secrets (.monocode/secrets.json)
  4. Global secrets (~/.monocode/secrets.json)
First match wins. Unresolved variables shown in red in the UI.
Claude Code never receives secret values — only resolved results.
```

## 11.3 Token reuse — capture and inject

Auth tokens are obtained at runtime via a login request. MonoCode captures the token from the response and stores it as a runtime variable. All subsequent requests that reference {{auth_token}} receive the captured value automatically — including requests fired by Claude Code via MCP.

### Capture

```
// Developer configures capture rule on the login request:
POST {{base_url}}/api/auth/login
Body: { "email": "dev@example.com", "password": "{{DEV_PASSWORD}}" }
Capture rule:
  variable: auth_token
  from: response.body.token      // JSONPath
  ttl: 3600                      // seconds (optional)
// After firing:
// {{auth_token}} = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
// Stored in memory. Shown as [captured] in environment panel.
// Expires after ttl if set.
```

### Inject

```
// Any subsequent request:
GET {{base_url}}/api/users
Headers:
  Authorization: Bearer {{auth_token}}   ← resolved at fire time
  X-API-Version: {{api_version}}          ← resolved from environment

// MonoCode resolves before firing:
GET https://localhost:3000/api/users
Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  X-API-Version: 2

// Claude Code uses the same mechanism via MCP:
// http_request({ url: "{{base_url}}/api/users",
//                headers: { Authorization: "Bearer {{auth_token}}" } })
// → MonoCode resolves → Claude Code never sees the raw token
```

## 11.4 Claude Code and environments

Claude Code can read environment variables and switch environments via MCP. It cannot read secret values — the MCP bridge strips secrets before returning variable lists. This means Claude Code can work with the full environment structure without ever having access to credentials.

| **MCP tool** | **What Claude Code can do** | **What Claude Code cannot do** |
| --- | --- | --- |
| env_get_variables | Read all plain variable names and values for active env | Read secret values — always redacted as "{{SECRET}}" |
| env_switch | Switch active environment (local → staging) | Modify environment definitions |
| token_capture | Store a token captured from an HTTP response | Read existing stored tokens directly |

## 11.5 Sharing workflow

The separation of environments.json (plain values) and secrets.json (credentials) enables a clean team sharing model that works via git — no separate secrets management infrastructure needed for most projects.

```
Developer A sets up the project:
  1. Creates environments: local, staging, production
  2. Fills in plain values: base_url, db_name, api_version
  3. Uses {{PLACEHOLDER}} for secrets
  4. Saves HTTP collections and DB collections
  5. git commit .monocode/environments.json
              .monocode/http/collections.json
              .monocode/db/collections.json

Developer B pulls the repo:
  1. Opens project in MonoCode
  2. Sees all environments, collections, variable names
  3. Creates their own .monocode/secrets.json with real values
  4. Everything works immediately

Claude Code on any machine:
  1. Reads environments.json via env_get_variables
  2. Uses {{base_url}}, {{auth_token}} in requests
  3. Never sees secrets — MonoCode resolves them transparently
```

# 12. Risk Register

This register names the known unknowns and material risks in the architecture above. Each item has an owner assigned at implementation time, a mitigation plan, and a trigger that escalates it from monitored to blocking. The goal is not to eliminate risk — it is to make sure no risk is silently inherited.

| **ID** | **Risk** | **Likelihood** | **Impact** | **Mitigation** |
| --- | --- | --- | --- | --- |
| R1 | PTY stdin injection corrupts or interleaves with Claude Code output (bracketed paste, mid-response writes, upstream prompt format changes). | High | High — breaks the core integration silently | Promote MCP context_push (see §8.6) to primary transport. PTY becomes fallback with visible marker. Add a canary test that fires a context send every release. |
| R2 | Destructive SQL regex gate (§10.4) misses leading comments, CTEs, multi-statements, and non-SQL dialects. | High | High — data loss under autonomous agent load | Reframe gate as a UX speed bump, not a security boundary. Require read-only DB credentials by default for MCP-visible connections. Add explicit allowlist per connection. |
| R3 | Secrets leak via MCP tool responses (Set-Cookie, bearer tokens in redirects, response body echoes). | Medium | High — credential exposure to the model | Outbound response redactor in mcp_bridge.rs. Default redaction rules for common auth headers and known secret values. Per-project denylist patterns. |
| R4 | tmux-based session persistence does not work on Windows; §5.2 quietly assumes Unix. | High | Medium — broken feature or platform drop | Decide explicitly: either (a) Windows is unsupported in v1, stated in README, or (b) build ConPTY + detached host process persistence path. Do not ship ambiguous. |
| R5 | .claude/mcp.json auto-write on project open (§8.3) overwrites developer config or surprises teams that commit .claude/. | Medium | Medium — trust erosion, one-star reviews | Prompt on first open per project. Respect existing mcp.json. Offer a global “never auto-configure MCP” toggle in settings. |
| R6 | Embedded WebView can drive MCP bridge if attacker-controlled content loads in browser panel. | Low | High — arbitrary DB/HTTP execution | Enforce origin check on Tauri IPC calls reaching mcp_bridge.rs. Browser panel uses a separate WebView partition with no IPC access. Documented in Security Model (§13). |
| R7 | Request log is memory-only (§9.4); developer loses the Claude Code request that broke staging on cmd-Q. | High | Low — productivity, not correctness | Rolling 24h disk cache at .monocode/http/recent.jsonl, gitignored. Still not an archive; still cleared on user action. |
| R8 | Binary size and memory claims (“10× smaller than Electron”) may not survive Monaco + xterm.js + WebView + MCP sidecar. | High | Low — marketing, not function | Measure at each milestone. Drop the specific multiplier from public copy. Keep “smaller and faster startup” as the claim. |
| R9 | No plugin seam in v1 (§7 forbids AI API calls anywhere). Future integrations require architectural surgery. | Medium | Medium — long-term flexibility | Design panel interfaces and store slices as if plugins existed, even if no plugin host ships. Mark extension points in code comments. |
| R10 | Telemetry, crash reporting, and update channel are not specified. Will be decided reactively under incident pressure. | High | Medium — operational blindness | Decide before v1: choose “none” or choose a stack. Document. Either is fine; ambiguity is not. |

## 12.1 Review cadence

The register is reviewed at every release. An item is closed when its mitigation is shipped and verified; it is escalated to a blocker when its trigger fires. New risks discovered during implementation are added here, not held in individual heads or tickets. This document is the source of truth for known unknowns.

# 13. Security Model

MonoCode is a local-first developer tool. It does not manage multi-tenant access, it does not hold production credentials for anyone but the developer running it, and it does not serve network traffic. That frames the threat model: the realistic adversaries are attacker-controlled content (pages loaded in the browser panel, responses from HTTP APIs), an overreaching agent (Claude Code driving MCP tools into unintended actions), and inadvertent leakage (secrets spilling into logs, screenshots, or model context).

## 13.1 Trust boundaries

The application crosses four trust boundaries. Each is named so it can be audited, tested, and, if needed, tightened.

| **Boundary** | **Trusted side** | **Untrusted side** | **Enforcement** |
| --- | --- | --- | --- |
| Developer ↔ MonoCode main process | Developer keystrokes, native file dialogs | — | OS process isolation |
| MonoCode main ↔ Tauri IPC | React UI, Zustand store | Any WebView content, including browser panel pages | Origin check on every invoke; browser panel runs in a separate WebView partition with IPC disabled |
| Tauri main ↔ MCP sidecar | MCP server process | Claude Code input | Unix socket / named pipe; per-project scope; destructive-action confirmation events |
| MCP sidecar ↔ Claude Code | Claude Code CLI | Model output (can request arbitrary tool calls) | Tool allowlist per project; outbound response redactor; rate limits on destructive tools |

## 13.2 Secrets handling

Secrets live in .monocode/secrets.json (project) and ~/.monocode/secrets.json (global). They are never logged, never screenshotted, never sent to Claude Code. The enforcement points are specific and testable.

- Resolution is one-way. Variables resolve to secret values at request fire time, inside httpExecutor.ts or the DB driver. The resolved value is used on the wire and discarded. It never enters the Zustand store, the request log, or the screenshot buffer.

- MCP tool outputs pass through an outbound redactor. Response headers (Set-Cookie, Authorization, WWW-Authenticate, Proxy-Authorization), known secret values from the active environment, and per-project denylist patterns are replaced with “[REDACTED]” before being returned to Claude Code.

- env_get_variables returns secret slots as “{{SECRET_NAME}}” placeholders, never the resolved value. This is already specified in §11.4 and is restated here as a security invariant, not a UX detail.

- The request log displays a redacted view of Authorization headers by default; the developer must explicitly toggle “show full headers” per entry. This prevents a shoulder-surf or screenshare leak.

- Captured runtime tokens (§11.3) are held in memory only, tagged with their TTL, and cleared on app quit. They are not persisted to disk under any flag.

## 13.3 Agent containment

Claude Code acts through MCP tools. The containment model treats the agent as trusted for the developer’s intent but untrusted for arbitrary action. Every tool has a blast radius declared in mcp_tools.rs, and that declaration drives the UI confirmation policy.

| **Blast radius** | **Examples** | **Confirmation policy** |
| --- | --- | --- |
| Read-only | http_request (GET), browser_get_console_logs, db_query (SELECT), env_get_variables | None. Logged in request/query log with source label. |
| Additive / local | http_request (POST), db_query (INSERT), token_capture, http_save_to_collection | None by default. Visible in logs. Per-project toggle to require confirmation for non-localhost URLs. |
| Destructive / scoped | db_query (UPDATE/DELETE with WHERE), cache_set | Confirmation if target connection is marked production. Otherwise logged and allowed. |
| Destructive / unscoped | db_query (DROP, TRUNCATE, UPDATE/DELETE without WHERE), cache_flush | Confirmation always required. Cannot be disabled. Enforced by requiring read-only credentials for production connections. |
| Out of scope | Arbitrary shell, filesystem writes outside project root, network listen | Not exposed as MCP tools. Claude Code does these through its own terminal, subject to its own permission prompts. |

## 13.4 What the gate in §10.4 is and is not

The destructive SQL gate described in §10.4 is a user-experience speed bump, not a security boundary. Regex on uppercased SQL cannot reliably classify intent — CTEs, leading comments, multi-statement scripts, and non-SQL dialects all defeat it. The gate exists to catch obvious mistakes, not to stop a determined or confused agent.

The real boundary is the database credential. For any connection that MonoCode advertises to MCP, the default credential is read-only. Write access is opt-in per connection, per session, and expires. This is the invariant a security review can actually verify.

## 13.5 What is explicitly out of scope

- Multi-user / shared-host deployments. MonoCode assumes one developer per running instance. If multiple developers share a host, each runs their own instance with their own ~/.monocode.

- Production credential vaulting. MonoCode stores connection strings and secrets as local files. Teams that need vaulting should resolve secrets from an external vault into ~/.monocode/secrets.json at session start — MonoCode does not replace 1Password, Vault, or doppler.

- Supply-chain verification of Claude Code itself. MonoCode launches whatever binary is on PATH. Integrity of the Claude Code CLI is outside MonoCode’s trust boundary.

- Encryption at rest. .monocode/*.json files are readable by any process running as the developer’s user. This matches how VS Code, git config, and .env files behave; it is a deliberate choice, not an oversight.

MonoCode · Architecture Document · v1.0 · April 2026