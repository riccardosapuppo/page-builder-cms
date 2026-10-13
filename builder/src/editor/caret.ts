// Where the caret goes when the focus is given back to an editor that is
// already open: a heading's line, a text's editor (./keys.ts, a key typed
// on the block; ./Clamp.tsx, Esc from the clamp).

// The editable element of a block's open editor: a heading's line, a
// text's editor.
export function editableIn(root: Element): HTMLElement | null {
  return root.querySelector<HTMLElement>("[contenteditable]:not([contenteditable='false'])");
}

// The focus into an editable element, the caret at the end of its last
// line (inside its last paragraph, past a line break the editor keeps).
export function caretAtEnd(editable: HTMLElement): void {
  editable.focus({ preventScroll: true });
  let end: Element = editable;
  while (end.lastElementChild && end.lastElementChild.tagName !== "BR") end = end.lastElementChild;
  const range = document.createRange();
  range.selectNodeContents(end);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
