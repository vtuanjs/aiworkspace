export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntry[];
  truncated?: boolean;
}

export type GitFileStatus = "new" | "modified";

export type ContextMenuAction =
  | "open"
  | "copy-path"
  | "copy-relative-path"
  | "copy-name"
  | "reveal"
  | "open-in-terminal"
  | "new-file"
  | "new-file-sibling"
  | "new-folder"
  | "duplicate"
  | "rename"
  | "delete";

export type MenuItem =
  | { type: "separator" }
  | { type: "item"; label: string; action: ContextMenuAction; hint?: string; danger?: boolean };
