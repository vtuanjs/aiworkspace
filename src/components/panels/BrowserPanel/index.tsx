// Embedded browser + console log capture + Send to Claude Code.

import React, { useState, useRef, useEffect } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../../../store/workspace";
import { sendToClaudeCode } from "../../../lib/sendToClaudeCode";

export const CONSOLE_LEVEL = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  LOG: "log",
} as const;
export type ConsoleLevel = typeof CONSOLE_LEVEL[keyof typeof CONSOLE_LEVEL];

export interface ConsoleEntry {
  id: string;
  level: ConsoleLevel;
  message: string;
  source?: string;
  timestamp: number;
}

const LEVEL_COLOR: Record<ConsoleLevel, string> = {
  error: "#f38ba8",
  warn: "#fab387",
  info: "#89b4fa",
  log: "#cdd6f4",
};

export default function BrowserPanel() {
  const { browserUrl, setBrowserUrl } = useWorkspaceStore();
  const [urlInput, setUrlInput] = useState(browserUrl);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [consoleHeight, setConsoleHeight] = useState(160);
  const webviewRef = useRef<HTMLElement | null>(null);

  const startConsoleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = consoleHeight;
    const onMove = (ev: MouseEvent) => {
      setConsoleHeight(Math.max(60, Math.min(500, startH + startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Keep URL input in sync if browserUrl changes externally (e.g. MCP browser_navigate)
  useEffect(() => {
    setUrlInput(browserUrl);
  }, [browserUrl]);

  // Listen for MCP request to return console logs
  useEffect(() => {
    const unlistenPromise = listen("mcp:request_console_logs", async () => {
      await emit("mcp:console_logs", consoleLogs);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [consoleLogs]);

  const handleNavigate = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setBrowserUrl(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleNavigate();
  };

  const handleSendToClaudeCode = async (entry: ConsoleEntry) => {
    setSendingId(entry.id);
    await sendToClaudeCode({
      source: "browser",
      content: `Browser ${entry.level} at ${browserUrl}:\n${entry.message}${
        entry.source ? `\nSource: ${entry.source}` : ""
      }`,
    });
    setTimeout(() => setSendingId(null), 1200);
  };

  const handleClearConsole = () => {
    setConsoleLogs([]);
  };

  // Inject a console-capturing script into the webview when the URL changes.
  // In Tauri 2, <webview> is a custom element. We post-process its dom-ready event
  // to capture window.console calls and push them into our React state.
  // Note: direct DOM manipulation of the webview tag is the supported approach here
  // because the panel runs inside the main WebView partition.
  const handleWebviewRef = (el: HTMLElement | null) => {
    if (!el || webviewRef.current === el) return;
    webviewRef.current = el;

    const addLog = (level: ConsoleLevel, message: string, source?: string) => {
      setConsoleLogs((prev) => [
        {
          id: crypto.randomUUID(),
          level,
          message,
          source,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    };

    // Tauri's webview tag supports event listeners for dom-ready
    el.addEventListener("dom-ready", () => {
      // Inject console override script into the embedded page
      const script = `
        (function() {
          const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
          ['log','info','warn','error'].forEach(function(level) {
            console[level] = function() {
              original[level].apply(console, arguments);
              try {
                const msg = Array.from(arguments).map(function(a) {
                  return typeof a === 'object' ? JSON.stringify(a) : String(a);
                }).join(' ');
                window.__aiworkspace_log && window.__aiworkspace_log(level, msg);
              } catch(_) {}
            };
          });
        })();
      `;
      // executeJavaScript is available on Tauri webview elements
      (el as unknown as { executeJavaScript: (s: string) => Promise<unknown> })
        .executeJavaScript(script)
        .catch(() => {});
    });

    // Listen for console messages from the embedded page via IPC message
    el.addEventListener(
      "ipc-message",
      (evt: Event) => {
        const e = evt as CustomEvent<{ channel: string; args: unknown[] }>;
        if (e.detail?.channel === "console") {
          const [level, message, source] = e.detail.args as [
            ConsoleLevel,
            string,
            string | undefined,
          ];
          addLog(level, message, source);
        }
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e" }}>
      {/* URL bar */}
      <div
        style={{
          display: "flex",
          padding: "8px",
          gap: "8px",
          borderBottom: "1px solid #313244",
          background: "#181825",
          flexShrink: 0,
        }}
      >
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://localhost:3000"
          style={{
            flex: 1,
            background: "#313244",
            border: "1px solid #45475a",
            borderRadius: 4,
            padding: "4px 8px",
            color: "#cdd6f4",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={handleNavigate}
          style={{
            padding: "4px 14px",
            background: "#6c7086",
            border: "none",
            borderRadius: 4,
            color: "#cdd6f4",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Go
        </button>
      </div>

      {/* Webview */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {browserUrl ? (
          ((): React.ReactNode => {
            const WebviewTag = "webview" as unknown as React.ElementType;
            return (
              <WebviewTag
                ref={handleWebviewRef}
                src={browserUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            );
          })()
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6c7086",
              fontSize: 14,
            }}
          >
            Enter a URL to navigate
          </div>
        )}
      </div>

      {/* Console — bottom, resizable */}
      <div
        style={{
          height: consoleHeight,
          flexShrink: 0,
          borderTop: "1px solid #313244",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Drag handle + header */}
        <div
          onMouseDown={startConsoleResize}
          style={{
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            background: "#181825",
            borderBottom: "1px solid #313244",
            flexShrink: 0,
            cursor: "row-resize",
            userSelect: "none",
          }}
        >
          <span style={{ color: "#a6adc8", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            CONSOLE
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleClearConsole(); }}
            title="Clear console"
            style={{
              background: "none",
              border: "none",
              color: "#6c7086",
              cursor: "pointer",
              fontSize: 11,
              padding: "1px 4px",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            Clear
          </button>
        </div>

        {/* Log entries */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {consoleLogs.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#6c7086", fontSize: 12 }}>
              No console output
            </div>
          ) : (
            consoleLogs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "3px 10px",
                  borderBottom: "1px solid #181825",
                  background: entry.level === CONSOLE_LEVEL.ERROR ? "rgba(243,139,168,0.05)" : "transparent",
                }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: LEVEL_COLOR[entry.level],
                      fontWeight: 600,
                      textTransform: "uppercase",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {entry.level}
                  </span>
                  <span style={{ color: LEVEL_COLOR[entry.level], fontSize: 12, wordBreak: "break-word", flex: 1 }}>
                    {entry.message}
                  </span>
                </div>
                {entry.source && (
                  <div style={{ color: "#6c7086", fontSize: 10, marginTop: 1 }}>{entry.source}</div>
                )}
                {(entry.level === CONSOLE_LEVEL.ERROR || entry.level === CONSOLE_LEVEL.WARN) && (
                  <button
                    onClick={() => handleSendToClaudeCode(entry)}
                    style={{
                      marginTop: 3,
                      padding: "2px 8px",
                      fontSize: 11,
                      background: sendingId === entry.id ? "#a6e3a1" : "#313244",
                      border: "none",
                      borderRadius: 4,
                      color: sendingId === entry.id ? "#1e1e2e" : "#cdd6f4",
                      cursor: "pointer",
                      transition: "background 0.3s",
                    }}
                  >
                    {sendingId === entry.id ? "Sent!" : "Send to Claude Code"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
