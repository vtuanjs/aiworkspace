import { useProjectsStore } from "../../store/projects";
import { useEnvironmentStore } from "../../store/environment";

export default function StatusBar() {
  const { projects, activeProjectId } = useProjectsStore();
  const { activeEnvironment } = useEnvironmentStore();

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div
      style={{
        height: 22,
        background: "#181825",
        borderTop: "1px solid #313244",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        flexShrink: 0,
        fontSize: 11,
        color: "#6c7086",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {activeProject && (
          <span style={{ color: "#cba6f7", fontWeight: 600 }}>
            ⌂ {activeProject.name}
          </span>
        )}
        {activeEnvironment && (
          <span>
            ⚙ {activeEnvironment}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>AIWorkspace</span>
      </div>
    </div>
  );
}
