import type { Preferences, RecentFile, Theme, ViewMode } from "./types";
import { DEFAULT_SIDEBAR_OUTLINE_RATIO, sanitizeSidebarOutlineRatio } from "./sidebar";

const PREFERENCES_KEY = "lightmark.preferences.v1";
const RECENT_FILES_KEY = "lightmark.recent-files.v1";
const MAX_RECENT_FILES = 10;

const defaultTheme: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";

const defaultPreferences: Preferences = {
  theme: defaultTheme,
  viewMode: "split",
  sidebarOutlineRatio: DEFAULT_SIDEBAR_OUTLINE_RATIO,
};

export function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (!stored) {
      return { ...defaultPreferences };
    }
    const parsed = JSON.parse(stored) as Partial<Preferences>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultPreferences.theme,
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : "split",
      sidebarOutlineRatio: sanitizeSidebarOutlineRatio(parsed.sidebarOutlineRatio),
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // WebView 存储不可用时保留当前会话状态即可。
  }
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRecentFile)
      .sort((left, right) => right.openedAt - left.openedAt)
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

export function rememberRecentFile(files: RecentFile[], path: string): RecentFile[] {
  const normalized = path.toLocaleLowerCase();
  return [
    { path, openedAt: Date.now() },
    ...files.filter((entry) => entry.path.toLocaleLowerCase() !== normalized),
  ].slice(0, MAX_RECENT_FILES);
}

export function removeRecentFile(files: RecentFile[], path: string): RecentFile[] {
  const normalized = path.toLocaleLowerCase();
  return files.filter((entry) => entry.path.toLocaleLowerCase() !== normalized);
}

export function saveRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, MAX_RECENT_FILES)));
  } catch {
    // 最近记录是辅助信息，写入失败不应影响编辑。
  }
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function isViewMode(value: unknown): value is ViewMode {
  return value === "split" || value === "editor" || value === "preview";
}

function isRecentFile(value: unknown): value is RecentFile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RecentFile>;
  return typeof candidate.path === "string" && typeof candidate.openedAt === "number";
}
