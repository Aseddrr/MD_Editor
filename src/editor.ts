export type FormatCommand = "bold" | "italic" | "code" | "link" | "heading" | "list";

export interface TextTransform {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}
export interface SearchMatch {
  start: number;
  end: number;
}

export function formatText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: FormatCommand,
): TextTransform {
  if (command === "heading") {
    return toggleLinePrefix(value, selectionStart, selectionEnd, "## ");
  }
  if (command === "list") {
    return toggleLinePrefix(value, selectionStart, selectionEnd, "- ");
  }

  const configurations: Record<Exclude<FormatCommand, "heading" | "list">, [string, string, string]> = {
    bold: ["**", "**", "粗体文本"],
    italic: ["*", "*", "斜体文本"],
    code: ["`", "`", "代码"],
    link: ["[", "](https://)", "链接文本"],
  };
  const [prefix, suffix, placeholder] = configurations[command];
  const selected = value.slice(selectionStart, selectionEnd);
  const inner = selected || placeholder;
  const replacement = `${prefix}${inner}${suffix}`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const nextSelectionStart = selectionStart + prefix.length;

  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionStart + inner.length,
  };
}

export function findMatches(content: string, query: string): SearchMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const normalizedContent = content.toLocaleLowerCase();
  const matches: SearchMatch[] = [];
  let offset = 0;
  while (offset <= normalizedContent.length - normalizedQuery.length) {
    const index = normalizedContent.indexOf(normalizedQuery, offset);
    if (index < 0) {
      break;
    }
    matches.push({ start: index, end: index + normalizedQuery.length });
    offset = index + Math.max(normalizedQuery.length, 1);
  }
  return matches;
}

export function getLineAndColumn(content: string, cursor: number): { line: number; column: number } {
  const safeCursor = Math.max(0, Math.min(cursor, content.length));
  const beforeCursor = content.slice(0, safeCursor);
  const lines = beforeCursor.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function toggleLinePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): TextTransform {
  const blockStart = value.lastIndexOf("\n", Math.max(selectionStart - 1, 0)) + 1;
  const trailingBreak = value.indexOf("\n", selectionEnd);
  const blockEnd = trailingBreak < 0 ? value.length : trailingBreak;
  const block = value.slice(blockStart, blockEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every((line) => line.startsWith(prefix) || line.length === 0);
  const transformed = lines
    .map((line) => {
      if (!line) {
        return line;
      }
      return allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
    })
    .join("\n");
  const delta = transformed.length - block.length;

  return {
    value: `${value.slice(0, blockStart)}${transformed}${value.slice(blockEnd)}`,
    selectionStart: blockStart,
    selectionEnd: Math.max(blockStart, blockEnd + delta),
  };
}
