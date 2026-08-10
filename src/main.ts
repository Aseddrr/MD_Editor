import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import {
  findMatches,
  formatText,
  getLineAndColumn,
  type FormatCommand,
  type SearchMatch,
} from "./editor";
import { parseOutline, renderMarkdown } from "./markdown";
import { loadCollapsedOutlineIds, saveCollapsedOutlineIds } from "./outline-storage";
import { buildVisibleOutlineRows } from "./outline-tree";
import { createEmptyDocument, createInitialState, documentDisplayName, isDocumentDirty } from "./state";
import { calculateSidebarSplit, DEFAULT_SIDEBAR_OUTLINE_RATIO } from "./sidebar";
import {
  loadPreferences,
  loadRecentFiles,
  rememberRecentFile,
  savePreferences,
  saveRecentFiles,
} from "./storage";
import { filterTree, renderFileTree } from "./tree";
import type { DocumentPayload, OutlineItem, Theme, ViewMode } from "./types";
import { resetDocumentViewport } from "./viewport";

const AUTOSAVE_DELAY_MS = 800;
const PREVIEW_DELAY_MS = 90;
const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown"] }];

const editor = element<HTMLTextAreaElement>("editor");
const preview = element<HTMLElement>("preview");
const welcome = element<HTMLElement>("welcome");
const fileTree = element<HTMLElement>("file-tree");
const fileFilter = element<HTMLInputElement>("file-filter");
const sidebar = element<HTMLElement>("sidebar");
const sidebarResizer = element<HTMLElement>("sidebar-resizer");
const outlineContainer = element<HTMLElement>("outline");
const outlineCount = element<HTMLElement>("outline-count");
const recentFilesContainer = element<HTMLElement>("recent-files");
const findBar = element<HTMLElement>("find-bar");
const findInput = element<HTMLInputElement>("find-input");
const findCount = element<HTMLElement>("find-count");
const documentPath = element<HTMLElement>("document-path");
const saveStatus = element<HTMLElement>("save-status");
const cursorStatus = element<HTMLElement>("cursor-status");
const toast = element<HTMLElement>("toast");
const viewModeButton = element<HTMLButtonElement>("view-mode-button");
const themeButton = element<HTMLButtonElement>("theme-button");
const sidebarResizeObserver = new ResizeObserver(applySidebarLayout);

const state = createInitialState(loadPreferences(), loadRecentFiles());
let hasDocumentSession = false;
let documentSession = 0;
let scanSession = 0;
let autosaveTimer: number | null = null;
let previewTimer: number | null = null;
let toastTimer: number | null = null;
let searchMatches: SearchMatch[] = [];
let searchIndex = -1;
let lastNativeWindowTitle = "";
let sidebarDragOffset = 0;
let collapsedOutlineIds = new Set<string>();

void initialize().catch((error: unknown) => {
  showToast(errorMessage(error), "error", 5000);
});

async function initialize(): Promise<void> {
  applyTheme(state.theme);
  applyViewMode(state.viewMode);
  applySidebarLayout();
  editor.value = state.document.content;
  renderTree();
  renderOutline();
  renderRecentFiles();
  updateDocumentChrome();
  updateCursorStatus();
  bindActions();
  await bindWindowEvents();
  await openStartupDocument();
}
function bindActions(): void {
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "new") void newDocument();
      if (action === "open") void chooseAndOpenFile();
      if (action === "open-folder") void chooseAndOpenFolder();
      if (action === "save") void saveDocument(false);
      if (action === "save-as") void saveDocument(true);
    });
  });

  document.querySelectorAll<HTMLElement>("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.dataset.format as FormatCommand | undefined;
      if (command) applyFormatting(command);
    });
  });

  editor.addEventListener("input", handleEditorInput);
  editor.addEventListener("click", updateCursorStatus);
  editor.addEventListener("keyup", updateCursorStatus);
  editor.addEventListener("select", updateCursorStatus);
  fileFilter.addEventListener("input", renderTree);
  element("refresh-tree-button").addEventListener("click", () => void refreshTree());
  bindSidebarResizer();
  sidebarResizeObserver.observe(sidebar);
  viewModeButton.addEventListener("click", cycleViewMode);
  themeButton.addEventListener("click", toggleTheme);

  findInput.addEventListener("input", () => updateSearch(false, 1));
  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateSearch(true, event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape") closeFind();
  });
  element("find-previous").addEventListener("click", () => updateSearch(true, -1));
  element("find-next").addEventListener("click", () => updateSearch(true, 1));
  element("find-close").addEventListener("click", closeFind);

  preview.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest<HTMLAnchorElement>(".preview-link");
    if (link?.dataset.href) {
      showToast(`预览链接：${link.dataset.href}`, "info");
    }
  });

  window.addEventListener("keydown", handleGlobalShortcut);
  window.addEventListener("resize", applySidebarLayout);
}

