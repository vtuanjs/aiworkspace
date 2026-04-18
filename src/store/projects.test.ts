import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

const mockWorkspaceStore = vi.hoisted(() => ({
  saveToDisk: vi.fn(),
  loadFromDisk: vi.fn(),
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

import { useProjectsStore } from "./projects";

const PROJECT_A = { id: "a", name: "Alpha", path: "/alpha", color: "#ff0000", lastOpened: null };
const PROJECT_B = { id: "b", name: "Beta", path: "/beta", color: "#00ff00", lastOpened: null };

describe("useProjectsStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockWorkspaceStore.saveToDisk.mockReset();
    mockWorkspaceStore.loadFromDisk.mockReset();
    mockEnvironmentStore.loadEnvironments.mockReset();
    useProjectsStore.setState({ projects: [], activeProjectId: null });
  });

  describe("listProjects", () => {
    it("fetches projects from Rust and sets state", async () => {
      mockInvoke.mockResolvedValue([PROJECT_A, PROJECT_B]);

      await useProjectsStore.getState().listProjects();

      expect(mockInvoke).toHaveBeenCalledWith("list_projects");
      expect(useProjectsStore.getState().projects).toEqual([PROJECT_A, PROJECT_B]);
    });
  });

  describe("addProject", () => {
    it("appends the new project returned by Rust to the existing list", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A] });
      mockInvoke.mockResolvedValue(PROJECT_B);

      await useProjectsStore.getState().addProject("/beta", "Beta", "#00ff00");

      expect(mockInvoke).toHaveBeenCalledWith("add_project", {
        path: "/beta",
        name: "Beta",
        color: "#00ff00",
      });
      expect(useProjectsStore.getState().projects).toEqual([PROJECT_A, PROJECT_B]);
    });
  });

  describe("removeProject", () => {
    it("removes the project from the list", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A, PROJECT_B] });
      mockInvoke.mockResolvedValue(undefined);

      await useProjectsStore.getState().removeProject("a");

      expect(mockInvoke).toHaveBeenCalledWith("remove_project", { id: "a" });
      expect(useProjectsStore.getState().projects).toEqual([PROJECT_B]);
    });

    it("clears activeProjectId when the active project is removed", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A], activeProjectId: "a" });
      mockInvoke.mockResolvedValue(undefined);

      await useProjectsStore.getState().removeProject("a");

      expect(useProjectsStore.getState().activeProjectId).toBeNull();
    });

    it("keeps activeProjectId unchanged when a different project is removed", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A, PROJECT_B], activeProjectId: "b" });
      mockInvoke.mockResolvedValue(undefined);

      await useProjectsStore.getState().removeProject("a");

      expect(useProjectsStore.getState().activeProjectId).toBe("b");
    });
  });

  describe("switchProject", () => {
    beforeEach(() => {
      mockWorkspaceStore.saveToDisk.mockResolvedValue(undefined);
      mockWorkspaceStore.loadFromDisk.mockResolvedValue(undefined);
      mockEnvironmentStore.loadEnvironments.mockResolvedValue(undefined);
      mockInvoke.mockResolvedValue(undefined);
    });

    it("saves current workspace, opens new project, then loads workspace and environments", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A, PROJECT_B], activeProjectId: "a" });

      await useProjectsStore.getState().switchProject("b");

      expect(mockWorkspaceStore.saveToDisk).toHaveBeenCalledWith("/alpha");
      expect(mockInvoke).toHaveBeenCalledWith("open_project", { id: "b" });
      expect(useProjectsStore.getState().activeProjectId).toBe("b");
      expect(mockWorkspaceStore.loadFromDisk).toHaveBeenCalledWith("/beta");
      expect(mockEnvironmentStore.loadEnvironments).toHaveBeenCalledWith("/beta");
    });

    it("skips saving workspace when no project is currently active", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A], activeProjectId: null });

      await useProjectsStore.getState().switchProject("a");

      expect(mockWorkspaceStore.saveToDisk).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("open_project", { id: "a" });
    });

    it("sets activeProjectId to the switched project", async () => {
      useProjectsStore.setState({ projects: [PROJECT_A, PROJECT_B], activeProjectId: "a" });

      await useProjectsStore.getState().switchProject("b");

      expect(useProjectsStore.getState().activeProjectId).toBe("b");
    });
  });
});
