// The editor's one keydown listener, made from the keymap (./keymap.ts):
// for each key press it finds the entries the keymap carries, keeps those
// whose scope the focus is in, and runs the first. While the person types
// (a field, a text on the canvas) only the entries marked `typing` are
// looked for, so Delete and Ctrl+D are the text's, never the block's. The
// drag library's keyboard sensor carries the moving keys
// (./drag/DragLayer.tsx), and the browser the keys of a button; while a
// block is picked up, the sensor has the keyboard to itself.
//
// Copy and paste go through the browser's copy and paste events, which
// Ctrl+C and Ctrl+V raise wherever the focus is: they carry the system
// clipboard both ways without asking the person for a permission.
import { useEffect, useLayoutEffect, useRef } from "react";
import { makeDelete, makeDuplicate } from "../document/commands.ts";
import { locate } from "../document/tree.ts";
import { afterRender, runCommand, runRedo, runUndo, focusBlock, placeFocus, regionOf, type Region } from "./act.ts";
import { copySelection, pasteText } from "./clipboard.ts";
import { useEnv, type EditorEnv } from "./context.tsx";
import { openDrawer, toggleDrawer } from "./Drawer.tsx";
import { placeForKey } from "./insert-place.ts";
import { openInserter } from "./InsertPicker.tsx";
import { entriesFor, type KeyAction, type Scope } from "./keymap.ts";
import { firstChildOf, parentOf, stepSelection } from "./selection.ts";
import { useOptionalSession, type Session } from "./session.tsx";
import { publishPaused } from "./Publish.tsx";
import { startEditing } from "./rich/tools.ts";
import type { Preview } from "./ui-store.ts";

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

// Whether the focus is in something the person types into: a field, or a
// text written on the canvas.
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null;
}

// Whether the focus is where an entry's scope says. Text fields and the
// text written on the canvas keep their keys (Ctrl+Z undoes typing there,
// Delete deletes a letter), but for the entries that work while typing;
// menus and dialogs keep theirs.
export function inScope(scope: Scope, target: EventTarget | null, typing = false): boolean {
  const element = target instanceof Element ? target : null;
  if (element?.closest("[role=dialog], [role=menu]")) return false;
  // A modal dialog open: the editor behind it takes no key, wherever the
  // focus is (lost to the page, say, when a field it was in went).
  if (document.querySelector("[role=dialog][aria-modal=true]")) return false;
  if (!typing && isTyping(element)) return false;
  switch (scope) {
    // The clamp is a toolbar of its own on the canvas: its keys are its
    // buttons' (Enter presses one), its arrows go along it.
    case "canvas":
      return Boolean(element?.closest(".canvas")) && !element?.closest(".clamp");
    case "selection":
      return Boolean(element?.closest(".canvas, .tree"));
    case "editor":
      return element === null || element === document.body || Boolean(element.closest(".app"));
    default:
      return false;
  }
}

// A key that writes in a text: a character, or Backspace, Delete, Enter
// and Tab, with no Ctrl, Cmd or Alt (AltGr types a character).
function writes(event: KeyboardEvent): boolean {
  const altGraph = event.getModifierState?.("AltGraph") ?? false;
  if (event.ctrlKey && !altGraph) return false;
  if (event.metaKey || (event.altKey && !altGraph)) return false;
  return [...event.key].length === 1 || ["Backspace", "Delete", "Enter", "Tab"].includes(event.key);
}

export const MODIFIERS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"]);

// A text asked to open whose editor is not there yet, its code on its way
// (./rich/tools.ts): the keys meant for it are kept for it, and none
// reaches the block, which still has the focus, where a Backspace would
// delete the block and a Space pick it up. Esc gives up opening it, and so
// does choosing another block (./rich/tools.ts, forgetLeftText); the keys
// that work while typing (keep a version, preview, publish) still do.
// True when the key was taken here.
export function waitForText(env: Pick<EditorEnv, "ui">, event: KeyboardEvent): boolean {
  const { editingText, textTools } = env.ui.getState();
  if (!editingText || textTools?.id === editingText.id || event.isComposing || MODIFIERS.has(event.key)) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target !== null && target !== document.body && !target.closest(".canvas")) return false;
  if (isTyping(target) || target?.closest("[role=dialog], [role=menu]")) return false;
  const press = { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, altGraph: event.getModifierState?.("AltGraph") ?? false };
  if (entriesFor(press, true).some((entry) => entry.via === "keymap")) return false;
  if (event.key === "Escape") env.ui.setState({ editingText: null });
  else if (writes(event)) env.ui.setState({ editingText: { ...editingText, keys: [...(editingText.keys ?? []), { key: event.key, shift: event.shiftKey }] } });
  event.preventDefault();
  event.stopPropagation();
  return true;
}

