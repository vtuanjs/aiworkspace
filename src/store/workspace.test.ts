import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { useWorkspaceStore, PANEL } from "./workspace";

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useWorkspaceStore.setState({
      activePanel: PANEL.TERMINAL,
      browserUrl: "",
      openFiles: [],
      activeTerminalId: null,
    });
  });

  describe("setters", () => {
    it("setActivePanel updates activePanel", () => {
      useWorkspaceStore.getState().setActivePanel(PANEL.BROWSER);
      expect(useWorkspaceStore.getState().activePanel).toBe(PANEL.BROWSER);
    });

    it("setBrowserUrl updates browserUrl", () => {
      useWorkspaceStore.getState().setBrowserUrl("http://localhost:3000");
      expect(useWorkspaceStore.getState().browserUrl).toBe("http://localhost:3000");
    });

    it("setOpenFiles updates openFiles", () => {
      useWorkspaceStore.getState().setOpenFiles(["src/App.tsx", "src/main.tsx"]);
      expect(useWorkspaceStore.getState().openFiles).toEqual(["src/App.tsx", "src/main.tsx"]);
    });

    it("setActiveTerminalId updates activeTerminalId", () => {
      useWorkspaceStore.getState().setActiveTerminalId("term-42");
      expect(useWorkspaceStore.getState().activeTerminalId).toBe("term-42");
    });
  });

  describe("loadFromDisk", () => {
    it("loads and translates snake_case JSON to camelCase state", async () => {
      mockInvoke.mockResolvedValue(
        JSON.stringify({
          active_panel: "BROWSER",
          browser_url: "https://example.com",
          open_files: ["src/App.tsx"],
          active_terminal_id: "term-1",
        })
      );

      await useWorkspaceStore.getState().loadFromDisk("/proj");

      const state = useWorkspaceStore.getState();
      expect(state.activePanel).toBe(PANEL.BROWSER);
      expect(state.browserUrl).toBe("https://example.com");
      expect(state.openFiles).toEqual(["src/App.tsx"]);
      expect(state.activeTerminalId).toBe("term-1");
      expect(mockInvoke).toHaveBeenCalledWith("read_file", {
        path: "/proj/.monocode/workspace.json",
      });
    });

    it("falls back to TERMINAL for an invalid panel value", async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({ active_panel: "INVALID" }));

      await useWorkspaceStore.getState().loadFromDisk("/proj");

      expect(useWorkspaceStore.getState().activePanel).toBe(PANEL.TERMINAL);
    });

    it("applies defaults for missing optional fields", async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({ active_panel: "HTTP" }));

      await useWorkspaceStore.getState().loadFromDisk("/proj");

      const state = useWorkspaceStore.getState();
      expect(state.activePanel).toBe(PANEL.HTTP);
      expect(state.browserUrl).toBe("");
      expect(state.openFiles).toEqual([]);
      expect(state.activeTerminalId).toBeNull();
    });

    it("resets all fields to defaults when file read fails", async () => {
      useWorkspaceStore.setState({ activePanel: PANEL.HTTP, browserUrl: "http://old" });
      mockInvoke.mockRejectedValue(new Error("file not found"));

      await useWorkspaceStore.getState().loadFromDisk("/proj");

      const state = useWorkspaceStore.getState();
      expect(state.activePanel).toBe(PANEL.TERMINAL);
      expect(state.browserUrl).toBe("");
      expect(state.openFiles).toEqual([]);
      expect(state.activeTerminalId).toBeNull();
    });
  });

  describe("saveToDisk", () => {
    it("writes camelCase state as snake_case JSON to disk", async () => {
      mockInvoke.mockResolvedValue(undefined);
      useWorkspaceStore.setState({
        activePanel: PANEL.HTTP,
        browserUrl: "http://localhost",
        openFiles: ["src/main.tsx"],
        activeTerminalId: "term-99",
      });

      await useWorkspaceStore.getState().saveToDisk("/proj");

      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "/proj/.monocode/workspace.json",
        content: expect.any(String),
      });

      const written = JSON.parse(mockInvoke.mock.calls[0][1].content);
      expect(written.active_panel).toBe("HTTP");
      expect(written.browser_url).toBe("http://localhost");
      expect(written.open_files).toEqual(["src/main.tsx"]);
      expect(written.active_terminal_id).toBe("term-99");
    });
  });
});
