import { describe, expect, it } from "vitest";
import {
  calculateSidebarSplit,
  DEFAULT_SIDEBAR_OUTLINE_RATIO,
  sanitizeSidebarOutlineRatio,
} from "./sidebar";

describe("sidebar split", () => {
  it("uses a larger default outline area and rejects invalid stored values", () => {
    expect(DEFAULT_SIDEBAR_OUTLINE_RATIO).toBe(0.6);
    expect(sanitizeSidebarOutlineRatio(undefined)).toBe(0.6);
    expect(sanitizeSidebarOutlineRatio(Number.NaN)).toBe(0.6);
    expect(sanitizeSidebarOutlineRatio(0.9)).toBe(0.6);
    expect(sanitizeSidebarOutlineRatio(0.55)).toBe(0.55);
  });

  it("keeps both sections visible at the minimum window height", () => {
    const split = calculateSidebarSplit(486, 7, 0.8);
    expect(split.outlinePixels).toBe(329);
    expect(split.availablePixels - split.outlinePixels).toBe(150);
  });

  it("clamps pointer input while preserving the requested ratio when possible", () => {
    expect(calculateSidebarSplit(727, 7, 0.1).effectiveRatio).toBeCloseTo(0.2);
    expect(calculateSidebarSplit(727, 7, 0.65).effectiveRatio).toBeCloseTo(0.65);
  });
});
