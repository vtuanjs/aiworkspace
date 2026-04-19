// Native child webview container. Rust positions it to the exact bounds of this div.
// getBoundingClientRect() returns CSS logical pixels; Tauri on macOS needs physical pixels,
// so we multiply by devicePixelRatio.

import { useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../../../store/workspace";

interface BrowserData {
  type: string;
  [key: string]: unknown;
}

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

const ERUDA_SHOW_JS = `(function(){
  if(window.__eruda_initialized){eruda.show();return;}
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/eruda';
  s.onload=function(){eruda.init();window.__eruda_initialized=true;eruda.show();};
  document.head.appendChild(s);
})();`;

const ERUDA_HIDE_JS = `if(window.__eruda_initialized)eruda.hide();`;

export default function BrowserView({ erudaActive }: { erudaActive: boolean }) {
  const { browserUrl, setBrowserUrl, rightTab } = useWorkspaceStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewOpenRef = useRef(false);
  const erudaActiveRef = useRef(erudaActive);

  const openOrNavigate = useCallback(async (url: string) => {
    const el = containerRef.current;
    if (!el || !url) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const bounds = getClientBounds(el);
    if (!bounds) return;
    try {
      await invoke("browser_open", { url, ...bounds });
      webviewOpenRef.current = true;
    } catch (e) {
      console.error("[BrowserView] browser_open failed:", e);
    }
  }, []);

  useEffect(() => {
    if (browserUrl) openOrNavigate(browserUrl);
  }, [browserUrl, openOrNavigate]);

  useEffect(() => {
    if (rightTab !== "browser") {
      invoke("browser_close", {}).catch(() => {});
      webviewOpenRef.current = false;
    } else if (browserUrl) {
      openOrNavigate(browserUrl);
    }
  }, [rightTab, browserUrl, openOrNavigate]);

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

  // Keep ref in sync for use inside event callbacks
  useEffect(() => { erudaActiveRef.current = erudaActive; }, [erudaActive]);

  // Show/hide eruda when toggle changes (page already loaded)
  useEffect(() => {
    if (!webviewOpenRef.current) return;
    invoke("browser_eval", { script: erudaActive ? ERUDA_SHOW_JS : ERUDA_HIDE_JS }).catch(() => {});
  }, [erudaActive]);

  useEffect(() => {
    const p = listen<BrowserData>("browser:data", (evt) => {
      const data = evt.payload;
      if (data.type === "navigate") {
        setBrowserUrl(data.url as string);
        // Re-inject eruda after page navigation if it was active
        if (erudaActiveRef.current) {
          setTimeout(() => {
            invoke("browser_eval", { script: ERUDA_SHOW_JS }).catch(() => {});
          }, 500);
        }
      } else if (data.type === "devtools") {
        invoke("browser_eval", { script: ERUDA_SHOW_JS }).catch(() => {});
      }
    }).catch(() => Promise.resolve(() => {}));
    return () => { p.then((u) => u()); };
  }, [setBrowserUrl]);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: "#11111b", position: "relative" }}>
      {!browserUrl && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#6c7086", fontSize: 13 }}>Enter a URL above to navigate</span>
        </div>
      )}
    </div>
  );
}
