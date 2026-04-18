// HTTP client: top-to-bottom layout — header, request, response, request log.

import { useState, useMemo } from "react";
import {
  executeRequest,
  HttpRequest,
  HttpLogEntry,
  REQUEST_SOURCE,
} from "../../../lib/httpExecutor";
import { sendToClaudeCode } from "../../../lib/sendToClaudeCode";
import { resolveVariables } from "../../../lib/resolveVariables";
import { useEnvironmentStore } from "../../../store/environment";

export const HTTP_METHOD = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;
export type HttpMethod = typeof HTTP_METHOD[keyof typeof HTTP_METHOD];

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: "#a6e3a1",
  POST: "#89b4fa",
  PUT: "#f9e2af",
  PATCH: "#fab387",
  DELETE: "#f38ba8",
};

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
  fontSize: 12,
};

function SectionHeader({
  label,
  open,
  onToggle,
  badge,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        height: 28,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        background: "#11111b",
        borderBottom: "1px solid #313244",
        borderTop: "1px solid #313244",
        cursor: "pointer",
        userSelect: "none",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e2e")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#11111b")}
    >
      <span style={{ color: "#6c7086", fontSize: 9 }}>{open ? "▼" : "▶"}</span>
      <span style={{ color: "#a6adc8", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", flex: 1 }}>
        {label}
      </span>
      {badge && (
        <span style={{ color: "#6c7086", fontSize: 10 }}>{badge}</span>
      )}
    </div>
  );
}

