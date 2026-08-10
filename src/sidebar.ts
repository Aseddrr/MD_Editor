export const DEFAULT_SIDEBAR_OUTLINE_RATIO = 0.6;
export const MIN_SIDEBAR_OUTLINE_RATIO = 0.2;
export const MAX_SIDEBAR_OUTLINE_RATIO = 0.8;

const MIN_OUTLINE_HEIGHT = 120;
const MIN_DIRECTORY_HEIGHT = 150;

export interface SidebarSplit {
  availablePixels: number;
  outlinePixels: number;
  effectiveRatio: number;
}

export function sanitizeSidebarOutlineRatio(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_SIDEBAR_OUTLINE_RATIO &&
    value <= MAX_SIDEBAR_OUTLINE_RATIO
    ? value
    : DEFAULT_SIDEBAR_OUTLINE_RATIO;
}

export function calculateSidebarSplit(
  sidebarHeight: number,
  dividerHeight: number,
  requestedRatio: number,
): SidebarSplit {
  const availablePixels = Math.max(0, sidebarHeight - dividerHeight);
  const safeRatio = Number.isFinite(requestedRatio)
    ? Math.min(MAX_SIDEBAR_OUTLINE_RATIO, Math.max(MIN_SIDEBAR_OUTLINE_RATIO, requestedRatio))
    : DEFAULT_SIDEBAR_OUTLINE_RATIO;
  if (availablePixels === 0) {
    return { availablePixels, outlinePixels: 0, effectiveRatio: safeRatio };
  }

  const minimumOutline = Math.min(MIN_OUTLINE_HEIGHT, availablePixels / 2);
  const minimumDirectory = Math.min(MIN_DIRECTORY_HEIGHT, availablePixels - minimumOutline);
  const maximumOutline = Math.max(minimumOutline, availablePixels - minimumDirectory);
  const outlinePixels = Math.min(
    maximumOutline,
    Math.max(minimumOutline, availablePixels * safeRatio),
  );
  return {
    availablePixels,
    outlinePixels,
    effectiveRatio: outlinePixels / availablePixels,
  };
}
