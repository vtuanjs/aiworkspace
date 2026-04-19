import { useWorkspaceStore } from "../../store/workspace";
import BrowserPanel from "../panels/BrowserPanel";
import HttpPanel from "../panels/HttpPanel";
import DbPanel from "../panels/DbPanel";
import { startResizeDrag } from "./hooks/useResizeDrag";

export function RightPanel({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const { rightTab } = useWorkspaceStore();

  return (
    <div style={{ width, flexShrink: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      <div
        onMouseDown={(e) => startResizeDrag(e, width, "x", true, 240, 720, onResize)}
        style={{ width: 4, flexShrink: 0, background: "#313244", cursor: "col-resize", transition: "background 0.1s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#cba6f7")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#313244")}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#181825", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: rightTab === "browser" ? "flex" : "none", flex: 1, overflow: "hidden", flexDirection: "column" }}>
            <BrowserPanel />
          </div>
          <div style={{ display: rightTab === "http" ? "flex" : "none", flex: 1, overflow: "hidden", flexDirection: "column" }}>
            <HttpPanel />
          </div>
          <div style={{ display: rightTab === "db" ? "flex" : "none", flex: 1, overflow: "hidden", flexDirection: "column" }}>
            <DbPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
