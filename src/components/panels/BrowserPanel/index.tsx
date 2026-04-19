import { useState } from "react";
import UrlBar from "./UrlBar";
import BrowserView from "./BrowserView";

export default function BrowserPanel() {
  const [erudaActive, setErudaActive] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#1e1e2e" }}>
      <UrlBar erudaActive={erudaActive} onToggleInspect={() => setErudaActive((v) => !v)} />
      <div style={{ height: 36, flexShrink: 0, background: "#11111b" }} />
      <BrowserView erudaActive={erudaActive} />
    </div>
  );
}
