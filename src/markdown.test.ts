import { describe, expect, it } from "vitest";
import { parseOutline } from "./markdown";

describe("parseOutline", () => {
  it("parses ATX and Setext headings with stable duplicate slugs", () => {
    const outline = parseOutline("# 开始\n\nSection\n---\n\n## 开始");
    expect(outline).toEqual([
      { id: "开始", text: "开始", level: 1, line: 0 },
      { id: "section", text: "Section", level: 2, line: 2 },
      { id: "开始-2", text: "开始", level: 2, line: 5 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    expect(parseOutline("```md\n# not a heading\n```\n# Real")).toEqual([
      { id: "real", text: "Real", level: 1, line: 3 },
    ]);
  });
});
