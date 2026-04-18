// VS Code-style layout:
//  [ActivityBar] [SidePanel?] [EditorArea]
//                             [TerminalPanel? — bottom]

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../store/workspace";
import { useWorkspacesStore } from "../../store/workspaces";

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
  | "copy-name"
  | "reveal"
  | "open-in-terminal"
  | "new-file"
  | "new-file-sibling"
  | "new-folder"
  | "duplicate"
  | "rename"
  | "delete";

type MenuItem =
  | { type: "separator" }
  | { type: "item"; label: string; action: ContextMenuAction; hint?: string; danger?: boolean };

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
  workspaceRoot: string;
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

  const fileItems: MenuItem[] = [
    { type: "item", label: "Open",              action: "open",              hint: "↵" },
    { type: "separator" },
    { type: "item", label: "Copy Path",          action: "copy-path",         hint: "⌘⌥C" },
    { type: "item", label: "Copy Relative Path", action: "copy-relative-path" },
    { type: "item", label: "Copy File Name",     action: "copy-name" },
    { type: "separator" },
    { type: "item", label: "Reveal in Finder",   action: "reveal",            hint: "⌘⌥R" },
    { type: "item", label: "Open in Terminal",   action: "open-in-terminal" },
    { type: "separator" },
    { type: "item", label: "New File…",          action: "new-file-sibling" },
    { type: "item", label: "Duplicate",          action: "duplicate" },
    { type: "separator" },
    { type: "item", label: "Rename…",            action: "rename",            hint: "F2" },
    { type: "item", label: "Delete",             action: "delete",            hint: "⌫",  danger: true },
  ];

  const dirItems: MenuItem[] = [
    { type: "item", label: "Copy Path",          action: "copy-path",         hint: "⌘⌥C" },
    { type: "item", label: "Copy Relative Path", action: "copy-relative-path" },
    { type: "item", label: "Copy Folder Name",   action: "copy-name" },
    { type: "separator" },
    { type: "item", label: "Reveal in Finder",   action: "reveal",            hint: "⌘⌥R" },
    { type: "item", label: "Open in Terminal",   action: "open-in-terminal" },
    { type: "separator" },
    { type: "item", label: "New File…",          action: "new-file" },
    { type: "item", label: "New Folder…",        action: "new-folder" },
    { type: "separator" },
    { type: "item", label: "Rename…",            action: "rename",            hint: "F2" },
    { type: "item", label: "Delete",             action: "delete",            hint: "⌫",  danger: true },
  ];

  const items = entry.is_dir ? dirItems : fileItems;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: Math.min(y, window.innerHeight - 320),
        left: Math.min(x, window.innerWidth - 220),
        background: "#1e1e2e",
        border: "1px solid #45475a",
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 220,
        zIndex: 9000,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        fontSize: 13,
      }}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={i} style={{ height: 1, background: "#313244", margin: "3px 0" }} />
        ) : (
          <div
            key={item.action}
            onMouseDown={(e) => {
              e.preventDefault();
              onAction(item.action, entry);
              onClose();
            }}
            style={{
              padding: "5px 16px",
              cursor: "pointer",
              color: item.danger ? "#f38ba8" : "#cdd6f4",
              userSelect: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 24,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span>{item.label}</span>
            {item.hint && <span style={{ color: "#6c7086", fontSize: 11 }}>{item.hint}</span>}
          </div>
        )
      )}
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
  workspaceRoot: string
): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  const root = workspaceRoot.replace(/\/$/, "");

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
  const { openFiles, setOpenFiles, activeFile, setActiveFile, previewFile, setPreviewFile, activeTerminalId } = useWorkspaceStore();
  const { workspaces, activeWorkspaceId } = useWorkspacesStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [tree, setTree] = useState<DirEntry | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, GitFileStatus>>(new Map());
  const [search, setSearch] = useState("");

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
    if (!activeWorkspace) return;
    invoke<DirEntry>("read_dir_tree", { path: activeWorkspace.path, depth: 4 })
      .then(setTree)
      .catch((e) => setTreeError(String(e)));
    invoke<{ path: string; status: string }[]>("git_status", { projectPath: activeWorkspace.path })
      .then((entries) => setGitStatusMap(buildGitStatusMap(entries, activeWorkspace.path)))
      .catch(() => setGitStatusMap(new Map()));
  }, [activeWorkspace?.path]);

  useEffect(() => {
    if (!activeWorkspace) { setTree(null); return; }
    setTreeError(null);
    refreshTree();
  }, [activeWorkspace?.path]);

  // Poll git status every 2s so edits/saves are reflected without a full tree reload.
  useEffect(() => {
    if (!activeWorkspace) return;
    const id = setInterval(() => {
      invoke<{ path: string; status: string }[]>("git_status", { projectPath: activeWorkspace.path })
        .then((entries) => setGitStatusMap(buildGitStatusMap(entries, activeWorkspace.path)))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [activeWorkspace?.path]);

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
        const root = activeWorkspace?.path ?? "";
        const rel = entry.path.startsWith(root)
          ? entry.path.slice(root.length).replace(/^\//, "")
          : entry.path;
        await navigator.clipboard.writeText(rel);
        break;
      }

      case "copy-name":
        await navigator.clipboard.writeText(entry.name);
        break;

      case "reveal":
        await invoke("reveal_in_finder", { path: entry.path }).catch(() => {});
        break;

      case "open-in-terminal": {
        const dir = entry.is_dir ? entry.path : entry.path.split("/").slice(0, -1).join("/");
        if (activeTerminalId) {
          await invoke("write_terminal", {
            terminalId: activeTerminalId,
            data: `cd "${dir}"\n`,
          }).catch(() => {});
        }
        break;
      }

      case "new-file":
        setFileOp({ type: "new-file", entry, value: "", error: null });
        break;

      case "new-file-sibling": {
        const parentPath = entry.path.split("/").slice(0, -1).join("/");
        const parentEntry: DirEntry = { name: "", path: parentPath, is_dir: true };
        setFileOp({ type: "new-file", entry: parentEntry, value: "", error: null });
        break;
      }

      case "new-folder":
        setFileOp({ type: "new-folder", entry, value: "", error: null });
        break;

      case "duplicate": {
        if (entry.is_dir) break;
        try {
          const content = await invoke<string>("read_file", { path: entry.path });
          const dot = entry.name.lastIndexOf(".");
          const baseName = dot > 0 ? entry.name.slice(0, dot) : entry.name;
          const ext = dot > 0 ? entry.name.slice(dot) : "";
          const parent = entry.path.split("/").slice(0, -1).join("/");
          const newPath = `${parent}/${baseName}_copy${ext}`;
          await invoke("write_file", { path: newPath, content });
          pinFileHandler(newPath);
          refreshTree();
        } catch (err) {
          alert(String(err));
        }
        break;
      }

      case "rename":
        setFileOp({ type: "rename", entry, value: entry.name, error: null });
        break;

      case "delete": {
        const label = entry.is_dir ? "folder and all its contents" : "file";
        if (!window.confirm(`Delete ${label} "${entry.name}"?`)) break;
        try {
          await invoke("delete_entry", { path: entry.path });
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
    if (!fileOp || !activeWorkspace) return;
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

  // Flatten tree for search results
  const flattenTree = (node: DirEntry): DirEntry[] => {
    const results: DirEntry[] = [];
    if (!node.is_dir) results.push(node);
    node.children?.forEach((child) => results.push(...flattenTree(child)));
    return results;
  };

  const searchResults = search.trim() && tree
    ? flattenTree(tree).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {/* Search bar */}
      <div style={{ padding: "6px 8px", borderBottom: "1px solid #313244", flexShrink: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#313244",
            border: "1px solid #45475a",
            borderRadius: 4,
            padding: "4px 8px",
            color: "#cdd6f4",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
      {!activeWorkspace ? (
        <div style={{ padding: "12px 8px", color: "#6c7086", fontSize: 12 }}>No workspace open</div>
      ) : treeError ? (
        <div style={{ padding: "12px 8px", color: "#f38ba8", fontSize: 12 }}>{treeError}</div>
      ) : !tree ? (
        <div style={{ padding: "12px 8px", color: "#6c7086", fontSize: 12 }}>Loading…</div>
      ) : searchResults ? (
        searchResults.length === 0 ? (
          <div style={{ padding: "12px 8px", color: "#6c7086", fontSize: 12 }}>No files match "{search}"</div>
        ) : (
          searchResults.map((entry) => (
            <div
              key={entry.path}
              onClick={() => previewFileHandler(entry.path)}
              onDoubleClick={() => pinFileHandler(entry.path)}
              onContextMenu={(e) => { e.preventDefault(); handleContextMenu(e, entry); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                cursor: "pointer",
                background: activeFile === entry.path ? "#094771" : "transparent",
                color: activeFile === entry.path ? "#fff" : "#d4d4d4",
                fontSize: 12,
                userSelect: "none",
              }}
              onMouseEnter={(e) => { if (activeFile !== entry.path) e.currentTarget.style.background = "#2a2a3d"; }}
              onMouseLeave={(e) => { if (activeFile !== entry.path) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 16 }}>
                <FileIcon name={entry.name} />
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
              <span style={{ color: "#45475a", fontSize: 10, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
                {entry.path.replace(activeWorkspace?.path ?? "", "").split("/").slice(0, -1).join("/").replace(/^\//, "") || "/"}
              </span>
            </div>
          ))
        )
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
      </div>{/* end scroll container */}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          entry={ctxMenu.entry}
          workspaceRoot={activeWorkspace?.path ?? ""}
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
                In: {fileOp.entry.path.replace(activeWorkspace?.path ?? "", "").replace(/^\//, "") || "/"}
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
import { useSettingsStore, HOTKEY_ACTIONS, eventToCombo } from "../../store/settings";
import TerminalPanel from "../panels/TerminalPanel";
import BrowserPanel from "../panels/BrowserPanel";
import HttpPanel from "../panels/HttpPanel";
import DbPanel from "../panels/DbPanel";
import EditorPanel from "../panels/EditorPanel";
import SearchPanel from "../panels/SearchPanel";
import EnvironmentSwitcher from "../EnvironmentSwitcher";

type RightTabId = "browser" | "http" | "db";

const RIGHT_TABS: { id: RightTabId; label: string; icon: string }[] = [
  { id: "browser", label: "Browser",  icon: "⊕" },
  { id: "http",    label: "HTTP",     icon: "⇄" },
  { id: "db",      label: "Database", icon: "◎" },
];

// ── TopBar ────────────────────────────────────────────────────────────────────

function ToolbarBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 32,
        height: 28,
        borderRadius: 5,
        border: "none",
        background: active ? "#313244" : "transparent",
        color: active ? "#cdd6f4" : "#6c7086",
        fontSize: 16,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.1s, color 0.1s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#313244";
        (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = active ? "#313244" : "transparent";
        (e.currentTarget as HTMLButtonElement).style.color = active ? "#cdd6f4" : "#6c7086";
      }}
    >
      {icon}
    </button>
  );
}

type SideView = "explorer" | "search";

function TopBar({
  sideOpen,
  sideView,
  terminalOpen,
  rightOpen,
  workspaceName,
  onSideViewClick,
  onToggleTerminal,
  onToggleRight,
}: {
  sideOpen: boolean;
  sideView: SideView;
  terminalOpen: boolean;
  rightOpen: boolean;
  workspaceName: string;
  onSideViewClick: (view: SideView) => void;
  onToggleTerminal: () => void;
  onToggleRight: () => void;
}) {
  return (
    <div
      style={{
        height: 38,
        background: "#181825",
        borderBottom: "1px solid #313244",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        gap: 4,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* Left: Explorer + Search toggles */}
      <ToolbarBtn icon="◫" label="Explorer (⌘⇧E)" active={sideOpen && sideView === "explorer"} onClick={() => onSideViewClick("explorer")} />
      <ToolbarBtn icon="⌕" label="Search (⌘⇧F)" active={sideOpen && sideView === "search"} onClick={() => onSideViewClick("search")} />

      <div style={{ width: 1, height: 18, background: "#313244", margin: "0 4px" }} />

      {/* Center — active workspace name */}
      <span style={{ color: "#6c7086", fontSize: 12, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {workspaceName}
      </span>

      {/* Right: env switcher + panel toggles */}
      <EnvironmentSwitcher />
      <div style={{ width: 1, height: 18, background: "#313244", margin: "0 4px" }} />
      <ToolbarBtn icon="⌘" label="Toggle Terminal (^`)" active={terminalOpen} onClick={onToggleTerminal} />
      <ToolbarBtn icon="◨" label="Toggle Right Panel (⌘⇧\)" active={rightOpen} onClick={onToggleRight} />
    </div>
  );
}

// ── SidePanel ─────────────────────────────────────────────────────────────────

function SidePanel({ width, view }: { width: number; view: SideView }) {
  const TITLES: Record<SideView, string> = { explorer: "EXPLORER", search: "SEARCH" };
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
        {TITLES[view]}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "explorer" ? <ExplorerPanel /> : <SearchPanel />}
      </div>
    </div>
  );
}

// ── RightPanel ────────────────────────────────────────────────────────────────

function RightPanel({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const [activeTab, setActiveTab] = useState<RightTabId>("browser");
  const { activeWorkspaceId } = useWorkspacesStore();

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      onResize(Math.max(240, Math.min(720, startW + startX - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div style={{ width, flexShrink: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      {/* Drag handle */}
      <div
        onMouseDown={startResize}
        style={{
          width: 4,
          flexShrink: 0,
          background: "#313244",
          cursor: "col-resize",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#cba6f7")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#313244")}
      />

      {/* Panel body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#181825", overflow: "hidden" }}>
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid #313244",
            background: "#11111b",
            flexShrink: 0,
            height: 35,
          }}
        >
          {RIGHT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                height: "100%",
                padding: "0 16px",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #cba6f7" : "2px solid transparent",
                background: "transparent",
                color: activeTab === tab.id ? "#cdd6f4" : "#6c7086",
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { if (activeTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
              onMouseLeave={(e) => { if (activeTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = "#6c7086"; }}
            >
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {activeTab === "browser" && <BrowserPanel key={activeWorkspaceId ?? "none"} />}
          {activeTab === "http"    && <HttpPanel    key={activeWorkspaceId ?? "none"} />}
          {activeTab === "db"      && <DbPanel      key={activeWorkspaceId ?? "none"} />}
        </div>
      </div>
    </div>
  );
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export default function Workspace() {
  useWorkspaceStore();
  const { activeWorkspaceId, workspaces } = useWorkspacesStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [sideOpen, setSideOpen] = useState(true);
  const [sideView, setSideView] = useState<SideView>("explorer");
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightWidth, setRightWidth] = useState(360);

  // Global VS Code–style hotkeys — keybindings come from settings store (user-configurable)
  useEffect(() => {
    const getAllTabs = () => {
      const { openFiles, previewFile } = useWorkspaceStore.getState();
      const hasPreview = previewFile !== null && !openFiles.includes(previewFile);
      return hasPreview ? [...openFiles, previewFile!] : [...openFiles];
    };

    const cycleTab = (dir: 1 | -1) => {
      const tabs = getAllTabs();
      if (tabs.length < 2) return;
      const { activeFile, setActiveFile } = useWorkspaceStore.getState();
      const idx = activeFile ? tabs.indexOf(activeFile) : (dir === 1 ? -1 : 0);
      setActiveFile(tabs[(idx + dir + tabs.length) % tabs.length]);
    };

    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const hk = useSettingsStore.getState().hotkeys;
      const get = (action: string) => hk[action];

      // ── Sidebar ────────────────────────────────────────────────────────────
      if (combo === get(HOTKEY_ACTIONS.TOGGLE_SIDEBAR)) {
        e.preventDefault(); setSideOpen((v) => !v); return;
      }
      if (combo === get(HOTKEY_ACTIONS.SHOW_EXPLORER)) {
        e.preventDefault(); setSideView("explorer"); setSideOpen(true); return;
      }
      if (combo === get(HOTKEY_ACTIONS.SHOW_SEARCH)) {
        e.preventDefault(); setSideView("search"); setSideOpen(true); return;
      }

      // ── Terminal / right panel ─────────────────────────────────────────────
      if (combo === get(HOTKEY_ACTIONS.TOGGLE_TERMINAL)) {
        e.preventDefault(); setTerminalOpen((v) => !v); return;
      }
      if (combo === get(HOTKEY_ACTIONS.TOGGLE_RIGHT_PANEL)) {
        e.preventDefault(); setRightOpen((v) => !v); return;
      }

      // ── Tab ops (skip when typing in an input) ────────────────────────────
      const focused = document.activeElement;
      const inInput =
        focused?.tagName === "INPUT" ||
        focused?.tagName === "TEXTAREA" ||
        (focused as HTMLElement)?.isContentEditable;

      if (combo === get(HOTKEY_ACTIONS.CLOSE_TAB) && !inInput) {
        e.preventDefault();
        const { activeFile, openFiles, previewFile, setOpenFiles, setPreviewFile, setActiveFile } =
          useWorkspaceStore.getState();
        if (!activeFile) return;
        const isPreview = previewFile === activeFile && !openFiles.includes(activeFile);
        if (isPreview) {
          setPreviewFile(null);
          setActiveFile(openFiles[0] ?? null);
        } else {
          const next = openFiles.filter((f) => f !== activeFile);
          setOpenFiles(next);
          setActiveFile([...next, ...(previewFile && !next.includes(previewFile) ? [previewFile] : [])][0] ?? null);
        }
        return;
      }

      if (combo === get(HOTKEY_ACTIONS.NEXT_TAB))      { e.preventDefault(); cycleTab(1);  return; }
      if (combo === get(HOTKEY_ACTIONS.PREV_TAB))      { e.preventDefault(); cycleTab(-1); return; }
      if (combo === get(HOTKEY_ACTIONS.NEXT_EDITOR_TAB)) { e.preventDefault(); cycleTab(1);  return; }
      if (combo === get(HOTKEY_ACTIONS.PREV_EDITOR_TAB)) { e.preventDefault(); cycleTab(-1); return; }

      // ── Cmd+1..9 — always on, not remappable ─────────────────────────────
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) {
          const tabs = getAllTabs();
          if (tabs.length === 0) return;
          e.preventDefault();
          useWorkspaceStore.getState().setActiveFile(tabs[Math.min(n - 1, tabs.length - 1)]);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // reads store via getState() — always fresh, no stale closures

  if (!activeWorkspaceId) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopBar sideOpen={false} sideView="explorer" terminalOpen={false} rightOpen={false} workspaceName="" onSideViewClick={() => {}} onToggleTerminal={() => {}} onToggleRight={() => {}} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e2e", color: "#6c7086", fontSize: 14, userSelect: "none" }}>
          Select or add a workspace to begin
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top toolbar */}
      <TopBar
        sideOpen={sideOpen}
        sideView={sideView}
        terminalOpen={terminalOpen}
        rightOpen={rightOpen}
        workspaceName={activeWorkspace?.name ?? ""}
        onSideViewClick={(view) => {
          if (sideOpen && sideView === view) setSideOpen(false);
          else { setSideView(view); setSideOpen(true); }
        }}
        onToggleTerminal={() => setTerminalOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
      />

      {/* Main area: [SidePanel?] + [EditorArea + BottomPanel] + [RightPanel?] */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* Side panel */}
        {sideOpen && (
          <SidePanel width={260} view={sideView} />
        )}

        {/* Editor + bottom panel column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

        {/* Right panel — Browser / HTTP / Database */}
        {rightOpen && (
          <RightPanel width={rightWidth} onResize={setRightWidth} />
        )}
      </div>
    </div>
  );
}
