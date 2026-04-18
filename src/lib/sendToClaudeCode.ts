// THE core integration — the only file that writes to the PTY.
// Primary transport: MCP context_push (writes to .claude/inbox/NNNN.md).
// Fallback: PTY write when no MCP session is detected.

import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../store/workspace";
import { useWorkspacesStore } from "../store/workspaces";

export interface WorkspaceContext {
  source: "browser" | "http" | "db";
  content: string;
}

export const SEND_TRANSPORT = {
  MCP: "MCP",
  PTY: "PTY",
} as const;
export type SendTransport = typeof SEND_TRANSPORT[keyof typeof SEND_TRANSPORT];

const MCP_ACTIVE_KEY = "aiworkspace:mcp_active";
const INBOX_COUNTER_KEY = "aiworkspace:inbox_counter";

function isMcpActive(): boolean {
  return localStorage.getItem(MCP_ACTIVE_KEY) === "true";
}

function nextInboxIndex(): number {
  const raw = localStorage.getItem(INBOX_COUNTER_KEY);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = isNaN(current) ? 0 : current + 1;
  localStorage.setItem(INBOX_COUNTER_KEY, String(next));
  return next;
}

function formatContext(ctx: WorkspaceContext): string {
  const sourceLabel: Record<WorkspaceContext["source"], string> = {
    browser: "Browser Console",
    http: "HTTP Response",
    db: "Database Result",
  };
  const label = sourceLabel[ctx.source];
  return `[${label}]\n\n${ctx.content}`;
}

function zeroPad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

async function sendViaMcp(
  ctx: WorkspaceContext,
  projectPath: string
): Promise<void> {
  const index = nextInboxIndex();
  const filename = `${zeroPad(index)}.md`;
  const inboxPath = `${projectPath}/.claude/inbox/${filename}`;
  const body = `# AIWorkspace Context\n\n${formatContext(ctx)}\n`;
  await invoke("write_file", { path: inboxPath, content: body });
}

async function sendViaPty(
  ctx: WorkspaceContext,
  terminalId: string
): Promise<void> {
  const message = `\n——— AIWorkspace context ———\n${formatContext(ctx)}\n`;
  await invoke("write_terminal", { terminalId, data: message });
}

export async function sendToClaudeCode(
  context: WorkspaceContext
): Promise<{ transport: SendTransport }> {
  const workspaceState = useWorkspaceStore.getState();
  const workspacesState = useWorkspacesStore.getState();

  const activeWorkspaceId = workspacesState.activeWorkspaceId;
  const activeWorkspace = activeWorkspaceId
    ? workspacesState.workspaces.find((w) => w.id === activeWorkspaceId)
    : null;

  if (isMcpActive() && activeWorkspace) {
    await sendViaMcp(context, activeWorkspace.path);
    return { transport: SEND_TRANSPORT.MCP };
  }

  // PTY fallback — requires an active terminal
  const terminalId = workspaceState.activeTerminalId;
  if (!terminalId) {
    // No terminal open yet; silently drop (Claude Code not running)
    return { transport: SEND_TRANSPORT.PTY };
  }

  await sendViaPty(context, terminalId);
  return { transport: SEND_TRANSPORT.PTY };
}
