import ExplorerPanel from "./explorer";
import SearchPanel from "../panels/SearchPanel";
import type { SideView } from "./TopBar";

const TITLES: Record<SideView, string> = { explorer: "EXPLORER", search: "SEARCH" };

export function SidePanel({ width, view }: { width: number; view: SideView }) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: "#181825",
        borderRight: "1px solid #313244",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#a6adc8",
          letterSpacing: "0.08em",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {TITLES[view]}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "explorer" ? <ExplorerPanel /> : <SearchPanel />}
      </div>
    </div>
  );
}
