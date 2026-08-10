import type { FileTreeNode } from "./types";

export function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    if (!node.isDirectory) {
      return node.name.toLocaleLowerCase().includes(normalizedQuery) ? [node] : [];
    }
    if (node.name.toLocaleLowerCase().includes(normalizedQuery)) {
      return [node];
    }
    const children = filterTree(node.children, normalizedQuery);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}
export function renderFileTree(
  container: HTMLElement,
  nodes: FileTreeNode[],
  activePath: string | null,
  onOpenFile: (path: string) => void,
): void {
  container.replaceChildren();
  if (nodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "没有匹配的 Markdown 文件";
    container.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  nodes.forEach((node) => fragment.append(createTreeNode(node, activePath, onOpenFile)));
  container.append(fragment);
}

function createTreeNode(
  node: FileTreeNode,
  activePath: string | null,
  onOpenFile: (path: string) => void,
): HTMLElement {
  if (node.isDirectory) {
    const details = document.createElement("details");
    details.className = "tree-directory";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = node.name;
    summary.title = node.path;
    details.append(summary);

    const children = document.createElement("div");
    children.className = "tree-children";
    node.children.forEach((child) => children.append(createTreeNode(child, activePath, onOpenFile)));
    details.append(children);
    return details;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-file";
  button.textContent = node.name;
  button.title = node.path;
  button.dataset.path = node.path;
  if (activePath && node.path.toLocaleLowerCase() === activePath.toLocaleLowerCase()) {
    button.classList.add("is-active");
  }
  button.addEventListener("click", () => onOpenFile(node.path));
  return button;
}