export default function HttpPanel() {
  const [method, setMethod] = useState<HttpMethod>(HTTP_METHOD.GET);
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}');
  const [log, setLog] = useState<HttpLogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HttpLogEntry | null>(null);
  const [sendingToCC, setSendingToCC] = useState<string | null>(null);
  const [requestTab, setRequestTab] = useState<"body" | "headers">("body");

  const [requestOpen, setRequestOpen] = useState(true);
  const [responseOpen, setResponseOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(true);

  const envStore = useEnvironmentStore();
  const unresolvedInUrl = useMemo(() => {
    const tokens = envStore.getActiveRuntimeTokens();
    const vars = envStore.getActiveVariables();
    const { unresolved } = resolveVariables(url, tokens, vars);
    return unresolved;
  }, [url, envStore]);

  const parseHeaders = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(headersText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
    } catch { /* invalid JSON */ }
    return {};
  };

  const handleSend = async () => {
    if (!url.trim()) return;
    setSending(true);
    const req: HttpRequest = { method, url: url.trim(), headers: parseHeaders(), body: body.trim() || undefined };
    const entry = await executeRequest(req, REQUEST_SOURCE.YOU);
    setLog((prev) => [entry, ...prev]);
    setSelectedEntry(entry);
    setResponseOpen(true);
    setSending(false);
  };

  const handleSendToCC = async (entry: HttpLogEntry) => {
    setSendingToCC(entry.id);
    const statusText = entry.response
      ? `Status: ${entry.response.status} (${entry.response.timeMs}ms)`
      : `Error: ${entry.error}`;
    const bodyText = entry.response
      ? `\nBody:\n${entry.response.body.slice(0, 500)}${entry.response.body.length > 500 ? "\n... (truncated)" : ""}`
      : "";
    await sendToClaudeCode({ source: "http", content: `HTTP ${entry.request.method} ${entry.request.url}\n${statusText}${bodyText}` });
    setTimeout(() => setSendingToCC(null), 1200);
  };

  const response = selectedEntry?.response ?? null;
  const responseStatus = response?.status;
  const statusColor = responseStatus ? (responseStatus < 400 ? "#a6e3a1" : "#f38ba8") : "#6c7086";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px",
          background: "#181825",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
        }}
      >
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
          style={{
            background: "#313244",
            border: "1px solid #45475a",
            borderRadius: 4,
            padding: "5px 6px",
            color: METHOD_COLOR[method],
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {Object.values(HTTP_METHOD).map((m) => (
            <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>{m}</option>
          ))}
        </select>

        <div style={{ flex: 1, position: "relative" }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
            placeholder="https://api.example.com/endpoint"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#313244",
              border: `1px solid ${unresolvedInUrl.length > 0 ? "#f38ba8" : "#45475a"}`,
              borderRadius: 4,
              padding: "5px 8px",
              color: "#cdd6f4",
              fontSize: 13,
              outline: "none",
            }}
          />
          {unresolvedInUrl.length > 0 && (
            <div
              title={`Unresolved: ${unresolvedInUrl.map((v) => `{{${v}}}`).join(", ")}`}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#f38ba8", pointerEvents: "none" }}
            >
              {unresolvedInUrl.map((v) => `{{${v}}}`).join(" ")}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !url.trim()}
          style={{
            padding: "5px 18px",
            background: sending ? "#45475a" : "#cba6f7",
            border: "none",
            borderRadius: 4,
            color: sending ? "#cdd6f4" : "#1e1e2e",
            cursor: sending ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {sending ? "..." : "Send"}
        </button>
      </div>

      {/* ── REQUEST ── */}
      <SectionHeader
        label="REQUEST"
        open={requestOpen}
        onToggle={() => setRequestOpen((v) => !v)}
      />
      {requestOpen && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 120 }}>
          {/* Sub-tabs */}
          <div style={{ display: "flex", background: "#181825", borderBottom: "1px solid #313244", flexShrink: 0 }}>
            {(["body", "headers"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRequestTab(tab)}
                style={{
                  padding: "4px 14px",
                  border: "none",
                  borderBottom: requestTab === tab ? "2px solid #cba6f7" : "2px solid transparent",
                  background: "transparent",
                  color: requestTab === tab ? "#cdd6f4" : "#6c7086",
                  fontSize: 11,
                  fontWeight: requestTab === tab ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          {requestTab === "body" ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'{ "key": "value" }'}
              style={{ flex: 1, ...MONO, background: "#1e1e2e", border: "none", padding: "8px", color: "#cdd6f4", resize: "none", outline: "none" }}
            />
          ) : (
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              style={{ flex: 1, ...MONO, background: "#1e1e2e", border: "none", padding: "8px", color: "#cdd6f4", resize: "none", outline: "none" }}
            />
          )}
        </div>
      )}

      {/* ── RESPONSE ── */}
      <SectionHeader
        label="RESPONSE"
        open={responseOpen}
        onToggle={() => setResponseOpen((v) => !v)}
        badge={responseStatus ? `${responseStatus}` : undefined}
      />
      {responseOpen && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 100 }}>
          {!selectedEntry ? (
            <div style={{ padding: "12px", color: "#6c7086", fontSize: 12 }}>No response yet</div>
          ) : selectedEntry.error ? (
            <div style={{ padding: "12px", color: "#f38ba8", fontSize: 12 }}>{selectedEntry.error}</div>
          ) : (
            <>
              {/* Status bar */}
              <div style={{ display: "flex", gap: 12, padding: "6px 10px", background: "#181825", borderBottom: "1px solid #313244", flexShrink: 0, alignItems: "center" }}>
                <span style={{ ...MONO, color: statusColor, fontWeight: 700 }}>{responseStatus}</span>
                <span style={{ ...MONO, color: "#6c7086" }}>{response?.timeMs}ms</span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => handleSendToCC(selectedEntry)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
                    background: sendingToCC === selectedEntry.id ? "#a6e3a1" : "#313244",
                    border: "none",
                    borderRadius: 3,
                    color: sendingToCC === selectedEntry.id ? "#1e1e2e" : "#cdd6f4",
                    cursor: "pointer",
                  }}
                >
                  {sendingToCC === selectedEntry.id ? "Sent!" : "→ Claude Code"}
                </button>
              </div>
              {/* Body */}
              <pre
                style={{
                  flex: 1,
                  ...MONO,
                  margin: 0,
                  padding: "8px 10px",
                  color: "#cdd6f4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowY: "auto",
                  background: "#1e1e2e",
                }}
              >
                {response?.body.slice(0, 4000)}
                {(response?.body.length ?? 0) > 4000 && <span style={{ color: "#6c7086" }}>{"\n"}... (truncated)</span>}
              </pre>
            </>
          )}
        </div>
      )}

      {/* ── REQUEST LOG ── */}
      <SectionHeader
        label="REQUEST LOG"
        open={logOpen}
        onToggle={() => setLogOpen((v) => !v)}
        badge={log.length > 0 ? `${log.length}` : undefined}
      />
      {logOpen && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 80 }}>
          {log.length === 0 ? (
            <div style={{ padding: "12px", color: "#6c7086", fontSize: 12 }}>No requests yet</div>
          ) : (
            log.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              const entryStatus = entry.response?.status;
              const entryColor = entryStatus ? (entryStatus < 400 ? "#a6e3a1" : "#f38ba8") : "#f38ba8";
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #1e1e2e",
                    cursor: "pointer",
                    background: isSelected ? "#2a2a3d" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#1e1e2e"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: METHOD_COLOR[entry.request.method as HttpMethod] ?? "#cdd6f4", fontWeight: 700, flexShrink: 0 }}>
                      {entry.request.method}
                    </span>
                    <span style={{ fontSize: 11, color: "#cdd6f4", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.request.url}
                    </span>
                    <span style={{ fontSize: 11, color: entryColor, fontWeight: 600, flexShrink: 0 }}>
                      {entryStatus ?? "err"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: entry.source === REQUEST_SOURCE.CLAUDE_CODE ? "#cba6f7" : "#6c7086" }}>
                      {entry.source === REQUEST_SOURCE.CLAUDE_CODE ? "Claude Code" : "You"}
                    </span>
                    {entry.response && <span style={{ fontSize: 10, color: "#6c7086" }}>{entry.response.timeMs}ms</span>}
                    <span style={{ flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendToCC(entry); }}
                      style={{
                        padding: "1px 6px",
                        fontSize: 10,
                        background: sendingToCC === entry.id ? "#a6e3a1" : "#313244",
                        border: "none",
                        borderRadius: 3,
                        color: sendingToCC === entry.id ? "#1e1e2e" : "#cdd6f4",
                        cursor: "pointer",
                      }}
                    >
                      {sendingToCC === entry.id ? "Sent!" : "→ CC"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
