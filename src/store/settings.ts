import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export const HOTKEY_ACTIONS = {
  TOGGLE_SIDEBAR: "toggle_sidebar",
  SHOW_EXPLORER: "show_explorer",
  SHOW_SEARCH: "show_search",
  TOGGLE_TERMINAL: "toggle_terminal",
  TOGGLE_RIGHT_PANEL: "toggle_right_panel",
  CLOSE_TAB: "close_tab",
  NEXT_TAB: "next_tab",
  PREV_TAB: "prev_tab",
  PREV_EDITOR_TAB: "prev_editor_tab",
  NEXT_EDITOR_TAB: "next_editor_tab",
} as const;

export type HotkeyAction = typeof HOTKEY_ACTIONS[keyof typeof HOTKEY_ACTIONS];

// Combo format: sorted mods joined with "+", then e.code.toLowerCase()
// e.g. "cmd+keyb", "ctrl+backquote", "cmd+shift+bracketleft"
export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  toggle_sidebar:     "cmd+keyb",
  show_explorer:      "cmd+shift+keye",
  show_search:        "cmd+shift+keyf",
  toggle_terminal:    "ctrl+backquote",
  toggle_right_panel: "cmd+shift+backslash",
  close_tab:          "cmd+keyw",
  next_tab:           "ctrl+tab",
  prev_tab:           "ctrl+shift+tab",
  prev_editor_tab:    "cmd+shift+bracketleft",
  next_editor_tab:    "cmd+shift+bracketright",
};

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  toggle_sidebar:     "Toggle Sidebar",
  show_explorer:      "Show Explorer",
  show_search:        "Show Search",
  toggle_terminal:    "Toggle Terminal",
  toggle_right_panel: "Toggle Right Panel",
  close_tab:          "Close Tab",
  next_tab:           "Next Tab",
  prev_tab:           "Previous Tab",
  prev_editor_tab:    "Previous Editor Tab",
  next_editor_tab:    "Next Editor Tab",
};

export function eventToCombo(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey)  mods.push("ctrl");
  if (e.altKey)   mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  if (e.metaKey)  mods.push("cmd");
  return [...mods, e.code.toLowerCase()].join("+");
}

const CODE_NAMES: Record<string, string> = {
  backquote:    "`",
  backslash:    "\\",
  bracketleft:  "[",
  bracketright: "]",
  tab:          "Tab",
  escape:       "Esc",
  enter:        "↵",
  space:        "Space",
  comma:        ",",
  period:       ".",
  slash:        "/",
  semicolon:    ";",
  quote:        "'",
  minus:        "-",
  equal:        "=",
};

export function comboToDisplay(combo: string): string {
  if (!combo) return "—";
  const modSymbols: Record<string, string> = { ctrl: "^", alt: "⌥", shift: "⇧", cmd: "⌘" };
  return combo.split("+").map((p) => {
    if (p in modSymbols) return modSymbols[p];
    if (p in CODE_NAMES) return CODE_NAMES[p];
    if (p.startsWith("key"))   return p.slice(3).toUpperCase();
    if (p.startsWith("digit")) return p.slice(5);
    if (p.startsWith("f") && !isNaN(Number(p.slice(1)))) return p.toUpperCase();
    return p.toUpperCase();
  }).join("");
}

export interface SettingsState {
  storageDir: string | null;
  hotkeys: Record<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
  saveHotkeys: (hotkeys: Record<string, string>) => Promise<void>;
  saveStorageDir: (dir: string | null) => Promise<void>;
  getHotkey: (action: HotkeyAction) => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  storageDir: null,
  hotkeys: { ...DEFAULT_HOTKEYS },
  loaded: false,

  getHotkey: (action) => get().hotkeys[action] ?? DEFAULT_HOTKEYS[action],

  load: async () => {
    try {
      const raw = await invoke<{ storage_dir?: string | null; hotkeys?: Record<string, string> }>(
        "get_app_settings"
      );
      set({
        storageDir: raw.storage_dir ?? null,
        hotkeys: { ...DEFAULT_HOTKEYS, ...(raw.hotkeys ?? {}) },
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  saveHotkeys: async (hotkeys) => {
    set({ hotkeys });
    const { storageDir } = get();
    await invoke("save_app_settings", {
      settings: { storage_dir: storageDir, hotkeys },
    });
  },

  saveStorageDir: async (dir) => {
    set({ storageDir: dir });
    const { hotkeys } = get();
    await invoke("save_app_settings", {
      settings: { storage_dir: dir, hotkeys },
    });
  },
}));
