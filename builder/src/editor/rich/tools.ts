// What the rest of the editor knows of the canvas's text editor, without
// loading it: which text block is being edited and where its caret
// starts, the state and the commands its formatting buttons and link field
// use (drawn on the selection's floating bar, ../Canvas.tsx), and how to
// start editing. The editor itself, TipTap with ProseMirror, is a chunk of
// its own (./TextEditor.tsx), loaded the first time a text is edited, or
// as soon as one is selected; the page's static renderer draws every other
// text, and this one until the chunk has arrived.
import { lazy } from "react";
import type { EditorEnv } from "../context.tsx";

// Where the caret goes when the editor opens: at a point of the window
// (the click that opened it), or at the end of the text (Enter, or the
// panel's button).
export type CaretAt = { x: number; y: number } | "end";

export interface TextEditing {
  id: string;
  at: CaretAt;
}

export interface TextCommands {
  toggleBold(): void;
  toggleItalic(): void;
  openLink(): void;
  // Closes the link field, the focus back in the text or left where it is.
  closeLink(focusText: boolean): void;
  // Links the selection (or, with nothing selected, writes the address
  // itself as a link); null when done, else why the address is refused.
  applyLink(href: string): string | null;
  removeLink(): void;
}

// The text editor's state at its selection, for the buttons that show it.
export interface TextTools {
  id: string;
  bold: boolean;
  italic: boolean;
  // The href of the link at the selection, if it is in one.
  link: string | null;
  linkOpen: boolean;
  run: TextCommands;
}

const load = () => import("./TextEditor.tsx");

export const LazyTextEditor = lazy(load);

// Starts loading the editor's chunk, so a text selected opens at once.
export function preloadTextEditor(): void {
  void load();
}

// Edits a text block on the canvas: it is selected, and the editor opens
// in it with the caret where it is asked. A block already being edited
// keeps its editor and its caret.
export function startEditing(env: Pick<EditorEnv, "store" | "ui">, id: string, at: CaretAt): void {
  const { store, ui } = env;
  if (store.getState().drag !== null) return;
  if (store.getState().selection !== id) store.getState().select(id);
  if (ui.getState().editingText?.id === id) return;
  ui.setState({ editingText: { id, at }, tray: "edit", notice: null });
}
