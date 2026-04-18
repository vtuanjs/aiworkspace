// HTTP client: request editor, collections sidebar, request log + Send to Claude Code.

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

export default function HttpPanel() {
  const [method, setMethod] = useState<HttpMethod>(HTTP_METHOD.GET);
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [headersText, setHeadersText] = useState(
    '{\n  "Content-Type": "application/json"\n}'
  );
  const [log, setLog] = useState<HttpLogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HttpLogEntry | null>(null);
  const [sendingToCC, setSendingToCC] = useState<string | null>(null);

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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // Invalid JSON — use empty headers
    }
    return {};
  };

  const handleSend = async () => {
    if (!url.trim()) return;
    setSending(true);

    const req: HttpRequest = {
      method,
      url: url.trim(),
      headers: parseHeaders(),
      body: body.trim() || undefined,
    };

    const entry = await executeRequest(req, REQUEST_SOURCE.YOU);
    setLog((prev) => [entry, ...prev]);
    setSelectedEntry(entry);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) handleSend();
  };

  const handleSendToCC = async (entry: HttpLogEntry) => {
    setSendingToCC(entry.id);
    const statusText = entry.response
      ? `Status: ${entry.response.status} (${entry.response.timeMs}ms)`
      : `Error: ${entry.error}`;
    const bodyText = entry.response
      ? `\nBody:\n${entry.response.body.slice(0, 500)}${
          entry.response.body.length > 500 ? "\n... (truncated)" : ""
        }`
      : "";
    await sendToClaudeCode({
      source: "http",
      content: `HTTP ${entry.request.method} ${entry.request.url}\n${statusText}${bodyText}`,
    });
    setTimeout(() => setSendingToCC(null), 1200);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "#1e1e2e" }}>
      {/* Left: request editor + response preview */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #313244",
          overflow: "hidden",
        }}
      >
        {/* URL bar */}
        <div
          style={{
            display: "flex",
            padding: "8px",
            gap: "8px",
            borderBottom: "1px solid #313244",
            background: "#181825",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            style={{
              background: "#313244",
              border: "1px solid #45475a",
              borderRadius: 4,
              padding: "4px 6px",
              color: METHOD_COLOR[method],
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {Object.values(HTTP_METHOD).map((m) => (
              <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>
                {m}
              </option>
            ))}
          </select>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://api.example.com/endpoint"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#313244",
                border: `1px solid ${unresolvedInUrl.length > 0 ? "#f38ba8" : "#45475a"}`,
                borderRadius: 4,
                padding: "4px 8px",
                color: "#cdd6f4",
                fontSize: 13,
                outline: "none",
              }}
            />
            {unresolvedInUrl.length > 0 && (
              <div
                title={`Unresolved: ${unresolvedInUrl.map((v) => `{{${v}}}`).join(", ")}`}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 10,
                  color: "#f38ba8",
                  pointerEvents: "none",
                }}
              >
                {unresolvedInUrl.map((v) => `{{${v}}}`).join(" ")}
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !url.trim()}
            style={{
              padding: "4px 18px",
              background: sending ? "#45475a" : "#6c7086",
              border: "none",
              borderRadius: 4,
              color: "#cdd6f4",
              cursor: sending ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>

        {/* Request body + headers */}
        <div
          style={{
            display: "flex",
            flex: 1,
            overflow: "hidden",
            borderBottom: "1px solid #313244",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid #313244",
            }}
          >
            <div
              style={{
                padding: "4px 8px",
                fontSize: 10,
                color: "#6c7086",
                background: "#181825",
                borderBottom: "1px solid #313244",
                flexShrink: 0,
              }}
            >
              BODY
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{ "key": "value" }'
              style={{
                flex: 1,
                background: "#1e1e2e",
                border: "none",
                padding: "8px",
                color: "#cdd6f4",
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                fontSize: 12,
                resize: "none",
                outline: "none",
              }}
            />
          </div>
          <div style={{ width: 220, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                padding: "4px 8px",
                fontSize: 10,
                color: "#6c7086",
                background: "#181825",
                borderBottom: "1px solid #313244",
                flexShrink: 0,
              }}
            >
              HEADERS (JSON)
            </div>
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              style={{
                flex: 1,
                background: "#1e1e2e",
                border: "none",
                padding: "8px",
                color: "#cdd6f4",
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                fontSize: 12,
                resize: "none",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Response preview */}
        {selectedEntry && (
          <div
            style={{
              maxHeight: 220,
              overflow: "auto",
              padding: "8px",
              borderTop: "1px solid #313244",
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
              fontSize: 12,
              background: "#181825",
              flexShrink: 0,
            }}
          >
            {selectedEntry.response ? (
              <>
                <span
                  style={{
                    color:
                      selectedEntry.response.status < 400
                        ? "#a6e3a1"
                        : "#f38ba8",
                    fontWeight: 700,
                  }}
                >
                  {selectedEntry.response.status}
                </span>{" "}
                <span style={{ color: "#6c7086" }}>
                  {selectedEntry.response.timeMs}ms
                </span>
                <pre
                  style={{
                    margin: "6px 0 0",
                    color: "#cdd6f4",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {selectedEntry.response.body.slice(0, 2000)}
                  {selectedEntry.response.body.length > 2000 && (
                    <span style={{ color: "#6c7086" }}>
                      {"\n"}... (truncated)
                    </span>
                  )}
                </pre>
              </>
            ) : (
              <span style={{ color: "#f38ba8" }}>{selectedEntry.error}</span>
            )}
          </div>
        )}
      </div>

      {/* Right: request log */}
      <div
        style={{
          width: 320,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderBottom: "1px solid #313244",
            background: "#181825",
            color: "#cdd6f4",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Request Log
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {log.length === 0 ? (
            <div style={{ padding: "16px", color: "#6c7086", fontSize: 12 }}>
              No requests yet
            </div>
          ) : (
            log.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #181825",
                    cursor: "pointer",
                    background: isSelected ? "#313244" : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        background:
                          entry.source === REQUEST_SOURCE.CLAUDE_CODE
                            ? "#313244"
                            : "#45475a",
                        padding: "1px 5px",
                        borderRadius: 3,
                        color:
                          entry.source === REQUEST_SOURCE.CLAUDE_CODE
                            ? "#cba6f7"
                            : "#cdd6f4",
                        flexShrink: 0,
                      }}
                    >
                      {entry.source === REQUEST_SOURCE.CLAUDE_CODE
                        ? "Claude Code"
                        : "You"}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          METHOD_COLOR[entry.request.method as HttpMethod] ??
                          "#cdd6f4",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {entry.request.method}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#cdd6f4",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.request.url}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          entry.response && entry.response.status < 400
                            ? "#a6e3a1"
                            : "#f38ba8",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {entry.response?.status ?? "err"}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendToCC(entry);
                    }}
                    style={{
                      padding: "1px 6px",
                      fontSize: 10,
                      background:
                        sendingToCC === entry.id ? "#a6e3a1" : "#313244",
                      border: "none",
                      borderRadius: 3,
                      color:
                        sendingToCC === entry.id ? "#1e1e2e" : "#cdd6f4",
                      cursor: "pointer",
                      transition: "background 0.3s",
                    }}
                  >
                    {sendingToCC === entry.id ? "Sent!" : "→ Claude Code"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
