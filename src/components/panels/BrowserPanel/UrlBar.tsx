import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../../store/workspace";

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

export default function UrlBar({ erudaActive, onToggleInspect }: { erudaActive: boolean; onToggleInspect: () => void }) {
  const { browserUrl, setBrowserUrl } = useWorkspaceStore();
  const [inputUrl, setInputUrl] = useState(browserUrl || "");

  useEffect(() => {
    setInputUrl(browserUrl || "");
  }, [browserUrl]);

  const handleNavigate = useCallback(() => {
    const url = normalizeUrl(inputUrl);
    if (!url) return;
    setInputUrl(url);
    setBrowserUrl(url);
  }, [inputUrl, setBrowserUrl]);

  return (
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
        title="Toggle DevTools"
        onClick={onToggleInspect}
        style={{
          ...BTN_BASE,
          padding: "2px 7px",
          height: 24,
          borderRadius: 4,
          border: `1px solid ${erudaActive ? "#cba6f7" : "#45475a"}`,
          fontSize: 11,
          background: erudaActive ? "#313244" : "transparent",
          color: erudaActive ? "#cba6f7" : "#6c7086",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#313244"; (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = erudaActive ? "#313244" : "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = erudaActive ? "#cba6f7" : "#6c7086";
        }}
      >
        Inspect
      </button>
    </div>
  );
}
