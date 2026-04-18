import { useEffect } from "react";
import ProjectList from "./components/ProjectList";
import Workspace from "./components/Workspace";
import { initMcpBridge } from "./lib/mcpBridge";

export default function App() {
  useEffect(() => {
    const cleanup = initMcpBridge();
    return cleanup;
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <ProjectList />
      <Workspace />
    </div>
  );
}
