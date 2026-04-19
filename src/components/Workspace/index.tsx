// VS Code-style layout:
//  [ActivityBar] [SidePanel?] [EditorArea]
//                             [TerminalPanel? — bottom]

import { useWorkspaceStore } from "../../store/workspace";
import { useWorkspacesStore } from "../../store/workspaces";
import { TopBar } from "./TopBar";
import { SidePanel } from "./SidePanel";
import { RightPanel } from "./RightPanel";
import { TerminalContainer } from "./TerminalContainer";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import EditorPanel from "../panels/EditorPanel";
import type { RightTab } from "../../store/workspace";
import type { SideView } from "./TopBar";

export default function Workspace() {
  const {
    sideOpen, setSideOpen,
    sideView, setSideView,
    terminalOpen, setTerminalOpen,
    terminalHeight, setTerminalHeight,
    rightOpen, setRightOpen,
    rightTab, setRightTab,
    rightWidth, setRightWidth,
  } = useWorkspaceStore();
  const { activeWorkspaceId, workspaces } = useWorkspacesStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  useWorkspaceHotkeys();

  const handleSideViewClick = (view: SideView) => {
    if (sideOpen && sideView === view) setSideOpen(false);
    else { setSideView(view); setSideOpen(true); }
  };

  const handleToggleTerminal = () => setTerminalOpen(!useWorkspaceStore.getState().terminalOpen);

  const handleRightTabClick = (tab: RightTab) => {
    const st = useWorkspaceStore.getState();
    if (st.rightOpen && st.rightTab === tab) setRightOpen(false);
    else { setRightTab(tab); setRightOpen(true); }
  };

  if (!activeWorkspaceId) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopBar
          sideOpen={false} sideView="explorer" terminalOpen={false}
          rightOpen={false} rightTab="browser" workspaceName=""
          onSideViewClick={() => {}} onToggleTerminal={() => {}} onRightTabClick={() => {}}
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e2e", color: "#6c7086", fontSize: 14, userSelect: "none" }}>
          Select or add a workspace to begin
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar
        sideOpen={sideOpen}
        sideView={sideView}
        terminalOpen={terminalOpen}
        rightOpen={rightOpen}
        rightTab={rightTab}
        workspaceName={activeWorkspace?.name ?? ""}
        onSideViewClick={handleSideViewClick}
        onToggleTerminal={handleToggleTerminal}
        onRightTabClick={handleRightTabClick}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {sideOpen && <SidePanel width={260} view={sideView} />}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <EditorPanel />
          </div>
          {/* Always mounted, CSS-toggled to preserve terminal state */}
          <div style={{ display: terminalOpen ? "flex" : "none", flexDirection: "column", flexShrink: 0 }}>
            <TerminalContainer height={terminalHeight} onResize={setTerminalHeight} onClose={() => setTerminalOpen(false)} />
          </div>
        </div>

        {/* Always mounted, CSS-toggled to preserve right panel state */}
        <div style={{ display: rightOpen ? "flex" : "none", flexDirection: "row", overflow: "hidden", flexShrink: 0 }}>
          <RightPanel width={rightWidth} onResize={setRightWidth} />
        </div>
      </div>
    </div>
  );
}
