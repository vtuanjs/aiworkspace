import { useEffect } from "react";
import { useWorkspaceStore } from "../../../store/workspace";
import { useSettingsStore, HOTKEY_ACTIONS, eventToCombo } from "../../../store/settings";

export function useWorkspaceHotkeys() {
  const { setSideOpen, setSideView, setTerminalOpen, setRightOpen } = useWorkspaceStore();

  useEffect(() => {
    const getAllTabs = (): string[] => {
      const { openFiles, previewFile } = useWorkspaceStore.getState();
      const hasPreview = previewFile !== null && !openFiles.includes(previewFile);
      return hasPreview ? [...openFiles, previewFile!] : [...openFiles];
    };

    const cycleTab = (dir: 1 | -1) => {
      const tabs = getAllTabs();
      if (tabs.length < 2) return;
      const { activeFile, setActiveFile } = useWorkspaceStore.getState();
      const idx = activeFile ? tabs.indexOf(activeFile) : dir === 1 ? -1 : 0;
      setActiveFile(tabs[(idx + dir + tabs.length) % tabs.length]);
    };

    const closeTab = () => {
      const { activeFile, openFiles, previewFile, setOpenFiles, setPreviewFile, setActiveFile } =
        useWorkspaceStore.getState();
      if (!activeFile) return;
      const isPreview = previewFile === activeFile && !openFiles.includes(activeFile);
      if (isPreview) {
        setPreviewFile(null);
        setActiveFile(openFiles[0] ?? null);
      } else {
        const next = openFiles.filter((f) => f !== activeFile);
        setOpenFiles(next);
        setActiveFile(
          [...next, ...(previewFile && !next.includes(previewFile) ? [previewFile] : [])][0] ?? null
        );
      }
    };

    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const hk = useSettingsStore.getState().hotkeys;
      const get = (action: string) => hk[action];

      if (combo === get(HOTKEY_ACTIONS.TOGGLE_SIDEBAR)) {
        e.preventDefault(); setSideOpen(!useWorkspaceStore.getState().sideOpen); return;
      }
      if (combo === get(HOTKEY_ACTIONS.SHOW_EXPLORER)) {
        e.preventDefault(); setSideView("explorer"); setSideOpen(true); return;
      }
      if (combo === get(HOTKEY_ACTIONS.SHOW_SEARCH)) {
        e.preventDefault(); setSideView("search"); setSideOpen(true); return;
      }
      if (combo === get(HOTKEY_ACTIONS.TOGGLE_TERMINAL)) {
        e.preventDefault(); setTerminalOpen(!useWorkspaceStore.getState().terminalOpen); return;
      }
      if (combo === get(HOTKEY_ACTIONS.TOGGLE_RIGHT_PANEL)) {
        e.preventDefault(); setRightOpen(!useWorkspaceStore.getState().rightOpen); return;
      }

      const focused = document.activeElement;
      const inInput =
        focused?.tagName === "INPUT" ||
        focused?.tagName === "TEXTAREA" ||
        (focused as HTMLElement)?.isContentEditable;

      if (combo === get(HOTKEY_ACTIONS.CLOSE_TAB) && !inInput) {
        e.preventDefault(); closeTab(); return;
      }
      if (combo === get(HOTKEY_ACTIONS.NEXT_TAB))        { e.preventDefault(); cycleTab(1);  return; }
      if (combo === get(HOTKEY_ACTIONS.PREV_TAB))        { e.preventDefault(); cycleTab(-1); return; }
      if (combo === get(HOTKEY_ACTIONS.NEXT_EDITOR_TAB)) { e.preventDefault(); cycleTab(1);  return; }
      if (combo === get(HOTKEY_ACTIONS.PREV_EDITOR_TAB)) { e.preventDefault(); cycleTab(-1); return; }

      // Cmd+1..9 — always on, not remappable
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) {
          const tabs = getAllTabs();
          if (tabs.length === 0) return;
          e.preventDefault();
          useWorkspaceStore.getState().setActiveFile(tabs[Math.min(n - 1, tabs.length - 1)]);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // reads store via getState() — always fresh, no stale closures
}