// A character typed on a selected text or heading, the focus on the block
// itself, starts the writing there, the caret at the end and the character
// first in: rather than the key doing nothing, and a Space after it picking
// the block up, which looks as if the page had locked. A Space alone still
// picks the block up, and the keymap's own keys (?, + and the rest) stay
// the keymap's. True when the key was taken here.
export function writeInto(env: Pick<EditorEnv, "store" | "ui">, event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || env.store.getState().drag !== null) return false;
  const id = env.store.getState().selection;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (id === null || target === null || target.dataset.blockId !== id) return false;
  if (target.dataset.blockType !== "text" && target.dataset.blockType !== "heading") return false;
  if (event.key === " " || [...event.key].length !== 1 || !writes(event)) return false;
  const press = { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, altGraph: event.getModifierState?.("AltGraph") ?? false };
  if (entriesFor(press).length > 0) return false;
  startEditing(env, id, "end");
  env.ui.setState({ editingText: { id, at: "end", keys: [{ key: event.key, shift: event.shiftKey }] } });
  event.preventDefault();
  return true;
}

type Handler = (region: Region) => boolean;

// The page session as it is when the key is pressed: it changes as pages
// open and saves land, the listener does not.
function handlers(env: EditorEnv, session: () => Session | null): Partial<Record<KeyAction, Handler>> {
  const { store, ui, newId } = env;
  const select = (id: string | null) => {
    if (id === null) return false;
    store.getState().select(id);
    ui.setState({ tray: "edit", notice: null });
    focusBlock(id);
    return true;
  };
  const selected = () => store.getState().selection;
  // The bottom line's device, the focus staying where it is.
  const device = (preview: Preview) => {
    ui.getState().setPreview(preview);
    return true;
  };
  const command = (make: (id: string) => Parameters<typeof runCommand>[1], region: Region) => {
    const id = selected();
    if (id === null) {
      ui.getState().say("Select a block first.");
      return true;
    }
    runCommand(env, make(id), region);
    return true;
  };
  return {
    selectNext: () => select(stepSelection(store.getState().document, selected(), 1)),
    selectPrevious: () => select(stepSelection(store.getState().document, selected(), -1)),
    selectParent: () => {
      const id = selected();
      return id !== null && select(parentOf(store.getState().document, id));
    },
    selectFirstChild: () => {
      const id = selected();
      return id !== null && select(firstChildOf(store.getState().document, id));
    },
    clearSelection: () => {
      if (selected() === null) return false;
      store.getState().select(null);
      placeFocus(null, "canvas");
      return true;
    },
    duplicate: (region) => command((id) => (doc) => makeDuplicate(doc, id, newId), region),
    delete: (region) => command((id) => (doc) => makeDelete(doc, id), region),
    // A text's and a heading's words are written on the canvas: the
    // editor opens, the caret at the end. Another widget's words are in its
    // panel: the sidebar's Block tab, its own group opened, and that group's
    // first field. A divider, a spacer, a section or a column has no words
    // to edit.
    editText: () => {
      const id = selected();
      const block = id === null ? undefined : locate(store.getState().document, id)?.block;
      if (!block || id === null) return false;
      if (block.type === "text" || block.type === "heading") {
        startEditing(env, id, "end");
        return true;
      }
      if (["section", "column", "divider", "spacer"].includes(block.type)) return false;
      // The sidebar shown if it was hidden, on the Block tab.
      ui.setState({ tray: "edit", sideTab: null, sidebarOpen: true });
      ui.getState().setGroupOpen(block.type, "content", true);
      afterRender(() => document.querySelector<HTMLElement>(".sidebar [role=tabpanel] [data-group=content] :is(input:not([type=hidden]), textarea)")?.focus());
      return true;
    },
    undo: (region) => {
      runUndo(env, region === "panel" ? "canvas" : region);
      return true;
    },
    redo: (region) => {
      runRedo(env, region === "panel" ? "canvas" : region);
      return true;
    },
    // The history's drawer, open on "Save version" with its name field,
    // which takes the focus (./HistoryPanel.tsx).
    saveVersion: () => {
      if (!session()?.current) return false;
      openDrawer(env, "history");
      ui.getState().setNamingVersion(true);
      // Already open, the field takes the focus back.
      setTimeout(() => document.querySelector<HTMLElement>(".ver-form input")?.focus(), 0);
      return true;
    },
    preview: () => {
      const now = session();
      if (!now?.current) return false;
      now.preview();
      return true;
    },
    publish: () => {
      const now = session();
      if (!now?.current || !now.capabilities.publish) return false;
      // The same pause the button shows, said instead of done: a header or
      // footer may be published empty, which takes it off every page.
      const why = publishPaused(now.autosave?.getSnapshot() ?? null, store.getState().document.sections.length, now.current.kind !== "page");
      if (why) ui.getState().say(why);
      else if (!now.publishing) void now.publish();
      return true;
    },
    // The page's "+": the picker after the selection (./InsertPicker.tsx);
    // on an empty page, the invitation's first section, which the page
    // lays out already.
    addHere: () => {
      const doc = store.getState().document;
      if (doc.sections.length === 0) {
        document.querySelector<HTMLElement>(".canvas .invite-layouts button")?.focus();
        return true;
      }
      const place = placeForKey(doc, selected());
      if (!place) return false;
      openInserter(env, place, document.activeElement);
      return true;
    },
    // The drawers open and close as their top bar keys do (./Drawer.tsx).
    openInsert: () => {
      toggleDrawer(env, "insert");
      return true;
    },
    openOutline: () => {
      toggleDrawer(env, "outline");
      return true;
    },
    deviceDesktop: () => device("desktop"),
    deviceTablet: () => device("tablet"),
    devicePhone: () => device("phone"),
    showShortcuts: () => {
      ui.getState().setShortcutsOpen(true);
      return true;
    },
  };
}

