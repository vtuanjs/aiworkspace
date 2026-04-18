// Right side — renders the active panel for the active project.

import { useWorkspaceStore, PANEL } from "../../store/workspace";
import { useProjectsStore } from "../../store/projects";
import TerminalPanel from "../panels/TerminalPanel";
import BrowserPanel from "../panels/BrowserPanel";
import HttpPanel from "../panels/HttpPanel";
import DbPanel from "../panels/DbPanel";
import EditorPanel from "../panels/EditorPanel";
import EnvironmentSwitcher from "../EnvironmentSwitcher";

const PANEL_TABS = [
  { id: PANEL.TERMINAL, label: "Terminal" },
  { id: PANEL.BROWSER, label: "Browser" },
  { id: PANEL.HTTP, label: "HTTP" },
  { id: PANEL.DB, label: "DB" },
  { id: PANEL.EDITOR, label: "Editor" },
] as const;

export default function Workspace() {
  const { activePanel, setActivePanel } = useWorkspaceStore();
  const { activeProjectId } = useProjectsStore();

  if (!activeProjectId) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e1e2e",
          color: "#6c7086",
          fontSize: 14,
          userSelect: "none",
        }}
      >
        Select or add a project to begin
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#1e1e2e",
        overflow: "hidden",
      }}
    >
      {/* Tab bar + environment switcher */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#181825",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
        }}
      >
        {PANEL_TABS.map((tab) => {
          const isActive = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              style={{
                padding: "8px 16px",
                background: isActive ? "#1e1e2e" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid #cba6f7" : "2px solid transparent",
                color: isActive ? "#cdd6f4" : "#6c7086",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                transition: "color 0.15s, background 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <EnvironmentSwitcher />
      </div>

      {/* Active panel — only the active one is rendered, others are unmounted */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {activePanel === PANEL.TERMINAL && <TerminalPanel />}
        {activePanel === PANEL.BROWSER && <BrowserPanel />}
        {activePanel === PANEL.HTTP && <HttpPanel />}
        {activePanel === PANEL.DB && <DbPanel />}
        {activePanel === PANEL.EDITOR && <EditorPanel />}
      </div>
    </div>
  );
}
