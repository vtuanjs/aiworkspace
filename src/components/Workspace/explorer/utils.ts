import type { DirEntry, GitFileStatus } from "./types";

export function buildGitStatusMap(
  entries: { path: string; status: string }[],
  workspaceRoot: string
): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  const root = workspaceRoot.replace(/\/$/, "");

  const setPriority = (absPath: string, s: GitFileStatus) => {
    const existing = map.get(absPath);
    if (!existing || (existing === "new" && s === "modified")) map.set(absPath, s);
  };

  for (const entry of entries) {
    const relPath = entry.path.replace(/^"(.*)"$/, "$1"); // strip git quotes
    const absPath = root + "/" + relPath;
    const s: GitFileStatus =
      entry.status === "??" || entry.status === "A" || entry.status === "AD" ? "new" : "modified";
    setPriority(absPath, s);
    const parts = absPath.split("/");
    for (let i = parts.length - 1; i > 1; i--) {
      setPriority(parts.slice(0, i).join("/"), s);
    }
  }

  return map;
}

export function flattenTree(node: DirEntry): DirEntry[] {
  const results: DirEntry[] = [];
  if (!node.is_dir) results.push(node);
  node.children?.forEach((child) => results.push(...flattenTree(child)));
  return results;
}
