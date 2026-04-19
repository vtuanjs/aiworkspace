import TerminalPanel from "../panels/TerminalPanel";
import { startResizeDrag } from "./hooks/useResizeDrag";

export function TerminalContainer({
  height,
  onResize,
  onClose,
}: {
  height: number;
  onResize: (h: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        height,
        flexShrink: 0,
        borderTop: "1px solid #313244",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={(e) => startResizeDrag(e, height, "y", true, 80, 600, onResize)}
        title="Drag to resize"
        style={{
          height: 28,
          background: "#181825",
          borderBottom: "1px solid #313244",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          flexShrink: 0,
          userSelect: "none",
          cursor: "row-resize",
        }}
      >
        <span style={{ color: "#cdd6f4", fontSize: 11, fontWeight: 600 }}>TERMINAL</span>
        <button
          onClick={onClose}
          title="Close terminal"
          style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TerminalPanel />
      </div>
    </div>
  );
}
