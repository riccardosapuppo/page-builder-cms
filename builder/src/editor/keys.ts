// The editor's one keydown listener, made from the keymap (./keymap.ts):
// for each key press it finds the entries the keymap carries, keeps those
// whose scope the focus is in, and runs the first. The drag library's
// keyboard sensor carries the moving keys (./drag/DragLayer.tsx), and the
// browser the keys of a button; while a block is picked up, the sensor has
// the keyboard to itself.
//
// Copy and paste go through the browser's copy and paste events, which
// Ctrl+C and Ctrl+V raise wherever the focus is: they carry the system
// clipboard both ways without asking the person for a permission.
import { useEffect, useLayoutEffect, useRef } from "react";
import { makeDelete, makeDuplicate } from "../document/commands.ts";
import { runCommand, runRedo, runUndo, focusBlock, placeFocus, regionOf, type Region } from "./act.ts";
import { copySelection, pasteText } from "./clipboard.ts";
import { useEnv, type EditorEnv } from "./context.tsx";
import { entriesFor, type KeyAction, type Scope } from "./keymap.ts";
import { firstChildOf, parentOf, stepSelection } from "./selection.ts";
import { useOptionalSession, type Session } from "./session.tsx";
import { publishPaused } from "./Publish.tsx";

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

// Whether the focus is where an entry's scope says. Text fields keep their
// keys (Ctrl+Z undoes typing there, Delete deletes a letter), and so do
// menus and dialogs.
export function inScope(scope: Scope, target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (element?.closest(EDITABLE) || element?.closest("[role=dialog], [role=menu]")) return false;
  switch (scope) {
    case "canvas":
      return Boolean(element?.closest(".canvas"));
    case "selection":
      return Boolean(element?.closest(".canvas, .tree"));
    case "editor":
      return element === null || element === document.body || Boolean(element.closest(".app"));
    default:
      return false;
  }
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
    undo: (region) => {
      runUndo(env, region === "panel" ? "canvas" : region);
      return true;
    },
    redo: (region) => {
      runRedo(env, region === "panel" ? "canvas" : region);
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
      // The same pause the button shows, said instead of done.
      const why = publishPaused(now.autosave?.getSnapshot() ?? null, store.getState().document.sections.length);
      if (why) ui.getState().say(why);
      else if (!now.publishing) void now.publish();
      return true;
    },
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      // A block picked up with the keyboard: the drag library's keys.
      if (env.store.getState().drag !== null) return;
      for (const entry of entriesFor(event)) {
        if (entry.via !== "keymap" || !inScope(entry.scope, event.target)) continue;
        const run = table[entry.action];
        if (run?.(regionOf(event.target))) {
          event.preventDefault();
          return;
        }
      }
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
      pasteText(env, text, regionOf(document.activeElement));
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
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
