import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

const mockWorkspaceStore = vi.hoisted(() => ({
  saveToDisk: vi.fn(),
  loadFromDisk: vi.fn(),
  resetForSwitch: vi.fn(),
}));
vi.mock("./workspace", () => ({
  useWorkspaceStore: { getState: () => mockWorkspaceStore },
}));

const mockEnvironmentStore = vi.hoisted(() => ({
  loadEnvironments: vi.fn(),
}));
vi.mock("./environment", () => ({
  useEnvironmentStore: { getState: () => mockEnvironmentStore },
}));

import { useWorkspacesStore } from "./workspaces";

const WORKSPACE_A = { id: "a", name: "Alpha", path: "/alpha", color: "#ff0000", lastOpened: null };
const WORKSPACE_B = { id: "b", name: "Beta", path: "/beta", color: "#00ff00", lastOpened: null };

describe("useWorkspacesStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockWorkspaceStore.saveToDisk.mockReset();
    mockWorkspaceStore.loadFromDisk.mockReset();
    mockWorkspaceStore.resetForSwitch.mockReset();
    mockEnvironmentStore.loadEnvironments.mockReset();
    useWorkspacesStore.setState({ workspaces: [], activeWorkspaceId: null });
  });

  describe("listWorkspaces", () => {
    it("fetches workspaces from Rust and sets state", async () => {
      mockInvoke.mockResolvedValue([WORKSPACE_A, WORKSPACE_B]);

      await useWorkspacesStore.getState().listWorkspaces();

      expect(mockInvoke).toHaveBeenCalledWith("list_projects");
      expect(useWorkspacesStore.getState().workspaces).toEqual([WORKSPACE_A, WORKSPACE_B]);
    });
  });

  describe("addWorkspace", () => {
    it("appends the new workspace returned by Rust to the existing list", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A] });
      mockInvoke.mockResolvedValue(WORKSPACE_B);

      await useWorkspacesStore.getState().addWorkspace("/beta", "Beta", "#00ff00");

      expect(mockInvoke).toHaveBeenCalledWith("add_project", {
        path: "/beta",
        name: "Beta",
        color: "#00ff00",
      });
      expect(useWorkspacesStore.getState().workspaces).toEqual([WORKSPACE_A, WORKSPACE_B]);
    });
  });

  describe("removeWorkspace", () => {
    it("removes the workspace from the list", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A, WORKSPACE_B] });
      mockInvoke.mockResolvedValue(undefined);

      await useWorkspacesStore.getState().removeWorkspace("a");

      expect(mockInvoke).toHaveBeenCalledWith("remove_project", { id: "a" });
      expect(useWorkspacesStore.getState().workspaces).toEqual([WORKSPACE_B]);
    });

    it("clears activeWorkspaceId when the active workspace is removed", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A], activeWorkspaceId: "a" });
      mockInvoke.mockResolvedValue(undefined);

      await useWorkspacesStore.getState().removeWorkspace("a");

      expect(useWorkspacesStore.getState().activeWorkspaceId).toBeNull();
    });

    it("keeps activeWorkspaceId unchanged when a different workspace is removed", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A, WORKSPACE_B], activeWorkspaceId: "b" });
      mockInvoke.mockResolvedValue(undefined);

      await useWorkspacesStore.getState().removeWorkspace("a");

      expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("b");
    });
  });

  describe("switchWorkspace", () => {
    beforeEach(() => {
      mockWorkspaceStore.saveToDisk.mockResolvedValue(undefined);
      mockWorkspaceStore.loadFromDisk.mockResolvedValue(undefined);
      mockWorkspaceStore.resetForSwitch.mockReturnValue(undefined);
      mockEnvironmentStore.loadEnvironments.mockResolvedValue(undefined);
      mockInvoke.mockResolvedValue(undefined);
    });

    it("saves current workspace, opens new workspace, then loads workspace and environments", async () => {      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A, WORKSPACE_B], activeWorkspaceId: "a" });

      await useWorkspacesStore.getState().switchWorkspace("b");

      expect(mockWorkspaceStore.saveToDisk).toHaveBeenCalledWith("/alpha");
      expect(mockInvoke).toHaveBeenCalledWith("open_project", { id: "b" });
      expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("b");
      expect(mockWorkspaceStore.loadFromDisk).toHaveBeenCalledWith("/beta");
      expect(mockEnvironmentStore.loadEnvironments).toHaveBeenCalledWith("/beta");
    });

    it("skips saving workspace when no workspace is currently active", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A], activeWorkspaceId: null });

      await useWorkspacesStore.getState().switchWorkspace("a");

      expect(mockWorkspaceStore.saveToDisk).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("open_project", { id: "a" });
    });

    it("calls resetForSwitch before setting the new active workspace", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A, WORKSPACE_B], activeWorkspaceId: "a" });

      await useWorkspacesStore.getState().switchWorkspace("b");

      expect(mockWorkspaceStore.resetForSwitch).toHaveBeenCalled();
    });

    it("sets activeWorkspaceId to the switched workspace", async () => {
      useWorkspacesStore.setState({ workspaces: [WORKSPACE_A, WORKSPACE_B], activeWorkspaceId: "a" });

      await useWorkspacesStore.getState().switchWorkspace("b");

      expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("b");
    });
  });
});
