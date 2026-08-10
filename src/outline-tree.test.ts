import { describe, expect, it } from "vitest";
import { buildVisibleOutlineRows } from "./outline-tree";
import type { OutlineItem } from "./types";

const outline: OutlineItem[] = [
  { id: "chapter-a", text: "Chapter A", level: 1, line: 0 },
  { id: "part-a1", text: "Part A1", level: 2, line: 2 },
  { id: "detail-a1", text: "Detail A1", level: 3, line: 4 },
  { id: "part-a2", text: "Part A2", level: 2, line: 6 },
  { id: "chapter-b", text: "Chapter B", level: 1, line: 8 },
];

describe("buildVisibleOutlineRows", () => {
  it("marks only headings followed by a deeper heading as parents", () => {
    const rows = buildVisibleOutlineRows(outline, new Set());
    expect(rows.map((row) => [row.item.id, row.hasChildren])).toEqual([
      ["chapter-a", true],
      ["part-a1", true],
      ["detail-a1", false],
      ["part-a2", false],
      ["chapter-b", false],
    ]);
  });

  it("hides all descendants until the next heading at the same or higher level", () => {
    const rows = buildVisibleOutlineRows(outline, new Set(["chapter-a"]));
    expect(rows.map((row) => row.item.id)).toEqual(["chapter-a", "chapter-b"]);
  });

  it("keeps nested collapse state when its parent is expanded again", () => {
    const parentCollapsed = buildVisibleOutlineRows(
      outline,
      new Set(["chapter-a", "part-a1"]),
    );
    expect(parentCollapsed.map((row) => row.item.id)).toEqual(["chapter-a", "chapter-b"]);

    const parentExpanded = buildVisibleOutlineRows(outline, new Set(["part-a1"]));
    expect(parentExpanded.map((row) => row.item.id)).toEqual([
      "chapter-a",
      "part-a1",
      "part-a2",
      "chapter-b",
    ]);
    expect(parentExpanded.find((row) => row.item.id === "part-a1")?.isCollapsed).toBe(true);
  });

  it("ignores stale collapsed IDs for headings without children", () => {
    const rows = buildVisibleOutlineRows(outline, new Set(["part-a2", "missing"]));
    expect(rows).toHaveLength(outline.length);
    expect(rows.find((row) => row.item.id === "part-a2")?.isCollapsed).toBe(false);
  });
});
