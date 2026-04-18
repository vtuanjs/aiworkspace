import { useWorkspacesStore } from "../../store/workspaces";
import { useEnvironmentStore } from "../../store/environment";

export default function StatusBar() {
  const { workspaces, activeWorkspaceId } = useWorkspacesStore();
  const { activeEnvironment } = useEnvironmentStore();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

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
        {activeWorkspace && (
          <span style={{ color: "#cba6f7", fontWeight: 600 }}>
            ⌂ {activeWorkspace.name}
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
