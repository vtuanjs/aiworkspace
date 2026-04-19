import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../../store/workspace";
import { useWorkspacesStore } from "../../../store/workspaces";
import type { DirEntry, ContextMenuAction } from "./types";
import { buildGitStatusMap, flattenTree } from "./utils";
import { TreeNode } from "./TreeNode";
import { ContextMenu } from "./ContextMenu";
import { FileIcon } from "./FileIcon";

const FILE_OP_TITLES: Record<"rename" | "new-file" | "new-folder", string> = {
  rename: "Rename",
  "new-file": "New File",
  "new-folder": "New Folder",
};

type FileOpState = {
  type: "rename" | "new-file" | "new-folder";
  entry: DirEntry;
  value: string;
  error: string | null;
};

type CtxMenuState = { x: number; y: number; entry: DirEntry };

export default function ExplorerPanel() {
  const { openFiles, setOpenFiles, activeFile, setActiveFile, previewFile, setPreviewFile, activeTerminalId } =
    useWorkspaceStore();
  const { workspaces, activeWorkspaceId } = useWorkspacesStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [tree, setTree] = useState<DirEntry | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, import("./types").GitFileStatus>>(new Map());
  const [search, setSearch] = useState("");
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [fileOp, setFileOp] = useState<FileOpState | null>(null);
  const fileOpInputRef = useRef<HTMLInputElement>(null);

  // ── Expanded folder state (persisted to explorer.json) ───────────────────────
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  // false = no saved state loaded yet for current workspace → auto-expand root on first tree load
  const explorerInitRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    explorerInitRef.current = false;
    setExpandedPaths(new Set());
    if (!activeWorkspaceId) return;
    invoke<string>("read_panel_state", { workspaceId: activeWorkspaceId, panel: "explorer" })
      .then((raw) => {
        const data = JSON.parse(raw) as { expanded_paths?: string[] };
        if (data.expanded_paths !== undefined) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          setExpandedPaths(new Set(data.expanded_paths));
          explorerInitRef.current = true;
        }
      })
      .catch(() => { explorerInitRef.current = true; });
  }, [activeWorkspaceId]);

  const saveExpandedPaths = useCallback((paths: Set<string>) => {
    if (!activeWorkspaceId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      invoke("write_panel_state", {
        workspaceId: activeWorkspaceId,
        panel: "explorer",
        content: JSON.stringify({ expanded_paths: [...paths] }),
      }).catch(() => {});
    }, 400);
  }, [activeWorkspaceId]);

  const handleToggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpandedPaths(next);
      return next;
    });
  }, [saveExpandedPaths]);


  useEffect(() => {
    if (fileOp) setTimeout(() => fileOpInputRef.current?.focus(), 50);
  }, [fileOp]);

  const refreshGitStatus = useCallback(() => {
    if (!activeWorkspace) return;
    invoke<{ path: string; status: string }[]>("git_status", { projectPath: activeWorkspace.path })
      .then((entries) => setGitStatusMap(buildGitStatusMap(entries, activeWorkspace.path)))
      .catch(() => setGitStatusMap(new Map()));
  }, [activeWorkspace?.path]);

  const refreshTree = useCallback(() => {
    if (!activeWorkspace) return;
    invoke<DirEntry>("read_dir_tree", { path: activeWorkspace.path, depth: 4 })
      .then(setTree)
      .catch((e) => setTreeError(String(e)));
    refreshGitStatus();
  }, [activeWorkspace?.path, refreshGitStatus]);

  useEffect(() => {
    if (!activeWorkspace) { setTree(null); return; }
    setTreeError(null);
    refreshTree();
  }, [activeWorkspace?.path]);

  // Mark init complete when tree loads (no auto-expand on first load)
  useEffect(() => {
    if (!tree || explorerInitRef.current) return;
    explorerInitRef.current = true;
  }, [tree]);

  useEffect(() => {
    if (!activeWorkspace) return;
    const id = setInterval(refreshGitStatus, 2000);
    return () => clearInterval(id);
  }, [activeWorkspace?.path, refreshGitStatus]);

  const previewFileHandler = (filePath: string) => {
    setPreviewFile(filePath);
    setActiveFile(filePath);
  };

  const pinFileHandler = (filePath: string) => {
    if (!openFiles.includes(filePath)) setOpenFiles([...openFiles, filePath]);
    if (previewFile === filePath) setPreviewFile(null);
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
          await invoke("write_terminal", { terminalId: activeTerminalId, data: `cd "${dir}"\n` }).catch(() => {});
        }
        break;
      }

      case "new-file":
        setFileOp({ type: "new-file", entry, value: "", error: null });
        break;

      case "new-file-sibling": {
        const parentPath = entry.path.split("/").slice(0, -1).join("/");
        setFileOp({ type: "new-file", entry: { name: "", path: parentPath, is_dir: true }, value: "", error: null });
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
            const next = openFiles.filter((f) => f !== entry.path);
            setOpenFiles(next);
            if (activeFile === entry.path) setActiveFile(next[0] ?? null);
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

  const searchResults =
    search.trim() && tree
      ? flattenTree(tree).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
      : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
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
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </span>
                <span style={{ color: "#45475a", fontSize: 10, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
                  {entry.path.replace(activeWorkspace.path, "").split("/").slice(0, -1).join("/").replace(/^\//, "") || "/"}
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
              expandedPaths={expandedPaths}
              onToggleExpanded={handleToggleExpanded}
            />
          ))
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          entry={ctxMenu.entry}
          onAction={handleAction}
          onClose={() => setCtxMenu(null)}
        />
      )}

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
              placeholder={
                fileOp.type === "rename" ? "New name" :
                fileOp.type === "new-folder" ? "Folder name" : "File name"
              }
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
