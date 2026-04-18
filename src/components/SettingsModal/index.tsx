import { useState, useEffect, useRef } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  useSettingsStore,
  HOTKEY_ACTIONS,
  HOTKEY_LABELS,
  DEFAULT_HOTKEYS,
  eventToCombo,
  comboToDisplay,
  type HotkeyAction,
} from "../../store/settings";

type Tab = "hotkeys" | "storage";

// ── Hotkey row ────────────────────────────────────────────────────────────────

function HotkeyRow({
  action,
  combo,
  isRecording,
  onStartRecord,
  onReset,
}: {
  action: HotkeyAction;
  combo: string;
  isRecording: boolean;
  onStartRecord: () => void;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "7px 16px",
        borderBottom: "1px solid #1e1e2e",
        gap: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e2e")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ flex: 1, color: "#cdd6f4", fontSize: 13 }}>
        {HOTKEY_LABELS[action]}
      </span>

      <button
        onClick={onStartRecord}
        title="Click to rebind"
        style={{
          minWidth: 110,
          padding: "3px 10px",
          background: isRecording ? "#313244" : "#181825",
          border: `1px solid ${isRecording ? "#cba6f7" : "#45475a"}`,
          borderRadius: 5,
          color: isRecording ? "#cba6f7" : "#a6adc8",
          fontSize: 12,
          fontFamily: "monospace",
          cursor: "pointer",
          textAlign: "center",
          letterSpacing: "0.03em",
        }}
      >
        {isRecording ? "Press keys…" : comboToDisplay(combo)}
      </button>

      <button
        onClick={onReset}
        title="Reset to default"
        style={{
          background: "none",
          border: "none",
          color: combo === DEFAULT_HOTKEYS[action] ? "#313244" : "#6c7086",
          cursor: combo === DEFAULT_HOTKEYS[action] ? "default" : "pointer",
          fontSize: 13,
          padding: "2px 4px",
        }}
        onMouseEnter={(e) => {
          if (combo !== DEFAULT_HOTKEYS[action])
            (e.currentTarget as HTMLButtonElement).style.color = "#f38ba8";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            combo === DEFAULT_HOTKEYS[action] ? "#313244" : "#6c7086";
        }}
      >
        ↺
      </button>
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { hotkeys, storageDir, saveHotkeys, saveStorageDir } = useSettingsStore();
  const [tab, setTab] = useState<Tab>("hotkeys");
  const [localHotkeys, setLocalHotkeys] = useState<Record<string, string>>({ ...hotkeys });
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [storageDraft, setStorageDraft] = useState<string>(storageDir ?? "~/.aiworkspace");
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape when not recording
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (recording) { setRecording(null); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, onClose]);

  // Capture hotkey when recording
  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Ignore modifier-only presses
      const pureMod = ["Control", "Alt", "Shift", "Meta"].includes(e.key);
      if (pureMod) return;
      const combo = eventToCombo(e);
      setLocalHotkeys((prev) => ({ ...prev, [recording]: combo }));
      setRecording(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording]);

  const handleSaveHotkeys = async () => {
    setSaving(true);
    try {
      await saveHotkeys(localHotkeys);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStorage = async () => {
    setSaving(true);
    try {
      const dir = storageDraft.trim() || null;
      await saveStorageDir(dir);
    } finally {
      setSaving(false);
    }
  };

  const browseDirForStorage = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") setStorageDraft(selected);
  };

  const resetAllHotkeys = () => setLocalHotkeys({ ...DEFAULT_HOTKEYS });

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "6px 16px",
    border: "none",
    background: "none",
    color: tab === t ? "#cdd6f4" : "#6c7086",
    borderBottom: tab === t ? "2px solid #cba6f7" : "2px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: tab === t ? 600 : 400,
  });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#181825",
          border: "1px solid #313244",
          borderRadius: 12,
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 0",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#cdd6f4", fontSize: 15, fontWeight: 600 }}>Settings</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #313244", padding: "0 4px", flexShrink: 0 }}>
          <button style={tabStyle("hotkeys")} onClick={() => setTab("hotkeys")}>Keyboard Shortcuts</button>
          <button style={tabStyle("storage")} onClick={() => setTab("storage")}>Storage</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* ── Hotkeys tab ── */}
          {tab === "hotkeys" && (
            <div>
              <div style={{ padding: "10px 16px 4px", color: "#6c7086", fontSize: 11 }}>
                Click a binding to record a new key combo. Changes apply immediately.
              </div>

              {(Object.values(HOTKEY_ACTIONS) as HotkeyAction[]).map((action) => (
                <HotkeyRow
                  key={action}
                  action={action}
                  combo={localHotkeys[action] ?? DEFAULT_HOTKEYS[action]}
                  isRecording={recording === action}
                  onStartRecord={() => setRecording(recording === action ? null : action)}
                  onReset={() => setLocalHotkeys((prev) => ({ ...prev, [action]: DEFAULT_HOTKEYS[action] }))}
                />
              ))}

              {/* Non-remappable */}
              <div style={{ padding: "8px 16px", borderBottom: "1px solid #1e1e2e" }}>
                <div style={{ color: "#45475a", fontSize: 11, marginBottom: 6 }}>
                  ALWAYS ON (not remappable)
                </div>
                {[
                  ["Go to Tab 1–9", "⌘1 – ⌘9"],
                  ["Save File", "⌘S (Monaco built-in)"],
                  ["Find in File", "⌘F (Monaco built-in)"],
                  ["Delete Line", "⌘⇧K (Monaco built-in)"],
                ].map(([label, hint]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#45475a", fontSize: 12 }}>
                    <span>{label}</span>
                    <span style={{ fontFamily: "monospace" }}>{hint}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Storage tab ── */}
          {tab === "storage" && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ color: "#a6adc8", fontSize: 12, marginBottom: 6 }}>
                  Global storage directory
                </div>
                <div style={{ color: "#6c7086", fontSize: 11, marginBottom: 10 }}>
                  AIWorkspace stores your workspace list, secrets, and global settings here.
                  The file <code style={{ color: "#cba6f7" }}>settings.json</code> always stays at{" "}
                  <code style={{ color: "#cba6f7" }}>~/.aiworkspace/</code>.
                  All other data moves to the directory you choose.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={storageDraft}
                    onChange={(e) => setStorageDraft(e.target.value)}
                    placeholder="~/.aiworkspace"
                    style={{
                      flex: 1,
                      background: "#1e1e2e",
                      border: "1px solid #45475a",
                      borderRadius: 6,
                      color: "#cdd6f4",
                      padding: "6px 10px",
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    onClick={browseDirForStorage}
                    style={{
                      background: "#313244",
                      border: "none",
                      borderRadius: 6,
                      color: "#cdd6f4",
                      padding: "6px 14px",
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Browse…
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#1e1e2e",
                  border: "1px solid #45475a",
                  borderRadius: 6,
                  padding: "10px 14px",
                  color: "#f9e2af",
                  fontSize: 12,
                }}
              >
                ⚠ Existing data is <strong>not</strong> moved automatically. Copy{" "}
                <code>~/.aiworkspace/projects.json</code> to the new directory before restarting.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderTop: "1px solid #313244",
            flexShrink: 0,
          }}
        >
          <div>
            {tab === "hotkeys" && (
              <button
                onClick={resetAllHotkeys}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6c7086",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f38ba8")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#6c7086")}
              >
                Reset all to defaults
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "#313244",
                border: "none",
                borderRadius: 6,
                color: "#cdd6f4",
                padding: "7px 16px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={tab === "hotkeys" ? handleSaveHotkeys : handleSaveStorage}
              disabled={saving}
              style={{
                background: "#cba6f7",
                border: "none",
                borderRadius: 6,
                color: "#1e1e2e",
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
