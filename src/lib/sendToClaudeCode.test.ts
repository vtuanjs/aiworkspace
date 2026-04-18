import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

const mockWorkspaceStore = vi.hoisted(() => ({ activeTerminalId: "term-1" }));
const mockProjectsStore = vi.hoisted(() => ({
  activeProjectId: "proj-1",
  projects: [{ id: "proj-1", path: "/home/user/myproject", name: "My Project" }],
}));
vi.mock("../store/workspace", () => ({
  useWorkspaceStore: { getState: () => mockWorkspaceStore },
}));
vi.mock("../store/projects", () => ({
  useProjectsStore: { getState: () => mockProjectsStore },
}));

import { sendToClaudeCode, SEND_TRANSPORT } from "./sendToClaudeCode";

describe("sendToClaudeCode", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    localStorage.clear();
    mockWorkspaceStore.activeTerminalId = "term-1";
    mockProjectsStore.activeProjectId = "proj-1";
  });

  describe("MCP transport", () => {
    it("writes to .claude/inbox/ when MCP is active", async () => {
      localStorage.setItem("monocode:mcp_active", "true");
      mockInvoke.mockResolvedValue(undefined);

      const result = await sendToClaudeCode({ source: "browser", content: "Error: 404" });

      expect(result.transport).toBe(SEND_TRANSPORT.MCP);
      expect(mockInvoke).toHaveBeenCalledWith("write_file", expect.objectContaining({
        path: expect.stringContaining("/.claude/inbox/"),
        content: expect.stringContaining("Error: 404"),
      }));
    });

    it("increments inbox counter on each call", async () => {
      localStorage.setItem("monocode:mcp_active", "true");
      mockInvoke.mockResolvedValue(undefined);

      await sendToClaudeCode({ source: "http", content: "req 1" });
      await sendToClaudeCode({ source: "http", content: "req 2" });

      const paths = mockInvoke.mock.calls.map((c) => c[1].path as string);
      expect(paths[0]).toContain("0001.md");
      expect(paths[1]).toContain("0002.md");
    });

    it("includes source label in inbox content", async () => {
      localStorage.setItem("monocode:mcp_active", "true");
      mockInvoke.mockResolvedValue(undefined);

      await sendToClaudeCode({ source: "db", content: "row data" });

      const content = mockInvoke.mock.calls[0][1].content as string;
      expect(content).toContain("Database Result");
    });
  });

  describe("PTY fallback transport", () => {
    it("writes to PTY when MCP is not active", async () => {
      mockInvoke.mockResolvedValue(undefined);

      const result = await sendToClaudeCode({ source: "http", content: "response body" });

      expect(result.transport).toBe(SEND_TRANSPORT.PTY);
      expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.objectContaining({
        terminalId: "term-1",
        data: expect.stringContaining("response body"),
      }));
    });

    it("PTY message includes MonoCode context marker", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await sendToClaudeCode({ source: "browser", content: "console error" });

      const data = mockInvoke.mock.calls[0][1].data as string;
      expect(data).toContain("——— MonoCode context ———");
    });

    it("returns PTY transport silently when no terminal is open", async () => {
      mockWorkspaceStore.activeTerminalId = "";

      const result = await sendToClaudeCode({ source: "browser", content: "error" });

      expect(result.transport).toBe(SEND_TRANSPORT.PTY);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("falls back to PTY when MCP is active but no active project", async () => {
      localStorage.setItem("monocode:mcp_active", "true");
      mockProjectsStore.activeProjectId = null as unknown as string;
      mockInvoke.mockResolvedValue(undefined);

      const result = await sendToClaudeCode({ source: "http", content: "data" });

      expect(result.transport).toBe(SEND_TRANSPORT.PTY);
      expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.anything());
    });
  });
});
