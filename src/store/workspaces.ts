// Which workspaces exist and which is active.
// Never holds per-workspace panel state — that lives in workspace.ts.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  color: string;
  lastOpened: string | null;
}

interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  listWorkspaces: () => Promise<void>;
  addWorkspace: (path: string, name: string, color: string) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  listWorkspaces: async () => {
    const workspaces = await invoke<Workspace[]>("list_projects");
    set({ workspaces });
  },

  addWorkspace: async (path: string, name: string, color: string) => {
    const workspace = await invoke<Workspace>("add_project", { path, name, color });
    set((state) => ({ workspaces: [...state.workspaces, workspace] }));
  },

  removeWorkspace: async (id: string) => {
    await invoke("remove_project", { id });
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
    }));
  },

  switchWorkspace: async (id: string) => {
    const { workspaces, activeWorkspaceId } = get();

    // Lazily import to avoid circular dependency at module load time
    const { useWorkspaceStore } = await import("./workspace");
    const workspaceStore = useWorkspaceStore.getState();

    // 1. Save current workspace to disk before switching
    if (activeWorkspaceId) {
      const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
      if (currentWorkspace) {
        await workspaceStore.saveToDisk(currentWorkspace.path);
      }
    }

    // 2. Reset panel state + switch active ID atomically — prevents stale state flash
    workspaceStore.resetForSwitch();
    set({ activeWorkspaceId: id });

    // 3. Open the new workspace on the Rust side
    await invoke("open_project", { id });

    // 4. Load workspace and environment state for the new workspace
    const newWorkspace = workspaces.find((w) => w.id === id);
    if (newWorkspace) {
      const { useEnvironmentStore } = await import("./environment");
      await Promise.all([
        useWorkspaceStore.getState().loadFromDisk(newWorkspace.path),
        useEnvironmentStore.getState().loadEnvironments(newWorkspace.path),
      ]);
    }
  },
}));
