import { describe, expect, it } from "vitest";
import {
  MAX_COLLAPSED_HEADINGS_PER_FILE,
  MAX_OUTLINE_COLLAPSE_FILES,
  outlineCollapseIdsForPath,
  parseOutlineCollapseRecords,
  updateOutlineCollapseRecords,
  type OutlineCollapseRecord,
} from "./outline-storage";

describe("outline collapse storage", () => {
  it("falls back safely for malformed storage", () => {
    expect(parseOutlineCollapseRecords("not json")).toEqual([]);
    expect(parseOutlineCollapseRecords('{"unexpected":true}')).toEqual([]);
  });

  it("isolates records by path case-insensitively", () => {
    const records = updateOutlineCollapseRecords([], "C:\\Docs\\Guide.md", ["intro"], 1);
    expect(outlineCollapseIdsForPath(records, "c:\\docs\\guide.md")).toEqual(["intro"]);
    expect(outlineCollapseIdsForPath(records, "C:\\Docs\\Other.md")).toEqual([]);
  });

  it("deduplicates and caps collapsed heading IDs", () => {
    const ids = Array.from(
      { length: MAX_COLLAPSED_HEADINGS_PER_FILE + 20 },
      (_, index) => `heading-${index}`,
    );
    ids.push("heading-0", "");
    const records = updateOutlineCollapseRecords([], "C:\\large.md", ids, 1);
    expect(records[0]?.collapsedIds).toHaveLength(MAX_COLLAPSED_HEADINGS_PER_FILE);
    expect(records[0]?.collapsedIds[0]).toBe("heading-0");
  });

  it("keeps only the most recent configured number of files", () => {
    let records: OutlineCollapseRecord[] = [];
    for (let index = 0; index < MAX_OUTLINE_COLLAPSE_FILES + 5; index += 1) {
      records = updateOutlineCollapseRecords(records, `C:\\doc-${index}.md`, [`h-${index}`], index);
    }
    expect(records).toHaveLength(MAX_OUTLINE_COLLAPSE_FILES);
    expect(outlineCollapseIdsForPath(records, "C:\\doc-34.md")).toEqual(["h-34"]);
    expect(outlineCollapseIdsForPath(records, "C:\\doc-0.md")).toEqual([]);
  });

  it("removes a file record when all headings are expanded", () => {
    const records = updateOutlineCollapseRecords([], "C:\\guide.md", ["intro"], 1);
    expect(updateOutlineCollapseRecords(records, "C:\\guide.md", [], 2)).toEqual([]);
  });
});