function bindSidebarResizer(): void {
  sidebarResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    sidebarDragOffset = event.clientY - sidebarResizer.getBoundingClientRect().top;
    sidebarResizer.setPointerCapture(event.pointerId);
    sidebar.classList.add("is-resizing");
    event.preventDefault();
  });

  sidebarResizer.addEventListener("pointermove", (event) => {
    if (!sidebarResizer.hasPointerCapture(event.pointerId)) return;
    const availablePixels = sidebar.clientHeight - sidebarResizer.offsetHeight;
    if (availablePixels <= 0) return;
    const requestedPixels = event.clientY - sidebar.getBoundingClientRect().top - sidebarDragOffset;
    setSidebarRatio(requestedPixels / availablePixels, false);
  });

  sidebarResizer.addEventListener("pointerup", (event) => {
    if (sidebarResizer.hasPointerCapture(event.pointerId)) {
      sidebarResizer.releasePointerCapture(event.pointerId);
    }
    sidebar.classList.remove("is-resizing");
    persistPreferences();
  });

  sidebarResizer.addEventListener("pointercancel", () => {
    sidebar.classList.remove("is-resizing");
    persistPreferences();
  });
  sidebarResizer.addEventListener("lostpointercapture", () => {
    sidebar.classList.remove("is-resizing");
  });

  sidebarResizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const split = calculateSidebarSplit(
      sidebar.clientHeight,
      sidebarResizer.offsetHeight,
      state.sidebarOutlineRatio,
    );
    if (split.availablePixels <= 0) return;
    const direction = event.key === "ArrowUp" ? -1 : 1;
    setSidebarRatio(state.sidebarOutlineRatio + (direction * 24) / split.availablePixels, true);
    event.preventDefault();
  });

  sidebarResizer.addEventListener("dblclick", () => {
    setSidebarRatio(DEFAULT_SIDEBAR_OUTLINE_RATIO, true);
  });
}

function applySidebarLayout(): void {
  const split = calculateSidebarSplit(
    sidebar.clientHeight,
    sidebarResizer.offsetHeight,
    state.sidebarOutlineRatio,
  );
  sidebar.style.setProperty("--outline-size", `${split.outlinePixels}px`);
  sidebarResizer.setAttribute("aria-valuenow", String(Math.round(split.effectiveRatio * 100)));
}

function setSidebarRatio(requestedRatio: number, saveImmediately: boolean): void {
  const split = calculateSidebarSplit(
    sidebar.clientHeight,
    sidebarResizer.offsetHeight,
    requestedRatio,
  );
  state.sidebarOutlineRatio = split.effectiveRatio;
  applySidebarLayout();
  if (saveImmediately) persistPreferences();
}

