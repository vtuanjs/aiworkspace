// Claude Code lives here. Built on xterm.js + PTY managed by Rust.

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../../../store/workspace";
import { useWorkspacesStore } from "../../../store/workspaces";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputPayload {
  terminal_id: string;
  data: string;
}

interface TerminalEntry {
  term: Terminal;
  fitAddon: FitAddon;
  terminalId: string;
  div: HTMLDivElement;
}

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-workspace terminal instances — never destroyed on workspace switch
  const terminalsRef = useRef<Map<string, TerminalEntry>>(new Map());

  const { setActiveTerminalId } = useWorkspaceStore();
  const { activeWorkspaceId, workspaces } = useWorkspacesStore();

  // Single long-lived output listener for all workspace terminals
  useEffect(() => {
    const unlistenPromise = listen<TerminalOutputPayload>(
      "terminal:output",
      (event) => {
        terminalsRef.current.forEach((entry) => {
          if (event.payload.terminal_id === entry.terminalId) {
            entry.term.write(event.payload.data);
          }
        });
      }
    );

    return () => {
      // Close all PTYs and dispose all terminals on full unmount
      terminalsRef.current.forEach((entry) => {
        invoke("close_terminal", { terminalId: entry.terminalId }).catch(() => {});
        entry.term.dispose();
      });
      terminalsRef.current.clear();
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []); // runs once on mount, cleans up on full unmount only

  // Handle workspace switch: show the right terminal, create if first visit
  useEffect(() => {
    if (!containerRef.current || !activeWorkspaceId) return;

    const container = containerRef.current;
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) return;

    let entry = terminalsRef.current.get(activeWorkspaceId);

    if (!entry) {
      // First time visiting this workspace — create terminal
      const terminalId = crypto.randomUUID();

      const div = document.createElement("div");
      div.style.cssText = "width:100%;height:100%;";

      const term = new Terminal({
        cursorBlink: true,
        theme: {
          background: "#1e1e2e",
          foreground: "#cdd6f4",
          cursor: "#f5c2e7",
          selectionBackground: "#45475a",
          black: "#45475a",
          red: "#f38ba8",
          green: "#a6e3a1",
          yellow: "#f9e2af",
          blue: "#89b4fa",
          magenta: "#f5c2e7",
          cyan: "#94e2d5",
          white: "#bac2de",
        },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
        scrollback: 5000,
        allowTransparency: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(div);

      entry = { term, fitAddon, terminalId, div };
      terminalsRef.current.set(activeWorkspaceId, entry);

      // Forward keyboard / paste input to PTY
      term.onData((data) => {
        invoke("write_terminal", { terminalId, data }).catch(() => {});
      });

      // Create PTY on the Rust side
      invoke("create_terminal", {
        terminalId,
        projectPath: workspace.path,
      }).catch((err) => {
        term.writeln(`\x1b[31m[AIWorkspace] Failed to create terminal: ${err}\x1b[0m`);
      });
    }

    // Hide all terminal divs currently in the container
    Array.from(container.children).forEach((child) => {
      (child as HTMLElement).style.display = "none";
    });

    // Append this workspace's terminal div if not already there
    if (!container.contains(entry.div)) {
      container.appendChild(entry.div);
    }
    entry.div.style.display = "";

    // Fit terminal to container after it becomes visible
    requestAnimationFrame(() => {
      entry!.fitAddon.fit();
      invoke("resize_terminal", {
        terminalId: entry!.terminalId,
        cols: entry!.term.cols,
        rows: entry!.term.rows,
      }).catch(() => {});
    });

    // Register as the active terminal for sendToClaudeCode
    setActiveTerminalId(entry.terminalId);

    // Resize observer — keep PTY in sync
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        entry!.fitAddon.fit();
        invoke("resize_terminal", {
          terminalId: entry!.terminalId,
          cols: entry!.term.cols,
          rows: entry!.term.rows,
        }).catch(() => {});
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      // Do NOT close the terminal — it stays alive for when we return
    };
  }, [activeWorkspaceId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#1e1e2e",
        boxSizing: "border-box",
      }}
    />
  );
}
