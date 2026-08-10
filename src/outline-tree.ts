import type { OutlineItem } from "./types";

export interface VisibleOutlineRow {
  item: OutlineItem;
  hasChildren: boolean;
  isCollapsed: boolean;
}

export function buildVisibleOutlineRows(
  items: OutlineItem[],
  collapsedIds: ReadonlySet<string>,
): VisibleOutlineRow[] {
  const parents: Array<{ level: number; isCollapsed: boolean }> = [];
  const rows: VisibleOutlineRow[] = [];

  items.forEach((item, index) => {
    while (parents.length > 0 && (parents.at(-1)?.level ?? 0) >= item.level) {
      parents.pop();
    }

    const hidden = parents.some((parent) => parent.isCollapsed);
    const hasChildren = (items[index + 1]?.level ?? 0) > item.level;
    const isCollapsed = hasChildren && collapsedIds.has(item.id);
    if (!hidden) {
      rows.push({ item, hasChildren, isCollapsed });
    }
    if (hasChildren) {
      parents.push({ level: item.level, isCollapsed });
    }
  });

  return rows;
}