async function bindWindowEvents(): Promise<void> {
  const appWindow = getCurrentWebviewWindow();
  await listen<string>("open-markdown-path", (event) => {
    void openDocument(event.payload);
  });

  await appWindow.onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    const markdownPath = event.payload.paths.find(isMarkdownPath);
    if (markdownPath) {
      void openDocument(markdownPath);
    } else {
      showToast("仅支持拖入 .md 或 .markdown 文件。", "warning");
    }
  });

  await appWindow.onCloseRequested(async (event) => {
    if (!hasDocumentSession || !isDocumentDirty(state.document)) return;
    event.preventDefault();
    if (await prepareToLeaveDocument()) {
      await appWindow.destroy();
    }
  });
}

async function openStartupDocument(): Promise<void> {
  const path = await invoke<string | null>("startup_markdown_path");
  if (path) {
    await openDocument(path);
  }
}

async function newDocument(): Promise<void> {
  if (!(await prepareToLeaveDocument())) return;
  documentSession += 1;
  hasDocumentSession = true;
  state.document = createEmptyDocument();
  collapsedOutlineIds = new Set();
  state.document.saveStatus = "idle";
  editor.value = "";
  searchMatches = [];
  searchIndex = -1;
  renderDocument();
  resetAndFocusDocumentViewport();
}

async function chooseAndOpenFile(): Promise<void> {
  const selected = await open({
    title: "打开 Markdown 文件",
    multiple: false,
    directory: false,
    filters: MARKDOWN_FILTERS,
  });
  if (typeof selected === "string") {
    await openDocument(selected);
  }
}

async function openDocument(path: string): Promise<void> {
  if (!isMarkdownPath(path)) {
    showToast("仅支持 .md 或 .markdown 文件。", "warning");
    return;
  }
  if (
    state.document.path &&
    state.document.path.toLocaleLowerCase() === path.toLocaleLowerCase()
  ) {
    editor.focus();
    return;
  }
  if (!(await prepareToLeaveDocument())) return;

  setSaveStatus("saving");
  try {
    const payload = await invoke<DocumentPayload>("read_markdown_file", { path });
    documentSession += 1;
    hasDocumentSession = true;
    state.document = {
      path: payload.path,
      content: payload.content,
      persistedContent: payload.content,
      lineEnding: payload.lineEnding,
      saveStatus: "saved",
    };
    collapsedOutlineIds = loadCollapsedOutlineIds(payload.path);
    state.recentFiles = rememberRecentFile(state.recentFiles, payload.path);
    saveRecentFiles(state.recentFiles);
    editor.value = payload.content;
    fileFilter.value = "";
    renderDocument();
    renderRecentFiles();
    resetAndFocusDocumentViewport();
  } catch (error) {
    setSaveStatus("error");
    showToast(errorMessage(error), "error", 5000);
  }
}

async function chooseAndOpenFolder(): Promise<void> {
  const selected = await open({
    title: "打开 Markdown 文件夹",
    multiple: false,
    directory: true,
  });
  if (typeof selected !== "string") return;
  state.rootPath = selected;
  fileFilter.value = "";
  await refreshTree();
}

async function refreshTree(): Promise<void> {
  if (!state.rootPath) {
    renderTree();
    return;
  }
  const currentScan = ++scanSession;
  fileTree.setAttribute("aria-busy", "true");
  try {
    const tree = await invoke<typeof state.tree>("scan_markdown_tree", {
      rootPath: state.rootPath,
    });
    if (currentScan !== scanSession) return;
    state.tree = tree;
    renderTree();
  } catch (error) {
    if (currentScan !== scanSession) return;
    state.tree = [];
    renderTree();
    showToast(errorMessage(error), "error", 5000);
  } finally {
    if (currentScan === scanSession) {
      fileTree.removeAttribute("aria-busy");
    }
  }
}

