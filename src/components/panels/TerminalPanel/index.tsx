// Claude Code lives here. Built on xterm.js + PTY managed by Rust.

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../../../store/workspace";
import { useProjectsStore } from "../../../store/projects";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputPayload {
  terminal_id: string;
  data: string;
}

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Stable terminal ID per panel mount — does NOT change on re-renders
  const terminalIdRef = useRef<string>(crypto.randomUUID());

  const { setActiveTerminalId } = useWorkspaceStore();
  const { activeProjectId, projects } = useProjectsStore();

  useEffect(() => {
    if (!containerRef.current || !activeProjectId) return;

    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return;

    const terminalId = terminalIdRef.current;

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
    term.open(containerRef.current);

    // Fit after a brief paint delay so the container has its final dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register this terminal as the active one for sendToClaudeCode
    setActiveTerminalId(terminalId);

    // Create PTY on the Rust side
    invoke("create_terminal", {
      terminalId,
      projectPath: project.path,
    }).catch((err) => {
      term.writeln(`\x1b[31m[AIWorkspace] Failed to create terminal: ${err}\x1b[0m`);
    });

    // Forward keyboard / paste input to PTY
    const onDataDisposable = term.onData((data) => {
      invoke("write_terminal", { terminalId, data }).catch(() => {
        // Terminal may have been closed; ignore write errors
      });
    });

    // Stream PTY output back to xterm
    const unlistenPromise = listen<TerminalOutputPayload>(
      "terminal:output",
      (event) => {
        if (event.payload.terminal_id === terminalId) {
          term.write(event.payload.data);
        }
      }
    );

    // Resize observer — keep PTY dimensions in sync with container
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // Debounce slightly to avoid excessive Tauri calls during smooth resize
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        invoke("resize_terminal", {
          terminalId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }, 50);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      unlistenPromise.then((unlisten) => unlisten());
      invoke("close_terminal", { terminalId }).catch(() => {});
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [activeProjectId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#1e1e2e",
        // xterm.js needs the container to have explicit dimensions
        boxSizing: "border-box",
      }}
    />
  );
}
