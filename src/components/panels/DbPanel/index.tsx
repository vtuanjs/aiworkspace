// Database + cache panel: query editor, schema browser, query log.

import { useState } from "react";
import { sendToClaudeCode } from "../../../lib/sendToClaudeCode";

export const QUERY_SOURCE = {
  YOU: "YOU",
  CLAUDE_CODE: "CLAUDE_CODE",
  BLOCKED: "BLOCKED",
} as const;
export type QuerySource = typeof QUERY_SOURCE[keyof typeof QUERY_SOURCE];

export interface QueryLogEntry {
  id: string;
  source: QuerySource;
  sql: string;
  result: string | null;
  error: string | null;
  timestamp: number;
}

// Patterns that require confirmation before running (destructive gate)
const DESTRUCTIVE_PATTERN =
  /^\s*(DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*$|DELETE\s+FROM\s+\w+\s+WHERE\s*1\s*=\s*1|UPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b))/i;

function isDestructive(sql: string): boolean {
  return DESTRUCTIVE_PATTERN.test(sql.trim());
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export default function DbPanel() {
  const [query, setQuery] = useState("");
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);
  const [sendingToCC, setSendingToCC] = useState<string | null>(null);

  const executeQuery = (sql: string) => {
    const id = crypto.randomUUID();
    // No live database connection in the frontend — log the attempt with a clear message.
    setQueryLog((prev) => [
      {
        id,
        source: QUERY_SOURCE.YOU,
        sql,
        result: null,
        error: "No database connected. Configure a connection in .monocode/connections.json.",
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  };

  const handleRunQuery = () => {
    if (!query.trim()) return;

    if (isDestructive(query)) {
      setConfirmPending(query);
      return;
    }

    executeQuery(query);
  };

  const handleConfirmDestructive = () => {
    if (!confirmPending) return;
    const sql = confirmPending;
    setConfirmPending(null);
    executeQuery(sql);
  };

  const handleCancelDestructive = () => {
    if (!confirmPending) return;
    const id = crypto.randomUUID();
    // Record as BLOCKED in the log
    setQueryLog((prev) => [
      {
        id,
        source: QUERY_SOURCE.BLOCKED,
        sql: confirmPending,
        result: null,
        error: "Query cancelled by user.",
        timestamp: Date.now(),
      },
      ...prev,
    ]);
    setConfirmPending(null);
  };

  const handleSendToCC = async (entry: QueryLogEntry) => {
    setSendingToCC(entry.id);
    const resultText = entry.error
      ? `Error: ${entry.error}`
      : `Result: ${entry.result}`;
    await sendToClaudeCode({
      source: "db",
      content: `DB Query:\n${entry.sql}\n${resultText}`,
    });
    setTimeout(() => setSendingToCC(null), 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRunQuery();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "#1e1e2e",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Destructive query confirmation modal */}
      {confirmPending && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "#1e1e2e",
              border: "1px solid #f38ba8",
              borderRadius: 8,
              padding: 24,
              maxWidth: 420,
              width: "90%",
            }}
          >
            <div
              style={{
                color: "#f38ba8",
                fontWeight: 700,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              Destructive Query
            </div>
            <div
              style={{ color: "#cdd6f4", fontSize: 13, marginBottom: 16 }}
            >
              This query may delete or modify data. Are you sure you want to
              run it?
            </div>
            <pre
              style={{
                fontFamily: "'JetBrains Mono', Menlo, monospace",
                fontSize: 12,
                background: "#181825",
                padding: 10,
                borderRadius: 4,
                color: "#f38ba8",
                marginBottom: 16,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: "0 0 16px",
              }}
            >
              {confirmPending}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCancelDestructive}
                style={{
                  flex: 1,
                  padding: "7px",
                  background: "#313244",
                  border: "none",
                  borderRadius: 4,
                  color: "#cdd6f4",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDestructive}
                style={{
                  flex: 1,
                  padding: "7px",
                  background: "#f38ba8",
                  border: "none",
                  borderRadius: 4,
                  color: "#1e1e2e",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Run Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Query editor */}
      <div
        style={{
          display: "flex",
          padding: "8px",
          gap: "8px",
          borderBottom: "1px solid #313244",
          background: "#181825",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={"SELECT * FROM users LIMIT 10\n\n(Ctrl+Enter to run)"}
          style={{
            flex: 1,
            height: 88,
            background: "#313244",
            border: "1px solid #45475a",
            borderRadius: 4,
            padding: "6px 8px",
            color: "#cdd6f4",
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            fontSize: 13,
            resize: "vertical",
            outline: "none",
          }}
        />
        <button
          onClick={handleRunQuery}
          disabled={!query.trim()}
          style={{
            padding: "6px 18px",
            background: query.trim() ? "#6c7086" : "#45475a",
            border: "none",
            borderRadius: 4,
            color: "#cdd6f4",
            cursor: query.trim() ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 600,
            alignSelf: "flex-start",
            marginTop: 2,
          }}
        >
          Run
        </button>
      </div>

      {/* Query log */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        <div
          style={{
            fontSize: 11,
            color: "#6c7086",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Query Log
        </div>
        {queryLog.length === 0 ? (
          <div style={{ color: "#6c7086", fontSize: 12 }}>
            No queries run yet
          </div>
        ) : (
          queryLog.map((entry) => (
            <div
              key={entry.id}
              style={{
                background: "#181825",
                borderRadius: 4,
                padding: "8px",
                marginBottom: 8,
                border:
                  entry.source === QUERY_SOURCE.BLOCKED
                    ? "1px solid rgba(243,139,168,0.3)"
                    : "1px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    background:
                      entry.source === QUERY_SOURCE.CLAUDE_CODE
                        ? "#313244"
                        : entry.source === QUERY_SOURCE.BLOCKED
                        ? "#f38ba8"
                        : "#45475a",
                    padding: "1px 6px",
                    borderRadius: 3,
                    color:
                      entry.source === QUERY_SOURCE.BLOCKED
                        ? "#1e1e2e"
                        : entry.source === QUERY_SOURCE.CLAUDE_CODE
                        ? "#cba6f7"
                        : "#cdd6f4",
                    fontWeight: 600,
                  }}
                >
                  {entry.source === QUERY_SOURCE.CLAUDE_CODE
                    ? "Claude Code"
                    : entry.source === QUERY_SOURCE.BLOCKED
                    ? "BLOCKED"
                    : "You"}
                </span>
                <span
                  style={{ fontSize: 10, color: "#6c7086", marginLeft: "auto" }}
                >
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              <pre
                style={{
                  fontFamily:
                    "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                  fontSize: 12,
                  color: "#cdd6f4",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {entry.sql}
              </pre>
              {entry.error && (
                <div
                  style={{
                    color: "#f38ba8",
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  {entry.error}
                </div>
              )}
              {entry.result && (
                <pre
                  style={{
                    color: "#a6e3a1",
                    fontSize: 12,
                    marginTop: 6,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {entry.result}
                </pre>
              )}
              {entry.source !== QUERY_SOURCE.BLOCKED && (
                <button
                  onClick={() => handleSendToCC(entry)}
                  style={{
                    marginTop: 6,
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
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
