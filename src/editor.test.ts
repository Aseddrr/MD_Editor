import { describe, expect, it } from "vitest";
import { findMatches, formatText, getLineAndColumn } from "./editor";

describe("formatText", () => {
  it("wraps a selected range", () => {
    expect(formatText("hello", 0, 5, "bold")).toEqual({
      value: "**hello**",
      selectionStart: 2,
      selectionEnd: 7,
    });
  });

  it("toggles prefixes across selected lines", () => {
    const prefixed = formatText("one\ntwo", 0, 7, "list");
    expect(prefixed.value).toBe("- one\n- two");
    expect(formatText(prefixed.value, 0, prefixed.value.length, "list").value).toBe("one\ntwo");
  });
});
describe("search and cursor helpers", () => {
  it("finds case-insensitive non-overlapping matches", () => {
    expect(findMatches("Alpha alpha ALPHA", "alpha")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("reports one-based line and column", () => {
    expect(getLineAndColumn("one\ntwo", 6)).toEqual({ line: 2, column: 3 });
  });
});
