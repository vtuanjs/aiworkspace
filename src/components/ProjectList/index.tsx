// Left sidebar — project switcher.

import { useEffect } from "react";
import { useProjectsStore } from "../../store/projects";

export default function ProjectList() {
  const { projects, activeProjectId, listProjects, switchProject, addProject } =
    useProjectsStore();

  useEffect(() => {
    listProjects();
  }, []);

  const handleAdd = async () => {
    // @tauri-apps/plugin-dialog is not in package.json — use window.prompt as fallback
    const path = window.prompt("Enter project path:");
    if (!path || !path.trim()) return;
    const trimmed = path.trim();
    const name = trimmed.split("/").pop() || "Project";
    await addProject(trimmed, name, "#6366f1");
  };

  return (
    <div
      style={{
        width: 56,
        background: "#1e1e2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 8,
        borderRight: "1px solid #313244",
        flexShrink: 0,
        overflowY: "auto",
      }}
    >
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            // Fire and forget — must not block UI for <200ms constraint
            switchProject(p.id);
          }}
          title={p.name}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: activeProjectId === p.id ? `2px solid ${p.color}` : "none",
            cursor: "pointer",
            background: activeProjectId === p.id ? p.color : "#313244",
            color: "#cdd6f4",
            fontSize: 16,
            fontWeight: "bold",
            flexShrink: 0,
          }}
        >
          {p.name.charAt(0).toUpperCase()}
        </button>
      ))}

      <button
        onClick={handleAdd}
        title="Add project"
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: "2px dashed #45475a",
          background: "none",
          color: "#6c7086",
          fontSize: 20,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        +
      </button>
    </div>
  );
}
