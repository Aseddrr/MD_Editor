import { describe, expect, it, vi } from "vitest";
import { resetDocumentViewport, type DocumentEditorViewport, type ScrollViewport } from "./viewport";

describe("resetDocumentViewport", () => {
  it("resets the caret and all scroll positions immediately and after rendering", () => {
    const editor: DocumentEditorViewport = {
      scrollTop: 900,
      scrollLeft: 80,
      setSelectionRange: vi.fn(),
    };
    const preview: ScrollViewport = { scrollTop: 700, scrollLeft: 60 };
    const outline: ScrollViewport = { scrollTop: 500, scrollLeft: 40 };
    let afterRender: (() => void) | undefined;

    resetDocumentViewport(editor, [preview, outline], (callback) => {
      afterRender = callback;
    });

    expect(editor.setSelectionRange).toHaveBeenCalledWith(0, 0);
    expect([editor, preview, outline]).toEqual([
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
    ]);

    editor.scrollTop = 300;
    editor.scrollLeft = 30;
    preview.scrollTop = 200;
    preview.scrollLeft = 20;
    outline.scrollTop = 100;
    outline.scrollLeft = 10;
    expect(afterRender).toBeTypeOf("function");
    afterRender?.();

    expect([editor, preview, outline]).toEqual([
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
      expect.objectContaining({ scrollTop: 0, scrollLeft: 0 }),
    ]);
  });
});
