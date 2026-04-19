import { useRef, useEffect } from "react";
import type { DirEntry, ContextMenuAction, MenuItem } from "./types";

const FILE_ITEMS: MenuItem[] = [
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
  { type: "item", label: "Delete",             action: "delete",            hint: "⌫", danger: true },
];

const DIR_ITEMS: MenuItem[] = [
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
  { type: "item", label: "Delete",             action: "delete",            hint: "⌫", danger: true },
];

export function ContextMenu({
  x,
  y,
  entry,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  entry: DirEntry;
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

  const items = entry.is_dir ? DIR_ITEMS : FILE_ITEMS;

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
