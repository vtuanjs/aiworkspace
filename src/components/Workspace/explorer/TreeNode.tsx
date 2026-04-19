import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DirEntry, GitFileStatus } from "./types";
import { FileIcon } from "./FileIcon";

const INDENT = 12;

const GIT_COLORS: Record<GitFileStatus, string> = {
  new: "#73c991",
  modified: "#e2c08d",
};

function nameColor(status: GitFileStatus | undefined): string {
  return status ? GIT_COLORS[status] : "#d4d4d4";
}

export function TreeNode({
  entry,
  depth,
  onOpenFile,
  onPinFile,
  activeFile,
  gitStatusMap,
  onContextMenu,
  expandedPaths,
  onToggleExpanded,
}: {
  entry: DirEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  onPinFile: (path: string) => void;
  activeFile: string | null;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  gitStatusMap: Map<string, GitFileStatus>;
  expandedPaths: Set<string>;
  onToggleExpanded: (path: string) => void;
}) {
  const expanded = expandedPaths.has(entry.path);
  const [lazyChildren, setLazyChildren] = useState<DirEntry[] | null>(null);
  const [lazyLoading, setLazyLoading] = useState(false);

  const gitStatus = gitStatusMap.get(entry.path);
  const color = nameColor(gitStatus);
  const visibleChildren = lazyChildren ?? entry.children ?? [];

  const handleToggle = () => {
    const willExpand = !expanded;
    onToggleExpanded(entry.path);
    if (willExpand && entry.truncated && lazyChildren === null && !lazyLoading) {
      setLazyLoading(true);
      invoke<DirEntry>("read_dir_tree", { path: entry.path, depth: 4 })
        .then((sub) => setLazyChildren(sub.children ?? []))
        .catch(() => setLazyChildren([]))
        .finally(() => setLazyLoading(false));
    }
  };

  if (entry.is_dir) {
    return (
      <div>
        <div
          onClick={handleToggle}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            paddingLeft: 6 + depth * INDENT,
            paddingRight: 8,
            height: 22,
            cursor: "pointer",
            color,
            fontSize: 13,
            userSelect: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a3d")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color, fontSize: 9, width: 12, flexShrink: 0, textAlign: "center" }}>
            {lazyLoading ? "⋯" : expanded ? "▼" : "▶"}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{expanded ? "📂" : "📁"}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.name}</span>
        </div>
        {expanded &&
          visibleChildren.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              onPinFile={onPinFile}
              activeFile={activeFile}
              onContextMenu={onContextMenu}
              gitStatusMap={gitStatusMap}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
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
        paddingLeft: 6 + depth * INDENT + 12,
        paddingRight: 8,
        height: 22,
        cursor: "pointer",
        background: isActive ? "#094771" : "transparent",
        color: isActive ? "#ffffff" : color,
        fontSize: 13,
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#2a2a3d"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 16, justifyContent: "center" }}>
        <FileIcon name={entry.name} />
      </span>
      <span style={{ fontSize: 13 }}>{entry.name}</span>
    </div>
  );
}
