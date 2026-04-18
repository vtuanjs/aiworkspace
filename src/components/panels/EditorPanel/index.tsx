// Monaco file viewer/editor. Read-only by default; edit is opt-in.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../../store/workspace";

// Language detection by file extension
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  rs: "rust",
  go: "go",
  py: "python",
  json: "json",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  html: "html",
  css: "css",
  scss: "scss",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  xml: "xml",
  txt: "plaintext",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_LANGUAGE_MAP[ext] ?? "plaintext";
}

function basename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

// Typed just enough for what we need; full Monaco types come from the lazy import
type MonacoEditor = {
  dispose: () => void;
  getValue: () => string;
  updateOptions: (opts: Record<string, unknown>) => void;
};
type MonacoModule = typeof import("monaco-editor");

export default function EditorPanel() {
  const { openFiles, setOpenFiles } = useWorkspaceStore();
  const [activeFile, setActiveFile] = useState<string | null>(
    openFiles[0] ?? null
  );
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [readOnly, setReadOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoModule | null>(null);

  // Sync active file when openFiles changes externally
  useEffect(() => {
    if (activeFile === null && openFiles.length > 0) {
      setActiveFile(openFiles[0]);
    }
    if (activeFile !== null && !openFiles.includes(activeFile)) {
      setActiveFile(openFiles[0] ?? null);
    }
  }, [openFiles]);

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile) return;
    if (fileContents[activeFile] !== undefined) return; // Already loaded

    invoke<string>("read_file", { path: activeFile })
      .then((content) => {
        setFileContents((prev) => ({ ...prev, [activeFile]: content }));
      })
      .catch(() => {
        setFileContents((prev) => ({
          ...prev,
          [activeFile]: "// Could not read file",
        }));
      });
  }, [activeFile]);

  // Create / update Monaco editor when active file or read-only mode changes
  useEffect(() => {
    if (!containerRef.current || !activeFile) return;
    const content = fileContents[activeFile];
    if (content === undefined) return; // Wait for load

    let disposed = false;

    import("monaco-editor").then((monaco) => {
      if (disposed || !containerRef.current) return;

      monacoRef.current = monaco;

      // Dispose previous editor instance before creating a new one
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }

      const editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: detectLanguage(activeFile),
        theme: "vs-dark",
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        cursorBlinking: "smooth",
      });

      editorRef.current = editor;
    });

    return () => {
      disposed = true;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [activeFile, fileContents[activeFile ?? ""], readOnly]);

  const handleTabClick = (filePath: string) => {
    setActiveFile(filePath);
    setSaveError(null);
  };

  const handleCloseTab = (
    e: React.MouseEvent,
    filePath: string
  ) => {
    e.stopPropagation();
    const newFiles = openFiles.filter((f) => f !== filePath);
    setOpenFiles(newFiles);
    setFileContents((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
    if (activeFile === filePath) {
      setActiveFile(newFiles[0] ?? null);
    }
  };

  const handleSave = async () => {
    if (!activeFile || !editorRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const content = editorRef.current.getValue();
      await invoke("write_file", { path: activeFile, content });
      setFileContents((prev) => ({ ...prev, [activeFile]: content }));
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReadOnly = () => {
    const next = !readOnly;
    setReadOnly(next);
    editorRef.current?.updateOptions({ readOnly: next });
    if (next) setSaveError(null);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        background: "#1e1e2e",
        overflow: "hidden",
      }}
    >
      {/* File tabs */}
      <div
        style={{
          display: "flex",
          background: "#181825",
          borderBottom: "1px solid #313244",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {openFiles.length === 0 ? (
          <div
            style={{
              padding: "6px 12px",
              color: "#6c7086",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
            }}
          >
            No files open
          </div>
        ) : (
          openFiles.map((filePath) => {
            const isActive = activeFile === filePath;
            return (
              <div
                key={filePath}
                onClick={() => handleTabClick(filePath)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: isActive ? "#1e1e2e" : "transparent",
                  borderRight: "1px solid #313244",
                  borderBottom: isActive
                    ? "2px solid #cba6f7"
                    : "2px solid transparent",
                  color: isActive ? "#cdd6f4" : "#6c7086",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  userSelect: "none",
                }}
              >
                <span>{basename(filePath)}</span>
                <button
                  onClick={(e) => handleCloseTab(e, filePath)}
                  title="Close file"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#6c7086",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: "0 1px",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Toolbar */}
      <div
        style={{
          padding: "4px 10px",
          borderBottom: "1px solid #313244",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          background: "#181825",
          flexShrink: 0,
        }}
      >
        {saveError && (
          <span style={{ fontSize: 11, color: "#f38ba8", flex: 1 }}>
            {saveError}
          </span>
        )}
        {!readOnly && activeFile && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "2px 10px",
              fontSize: 11,
              background: saving ? "#45475a" : "#a6e3a1",
              border: "none",
              borderRadius: 4,
              color: "#1e1e2e",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        <button
          onClick={handleToggleReadOnly}
          title={readOnly ? "Switch to edit mode" : "Switch to read-only mode"}
          style={{
            padding: "2px 10px",
            fontSize: 11,
            background: readOnly ? "#313244" : "#fab387",
            border: "none",
            borderRadius: 4,
            color: readOnly ? "#cdd6f4" : "#1e1e2e",
            cursor: "pointer",
            fontWeight: readOnly ? 400 : 600,
          }}
        >
          {readOnly ? "Read-only" : "Editing"}
        </button>
      </div>

      {/* Monaco editor container */}
      {activeFile ? (
        <div ref={containerRef} style={{ flex: 1 }} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6c7086",
            fontSize: 14,
          }}
        >
          Open a file to view or edit it
        </div>
      )}
    </div>
  );
}