// Mounted once, by the shell (EditorKeys).
export function useEditorKeys(): void {
  const env = useEnv();
  const session = useOptionalSession();
  const latest = useRef(session);
  useLayoutEffect(() => {
    latest.current = session;
  });
  useEffect(() => {
    const table = handlers(env, () => latest.current);
    const handle = (event: KeyboardEvent, typing: boolean) => {
      if (event.defaultPrevented || event.isComposing) return;
      // A block picked up with the keyboard: the drag library's keys.
      if (env.store.getState().drag !== null) return;
      const press = { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, altGraph: event.getModifierState?.("AltGraph") ?? false };
      for (const entry of entriesFor(press, typing)) {
        if (entry.via !== "keymap" || !inScope(entry.scope, event.target, typing)) continue;
        const run = table[entry.action];
        if (run?.(regionOf(event.target))) {
          event.preventDefault();
          return;
        }
      }
    };
    // Typing, the keys are looked for on their way down to the text: the
    // text editor cancels every Enter and Esc for itself (ProseMirror does),
    // so Ctrl+Shift+Enter would never come back up to publish. Cancelled
    // here, the text editor leaves the press alone.
    const onTypingKeyDown = (event: KeyboardEvent) => {
      if (waitForText(env, event)) return;
      if (isTyping(event.target)) handle(event, true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || writeInto(env, event)) return;
      handle(event, false);
    };
    const onCopy = (event: ClipboardEvent) => {
      if (!inScope("selection", document.activeElement) || env.store.getState().selection === null) return;
      const text = copySelection(env);
      if (text === null || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!inScope("selection", document.activeElement)) return;
      const text = event.clipboardData?.getData("text/plain") || env.ui.getState().copied;
      event.preventDefault();
      if (!text) {
        env.ui.getState().say("Nothing has been copied yet: copy a block first.");
        return;
      }
      pasteText(env, text, regionOf(document.activeElement), latest.current?.current?.kind ?? "page");
    };
    document.addEventListener("keydown", onTypingKeyDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onTypingKeyDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [env]);
}

// The listener as a component, inside the provider it reads the editor
// through.
export function EditorKeys(): null {
  useEditorKeys();
  return null;
}