async function saveDocument(forceSaveAs: boolean): Promise<boolean> {
  if (!hasDocumentSession) {
    await newDocument();
  }

  let path = state.document.path;
  if (!path || forceSaveAs) {
    const selected = await save({
      title: forceSaveAs ? "Markdown 另存为" : "保存 Markdown 文件",
      defaultPath: path ?? "未命名.md",
      filters: MARKDOWN_FILTERS,
    });
    if (!selected) return false;
    path = ensureMarkdownExtension(selected);
  }
  return persistDocument(path, true);
}

async function persistDocument(path: string, updatePath: boolean): Promise<boolean> {
  clearAutosave();
  const currentSession = documentSession;
  const contentToSave = state.document.content;
  const lineEnding = state.document.lineEnding;
  setSaveStatus("saving");

  try {
    const savedPath = await invoke<string>("write_markdown_file", {
      path,
      content: contentToSave,
      lineEnding,
    });
    if (currentSession !== documentSession) return true;

    if (updatePath || !state.document.path) {
      state.document.path = savedPath;
      saveCollapsedOutlineIds(savedPath, collapsedOutlineIds);
    }
    state.document.persistedContent = contentToSave;
    state.recentFiles = rememberRecentFile(state.recentFiles, savedPath);
    saveRecentFiles(state.recentFiles);
    renderRecentFiles();

    if (state.document.content === contentToSave) {
      setSaveStatus("saved");
    } else {
      setSaveStatus("dirty");
      scheduleAutosave();
    }
    if (state.rootPath) void refreshTree();
    return true;
  } catch (error) {
    if (currentSession === documentSession) {
      setSaveStatus("error");
      showToast(errorMessage(error), "error", 5000);
    }
    return false;
  }
}

async function prepareToLeaveDocument(): Promise<boolean> {
  clearAutosave();
  if (!hasDocumentSession || !isDocumentDirty(state.document)) {
    return true;
  }

  if (state.document.path) {
    const saved = await persistDocument(state.document.path, false);
    if (saved && !isDocumentDirty(state.document)) return true;
    return ask("当前文档保存失败。是否放弃尚未保存的更改？", {
      title: "保存失败",
      kind: "warning",
    });
  }

  return ask("未命名文档尚未保存。是否放弃这些更改？", {
    title: "未保存的文档",
    kind: "warning",
  });
}

function handleEditorInput(): void {
  if (!hasDocumentSession) {
    hasDocumentSession = true;
    documentSession += 1;
  }
  state.document.content = editor.value;
  setSaveStatus(isDocumentDirty(state.document) ? "dirty" : "saved");
  schedulePreview();
  scheduleAutosave();
  updateCursorStatus();
}

function schedulePreview(): void {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    renderPreviewAndOutline();
  }, PREVIEW_DELAY_MS);
}

function scheduleAutosave(): void {
  clearAutosave();
  if (!state.document.path || !isDocumentDirty(state.document)) return;
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    const path = state.document.path;
    if (path) void persistDocument(path, false);
  }, AUTOSAVE_DELAY_MS);
}

function clearAutosave(): void {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function renderDocument(): void {
  welcome.hidden = hasDocumentSession;
  renderPreviewAndOutline();
  renderTree();
  updateDocumentChrome();
  updateCursorStatus();
  updateSearch(false, 1);
}

function resetAndFocusDocumentViewport(): void {
  resetDocumentViewport(editor, [preview, outlineContainer], (callback) => {
    window.requestAnimationFrame(callback);
  });
  editor.focus({ preventScroll: true });
  updateCursorStatus();
}

function renderPreviewAndOutline(): void {
  state.outline = parseOutline(state.document.content);
  const html = renderMarkdown(state.document.content, state.outline);
  preview.innerHTML = html || '<p class="preview-placeholder">预览会显示在这里。</p>';
  renderOutline();
}

function renderOutline(): void {
  outlineContainer.replaceChildren();
  outlineCount.textContent = String(state.outline.length);
  if (state.outline.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "当前文档没有标题";
    outlineContainer.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  buildVisibleOutlineRows(state.outline, collapsedOutlineIds).forEach((row) => {
    const item = row.item;
    const rowElement = document.createElement("div");
    rowElement.className = "outline-row";
    rowElement.style.setProperty("--outline-depth", String(Math.max(0, item.level - 1)));

    if (row.hasChildren) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "outline-toggle";
      toggle.textContent = row.isCollapsed ? "▸" : "▾";
      toggle.title = `${row.isCollapsed ? "展开" : "收起"}“${item.text}”`;
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!row.isCollapsed));
      toggle.addEventListener("click", () => toggleOutline(item));
      toggle.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleOutline(item);
      });
      rowElement.append(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "outline-toggle-spacer";
      spacer.setAttribute("aria-hidden", "true");
      rowElement.append(spacer);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline-item";
    button.textContent = item.text;
    button.title = item.text;
    button.addEventListener("click", () => jumpToOutline(item));
    rowElement.append(button);
    fragment.append(rowElement);
  });
  outlineContainer.append(fragment);
}

