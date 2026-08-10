export type Theme = "light" | "dark";
export type ViewMode = "split" | "editor" | "preview";
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface DocumentState {
  path: string | null;
  content: string;
  persistedContent: string;
  lineEnding: "lf" | "crlf";
  saveStatus: SaveStatus;
}
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

export interface RecentFile {
  path: string;
  openedAt: number;
}

export interface Preferences {
  theme: Theme;
  viewMode: ViewMode;
}

export interface AppState {
  document: DocumentState;
  rootPath: string | null;
  tree: FileTreeNode[];
  outline: OutlineItem[];
  theme: Theme;
  viewMode: ViewMode;
  recentFiles: RecentFile[];
}

export interface DocumentPayload {
  path: string;
  content: string;
  lineEnding: "lf" | "crlf";
}
