// Per-project panel state.
// Never holds the project list — that lives in projects.ts.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export const PANEL = {
  TERMINAL: "TERMINAL",
  BROWSER: "BROWSER",
  HTTP: "HTTP",
  DB: "DB",
  EDITOR: "EDITOR",
} as const;
export type Panel = typeof PANEL[keyof typeof PANEL];

// Shape stored in <project>/.aiworkspace/workspace.json
interface WorkspaceDiskData {
  active_panel?: string;
  browser_url?: string;
  open_files?: string[];
  active_file?: string | null;
  active_terminal_id?: string | null;
}

export interface WorkspaceState {
  activePanel: Panel;
  browserUrl: string;
  openFiles: string[];
  activeFile: string | null;
  activeFileLine: number | null;
  searchQuery: string | null;
  previewFile: string | null;
  activeTerminalId: string | null;
  setActivePanel: (panel: Panel) => void;
  setBrowserUrl: (url: string) => void;
  setOpenFiles: (files: string[]) => void;
  setActiveFile: (file: string | null) => void;
  setActiveFileLine: (line: number | null) => void;
  setSearchQuery: (q: string | null) => void;
  setPreviewFile: (file: string | null) => void;
  setActiveTerminalId: (id: string | null) => void;
  resetForSwitch: () => void;
  loadFromDisk: (projectPath: string) => Promise<void>;
  saveToDisk: (projectPath: string) => Promise<void>;
}

function isValidPanel(value: unknown): value is Panel {
  return typeof value === "string" && Object.values(PANEL).includes(value as Panel);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activePanel: PANEL.TERMINAL,
  browserUrl: "",
  openFiles: [],
  activeFile: null,
  activeFileLine: null,
  searchQuery: null,
  previewFile: null,
  activeTerminalId: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setBrowserUrl: (url) => set({ browserUrl: url }),
  setOpenFiles: (files) => set({ openFiles: files }),
  setActiveFile: (file) => set({ activeFile: file }),
  setActiveFileLine: (line) => set({ activeFileLine: line }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPreviewFile: (file) => set({ previewFile: file }),
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),

  resetForSwitch: () => set({
    activePanel: PANEL.TERMINAL,
    browserUrl: "",
    openFiles: [],
    activeFile: null,
    activeFileLine: null,
    searchQuery: null,
    previewFile: null,
    activeTerminalId: null,
  }),

  loadFromDisk: async (projectPath: string) => {
    try {
      const raw = await invoke<string>("read_file", {
        path: `${projectPath}/.aiworkspace/workspace.json`,
      });
      const ws: WorkspaceDiskData = JSON.parse(raw);
      set({
        activePanel: isValidPanel(ws.active_panel) ? ws.active_panel : PANEL.TERMINAL,
        browserUrl: typeof ws.browser_url === "string" ? ws.browser_url : "",
        openFiles: Array.isArray(ws.open_files) ? ws.open_files : [],
        activeFile: typeof ws.active_file === "string" ? ws.active_file : null,
        activeFileLine: null,
        searchQuery: null,
        previewFile: null,
        activeTerminalId:
          typeof ws.active_terminal_id === "string" ? ws.active_terminal_id : null,
      });
    } catch {
      // File may not exist yet — keep defaults (already set by resetForSwitch)
      set({
        activePanel: PANEL.TERMINAL,
        browserUrl: "",
        openFiles: [],
        activeFile: null,
        activeFileLine: null,
        searchQuery: null,
        previewFile: null,
        activeTerminalId: null,
      });
    }
  },

  saveToDisk: async (projectPath: string) => {
    const { activePanel, browserUrl, openFiles, activeFile, activeTerminalId } = get();
    const data: WorkspaceDiskData = {
      active_panel: activePanel,
      browser_url: browserUrl,
      open_files: openFiles,
      active_file: activeFile,
      active_terminal_id: activeTerminalId,
    };
    await invoke("write_file", {
      path: `${projectPath}/.aiworkspace/workspace.json`,
      content: JSON.stringify(data, null, 2),
    });
  },
}));
