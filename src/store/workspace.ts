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

// Shape stored in ~/.aiworkspace/workspaces/<id>.json
// Each panel owns its own sub-object for forward compatibility.
interface WorkspaceDiskData {
  active_panel?: string;
  right_tab?: string;
  side_open?: boolean;
  right_open?: boolean;
  right_width?: number;
  browser?: {
    url?: string;
  };
  http?: {
    method?: string;
    url?: string;
    body?: string;
    headers_text?: string;
    request_tab?: string;
  };
  db?: {
    query?: string;
  };
  explorer?: {
    side_view?: string;
  };
  terminal?: {
    open?: boolean;
    height?: number;
    active_id?: string | null;
  };
  editor?: {
    open_files?: string[];
    active_file?: string | null;
    preview_file?: string | null;
    line_of_code?: number | null;
  };
}

export const RIGHT_TAB = {
  BROWSER: "browser",
  HTTP: "http",
  DB: "db",
} as const;
export type RightTab = typeof RIGHT_TAB[keyof typeof RIGHT_TAB];

function isValidRightTab(value: unknown): value is RightTab {
  return typeof value === "string" && Object.values(RIGHT_TAB).includes(value as RightTab);
}

export interface WorkspaceState {
  activePanel: Panel;
  rightTab: RightTab;
  browserUrl: string;
  openFiles: string[];
  activeFile: string | null;
  activeFileLine: number | null;
  searchQuery: string | null;
  previewFile: string | null;
  activeTerminalId: string | null;
  sideOpen: boolean;
  sideView: "explorer" | "search";
  terminalOpen: boolean;
  terminalHeight: number;
  rightOpen: boolean;
  rightWidth: number;
  // HTTP panel
  httpMethod: string;
  httpUrl: string;
  httpBody: string;
  httpHeadersText: string;
  httpRequestTab: "body" | "headers";
  // DB panel
  dbQuery: string;
  setActivePanel: (panel: Panel) => void;
  setRightTab: (tab: RightTab) => void;
  setBrowserUrl: (url: string) => void;
  setOpenFiles: (files: string[]) => void;
  setActiveFile: (file: string | null) => void;
  setActiveFileLine: (line: number | null) => void;
  setSearchQuery: (q: string | null) => void;
  setPreviewFile: (file: string | null) => void;
  setActiveTerminalId: (id: string | null) => void;
  setSideOpen: (open: boolean) => void;
  setSideView: (view: "explorer" | "search") => void;
  setTerminalOpen: (open: boolean) => void;
  setTerminalHeight: (height: number) => void;
  setRightOpen: (open: boolean) => void;
  setRightWidth: (width: number) => void;
  setHttpMethod: (method: string) => void;
  setHttpUrl: (url: string) => void;
  setHttpBody: (body: string) => void;
  setHttpHeadersText: (headers: string) => void;
  setHttpRequestTab: (tab: "body" | "headers") => void;
  setDbQuery: (query: string) => void;
  resetForSwitch: () => void;
  loadFromDisk: (workspaceId: string) => Promise<void>;
  saveToDisk: (workspaceId: string) => Promise<void>;
}

function isValidPanel(value: unknown): value is Panel {
  return typeof value === "string" && Object.values(PANEL).includes(value as Panel);
}

// ── Throttled auto-save ────────────────────────────────────────────────────────
// Stores the current project path set by loadFromDisk so triggerAutoSave
// never needs a cross-store lookup (which could silently miss).

const AUTOSAVE_MS = 300;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveTime = 0;
let currentWorkspaceId: string | null = null;

function triggerAutoSave() {
  if (!currentWorkspaceId) return;
  const id = currentWorkspaceId;
  useWorkspaceStore.getState().saveToDisk(id).catch((e) => {
    console.error("[workspace] auto-save failed:", e);
  });
}

