import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../../store/workspace";
import { useWorkspacesStore } from "../../../store/workspaces";

interface SearchMatch {
  file_path: string;
  line_number: number;
  line: string;
  match_start: number;
  match_end: number;
}

interface FileGroup {
  filePath: string;
  fileName: string;
  relativePath: string;
  matches: SearchMatch[];
}

function groupByFile(matches: SearchMatch[], projectRoot: string): FileGroup[] {
  const map = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    const list = map.get(m.file_path) ?? [];
    list.push(m);
    map.set(m.file_path, list);
  }
  return Array.from(map.entries()).map(([filePath, matches]) => {
    const rel = filePath.startsWith(projectRoot)
      ? filePath.slice(projectRoot.length).replace(/^\//, "")
      : filePath;
    const parts = rel.split("/");
    return {
      filePath,
      fileName: parts[parts.length - 1],
      relativePath: parts.slice(0, -1).join("/"),
      matches,
    };
  });
}

function HighlightedLine({
  line,
  matchStart,
  matchEnd,
}: {
  line: string;
  matchStart: number;
  matchEnd: number;
}) {
  const trimmed = line.trimStart();
  const trimOffset = line.length - trimmed.length;
  const start = Math.max(0, matchStart - trimOffset);
  const end = Math.max(0, matchEnd - trimOffset);

  return (
    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#cdd6f4" }}>
      {trimmed.slice(0, start)}
      <mark style={{ background: "#f9e2af33", color: "#f9e2af", borderRadius: 2, padding: "0 1px" }}>
        {trimmed.slice(start, end)}
      </mark>
      {trimmed.slice(end)}
    </span>
  );
}

export default function SearchPanel() {
  const { workspaces, activeWorkspaceId } = useWorkspacesStore();
  const { openFiles, setOpenFiles, setActiveFile, setActiveFileLine, setSearchQuery, setPreviewFile } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<FileGroup[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!activeWorkspace || !q.trim()) {
      setResults([]);
      setTotalMatches(0);
      setError(null);
      setSearchQuery(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const matches = await invoke<SearchMatch[]>("search_in_files", {
        projectPath: activeWorkspace.path,
        query: q,
        caseSensitive,
        wholeWord,
        useRegex,
      });
      const groups = groupByFile(matches, activeWorkspace.path);
      setResults(groups);
      setTotalMatches(matches.length);
      setSearchQuery(matches.length > 0 ? q : null);
    } catch (e) {
      setError(String(e));
      setResults([]);
      setTotalMatches(0);
    } finally {
      setSearching(false);
    }
  }, [activeWorkspace?.path, caseSensitive, wholeWord, useRegex]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const openMatch = (match: SearchMatch) => {
    if (!openFiles.includes(match.file_path)) {
      setOpenFiles([...openFiles, match.file_path]);
    }
    setPreviewFile(null);
    setActiveFile(match.file_path);
    setActiveFileLine(match.line_number);
  };

  const toggleFile = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const optionBtn = (active: boolean, label: string, title: string, onToggle: () => void) => (
    <button
      onClick={onToggle}
      title={title}
      style={{
        width: 24,
        height: 22,
        border: `1px solid ${active ? "#cba6f7" : "transparent"}`,
        borderRadius: 4,
        background: active ? "#313244" : "transparent",
        color: active ? "#cba6f7" : "#6c7086",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "monospace",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#6c7086"; }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#181825", overflow: "hidden" }}>

      {/* ── Inputs ── */}
      <div style={{ padding: "8px 8px 6px", borderBottom: "1px solid #313244", flexShrink: 0 }}>

        {/* Search row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: showReplace ? 6 : 0 }}>
          {/* Toggle replace arrow */}
          <button
            onClick={() => setShowReplace((v) => !v)}
            title="Toggle Replace"
            style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: 10, padding: 2, flexShrink: 0 }}
          >
            {showReplace ? "▼" : "▶"}
          </button>

          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); }}
              placeholder="Search"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#313244",
                border: `1px solid ${error ? "#f38ba8" : "#45475a"}`,
                borderRadius: 4,
                padding: "4px 72px 4px 8px",
                color: "#cdd6f4",
                fontSize: 13,
                outline: "none",
              }}
            />
            {/* Option buttons inside input */}
            <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 2 }}>
              {optionBtn(caseSensitive, "Aa", "Case Sensitive", () => setCaseSensitive((v) => !v))}
              {optionBtn(wholeWord, "\\b", "Whole Word", () => setWholeWord((v) => !v))}
              {optionBtn(useRegex, ".*", "Use Regex", () => setUseRegex((v) => !v))}
            </div>
          </div>
        </div>

        {/* Replace row */}
        {showReplace && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 14 }} />
            <input
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace"
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
          </div>
        )}
      </div>

      {/* ── Summary bar ── */}
      {query.trim() && !searching && !error && (
        <div style={{ padding: "4px 12px", fontSize: 11, color: "#6c7086", borderBottom: "1px solid #1e1e2e", flexShrink: 0 }}>
          {totalMatches === 0
            ? "No results"
            : `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${results.length} file${results.length !== 1 ? "s" : ""}`}
        </div>
      )}
      {searching && (
        <div style={{ padding: "4px 12px", fontSize: 11, color: "#6c7086", borderBottom: "1px solid #1e1e2e", flexShrink: 0 }}>
          Searching…
        </div>
      )}
      {error && (
        <div style={{ padding: "4px 12px", fontSize: 11, color: "#f38ba8", borderBottom: "1px solid #1e1e2e", flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {results.map((group) => {
          const collapsed = collapsedFiles.has(group.filePath);
          return (
            <div key={group.filePath}>
              {/* File header */}
              <div
                onClick={() => toggleFile(group.filePath)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  cursor: "pointer",
                  background: "#11111b",
                  borderBottom: "1px solid #1e1e2e",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  userSelect: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e2e")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#11111b")}
              >
                <span style={{ color: "#6c7086", fontSize: 9 }}>{collapsed ? "▶" : "▼"}</span>
                <span style={{ color: "#cdd6f4", fontSize: 12, fontWeight: 600 }}>{group.fileName}</span>
                {group.relativePath && (
                  <span style={{ color: "#45475a", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {group.relativePath}
                  </span>
                )}
                <span style={{
                  background: "#313244",
                  color: "#cba6f7",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 8,
                  padding: "1px 6px",
                  flexShrink: 0,
                }}>
                  {group.matches.length}
                </span>
              </div>

              {/* Match rows */}
              {!collapsed && group.matches.map((match, i) => (
                <div
                  key={i}
                  onClick={() => openMatch(match)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "3px 10px 3px 20px",
                    cursor: "pointer",
                    borderBottom: "1px solid #1a1a2e",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a3d")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ color: "#45475a", fontSize: 11, fontFamily: "monospace", flexShrink: 0, minWidth: 28, textAlign: "right", paddingTop: 1 }}>
                    {match.line_number}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <HighlightedLine
                      line={match.line}
                      matchStart={match.match_start}
                      matchEnd={match.match_end}
                    />
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