function toggleOutline(item: OutlineItem): void {
  if (collapsedOutlineIds.has(item.id)) {
    collapsedOutlineIds.delete(item.id);
  } else {
    collapsedOutlineIds.add(item.id);
  }
  if (state.document.path) {
    saveCollapsedOutlineIds(state.document.path, collapsedOutlineIds);
  }
  renderOutline();
}

function jumpToOutline(item: OutlineItem): void {
  const cursor = offsetForLine(state.document.content, item.line);
  editor.focus();
  editor.setSelectionRange(cursor, cursor);
  const heading = Array.from(preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .find((candidate) => candidate.id === item.id);
  heading?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateCursorStatus();
}

function renderTree(): void {
  if (!state.rootPath) {
    fileTree.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "点击“文件夹”浏览 Markdown 文档";
    fileTree.append(empty);
    return;
  }
  const filtered = filterTree(state.tree, fileFilter.value);
  renderFileTree(fileTree, filtered, state.document.path, (path) => void openDocument(path));
}

function renderRecentFiles(): void {
  recentFilesContainer.replaceChildren();
  if (state.recentFiles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "还没有最近文件";
    recentFilesContainer.append(empty);
    return;
  }

  state.recentFiles.forEach((recent) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-file";
    const name = document.createElement("span");
    name.textContent = documentDisplayName(recent.path);
    const path = document.createElement("small");
    path.textContent = recent.path;
    button.append(name, path);
    button.addEventListener("click", () => void openDocument(recent.path));
    recentFilesContainer.append(button);
  });
}

function applyFormatting(command: FormatCommand): void {
  const transformed = formatText(
    editor.value,
    editor.selectionStart,
    editor.selectionEnd,
    command,
  );
  editor.value = transformed.value;
  editor.focus();
  editor.setSelectionRange(transformed.selectionStart, transformed.selectionEnd);
  handleEditorInput();
}

function openFind(): void {
  findBar.hidden = false;
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (selected && !selected.includes("\n")) {
    findInput.value = selected;
  }
  updateSearch(false, 1);
  findInput.focus();
  findInput.select();
}

function closeFind(): void {
  findBar.hidden = true;
  editor.focus();
}

function updateSearch(move: boolean, direction: 1 | -1): void {
  const previousMatch = searchMatches[searchIndex];
  searchMatches = findMatches(state.document.content, findInput.value);
  if (searchMatches.length === 0) {
    searchIndex = -1;
    findCount.textContent = "0/0";
    return;
  }

  if (move) {
    searchIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
  } else if (previousMatch) {
    const preservedIndex = searchMatches.findIndex(
      (match) => match.start === previousMatch.start && match.end === previousMatch.end,
    );
    searchIndex = preservedIndex >= 0 ? preservedIndex : 0;
  } else {
    searchIndex = 0;
  }

  findCount.textContent = `${searchIndex + 1}/${searchMatches.length}`;
  if (move) selectSearchMatch();
}

