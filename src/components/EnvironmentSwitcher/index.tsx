// Dropdown to select the active environment for the current project.
// Shows captured runtime tokens with expiry countdowns.

import { useEffect, useState } from "react";
import { useEnvironmentStore, RuntimeToken } from "../../store/environment";
import { useProjectsStore } from "../../store/projects";

export default function EnvironmentSwitcher() {
  const { activeEnvironment, environments, runtimeTokens, switchEnvironment, clearExpiredTokens } =
    useEnvironmentStore();
  const { activeProjectId, projects } = useProjectsStore();
  const [open, setOpen] = useState(false);

  const activeProject = activeProjectId
    ? projects.find((p: { id: string }) => p.id === activeProjectId)
    : null;

  const envNames = Object.keys(environments);
  const hasEnvs = envNames.length > 0;

  // Tick every second to update TTL countdowns
  useEffect(() => {
    const timer = setInterval(() => clearExpiredTokens(), 1000);
    return () => clearInterval(timer);
  }, [clearExpiredTokens]);

  if (!activeProject) return null;

  const handleSwitch = async (name: string) => {
    await switchEnvironment(activeProject.path, name);
    setOpen(false);
  };

  const tokenEntries = (Object.entries(runtimeTokens) as [string, RuntimeToken][]).filter(
    ([, v]) => v.expiresAt === undefined || v.expiresAt > Date.now()
  );

  return (
    <div style={{ position: "relative", marginLeft: "auto", marginRight: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch environment"
        style={{
          padding: "3px 10px",
          background: hasEnvs ? "#313244" : "#1e1e2e",
          border: "1px solid #45475a",
          borderRadius: 4,
          color: hasEnvs ? "#cba6f7" : "#6c7086",
          fontSize: 11,
          cursor: "pointer",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>{activeEnvironment || "No env"}</span>
        {tokenEntries.length > 0 && (
          <span
            style={{
              background: "#a6e3a1",
              color: "#1e1e2e",
              borderRadius: 10,
              fontSize: 9,
              padding: "0 4px",
              fontWeight: 700,
            }}
          >
            {tokenEntries.length} token{tokenEntries.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "#181825",
            border: "1px solid #313244",
            borderRadius: 6,
            minWidth: 200,
            zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {/* Environment list */}
          <div
            style={{
              padding: "6px 8px",
              fontSize: 10,
              color: "#6c7086",
              borderBottom: "1px solid #313244",
            }}
          >
            ENVIRONMENTS
          </div>
          {hasEnvs ? (
            envNames.map((name) => (
              <button
                key={name}
                onClick={() => handleSwitch(name)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "6px 12px",
                  background: name === activeEnvironment ? "#313244" : "transparent",
                  border: "none",
                  textAlign: "left",
                  color: name === activeEnvironment ? "#cba6f7" : "#cdd6f4",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {name === activeEnvironment ? "✓ " : "  "}
                {name}
              </button>
            ))
          ) : (
            <div style={{ padding: "8px 12px", color: "#6c7086", fontSize: 11 }}>
              No environments configured.
              <br />
              Add to .monocode/environments.json
            </div>
          )}

          {/* Runtime tokens */}
          {tokenEntries.length > 0 && (
            <>
              <div
                style={{
                  padding: "6px 8px",
                  fontSize: 10,
                  color: "#6c7086",
                  borderTop: "1px solid #313244",
                }}
              >
                RUNTIME TOKENS
              </div>
              {tokenEntries.map(([name, token]: [string, RuntimeToken]) => {
                const remaining =
                  token.expiresAt !== undefined
                    ? Math.max(0, Math.round((token.expiresAt - Date.now()) / 1000))
                    : null;
                return (
                  <div
                    key={name}
                    style={{
                      padding: "5px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#a6e3a1" }}>{`{{${name}}}`}</span>
                    {remaining !== null && (
                      <span style={{ fontSize: 10, color: "#6c7086" }}>{remaining}s</span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Click-away to close */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 99 }}
        />
      )}
    </div>
  );
}
