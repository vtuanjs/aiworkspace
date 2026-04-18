// Monaco file viewer/editor. Read-only by default; edit is opt-in.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../../store/workspace";
import { useWorkspacesStore } from "../../../store/workspaces";
// ── Language detection ────────────────────────────────────────────────────────

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

// ── Monaco types ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoEditor = any;
type MonacoModule = typeof import("monaco-editor");

// ── EditorPanel ───────────────────────────────────────────────────────────────

export default function EditorPanel() {
  const { openFiles, setOpenFiles, activeFile, setActiveFile, previewFile, setPreviewFile, activeFileLine, searchQuery } = useWorkspaceStore();
  const { workspaces, activeWorkspaceId } = useWorkspacesStore();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // Tab context menu
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; filePath: string } | null>(null);
  const tabCtxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabCtxMenu) return;
    const handler = (e: MouseEvent) => {
      if (tabCtxRef.current && !tabCtxRef.current.contains(e.target as Node)) setTabCtxMenu(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [tabCtxMenu]);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoModule | null>(null);
  // Stable ref so the Monaco Cmd+S command always calls the latest save
  const handleSaveRef = useRef<(() => void) | null>(null);

  // If openFiles changes and activeFile is no longer valid, reset it
  useEffect(() => {
    const allVisible = previewFile && !openFiles.includes(previewFile)
      ? [...openFiles, previewFile]
      : openFiles;
    if (activeFile === null && allVisible.length > 0) {
      setActiveFile(allVisible[0]);
    }
    if (activeFile !== null && !allVisible.includes(activeFile)) {
      setActiveFile(allVisible[0] ?? null);
    }
  }, [openFiles, previewFile]);

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile) return;
    if (fileContents[activeFile] !== undefined) return;

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

  // Effect A: DISPOSE — only fires when activeFile changes.
  // Runs cleanup (dispose old editor) before Effect B creates the new one.
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [activeFile]);

  // Effect B: CREATE — fires when activeFile changes OR when content first arrives (async load).
  // Cleanup only cancels the pending async import — it NEVER disposes the editor.
  // This means saving (which updates fileContents) triggers this effect but the
  // `if (editorRef.current) return` guard exits immediately — cursor stays intact.
  useEffect(() => {
    if (!containerRef.current || !activeFile) return;
    const content = fileContents[activeFile];
    if (content === undefined) return; // wait for content to load
    if (editorRef.current) return;     // already exists — save path hits this and exits

    let disposed = false;

    import("monaco-editor").then((monaco) => {
      if (disposed || !containerRef.current || editorRef.current) return;

      monacoRef.current = monaco;

      const editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: detectLanguage(activeFile),
        theme: "vs-dark",
        readOnly: false,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        cursorBlinking: "smooth",
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSaveRef.current?.();
      });

      editorRef.current = editor;

      // Apply any pending search highlight that arrived before the editor was ready
      const { activeFileLine: line, searchQuery: sq } = useWorkspaceStore.getState();
      if (line) {
        editor.revealLineInCenter(line);
        if (sq) {
          const model = editor.getModel();
          if (model) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matches: any[] = model.findMatches(sq, false, false, false, null, false);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decorations: any[] = matches.map((m: any) => ({
              range: m.range,
              options: { inlineClassName: "search-result-highlight", overviewRulerColor: "#f9e2af", overviewRulerLane: 1 },
            }));
            decorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: { isWholeLine: true, className: "search-result-line", overviewRulerColor: "#cba6f7", overviewRulerLane: 4 },
            });
            decorationIdsRef.current = editor.deltaDecorations([], decorations);
          }
        }
      }
    });

    return () => { disposed = true; }; // only cancel pending import, never dispose
  // fileContents[activeFile] dep is needed so the effect re-fires when async content loads.
  // On save, fileContents changes too, but `if (editorRef.current) return` exits early.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, fileContents[activeFile ?? ""]]);

  // Scroll to line + highlight search matches whenever activeFileLine / searchQuery change.
  // Runs after editor creation since it only fires when editorRef.current exists.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFileLine) return;

    editor.revealLineInCenter(activeFileLine);

    // Clear old decorations
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);

    if (!searchQuery || !monacoRef.current) return;
    const model = editor.getModel();
    if (!model) return;

    const monaco = monacoRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches: any[] = model.findMatches(searchQuery, false, false, false, null, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decorations: any[] = matches.map((m: any) => ({
      range: m.range,
      options: {
        inlineClassName: "search-result-highlight",
        overviewRulerColor: "#f9e2af",
        overviewRulerLane: 1,
        minimap: { color: "#f9e2af", position: 1 },
      },
    }));
    decorations.push({
      range: new monaco.Range(activeFileLine, 1, activeFileLine, 1),
      options: { isWholeLine: true, className: "search-result-line", overviewRulerColor: "#cba6f7", overviewRulerLane: 4 },
    });
    decorationIdsRef.current = editor.deltaDecorations([], decorations);
  }, [activeFileLine, searchQuery]);

  const handleTabClick = (filePath: string) => {
    setActiveFile(filePath);
    setSaveError(null);
  };

  const handleTabDoubleClick = (filePath: string) => {
    // Pin the preview tab
    if (previewFile === filePath && !openFiles.includes(filePath)) {
      setOpenFiles([...openFiles, filePath]);
      setPreviewFile(null);
    }
    setActiveFile(filePath);
  };

  const closeFile = (filePath: string) => {
    const isPreview = previewFile === filePath;
    if (isPreview) {
      setPreviewFile(null);
    } else {
      const newFiles = openFiles.filter((f) => f !== filePath);
      setOpenFiles(newFiles);
    }
    setFileContents((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
    if (activeFile === filePath) {
      const allVisible = [
        ...openFiles.filter((f) => f !== filePath),
        ...(previewFile && previewFile !== filePath && !openFiles.includes(previewFile) ? [previewFile] : []),
      ];
      setActiveFile(allVisible[0] ?? null);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    closeFile(filePath);
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

  // Keep ref in sync so Monaco's Cmd+S command always has the latest closure
  handleSaveRef.current = handleSave;

  // All tabs to display: pinned files + preview (if not already pinned)
  const previewVisible = previewFile !== null && !openFiles.includes(previewFile);
  const allTabs = previewVisible ? [...openFiles, previewFile!] : openFiles;

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column", background: "#1e1e2e", overflow: "hidden" }}>
      {/* File tabs */}
      <div
        style={{
          display: "flex",
          background: "#181825",
          borderBottom: "1px solid #313244",
          overflowX: "auto",
          flexShrink: 0,
          alignItems: "center",
        }}
      >
          {allTabs.length === 0 ? (
            <div style={{ padding: "6px 12px", color: "#6c7086", fontSize: 12, display: "flex", alignItems: "center" }}>
              No files open
            </div>
          ) : (
            allTabs.map((filePath) => {
              const isActive = activeFile === filePath;
              const isPreview = filePath === previewFile && !openFiles.includes(filePath);
              return (
                <div
                  key={filePath}
                  onClick={() => handleTabClick(filePath)}
                  onDoubleClick={() => handleTabDoubleClick(filePath)}
                  onContextMenu={(e) => { e.preventDefault(); setTabCtxMenu({ x: e.clientX, y: e.clientY, filePath }); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    background: isActive ? "#1e1e2e" : "transparent",
                    borderRight: "1px solid #313244",
                    borderBottom: isActive ? "2px solid #cba6f7" : "2px solid transparent",
                    color: isActive ? "#cdd6f4" : "#6c7086",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    userSelect: "none",
                  }}
                >
                  <span style={{ fontStyle: isPreview ? "italic" : "normal" }}>
                    {basename(filePath)}
                  </span>
                  {saving && isActive && (
                    <span style={{ color: "#6c7086", fontSize: 10 }}>saving…</span>
                  )}
                  <button
                    onClick={(e) => handleCloseTab(e, filePath)}
                    title="Close file"
                    style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 1px" }}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
          {saveError && (
            <span style={{ fontSize: 11, color: "#f38ba8", padding: "0 10px", whiteSpace: "nowrap" }}>{saveError}</span>
          )}
        </div>

        {/* Tab context menu */}
        {tabCtxMenu && (
          <div
            ref={tabCtxRef}
            style={{
              position: "fixed",
              top: tabCtxMenu.y,
              left: tabCtxMenu.x,
              background: "#1e1e2e",
              border: "1px solid #45475a",
              borderRadius: 6,
              padding: "4px 0",
              minWidth: 200,
              zIndex: 9000,
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              fontSize: 13,
            }}
          >
            {[
              { label: "Close", action: () => closeFile(tabCtxMenu.filePath) },
              { label: "Close Others", action: () => {
                const f = tabCtxMenu.filePath;
                setOpenFiles(openFiles.includes(f) ? [f] : []);
                setPreviewFile(previewFile === f ? f : null);
                setActiveFile(f);
              }},
              { label: "Close All", action: () => {
                setOpenFiles([]);
                setPreviewFile(null);
                setActiveFile(null);
              }},
              { label: "Close to the Right", action: () => {
                const idx = openFiles.indexOf(tabCtxMenu.filePath);
                if (idx !== -1) {
                  const kept = openFiles.slice(0, idx + 1);
                  setOpenFiles(kept);
                  if (activeFile && !kept.includes(activeFile) && activeFile !== previewFile) {
                    setActiveFile(kept[kept.length - 1] ?? null);
                  }
                }
              }},
            ].map(({ label, action }, i) => (
              <div key={i}>
                <div
                  onMouseDown={() => { action(); setTabCtxMenu(null); }}
                  style={{ padding: "5px 16px", cursor: "pointer", color: "#cdd6f4", userSelect: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {label}
                </div>
                {i === 3 && <div style={{ height: 1, background: "#313244", margin: "3px 0" }} />}
              </div>
            ))}
            {[
              { label: "Copy Path", action: async () => { await navigator.clipboard.writeText(tabCtxMenu.filePath); } },
              { label: "Copy Relative Path", action: async () => {
                const root = activeWorkspace?.path ?? "";
                const rel = tabCtxMenu.filePath.startsWith(root)
                  ? tabCtxMenu.filePath.slice(root.length).replace(/^\//, "")
                  : tabCtxMenu.filePath;
                await navigator.clipboard.writeText(rel);
              }},
              { label: "Reveal in Finder", action: async () => { await invoke("reveal_in_finder", { path: tabCtxMenu.filePath }).catch(() => {}); } },
            ].map(({ label, action }, i) => (
              <div
                key={i}
                onMouseDown={() => { action(); setTabCtxMenu(null); }}
                style={{ padding: "5px 16px", cursor: "pointer", color: "#cdd6f4", userSelect: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {label}
              </div>
            ))}
          </div>
        )}

        {/* Monaco editor */}
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
            {activeWorkspace ? "Select a file from the tree to open it" : "Open a file to view or edit it"}
          </div>
        )}
    </div>
  );
}