function selectSearchMatch(): void {
  const match = searchMatches[searchIndex];
  if (!match) return;
  editor.focus();
  editor.setSelectionRange(match.start, match.end);
  updateCursorStatus();
}

function handleGlobalShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey || event.altKey) return;
  const key = event.key.toLocaleLowerCase();

  if (key === "n") {
    event.preventDefault();
    void newDocument();
  } else if (key === "o" && event.shiftKey) {
    event.preventDefault();
    void chooseAndOpenFolder();
  } else if (key === "o") {
    event.preventDefault();
    void chooseAndOpenFile();
  } else if (key === "s" && event.shiftKey) {
    event.preventDefault();
    void saveDocument(true);
  } else if (key === "s") {
    event.preventDefault();
    void saveDocument(false);
  } else if (key === "f") {
    event.preventDefault();
    openFind();
  } else if (key === "b") {
    event.preventDefault();
    applyFormatting("bold");
  } else if (key === "i") {
    event.preventDefault();
    applyFormatting("italic");
  } else if (key === "e") {
    event.preventDefault();
    applyFormatting("code");
  } else if (key === "k") {
    event.preventDefault();
    applyFormatting("link");
  }
}

function cycleViewMode(): void {
  const modes: ViewMode[] = ["split", "editor", "preview"];
  const currentIndex = modes.indexOf(state.viewMode);
  const nextMode = modes[(currentIndex + 1) % modes.length] ?? "split";
  state.viewMode = nextMode;
  applyViewMode(nextMode);
  persistPreferences();
}

function applyViewMode(mode: ViewMode): void {
  document.documentElement.dataset.view = mode;
  viewModeButton.textContent = mode === "split" ? "分栏" : mode === "editor" ? "仅编辑" : "仅预览";
}

function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(state.theme);
  persistPreferences();
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "浅色" : "深色";
}

function persistPreferences(): void {
  savePreferences({
    theme: state.theme,
    viewMode: state.viewMode,
    sidebarOutlineRatio: state.sidebarOutlineRatio,
  });
}

function setSaveStatus(status: typeof state.document.saveStatus): void {
  state.document.saveStatus = status;
  updateDocumentChrome();
}

function updateDocumentChrome(): void {
  const name = documentDisplayName(state.document.path);
  const dirtyMark = isDocumentDirty(state.document) ? " •" : "";
  const windowTitle = `${name}${dirtyMark} — LightMark`;
  document.title = windowTitle;
  if (windowTitle !== lastNativeWindowTitle) {
    lastNativeWindowTitle = windowTitle;
    void getCurrentWebviewWindow().setTitle(windowTitle);
  }
  documentPath.textContent = state.document.path ?? name;
  documentPath.title = state.document.path ?? name;

  const labels = {
    idle: "就绪",
    dirty: state.document.path ? "等待自动保存" : "尚未保存",
    saving: "正在保存…",
    saved: "已保存",
    error: "保存失败",
  } as const;
  saveStatus.textContent = labels[state.document.saveStatus];
}

function updateCursorStatus(): void {
  const position = getLineAndColumn(editor.value, editor.selectionStart);
  cursorStatus.textContent = `行 ${position.line}，列 ${position.column}`;
}

function showToast(
  message: string,
  kind: "info" | "warning" | "error" = "info",
  duration = 3200,
): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toastTimer = null;
  }, duration);
}

function ensureMarkdownExtension(path: string): string {
  return isMarkdownPath(path) ? path : `${path}.md`;
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function offsetForLine(content: string, line: number): number {
  if (line <= 0) return 0;
  let offset = 0;
  for (let index = 0; index < line; index += 1) {
    const nextBreak = content.indexOf("\n", offset);
    if (nextBreak < 0) return content.length;
    offset = nextBreak + 1;
  }
  return offset;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "发生未知错误。";
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: #${id}`);
  return found as T;
}
