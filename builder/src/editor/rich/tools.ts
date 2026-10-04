// What the rest of the editor knows of the canvas's text editor, without
// loading it: which text block is being edited and where its caret
// starts, the state and the commands its formatting buttons and link field
// use (drawn on the selection's floating bar, ../Canvas.tsx), and how to
// start editing. The editor itself, TipTap with ProseMirror, is a chunk of
// its own (./TextEditor.tsx), loaded the first time a text is edited, or
// as soon as one is selected; the page's static renderer draws every other
// text, and this one until the chunk has arrived.
//
// Once the chunk is here, a text opens in the same moment it is asked to:
// nothing waits, so React has no fallback to show and take back (which it
// does no sooner than 300 ms after showing it). Until then, the keys meant
// for the text are kept (`TextEditing.keys`, ../keys.ts) and typed into it
// once it opens, so a letter or a Backspace pressed in between is the
// text's, never the block's.
import { createElement, use } from "react";
import type { EditorEnv } from "../context.tsx";

// Where the caret goes when the editor opens: at a point of the window
// (the click that opened it), or at the end of the text (Enter, or the
// panel's button).
export type CaretAt = { x: number; y: number } | "end";

// A key pressed for the text before its editor was there.
export interface WaitingKey {
  key: string;
  shift: boolean;
}

export interface TextEditing {
  id: string;
  at: CaretAt;
  // The keys pressed for the text while its editor was on its way, in
  // order: typed into it when it opens.
  keys?: readonly WaitingKey[];
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

type EditorModule = typeof import("./TextEditor.tsx");
// The chunk's promise, marked fulfilled once it is, as React reads a
// promise it is given: use() then returns the module at once.
type Loading = Promise<EditorModule> & { status?: string; value?: EditorModule };
let loading: Loading | null = null;
const load = (): Loading => {
  if (loading) return loading;
  const started: Loading = import("./TextEditor.tsx");
  started.then((module) => {
    started.status = "fulfilled";
    started.value = module;
  }, () => {});
  loading = started;
  return started;
};

// Starts loading the editor's chunk, so a text selected opens at once.
export function preloadTextEditor(): void {
  void load();
}

// The editor in the text's place: at once when the chunk is here, else
// once it arrives (a Suspense around it draws the text meanwhile).
export function TextEditorHost(props: { blockId: string; label: string }) {
  const module = use(load() as Promise<EditorModule>);
  return createElement(module.default, props);
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

// A text asked to open whose editor is not there yet is asked no more once
// another block is chosen or a drag starts: the keys kept for it go with
// it, so they reach the block chosen now (../keys.ts) and are never typed
// into the text when it is chosen again, which then waits for Enter or a
// click like any text. An editor already open closes itself instead
// (./text-session.ts), and keeps a text the page refuses open. Returns
// the way to stop watching.
export function forgetLeftText(env: Pick<EditorEnv, "store" | "ui">): () => void {
  const { store, ui } = env;
  return store.subscribe((state) => {
    const { editingText, textTools } = ui.getState();
    if (editingText === null || textTools?.id === editingText.id) return;
    if (state.selection !== editingText.id || state.drag !== null) ui.setState({ editingText: null });
  });
}
