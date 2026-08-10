const OUTLINE_COLLAPSE_KEY = "lightmark.outline-collapse.v1";
export const MAX_OUTLINE_COLLAPSE_FILES = 30;
export const MAX_COLLAPSED_HEADINGS_PER_FILE = 256;

export interface OutlineCollapseRecord {
  path: string;
  collapsedIds: string[];
  updatedAt: number;
}

export function parseOutlineCollapseRecords(serialized: string | null): OutlineCollapseRecord[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) return [];

    const records = parsed
      .filter(isOutlineCollapseRecord)
      .map((record) => ({
        path: record.path,
        collapsedIds: sanitizeCollapsedIds(record.collapsedIds),
        updatedAt: record.updatedAt,
      }))
      .filter((record) => record.collapsedIds.length > 0)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const seenPaths = new Set<string>();
    return records.filter((record) => {
      const normalized = normalizePath(record.path);
      if (seenPaths.has(normalized)) return false;
      seenPaths.add(normalized);
      return true;
    }).slice(0, MAX_OUTLINE_COLLAPSE_FILES);
  } catch {
    return [];
  }
}

export function updateOutlineCollapseRecords(
  records: OutlineCollapseRecord[],
  path: string,
  collapsedIds: Iterable<string>,
  updatedAt: number,
): OutlineCollapseRecord[] {
  const normalized = normalizePath(path);
  const remaining = records.filter((record) => normalizePath(record.path) !== normalized);
  const sanitizedIds = sanitizeCollapsedIds(Array.from(collapsedIds));
  if (sanitizedIds.length === 0) {
    return remaining.slice(0, MAX_OUTLINE_COLLAPSE_FILES);
  }
  return [
    { path, collapsedIds: sanitizedIds, updatedAt },
    ...remaining,
  ].slice(0, MAX_OUTLINE_COLLAPSE_FILES);
}

export function outlineCollapseIdsForPath(
  records: OutlineCollapseRecord[],
  path: string,
): string[] {
  const normalized = normalizePath(path);
  return records.find((record) => normalizePath(record.path) === normalized)?.collapsedIds ?? [];
}

export function loadCollapsedOutlineIds(path: string): Set<string> {
  try {
    const records = parseOutlineCollapseRecords(localStorage.getItem(OUTLINE_COLLAPSE_KEY));
    return new Set(outlineCollapseIdsForPath(records, path));
  } catch {
    return new Set();
  }
}

export function saveCollapsedOutlineIds(path: string, collapsedIds: Iterable<string>): void {
  try {
    const records = parseOutlineCollapseRecords(localStorage.getItem(OUTLINE_COLLAPSE_KEY));
    const updated = updateOutlineCollapseRecords(records, path, collapsedIds, Date.now());
    localStorage.setItem(OUTLINE_COLLAPSE_KEY, JSON.stringify(updated));
  } catch {
    // 大纲折叠是辅助状态，存储失败不应影响文档编辑。
  }
}

function sanitizeCollapsedIds(values: unknown[]): string[] {
  const unique = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value.length > 0) unique.add(value);
  });
  return Array.from(unique).slice(0, MAX_COLLAPSED_HEADINGS_PER_FILE);
}

function isOutlineCollapseRecord(value: unknown): value is OutlineCollapseRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OutlineCollapseRecord>;
  return typeof record.path === "string" &&
    record.path.length > 0 &&
    Array.isArray(record.collapsedIds) &&
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt);
}

function normalizePath(path: string): string {
  return path.toLocaleLowerCase();
}
