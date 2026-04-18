// VS Code-style layout:
//  [ActivityBar] [SidePanel?] [EditorArea]
//                             [TerminalPanel? — bottom]

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../store/workspace";
import { useProjectsStore } from "../../store/projects";

// ── File tree types ───────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntry[];
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

// ── ContextMenu ──────────────────────────────────────────────────────────────

type ContextMenuAction =
  | "open"
  | "copy-path"
  | "copy-relative-path"
  | "reveal"
  | "new-file"
  | "new-folder"
  | "rename"
  | "delete";

function ContextMenu({
  x,
  y,
  entry,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  entry: DirEntry;
  projectRoot: string;
  onAction: (action: ContextMenuAction, entry: DirEntry) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  const fileItems: { label: string; action: ContextMenuAction }[] = [
    { label: "Open", action: "open" },
    { label: "Copy Path", action: "copy-path" },
    { label: "Copy Relative Path", action: "copy-relative-path" },
    { label: "Reveal in Finder", action: "reveal" },
    { label: "Rename", action: "rename" },
    { label: "Delete", action: "delete" },
  ];

  const dirItems: { label: string; action: ContextMenuAction; danger?: boolean }[] = [
    { label: "Copy Path", action: "copy-path" },
    { label: "Copy Relative Path", action: "copy-relative-path" },
    { label: "Reveal in Finder", action: "reveal" },
    { label: "New File", action: "new-file" },
    { label: "New Folder", action: "new-folder" },
    { label: "Rename", action: "rename" },
    { label: "Delete", action: "delete" },
  ];

  const items = entry.is_dir ? dirItems : fileItems;
  const separatorAfter = entry.is_dir
    ? ["reveal", "new-folder", "rename"]
    : ["reveal", "open", "rename"];
  const dangerItems = ["delete"];

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: y,
        left: x,
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
      {items.map((item) => (
        <div key={item.action}>
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              onAction(item.action, entry);
              onClose();
            }}
            style={{
              padding: "5px 16px",
              cursor: "pointer",
              color: dangerItems.includes(item.action) ? "#f38ba8" : "#cdd6f4",
              userSelect: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.label}
          </div>
          {separatorAfter.includes(item.action) && (
            <div style={{ height: 1, background: "#313244", margin: "3px 0" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── File icons ────────────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const base = name.toLowerCase();

  // Folder-adjacent special files
  if (base === "dockerfile" || base === ".dockerignore")
    return <span style={{ color: "#0db7ed", fontSize: 13 }}>🐳</span>;
  if (base === ".gitignore" || base === ".gitattributes")
    return <span style={{ color: "#f05033", fontSize: 12, fontWeight: 700 }}>⊙</span>;
  if (base === "package.json" || base === "package-lock.json")
    return <span style={{ color: "#cb3837", fontSize: 11, fontWeight: 900, fontFamily: "monospace" }}>npm</span>;
  if (base === "cargo.toml" || base === "cargo.lock")
    return <span style={{ color: "#dea584", fontSize: 13 }}>⚙</span>;

  const map: Record<string, JSX.Element> = {
    ts:  <span style={{ color: "#3178c6", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>TS</span>,
    tsx: <span style={{ color: "#61dafb", fontSize: 13 }}>⚛</span>,
    js:  <span style={{ color: "#f7df1e", fontSize: 11, fontWeight: 800, fontFamily: "monospace", background: "#3b3b00", padding: "0 1px", borderRadius: 2 }}>JS</span>,
    jsx: <span style={{ color: "#61dafb", fontSize: 13 }}>⚛</span>,
    rs:  <span style={{ color: "#dea584", fontSize: 13 }}>⚙</span>,
    go:  <span style={{ color: "#00add8", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>Go</span>,
    py:  <span style={{ color: "#3572a5", fontSize: 13 }}>🐍</span>,
    json: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{"{}"}</span>,
    yaml: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>≡</span>,
    yml:  <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>≡</span>,
    toml: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>⚙</span>,
    md:  <span style={{ color: "#519aba", fontSize: 12, fontWeight: 700 }}>M↓</span>,
    mdx: <span style={{ color: "#519aba", fontSize: 12, fontWeight: 700 }}>M↓</span>,
    sh:  <span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    bash:<span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    zsh: <span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    sql: <span style={{ color: "#e97700", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>DB</span>,
    html:<span style={{ color: "#e34c26", fontSize: 12, fontWeight: 700 }}>{"</>"}</span>,
    css: <span style={{ color: "#563d7c", fontSize: 13 }}>🎨</span>,
    scss:<span style={{ color: "#cf649a", fontSize: 13 }}>🎨</span>,
    svg: <span style={{ color: "#ffb13b", fontSize: 12 }}>◈</span>,
    png: <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    jpg: <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    jpeg:<span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    gif: <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    lock:<span style={{ color: "#bcbcbc", fontSize: 12 }}>🔒</span>,
    env: <span style={{ color: "#ecc94b", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>.env</span>,
  };

  return map[ext] ?? <span style={{ color: "#cdd6f4", fontSize: 12 }}>📄</span>;
}

const INDENT = 12;

// ── Git status coloring ───────────────────────────────────────────────────────

type GitFileStatus = "new" | "modified";

function buildGitStatusMap(
  entries: { path: string; status: string }[],
  projectRoot: string
): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  const root = projectRoot.replace(/\/$/, "");

  const setPriority = (absPath: string, s: GitFileStatus) => {
    const existing = map.get(absPath);
    if (!existing || (existing === "new" && s === "modified")) {
      map.set(absPath, s);
    }
  };

  for (const entry of entries) {
    const relPath = entry.path.replace(/^"(.*)"$/, "$1"); // strip git quotes
    const absPath = root + "/" + relPath;
    const s: GitFileStatus =
      entry.status === "??" || entry.status === "A" || entry.status === "AD"
        ? "new"
        : "modified";
    setPriority(absPath, s);
    // propagate up to every ancestor folder
    const parts = absPath.split("/");
    for (let i = parts.length - 1; i > 1; i--) {
      setPriority(parts.slice(0, i).join("/"), s);
    }
  }

  return map;
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

function TreeNode({
  entry,
  depth,
  onOpenFile,
  onPinFile,
  activeFile,
  gitStatusMap,
  onContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  onPinFile: (path: string) => void;
  activeFile: string | null;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  gitStatusMap: Map<string, GitFileStatus>;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const gitStatus = gitStatusMap.get(entry.path);
  const nameColor = gitStatus === "new" ? "#73c991" : gitStatus === "modified" ? "#e2c08d" : entry.is_dir ? "#d4d4d4" : "#d4d4d4";

  if (entry.is_dir) {
    return (
      <div>
        <div
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            paddingLeft: 6 + depth * INDENT,
            paddingRight: 8,
            paddingTop: 1,
            paddingBottom: 1,
            height: 22,
            cursor: "pointer",
            color: nameColor,
            fontSize: 13,
            userSelect: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a3d")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: nameColor, fontSize: 9, width: 12, flexShrink: 0, textAlign: "center" }}>
            {expanded ? "▼" : "▶"}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0 }}>
            {expanded ? "📂" : "📁"}
          </span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.name}</span>
        </div>
        {expanded &&
          entry.children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              onPinFile={onPinFile}
              activeFile={activeFile}
              onContextMenu={onContextMenu}
              gitStatusMap={gitStatusMap}
            />
          ))}
      </div>
    );
  }

  const isActive = entry.path === activeFile;
  return (
    <div
      onClick={() => onOpenFile(entry.path)}
      onDoubleClick={() => onPinFile(entry.path)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        paddingLeft: 6 + depth * INDENT + 12, // align with folder label (skip chevron width)
        paddingRight: 8,
        paddingTop: 1,
        paddingBottom: 1,
        height: 22,
        cursor: "pointer",
        background: isActive ? "#094771" : "transparent",
        color: isActive ? "#ffffff" : nameColor,
        fontSize: 13,
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "#2a2a3d";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 16, justifyContent: "center" }}>
        <FileIcon name={entry.name} />
      </span>
      <span style={{ fontSize: 13 }}>{entry.name}</span>
    </div>
  );
}

// ── ExplorerPanel ─────────────────────────────────────────────────────────────

function ExplorerPanel() {
  const { openFiles, setOpenFiles, activeFile, setActiveFile, previewFile, setPreviewFile } = useWorkspaceStore();
  const { projects, activeProjectId } = useProjectsStore();
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const [tree, setTree] = useState<DirEntry | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitFileStatus>>(new Map());

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    entry: DirEntry;
  } | null>(null);

  // File operation modal state
  const [fileOp, setFileOp] = useState<{
    type: "rename" | "new-file" | "new-folder";
    entry: DirEntry;
    value: string;
    error: string | null;
  } | null>(null);

  const fileOpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fileOp) setTimeout(() => fileOpInputRef.current?.focus(), 50);
  }, [fileOp]);

  const refreshTree = useCallback(() => {
    if (!activeProject) return;
    invoke<DirEntry>("read_dir_tree", { path: activeProject.path, depth: 4 })
      .then(setTree)
      .catch((e) => setTreeError(String(e)));
    invoke<{ path: string; status: string }[]>("git_status", { projectPath: activeProject.path })
      .then((entries) => setGitStatusMap(buildGitStatusMap(entries, activeProject.path)))
      .catch(() => setGitStatusMap(new Map()));
  }, [activeProject?.path]);

  useEffect(() => {
    if (!activeProject) { setTree(null); return; }
    setTreeError(null);
    refreshTree();
  }, [activeProject?.path]);

  // Poll git status every 2s so edits/saves are reflected without a full tree reload.
  useEffect(() => {
    if (!activeProject) return;
    const id = setInterval(() => {
      invoke<{ path: string; status: string }[]>("git_status", { projectPath: activeProject.path })
        .then((entries) => setGitStatusMap(buildGitStatusMap(entries, activeProject.path)))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [activeProject?.path]);

  // Single click → preview (temporary tab, italic). Double click → pin.
  const previewFileHandler = (filePath: string) => {
    setPreviewFile(filePath);
    setActiveFile(filePath);
  };

  const pinFileHandler = (filePath: string) => {
    if (!openFiles.includes(filePath)) {
      setOpenFiles([...openFiles, filePath]);
    }
    if (previewFile === filePath) {
      setPreviewFile(null);
    }
    setActiveFile(filePath);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: DirEntry) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleAction = async (action: ContextMenuAction, entry: DirEntry) => {
    switch (action) {
      case "open":
        pinFileHandler(entry.path);
        break;
      case "copy-path":
        await navigator.clipboard.writeText(entry.path);
        break;
      case "copy-relative-path": {
        const root = activeProject?.path ?? "";
        const rel = entry.path.startsWith(root)
          ? entry.path.slice(root.length).replace(/^\//, "")
          : entry.path;
        await navigator.clipboard.writeText(rel);
        break;
      }
      case "reveal":
        await invoke("reveal_in_finder", { path: entry.path }).catch(() => {});
        break;
      case "new-file":
        setFileOp({ type: "new-file", entry, value: "", error: null });
        break;
      case "new-folder":
        setFileOp({ type: "new-folder", entry, value: "", error: null });
        break;
      case "rename":
        setFileOp({ type: "rename", entry, value: entry.name, error: null });
        break;
      case "delete": {
        const label = entry.is_dir ? "folder and all its contents" : "file";
        if (!window.confirm(`Delete ${label} "${entry.name}"?`)) break;
        try {
          await invoke("delete_entry", { path: entry.path });
          // Close tab if open
          if (openFiles.includes(entry.path)) {
            const newFiles = openFiles.filter((f) => f !== entry.path);
            setOpenFiles(newFiles);
            if (activeFile === entry.path) setActiveFile(newFiles[0] ?? null);
          }
          refreshTree();
        } catch (err) {
          alert(String(err));
        }
        break;
      }
    }
  };

  const handleFileOpConfirm = async () => {
    if (!fileOp || !activeProject) return;
    const value = fileOp.value.trim();
    if (!value) {
      setFileOp({ ...fileOp, error: "Name cannot be empty." });
      return;
    }

    try {
      if (fileOp.type === "rename") {
        const parent = fileOp.entry.path.split("/").slice(0, -1).join("/");
        const newPath = parent + "/" + value;
        await invoke("rename_entry", { oldPath: fileOp.entry.path, newPath });
        // Update open tabs
        if (openFiles.includes(fileOp.entry.path)) {
          const newFiles = openFiles.map((f) => (f === fileOp.entry.path ? newPath : f));
          setOpenFiles(newFiles);
          if (activeFile === fileOp.entry.path) setActiveFile(newPath);
        }
      } else if (fileOp.type === "new-file") {
        const newPath = fileOp.entry.path + "/" + value;
        await invoke("create_file_entry", { path: newPath });
        pinFileHandler(newPath);
      } else if (fileOp.type === "new-folder") {
        const newPath = fileOp.entry.path + "/" + value;
        await invoke("create_dir_entry", { path: newPath });
      }
      setFileOp(null);
      refreshTree();
    } catch (err) {
      setFileOp({ ...fileOp, error: String(err) });
    }
  };

  const FILE_OP_TITLES: Record<string, string> = {
    rename: "Rename",
    "new-file": "New File",
    "new-folder": "New Folder",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
      {!activeProject ? (
        <div style={{ padding: "12px 8px", color: "#6c7086", fontSize: 12 }}>No project open</div>
      ) : treeError ? (
        <div style={{ padding: "12px 8px", color: "#f38ba8", fontSize: 12 }}>{treeError}</div>
      ) : !tree ? (
        <div style={{ padding: "12px 8px", color: "#6c7086", fontSize: 12 }}>Loading…</div>
      ) : (
        tree.children?.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            onOpenFile={previewFileHandler}
            onPinFile={pinFileHandler}
            activeFile={activeFile}
            onContextMenu={handleContextMenu}
            gitStatusMap={gitStatusMap}
          />
        ))
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          entry={ctxMenu.entry}
          projectRoot={activeProject?.path ?? ""}
          onAction={handleAction}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* File operation modal */}
      {fileOp && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setFileOp(null); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9001,
          }}
        >
          <div
            style={{
              background: "#1e1e2e",
              border: "1px solid #313244",
              borderRadius: 10,
              padding: 20,
              width: 340,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ color: "#cdd6f4", fontSize: 14, fontWeight: 600 }}>
              {FILE_OP_TITLES[fileOp.type]}
            </div>
            {fileOp.type !== "rename" && (
              <div style={{ color: "#6c7086", fontSize: 11 }}>
                In: {fileOp.entry.path.replace(activeProject?.path ?? "", "").replace(/^\//, "") || "/"}
              </div>
            )}
            <input
              ref={fileOpInputRef}
              value={fileOp.value}
              onChange={(e) => setFileOp({ ...fileOp, value: e.target.value, error: null })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFileOpConfirm();
                if (e.key === "Escape") setFileOp(null);
              }}
              placeholder={fileOp.type === "rename" ? "New name" : fileOp.type === "new-folder" ? "Folder name" : "File name"}
              style={{
                background: "#181825",
                border: "1px solid #45475a",
                borderRadius: 6,
                color: "#cdd6f4",
                padding: "6px 10px",
                fontSize: 13,
                outline: "none",
              }}
            />
            {fileOp.error && (
              <div style={{ color: "#f38ba8", fontSize: 12 }}>{fileOp.error}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setFileOp(null)}
                style={{ padding: "5px 16px", background: "#313244", border: "none", borderRadius: 6, color: "#cdd6f4", cursor: "pointer", fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleFileOpConfirm}
                style={{ padding: "5px 16px", background: "#cba6f7", border: "none", borderRadius: 6, color: "#1e1e2e", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              >
                {FILE_OP_TITLES[fileOp.type]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import TerminalPanel from "../panels/TerminalPanel";
import BrowserPanel from "../panels/BrowserPanel";
import HttpPanel from "../panels/HttpPanel";
import DbPanel from "../panels/DbPanel";
import EditorPanel from "../panels/EditorPanel";
import EnvironmentSwitcher from "../EnvironmentSwitcher";

// ── Icons ─────────────────────────────────────────────────────────────────────
// Simple SVG-free text icons

type ActivityId = "explorer" | "terminal" | "browser" | "http" | "db";

const ACTIVITIES: { id: ActivityId; label: string; icon: string }[] = [
  { id: "explorer", label: "Explorer", icon: "◫" },
  { id: "browser",  label: "Browser",  icon: "⊕" },
  { id: "http",     label: "HTTP",     icon: "⇄" },
  { id: "db",       label: "Database", icon: "◎" },
  { id: "terminal", label: "Terminal", icon: "⌘" },
];

// ── ActivityBar ───────────────────────────────────────────────────────────────

function ActivityBar({
  active,
  onSelect,
  expanded,
  onExpandToggle,
}: {
  active: ActivityId | null;
  onSelect: (id: ActivityId) => void;
  expanded: boolean;
  onExpandToggle: () => void;
}) {
  return (
    <div
      style={{
        width: expanded ? 160 : 48,
        background: "#181825",
        borderRight: "1px solid #313244",
        display: "flex",
        flexDirection: "column",
        alignItems: expanded ? "stretch" : "center",
        paddingTop: 4,
        paddingBottom: 4,
        gap: 2,
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.15s ease",
      }}
    >
      {ACTIVITIES.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a.id)}
          title={a.label}
          style={{
            height: 40,
            borderRadius: 6,
            border: "none",
            background: active === a.id ? "#313244" : "transparent",
            color: active === a.id ? "#cdd6f4" : "#6c7086",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: expanded ? "flex-start" : "center",
            gap: 10,
            padding: expanded ? "0 12px" : "0",
            width: expanded ? "calc(100% - 8px)" : 40,
            marginLeft: expanded ? 4 : 0,
            borderLeft: active === a.id ? "2px solid #cba6f7" : "2px solid transparent",
            transition: "color 0.1s, background 0.1s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => { if (active !== a.id) (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
          onMouseLeave={(e) => { if (active !== a.id) (e.currentTarget as HTMLButtonElement).style.color = "#6c7086"; }}
        >
          <span style={{ flexShrink: 0 }}>{a.icon}</span>
          {expanded && <span style={{ fontSize: 12, fontWeight: active === a.id ? 600 : 400 }}>{a.label}</span>}
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Expand / collapse toggle */}
      <button
        onClick={onExpandToggle}
        title={expanded ? "Collapse" : "Expand"}
        style={{
          height: 28,
          borderRadius: 6,
          border: "none",
          background: "none",
          color: "#45475a",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: expanded ? "flex-end" : "center",
          padding: expanded ? "0 12px" : "0",
          width: expanded ? "calc(100% - 8px)" : 40,
          marginLeft: expanded ? 4 : 0,
          transition: "color 0.12s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#45475a"; }}
      >
        {expanded ? "«" : "»"}
      </button>
    </div>
  );
}

// ── SidePanel ─────────────────────────────────────────────────────────────────

function SidePanel({
  activity,
  width,
}: {
  activity: ActivityId;
  width: number;
}) {
  const TITLES: Record<ActivityId, string> = {
    explorer: "EXPLORER",
    browser: "BROWSER",
    http: "HTTP CLIENT",
    db: "DATABASE",
    terminal: "TERMINAL",
  };

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: "#181825",
        borderRight: "1px solid #313244",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#a6adc8",
          letterSpacing: "0.08em",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {TITLES[activity]}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activity === "explorer" && <ExplorerPanel />}
        {activity === "browser"  && <BrowserPanel />}
        {activity === "http"     && <HttpPanel />}
        {activity === "db"       && <DbPanel />}
      </div>
    </div>
  );
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export default function Workspace() {
  useWorkspaceStore();
  const { activeProjectId } = useProjectsStore();

  const [activity, setActivity] = useState<ActivityId>("explorer");
  const [sideOpen, setSideOpen] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);

  const handleActivityClick = (id: ActivityId) => {
    if (id === "terminal") {
      setTerminalOpen((o) => !o);
      return;
    }
    if (activity === id && sideOpen) {
      setSideOpen(false);
    } else {
      setActivity(id);
      setSideOpen(true);
    }
  };

  if (!activeProjectId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e2e", color: "#6c7086", fontSize: 14, userSelect: "none" }}>
        Select or add a project to begin
      </div>
    );
  }

  const showSidePanel = sideOpen && activity !== "terminal";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      {/* Activity bar */}
      <ActivityBar
        active={terminalOpen && activity === "terminal" ? "terminal" : sideOpen ? activity : null}
        onSelect={handleActivityClick}
        expanded={activityExpanded}
        onExpandToggle={() => setActivityExpanded((v) => !v)}
      />

      {/* Main area: [SidePanel?] + [EditorArea + BottomPanel] */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* Side panel */}
        {showSidePanel && (
          <SidePanel activity={activity} width={260} />
        )}

        {/* Editor + bottom panel column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Title bar / breadcrumb */}
          <div
            style={{
              height: 35,
              background: "#181825",
              borderBottom: "1px solid #313244",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#6c7086", fontSize: 12 }}>
              AIWorkspace
            </span>
            <EnvironmentSwitcher />
          </div>

          {/* Editor area — always shown */}
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <EditorPanel />
          </div>

          {/* Terminal panel — bottom, resizable */}
          {terminalOpen && (
            <div
              style={{
                height: terminalHeight,
                flexShrink: 0,
                borderTop: "1px solid #313244",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Terminal header */}
              <div
                style={{
                  height: 28,
                  background: "#181825",
                  borderBottom: "1px solid #313244",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 8px",
                  flexShrink: 0,
                  userSelect: "none",
                }}
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startH = terminalHeight;
                  const onMove = (ev: MouseEvent) => {
                    const delta = startY - ev.clientY;
                    setTerminalHeight(Math.max(80, Math.min(600, startH + delta)));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
                title="Drag to resize"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#cdd6f4", fontSize: 11, fontWeight: 600 }}>TERMINAL</span>
                </div>
                <button
                  onClick={() => setTerminalOpen(false)}
                  title="Close terminal"
                  style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <TerminalPanel />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
