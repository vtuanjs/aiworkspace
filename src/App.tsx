import { useEffect, Component, ReactNode } from "react";
import WorkspaceList from "./components/WorkspaceList";
import Workspace from "./components/Workspace";
import StatusBar from "./components/StatusBar";
import { initMcpBridge } from "./lib/mcpBridge";
import { useSettingsStore } from "./store/settings";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#f38ba8", fontFamily: "monospace", background: "#1e1e2e", height: "100vh" }}>
          <h2 style={{ color: "#f38ba8" }}>Render error</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#cdd6f4" }}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    loadSettings();
    const cleanup = initMcpBridge();
    return cleanup;
  }, []);

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e", overflow: "hidden" }}>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <WorkspaceList />
          <Workspace />
        </div>
        <StatusBar />
      </div>
    </ErrorBoundary>
  );
}
