import DOMPurify from "dompurify";
import { marked } from "marked";
import type { OutlineItem } from "./types";

export function parseOutline(markdown: string): OutlineItem[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings: Array<{ text: string; level: number; line: number }> = [];
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence?.[1]) {
      const marker = fence[1];
      const character = marker[0] as "`" | "~";
      if (!fenceCharacter) {
        fenceCharacter = character;
        fenceLength = marker.length;
      } else if (character === fenceCharacter && marker.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter) {
      continue;
    }

    const atx = line.match(/^ {0,3}(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*$/);
    if (atx?.[1] && atx[2]) {
      const text = cleanHeadingText(atx[2]);
      if (text) {
        headings.push({ text, level: atx[1].length, line: index });
      }
      continue;
    }

    const nextLine = lines[index + 1] ?? "";
    const setext = nextLine.match(/^ {0,3}(=+|-+)[\t ]*$/);
    if (line.trim() && setext?.[1]) {
      const text = cleanHeadingText(line.trim());
      if (text) {
        headings.push({ text, level: setext[1][0] === "=" ? 1 : 2, line: index });
      }
      index += 1;
    }
  }

  const slugCounts = new Map<string, number>();
  return headings.map((heading, index) => {
    const baseSlug = slugify(heading.text) || `section-${index + 1}`;
    const occurrence = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, occurrence + 1);
    return {
      ...heading,
      id: occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence + 1}`,
    };
  });
}
export function renderMarkdown(markdown: string, outline: OutlineItem[]): string {
  const rawHtml = marked.parse(markdown, {
    async: false,
    breaks: false,
    gfm: true,
  });
  const sanitized = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: true,
  });
  const container = document.createElement("div");
  container.innerHTML = sanitized;

  let outlineCursor = 0;
  container.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6").forEach((heading, index) => {
    const text = heading.textContent?.trim() ?? "";
    const matchIndex = outline.findIndex(
      (item, itemIndex) => itemIndex >= outlineCursor && item.text === text,
    );
    if (matchIndex >= 0) {
      heading.id = outline[matchIndex]?.id ?? `section-${index + 1}`;
      outlineCursor = matchIndex + 1;
    } else {
      heading.id = `rendered-section-${index + 1}`;
    }
  });

  container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href) {
      anchor.dataset.href = href;
    }
    anchor.removeAttribute("href");
    anchor.classList.add("preview-link");
  });
  return container.innerHTML;
}

function cleanHeadingText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

function slugify(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}
