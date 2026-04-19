import type { RightTab } from "../../store/workspace";
import EnvironmentSwitcher from "../EnvironmentSwitcher";

export type SideView = "explorer" | "search";

const RIGHT_TABS: { id: RightTab; label: string; icon: string }[] = [
  { id: "browser", label: "Browser",  icon: "⊕" },
  { id: "http",    label: "HTTP",     icon: "⇄" },
  { id: "db",      label: "Database", icon: "◎" },
];

function ToolbarBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 32,
        height: 28,
        borderRadius: 5,
        border: "none",
        background: active ? "#313244" : "transparent",
        color: active ? "#cdd6f4" : "#6c7086",
        fontSize: 16,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.1s, color 0.1s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#313244";
        (e.currentTarget as HTMLButtonElement).style.color = "#cdd6f4";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = active ? "#313244" : "transparent";
        (e.currentTarget as HTMLButtonElement).style.color = active ? "#cdd6f4" : "#6c7086";
      }}
    >
      {icon}
    </button>
  );
}

const DIVIDER = <div style={{ width: 1, height: 18, background: "#313244", margin: "0 4px" }} />;

export function TopBar({
  sideOpen,
  sideView,
  terminalOpen,
  rightOpen,
  rightTab,
  workspaceName,
  onSideViewClick,
  onToggleTerminal,
  onRightTabClick,
}: {
  sideOpen: boolean;
  sideView: SideView;
  terminalOpen: boolean;
  rightOpen: boolean;
  rightTab: RightTab;
  workspaceName: string;
  onSideViewClick: (view: SideView) => void;
  onToggleTerminal: () => void;
  onRightTabClick: (tab: RightTab) => void;
}) {
  return (
    <div
      style={{
        height: 38,
        background: "#181825",
        borderBottom: "1px solid #313244",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        gap: 4,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <ToolbarBtn icon="◫" label="Explorer (⌘⇧E)" active={sideOpen && sideView === "explorer"} onClick={() => onSideViewClick("explorer")} />
      <ToolbarBtn icon="⌕" label="Search (⌘⇧F)"   active={sideOpen && sideView === "search"}   onClick={() => onSideViewClick("search")} />
      {DIVIDER}
      <span style={{ color: "#6c7086", fontSize: 12, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {workspaceName}
      </span>
      <EnvironmentSwitcher />
      {DIVIDER}
      <ToolbarBtn icon="⌘" label="Toggle Terminal (^`)" active={terminalOpen} onClick={onToggleTerminal} />
      {DIVIDER}
      {RIGHT_TABS.map((tab) => (
        <ToolbarBtn
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          active={rightOpen && rightTab === tab.id}
          onClick={() => onRightTabClick(tab.id)}
        />
      ))}
    </div>
  );
}