function scheduleAutoSave() {
  const now = Date.now();
  const remaining = AUTOSAVE_MS - (now - lastSaveTime);

  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  if (remaining <= 0) {
    lastSaveTime = now;
    triggerAutoSave();
  } else {
    autoSaveTimer = setTimeout(() => {
      lastSaveTime = Date.now();
      triggerAutoSave();
    }, remaining);
  }
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activePanel: PANEL.TERMINAL,
  rightTab: RIGHT_TAB.BROWSER,
  browserUrl: "",
  openFiles: [],
  activeFile: null,
  activeFileLine: null,
  searchQuery: null,
  previewFile: null,
  activeTerminalId: null,
  sideOpen: true,
  sideView: "explorer",
  terminalOpen: true,
  terminalHeight: 220,
  rightOpen: true,
  rightWidth: 360,
  httpMethod: "GET",
  httpUrl: "",
  httpBody: "",
  httpHeadersText: '{\n  "Content-Type": "application/json"\n}',
  httpRequestTab: "body",
  dbQuery: "",

  // Each public setter calls scheduleAutoSave so user actions are persisted.
  // resetForSwitch and loadFromDisk intentionally do NOT call it.
  setActivePanel: (panel) => { set({ activePanel: panel }); scheduleAutoSave(); },
  setRightTab: (tab) => { set({ rightTab: tab }); scheduleAutoSave(); },
  setBrowserUrl: (url) => { set({ browserUrl: url }); scheduleAutoSave(); },
  setOpenFiles: (files) => { set({ openFiles: files }); scheduleAutoSave(); },
  setActiveFile: (file) => { set({ activeFile: file }); scheduleAutoSave(); },
  setActiveFileLine: (line) => set({ activeFileLine: line }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPreviewFile: (file) => { set({ previewFile: file }); scheduleAutoSave(); },
  setActiveTerminalId: (id) => { set({ activeTerminalId: id }); scheduleAutoSave(); },
  setSideOpen: (open) => { set({ sideOpen: open }); scheduleAutoSave(); },
  setSideView: (view) => { set({ sideView: view }); scheduleAutoSave(); },
  setTerminalOpen: (open) => { set({ terminalOpen: open }); scheduleAutoSave(); },
  setTerminalHeight: (height) => { set({ terminalHeight: height }); scheduleAutoSave(); },
  setRightOpen: (open) => { set({ rightOpen: open }); scheduleAutoSave(); },
  setRightWidth: (width) => { set({ rightWidth: width }); scheduleAutoSave(); },
  setHttpMethod: (method) => { set({ httpMethod: method }); scheduleAutoSave(); },
  setHttpUrl: (url) => { set({ httpUrl: url }); scheduleAutoSave(); },
  setHttpBody: (body) => { set({ httpBody: body }); scheduleAutoSave(); },
  setHttpHeadersText: (headers) => { set({ httpHeadersText: headers }); scheduleAutoSave(); },
  setHttpRequestTab: (tab) => { set({ httpRequestTab: tab }); scheduleAutoSave(); },
  setDbQuery: (query) => { set({ dbQuery: query }); scheduleAutoSave(); },

  resetForSwitch: () => {
    currentWorkspaceId = null; // clear id so no auto-save fires during transition
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    set({
      activePanel: PANEL.TERMINAL,
      rightTab: RIGHT_TAB.BROWSER,
      browserUrl: "",
      openFiles: [],
      activeFile: null,
      activeFileLine: null,
      searchQuery: null,
      previewFile: null,
      activeTerminalId: null,
      sideOpen: true,
      sideView: "explorer",
      terminalOpen: true,
      terminalHeight: 220,
      rightOpen: true,
      rightWidth: 360,
      httpMethod: "GET",
      httpUrl: "",
      httpBody: "",
      httpHeadersText: '{\n  "Content-Type": "application/json"\n}',
      httpRequestTab: "body",
      dbQuery: "",
    });
  },

  loadFromDisk: async (workspaceId: string) => {
    try {
      const raw = await invoke<string>("read_workspace_state", { workspaceId });
      const ws: WorkspaceDiskData = JSON.parse(raw);
      set({
        activePanel: isValidPanel(ws.active_panel) ? ws.active_panel : PANEL.TERMINAL,
        rightTab: isValidRightTab(ws.right_tab) ? ws.right_tab : RIGHT_TAB.BROWSER,
        sideOpen: typeof ws.side_open === "boolean" ? ws.side_open : true,
        rightOpen: typeof ws.right_open === "boolean" ? ws.right_open : true,
        rightWidth: typeof ws.right_width === "number" && ws.right_width > 0 ? ws.right_width : 360,
        browserUrl: typeof ws.browser?.url === "string" ? ws.browser.url : "",
        httpMethod: typeof ws.http?.method === "string" ? ws.http.method : "GET",
        httpUrl: typeof ws.http?.url === "string" ? ws.http.url : "",
        httpBody: typeof ws.http?.body === "string" ? ws.http.body : "",
        httpHeadersText: typeof ws.http?.headers_text === "string"
          ? ws.http.headers_text
          : '{\n  "Content-Type": "application/json"\n}',
        httpRequestTab: ws.http?.request_tab === "headers" ? "headers" : "body",
        dbQuery: typeof ws.db?.query === "string" ? ws.db.query : "",
        sideView:
          ws.explorer?.side_view === "explorer" || ws.explorer?.side_view === "search"
            ? ws.explorer.side_view
            : "explorer",
        terminalOpen: typeof ws.terminal?.open === "boolean" ? ws.terminal.open : true,
        terminalHeight:
          typeof ws.terminal?.height === "number" && ws.terminal.height > 0
            ? ws.terminal.height
            : 220,
        activeTerminalId:
          typeof ws.terminal?.active_id === "string" ? ws.terminal.active_id : null,
        openFiles: Array.isArray(ws.editor?.open_files) ? ws.editor.open_files : [],
        activeFile: typeof ws.editor?.active_file === "string" ? ws.editor.active_file : null,
        previewFile: typeof ws.editor?.preview_file === "string" ? ws.editor.preview_file : null,
        activeFileLine:
          typeof ws.editor?.line_of_code === "number" ? ws.editor.line_of_code : null,
        searchQuery: null,
      });
    } catch {
      set({
        activePanel: PANEL.TERMINAL,
        rightTab: RIGHT_TAB.BROWSER,
        browserUrl: "",
        openFiles: [],
        activeFile: null,
        activeFileLine: null,
        searchQuery: null,
        previewFile: null,
        activeTerminalId: null,
        sideOpen: true,
        sideView: "explorer",
        terminalOpen: true,
        terminalHeight: 220,
        rightOpen: true,
        rightWidth: 360,
        httpMethod: "GET",
        httpUrl: "",
        httpBody: "",
        httpHeadersText: '{\n  "Content-Type": "application/json"\n}',
        httpRequestTab: "body",
        dbQuery: "",
      });
    }
    // Set id AFTER load so auto-save uses the correct id
    currentWorkspaceId = workspaceId;
  },

  saveToDisk: async (workspaceId: string) => {
    const {
      activePanel, rightTab,
      browserUrl,
      openFiles, activeFile, activeFileLine, previewFile,
      activeTerminalId,
      sideOpen, sideView,
      terminalOpen, terminalHeight,
      rightOpen, rightWidth,
      httpMethod, httpUrl, httpBody, httpHeadersText, httpRequestTab,
      dbQuery,
    } = get();
    const data: WorkspaceDiskData = {
      active_panel: activePanel,
      right_tab: rightTab,
      side_open: sideOpen,
      right_open: rightOpen,
      right_width: rightWidth,
      browser: { url: browserUrl },
      http: { method: httpMethod, url: httpUrl, body: httpBody, headers_text: httpHeadersText, request_tab: httpRequestTab },
      db: { query: dbQuery },
      explorer: { side_view: sideView },
      terminal: { open: terminalOpen, height: terminalHeight, active_id: activeTerminalId },
      editor: { open_files: openFiles, active_file: activeFile, preview_file: previewFile, line_of_code: activeFileLine },
    };
    await invoke("write_workspace_state", {
      workspaceId,
      content: JSON.stringify(data, null, 2),
    });
  },
}));
