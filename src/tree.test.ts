import { describe, expect, it } from "vitest";
import { filterTree } from "./tree";
import type { FileTreeNode } from "./types";

const tree: FileTreeNode[] = [
  {
    name: "docs",
    path: "C:/docs",
    isDirectory: true,
    children: [
      { name: "guide.md", path: "C:/docs/guide.md", isDirectory: false, children: [] },
    ],
  },
  { name: "README.md", path: "C:/README.md", isDirectory: false, children: [] },
];

describe("filterTree", () => {
  it("keeps parent directories for matching descendants", () => {
    expect(filterTree(tree, "guide")).toEqual([tree[0]]);
  });

  it("matches file names case-insensitively", () => {
    expect(filterTree(tree, "readme")).toEqual([tree[1]]);
  });
});
