// Left sidebar — project switcher.

import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkspacesStore } from "../../store/workspaces";
import SettingsModal from "../SettingsModal";
const WORKSPACE_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

export default function WorkspaceList() {
  const { workspaces, activeWorkspaceId, listWorkspaces, switchWorkspace, addWorkspace, removeWorkspace } =
    useWorkspacesStore();

  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(WORKSPACE_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; workspaceId: string; workspaceName: string } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  const handleWorkspaceContextMenu = (e: React.MouseEvent, workspaceId: string, workspaceName: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, workspaceId, workspaceName });
  };

  const handleRemoveWorkspace = async (workspaceId: string, workspaceName: string) => {
    setCtxMenu(null);
    if (!window.confirm(`Remove "${workspaceName}" from AIWorkspace?\n\nThis only removes it from the workspace list — your files are not deleted.`)) return;
    await removeWorkspace(workspaceId);
  };

  useEffect(() => {
    listWorkspaces();
  }, []);

  useEffect(() => {
    if (modalOpen) nameRef.current?.focus();
  }, [modalOpen]);

  const openModal = () => {
    setPath("");
    setName("");
    setColor(WORKSPACE_COLORS[0]);
    setError(null);
    setModalOpen(true);
  };

  const browsePath = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setPath(selected);
    if (!name.trim()) {
      setName(selected.split("/").pop() || "Workspace");
    }
  };

  const handleConfirm = async () => {
    const trimmedPath = path.trim();
    const trimmedName = name.trim();
    if (!trimmedPath) { setError("Please select a workspace folder."); return; }
    if (!trimmedName) { setError("Workspace name is required."); return; }
    setError(null);
    setLoading(true);
    try {
      await addWorkspace(trimmedPath, trimmedName, color);
      setModalOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") setModalOpen(false);
  };

  return (
    <>
      {/* VS Code-style project switcher — far left strip */}
      <div
        style={{
          width: expanded ? 180 : 44,
          background: "#11111b",
          display: "flex",
          flexDirection: "column",
          alignItems: expanded ? "stretch" : "center",
          paddingTop: 8,
          paddingBottom: 8,
          gap: 6,
          flexShrink: 0,
          overflowY: "auto",
          overflowX: "hidden",
          borderRight: "1px solid #1e1e2e",
          transition: "width 0.15s ease",
        }}
      >
        {workspaces.map((w) => (
          <button
            key={w.id}
            onClick={() => switchWorkspace(w.id)}
            onContextMenu={(e) => handleWorkspaceContextMenu(e, w.id, w.name)}
            title={w.name}
            style={{
              height: 32,
              borderRadius: activeWorkspaceId === w.id ? 8 : 10,
              border: "none",
              cursor: "pointer",
              background: expanded ? (activeWorkspaceId === w.id ? "#1e1e2e" : "transparent") : w.color,
              color: expanded ? (activeWorkspaceId === w.id ? "#cdd6f4" : "#a6adc8") : "#fff",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              outline: !expanded && activeWorkspaceId === w.id ? `2px solid ${w.color}` : "none",
              outlineOffset: 2,
              transition: "border-radius 0.12s, background 0.12s",
              boxShadow: !expanded && activeWorkspaceId === w.id ? `0 0 0 2px #11111b, 0 0 0 4px ${w.color}` : "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: expanded ? "0 8px" : "0",
              width: expanded ? "calc(100% - 8px)" : 32,
              marginLeft: expanded ? 4 : 0,
              textAlign: "left",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: w.color,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              flexShrink: 0,
            }}>
              {w.name.charAt(0).toUpperCase()}
            </span>
            {expanded && (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: activeWorkspaceId === w.id ? 600 : 400 }}>
                {w.name}
              </span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Add project */}
        <button
          onClick={openModal}
          title="Add workspace"
          style={{
            height: 32,
            borderRadius: 10,
            border: "2px dashed #313244",
            background: "none",
            color: "#45475a",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: expanded ? "flex-start" : "center",
            gap: 8,
            padding: expanded ? "0 8px" : "0",
            width: expanded ? "calc(100% - 8px)" : 32,
            marginLeft: expanded ? 4 : 0,
            transition: "color 0.12s, border-color 0.12s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#6c7086";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#45475a";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#313244";
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>+</span>
          {expanded && <span style={{ fontSize: 12 }}>Add workspace</span>}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          style={{
            height: 32,
            borderRadius: 10,
            border: "none",
            background: "none",
            color: "#45475a",
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: expanded ? "flex-start" : "center",
            gap: 8,
            padding: expanded ? "0 8px" : "0",
            width: expanded ? "calc(100% - 8px)" : 32,
            marginLeft: expanded ? 4 : 0,
            transition: "color 0.12s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#45475a"; }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>⚙</span>
          {expanded && <span style={{ fontSize: 12 }}>Settings</span>}
        </button>

        {/* Expand / collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
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
            padding: expanded ? "0 8px" : "0",
            width: expanded ? "calc(100% - 8px)" : 32,
            marginLeft: expanded ? 4 : 0,
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#45475a"; }}
        >
          {expanded ? "«" : "»"}
        </button>
      </div>

      {/* Modal overlay */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onKeyDown={handleKeyDown}
            style={{
              background: "#1e1e2e",
              border: "1px solid #313244",
              borderRadius: 12,
              padding: 24,
              width: 400,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <h2 style={{ margin: 0, color: "#cdd6f4", fontSize: 16, fontWeight: 600 }}>
              Add Workspace
            </h2>

            {/* Folder picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ color: "#a6adc8", fontSize: 12 }}>Folder</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  readOnly
                  value={path}
                  placeholder="Select a folder…"
                  style={{
                    flex: 1,
                    background: "#181825",
                    border: "1px solid #45475a",
                    borderRadius: 6,
                    color: path ? "#cdd6f4" : "#6c7086",
                    padding: "6px 10px",
                    fontSize: 13,
                    outline: "none",
                    minWidth: 0,
                  }}
                />
                <button
                  onClick={browsePath}
                  style={{
                    background: "#313244",
                    border: "none",
                    borderRadius: 6,
                    color: "#cdd6f4",
                    padding: "6px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Browse…
                </button>
              </div>
            </div>

            {/* Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ color: "#a6adc8", fontSize: 12 }}>Name</label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Workspace"
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
            </div>

            {/* Color */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ color: "#a6adc8", fontSize: 12 }}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {WORKSPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border: color === c ? "3px solid #cdd6f4" : "3px solid transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div style={{ color: "#f38ba8", fontSize: 12 }}>{error}</div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: "#313244",
                  border: "none",
                  borderRadius: 6,
                  color: "#cdd6f4",
                  padding: "7px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                style={{
                  background: color,
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "7px 16px",
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  fontWeight: 600,
                }}
              >
                {loading ? "Adding…" : "Add Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}


      {/* Project context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: "#1e1e2e",
            border: "1px solid #45475a",
            borderRadius: 6,
            padding: "4px 0",
            minWidth: 180,
            zIndex: 9000,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            fontSize: 13,
          }}
        >
          <div
            onMouseDown={() => { switchWorkspace(ctxMenu.workspaceId); setCtxMenu(null); }}
            style={{ padding: "5px 16px", cursor: "pointer", color: "#cdd6f4", userSelect: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Switch to Workspace
          </div>
          <div style={{ height: 1, background: "#313244", margin: "3px 0" }} />
          <div
            onMouseDown={() => handleRemoveWorkspace(ctxMenu.workspaceId, ctxMenu.workspaceName)}
            style={{ padding: "5px 16px", cursor: "pointer", color: "#f38ba8", userSelect: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#313244")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Remove from AIWorkspace
          </div>
        </div>
      )}
    </>
  );
}
