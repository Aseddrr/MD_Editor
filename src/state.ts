import type { AppState, DocumentState, Preferences, RecentFile } from "./types";

export function createEmptyDocument(): DocumentState {
  return {
    path: null,
    content: "",
    persistedContent: "",
    lineEnding: "lf",
    saveStatus: "idle",
  };
}
export function createInitialState(
  preferences: Preferences,
  recentFiles: RecentFile[],
): AppState {
  return {
    document: createEmptyDocument(),
    rootPath: null,
    tree: [],
    outline: [],
    theme: preferences.theme,
    viewMode: preferences.viewMode,
    recentFiles,
  };
}

export function documentDisplayName(path: string | null): string {
  if (!path) {
    return "未命名.md";
  }
  return path.split(/[\\/]/).at(-1) || path;
}

export function isDocumentDirty(document: DocumentState): boolean {
  return document.content !== document.persistedContent;
}
