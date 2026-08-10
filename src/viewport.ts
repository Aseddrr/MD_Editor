export interface ScrollViewport {
  scrollTop: number;
  scrollLeft: number;
}

export interface DocumentEditorViewport extends ScrollViewport {
  setSelectionRange(start: number, end: number): void;
}

export type ScrollResetScheduler = (callback: () => void) => void;

export function resetDocumentViewport(
  editor: DocumentEditorViewport,
  additionalViewports: readonly ScrollViewport[],
  scheduleAfterRender: ScrollResetScheduler,
): void {
  const viewports: readonly ScrollViewport[] = [editor, ...additionalViewports];
  const resetScrollPositions = (): void => {
    viewports.forEach((viewport) => {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    });
  };

  editor.setSelectionRange(0, 0);
  resetScrollPositions();
  scheduleAfterRender(resetScrollPositions);
}
