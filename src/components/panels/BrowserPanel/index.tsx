// Embedded browser as a child webview inside the main Tauri window.
// Positioned using client-relative coordinates from getBoundingClientRect.

import { useRef, useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../../../store/workspace";

interface BrowserData {
  type: string;
  [key: string]: unknown;
}

// getBoundingClientRect() returns CSS logical pixels, but Tauri's add_child/set_position
// on macOS expects physical pixels. Multiply by devicePixelRatio so Rust can use
// PhysicalPosition/PhysicalSize and get pixel-perfect placement on Retina displays.
function getClientBounds(el: HTMLElement): { x: number; y: number; width: number; height: number } | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  };
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

const BTN_BASE: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#6c7086",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "background 0.1s, color 0.1s",
};

function ToolBtn({ title, onClick, children, style }: { title: string; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ ...BTN_BASE, width: 26, height: 24, borderRadius: 4, fontSize: 14, ...style }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#313244"; (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#6c7086"; }}
    >
      {children}
    </button>
  );
}

export default function BrowserPanel() {
  const { browserUrl, setBrowserUrl, rightTab } = useWorkspaceStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewOpenRef = useRef(false);
  const [inputUrl, setInputUrl] = useState(browserUrl || "");

  // Sync address bar when URL changes from in-webview navigation
  useEffect(() => {
    setInputUrl(browserUrl || "");
  }, [browserUrl]);

  const handleNavigate = useCallback(() => {
    const url = normalizeUrl(inputUrl);
    if (!url) return;
    setInputUrl(url);
    setBrowserUrl(url);
  }, [inputUrl, setBrowserUrl]);

  const openOrNavigate = useCallback(async (url: string) => {
    const el = containerRef.current;
    if (!el || !url) return;
    // Wait for sibling toolbar and layout to settle before measuring bounds.
    // RAF alone can miss conditional siblings that render in the same cycle.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const bounds = getClientBounds(el);
    if (!bounds) return;
    try {
      await invoke("browser_open", { url, ...bounds });
      webviewOpenRef.current = true;
    } catch (e) {
      console.error("[BrowserPanel] browser_open failed:", e);
    }
  }, []);

  useEffect(() => {
    if (browserUrl) openOrNavigate(browserUrl);
  }, [browserUrl, openOrNavigate]);

  // Close browser window when switching to HTTP/DB tab; reopen when back to Browser.
  useEffect(() => {
    if (rightTab !== "browser") {
      invoke("browser_close", {}).catch(() => {});
      webviewOpenRef.current = false;
    } else if (browserUrl) {
      openOrNavigate(browserUrl);
    }
  }, [rightTab, browserUrl, openOrNavigate]);

  // Resize observer — reposition/close child webview as panel resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(async (entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) {
        invoke("browser_close", {}).catch(() => {});
        webviewOpenRef.current = false;
      } else if (webviewOpenRef.current) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const bounds = getClientBounds(el);
        if (bounds) invoke("browser_set_bounds", bounds).catch(() => {});
      } else if (browserUrl) {
        openOrNavigate(browserUrl);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      invoke("browser_close", {}).catch(() => {});
      webviewOpenRef.current = false;
    };
  }, [browserUrl, openOrNavigate]);

  // Relay events from the injected init script
  useEffect(() => {
    const p = listen<BrowserData>("browser:data", (evt) => {
      const data = evt.payload;
      if (data.type === "navigate") {
        setBrowserUrl(data.url as string);
      } else if (data.type === "devtools") {
        invoke("browser_open_devtools", {}).catch(() => {});
      }
    }).catch(() => Promise.resolve(() => {}));
    return () => { p.then((u) => u()); };
  }, [setBrowserUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#1e1e2e" }}>
      {/* URL toolbar — always visible so users can enter a URL even before any page loads */}
      <div style={{
        height: 36,
        background: "#181825",
        borderBottom: "1px solid #313244",
        display: "flex",
        alignItems: "center",
        padding: "0 6px",
        gap: 4,
        flexShrink: 0,
      }}>
        <ToolBtn title="Back" onClick={() => invoke("browser_go_back", {}).catch(() => {})}>←</ToolBtn>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleNavigate(); }}
          placeholder="Enter URL and press Enter…"
          style={{
            flex: 1,
            minWidth: 0,
            background: "#313244",
            border: "1px solid #45475a",
            borderRadius: 4,
            padding: "3px 8px",
            color: "#cdd6f4",
            fontSize: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#cba6f7"; }}
          onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#45475a"; }}
        />
        <button
          title="Open DevTools"
          onClick={() => invoke("browser_open_devtools", {}).catch(() => {})}
          style={{
            ...BTN_BASE,
            padding: "2px 7px",
            height: 24,
            borderRadius: 4,
            border: "1px solid #45475a",
            fontSize: 11,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#313244"; (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#6c7086"; }}
        >
          Inspect
        </button>
      </div>

      {/* Native child webview fills this div — Rust positions it to these exact bounds */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: "#11111b", position: "relative" }}>
        {!browserUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#6c7086", fontSize: 13 }}>Enter a URL above to navigate</span>
          </div>
        )}
      </div>
    </div>
  );
}
