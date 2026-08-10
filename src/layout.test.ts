import { describe, expect, it } from "vitest";
import page from "../index.html?raw";
// Vitest runs in Node, while the application intentionally has no Node type dependency.
// @ts-expect-error Node's built-in file API is available in the test runtime.
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const compactStyles = styles.replace(/\s+/g, "");

function rules(selector: string): string[] {
  const compactSelector = selector.replace(/\s+/g, "");
  const marker = `${compactSelector}{`;
  const matches: string[] = [];
  let cursor = 0;
  while (cursor < compactStyles.length) {
    const start = compactStyles.indexOf(marker, cursor);
    if (start < 0) break;
    const bodyStart = compactStyles.indexOf("{", start) + 1;
    const end = compactStyles.indexOf("}", bodyStart);
    matches.push(compactStyles.slice(bodyStart, end));
    cursor = end + 1;
  }
  expect(matches.length, `missing CSS rule: ${selector}`).toBeGreaterThan(0);
  return matches;
}

function expectDeclarations(selector: string, declarations: string[]): void {
  const compactDeclarations = declarations.map((declaration) => declaration.replace(/\s+/g, ""));
  const matchingRule = rules(selector).find((body) =>
    compactDeclarations.every((declaration) => body.includes(declaration)),
  );
  expect(matchingRule, `no ${selector} rule contains ${declarations.join(", ")}`).toBeDefined();
}

describe("layout containment contract", () => {
  it("uses a compact directory heading without a folder subtitle", () => {
    expect(page).toContain('<span class="section-title">目录</span>');
    expect(page).not.toContain('id="folder-name"');
  });

  it("places the resizable outline above the directory", () => {
    const outline = page.indexOf('class="sidebar-section outline-section"');
    const resizer = page.indexOf('id="sidebar-resizer"');
    const directory = page.indexOf('class="sidebar-section file-section"');
    expect(outline).toBeGreaterThanOrEqual(0);
    expect(resizer).toBeGreaterThan(outline);
    expect(directory).toBeGreaterThan(resizer);
    expect(page).toContain('role="separator"');
  });

  it("keeps the application shell and intermediate grids inside the viewport", () => {
    expectDeclarations(".app-shell", ["height: 100%;", "min-height: 0;", "overflow: hidden;"]);
    expectDeclarations(".app-body", ["min-width: 0;", "min-height: 0;", "overflow: hidden;"]);
    expectDeclarations(".sidebar", ["min-height: 0;", "overflow: hidden;"]);
    expectDeclarations(".sidebar", [
      "--outline-size: 60%;",
      "grid-template-rows: var(--outline-size) 7px minmax(0, 1fr);",
    ]);
    expectDeclarations(".workspace", ["min-height: 0;", "overflow: hidden;"]);
    expectDeclarations(".pane", ["min-height: 0;", "overflow: hidden;"]);
  });

  it("assigns scrolling to the four content regions", () => {
    expectDeclarations(".file-tree,\n.outline", ["flex: 1 1 0;", "overflow: auto;"]);
    expectDeclarations("#editor", ["max-height: 100%;", "overflow: auto;"]);
    expectDeclarations(".markdown-body", ["max-height: 100%;", "overflow: auto;"]);
  });

  it("contains intrinsically wide Markdown content", () => {
    expectDeclarations(".markdown-body pre", ["max-width: 100%;", "overflow: auto;"]);
    expectDeclarations(".markdown-body .table-scroll", [
      "width: 100%;",
      "max-width: 100%;",
      "overflow-x: auto;",
    ]);
    expectDeclarations(".markdown-body table", ["width: max-content;", "min-width: 100%;"]);
  });
});
