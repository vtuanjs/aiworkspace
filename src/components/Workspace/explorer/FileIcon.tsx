export function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const base = name.toLowerCase();

  if (base === "dockerfile" || base === ".dockerignore")
    return <span style={{ color: "#0db7ed", fontSize: 13 }}>🐳</span>;
  if (base === ".gitignore" || base === ".gitattributes")
    return <span style={{ color: "#f05033", fontSize: 12, fontWeight: 700 }}>⊙</span>;
  if (base === "package.json" || base === "package-lock.json")
    return <span style={{ color: "#cb3837", fontSize: 11, fontWeight: 900, fontFamily: "monospace" }}>npm</span>;
  if (base === "cargo.toml" || base === "cargo.lock")
    return <span style={{ color: "#dea584", fontSize: 13 }}>⚙</span>;

  const map: Record<string, JSX.Element> = {
    ts:   <span style={{ color: "#3178c6", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>TS</span>,
    tsx:  <span style={{ color: "#61dafb", fontSize: 13 }}>⚛</span>,
    js:   <span style={{ color: "#f7df1e", fontSize: 11, fontWeight: 800, fontFamily: "monospace", background: "#3b3b00", padding: "0 1px", borderRadius: 2 }}>JS</span>,
    jsx:  <span style={{ color: "#61dafb", fontSize: 13 }}>⚛</span>,
    rs:   <span style={{ color: "#dea584", fontSize: 13 }}>⚙</span>,
    go:   <span style={{ color: "#00add8", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>Go</span>,
    py:   <span style={{ color: "#3572a5", fontSize: 13 }}>🐍</span>,
    json: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{"{}"}</span>,
    yaml: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>≡</span>,
    yml:  <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>≡</span>,
    toml: <span style={{ color: "#cbcb41", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>⚙</span>,
    md:   <span style={{ color: "#519aba", fontSize: 12, fontWeight: 700 }}>M↓</span>,
    mdx:  <span style={{ color: "#519aba", fontSize: 12, fontWeight: 700 }}>M↓</span>,
    sh:   <span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    bash: <span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    zsh:  <span style={{ color: "#89e051", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>$</span>,
    sql:  <span style={{ color: "#e97700", fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>DB</span>,
    html: <span style={{ color: "#e34c26", fontSize: 12, fontWeight: 700 }}>{"</>"}</span>,
    css:  <span style={{ color: "#563d7c", fontSize: 13 }}>🎨</span>,
    scss: <span style={{ color: "#cf649a", fontSize: 13 }}>🎨</span>,
    svg:  <span style={{ color: "#ffb13b", fontSize: 12 }}>◈</span>,
    png:  <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    jpg:  <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    jpeg: <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    gif:  <span style={{ color: "#a074c4", fontSize: 12 }}>🖼</span>,
    lock: <span style={{ color: "#bcbcbc", fontSize: 12 }}>🔒</span>,
    env:  <span style={{ color: "#ecc94b", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>.env</span>,
  };

  return map[ext] ?? <span style={{ color: "#cdd6f4", fontSize: 12 }}>📄</span>;
}
