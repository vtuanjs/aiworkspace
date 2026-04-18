// Which projects exist and which is active.
// Never holds per-project panel state — that lives in workspace.ts.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  lastOpened: string | null;
}

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
  listProjects: () => Promise<void>;
  addProject: (path: string, name: string, color: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  switchProject: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeProjectId: null,

  listProjects: async () => {
    const projects = await invoke<Project[]>("list_projects");
    set({ projects });
  },

  addProject: async (path: string, name: string, color: string) => {
    const project = await invoke<Project>("add_project", { path, name, color });
    set((state) => ({ projects: [...state.projects, project] }));
  },

  removeProject: async (id: string) => {
    await invoke("remove_project", { id });
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },

  switchProject: async (id: string) => {
    const { projects, activeProjectId } = get();

    // Lazily import to avoid circular dependency at module load time
    const { useWorkspaceStore } = await import("./workspace");
    const workspaceStore = useWorkspaceStore.getState();

    // 1. Save current workspace to disk before switching
    if (activeProjectId) {
      const currentProject = projects.find((p) => p.id === activeProjectId);
      if (currentProject) {
        await workspaceStore.saveToDisk(currentProject.path);
      }
    }

    // 2. Open the new project on the Rust side
    await invoke("open_project", { id });

    // 3. Set the active project ID
    set({ activeProjectId: id });

    // 4. Load workspace and environment state for the new project
    const newProject = projects.find((p) => p.id === id);
    if (newProject) {
      const { useEnvironmentStore } = await import("./environment");
      await Promise.all([
        useWorkspaceStore.getState().loadFromDisk(newProject.path),
        useEnvironmentStore.getState().loadEnvironments(newProject.path),
      ]);
    }
  },
}));
