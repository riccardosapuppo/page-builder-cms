// The editor's state: a vanilla zustand store around the pure reducer of
// ../document. The document changes only by commands, so every change has
// its inverse and lands in the history; undo applies the inverse of the
// last command, redo applies the very same command again (same ids, same
// media), and a new command clears what could be redone.
//
// Why a reducer inside zustand rather than either alone: the reducer keeps
// every rule of the document pure and testable without React; zustand gives
// the React side selectors that re-render only what changed, and gives the
// autosave (../storage) a plain subscribe/getState without reaching into
// React at all.
//
// Besides the document it holds what the interface needs to agree on: the
// selection, the device being edited, where the focus goes after a command,
// the drag in progress (its preview is a separate tree; the document is
// untouched until the drop), and the last refusal, so the interface can
// say why nothing happened. Time is injected: `now` is the only clock.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Device, PageDocument } from "../shared/document.ts";
import type { CommandError } from "../document/check.ts";
import { invertCommand, type Command } from "../document/commands.ts";
import { cancelDrag, dragOver, drop, startDrag, type DragSession, type DragSource, type DropTarget } from "../document/drag.ts";
import { applyCommand, type Focus } from "../document/reducer.ts";
import { hasBlock } from "../document/tree.ts";

export interface HistoryEntry {
  command: Command;
  // When it was applied (or applied again by a redo), from `now`.
  at: number;
}

// What a command, an undo, a redo or a drop came to: where the focus went,
// or why nothing happened. Not the storage adapter's Outcome, which is a
// server's answer.
export type StoreOutcome = { ok: true; focus: Focus | null } | { ok: false; error: CommandError };

export interface EditorState {
  document: PageDocument;
  // Applied commands, the most recent last.
  past: readonly HistoryEntry[];
  // Undone commands, the next to redo last.
  future: readonly HistoryEntry[];
  focus: Focus | null;
  selection: string | null;
  device: Device;
  drag: DragSession | null;
  error: CommandError | null;

  dispatch(command: Command): StoreOutcome;
  undo(): StoreOutcome;
  redo(): StoreOutcome;
  // A page read from storage, already upgraded and checked
  // (../document/upgrade.ts, openDocument): the history starts again.
  load(document: PageDocument): void;
  select(id: string | null): void;
  setDevice(device: Device): void;
  startDrag(source: DragSource): StoreOutcome;
  dragOver(target: DropTarget | null): void;
  drop(): StoreOutcome;
  cancelDrag(): void;
}

export interface EditorStoreOptions {
  document: PageDocument;
  now: () => number;
  // How many commands undo can reach back; the oldest go first.
  historyLimit?: number;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export type EditorStore = StoreApi<EditorState>;

export function createEditorStore({ document, now, historyLimit = DEFAULT_HISTORY_LIMIT }: EditorStoreOptions): EditorStore {
  const nothing = (message: string): StoreOutcome => ({ ok: false, error: { reason: "nothing", message } });

  return createStore<EditorState>()((set, get) => {
    const refused = (error: CommandError): StoreOutcome => {
      set({ error });
      return { ok: false, error };
    };
    // The page after a command, with the focus and selection it leaves.
    const settle = (next: PageDocument, focus: Focus | null, past: readonly HistoryEntry[], future: readonly HistoryEntry[]): StoreOutcome => {
      const selection = focus?.id ?? null;
      set({ document: next, focus, selection, past, future, error: null, drag: null });
      return { ok: true, focus };
    };
    const record = (command: Command): readonly HistoryEntry[] => [...get().past, { command, at: now() }].slice(-historyLimit);

    return {
      document,
      past: [],
      future: [],
      focus: null,
      selection: null,
      device: "base",
      drag: null,
      error: null,

      dispatch(command) {
        const applied = applyCommand(get().document, command);
        if (!applied.ok) return refused(applied.error);
        return settle(applied.document, applied.focus, record(command), []);
      },

      undo() {
        const { past, future } = get();
        const entry = past.at(-1);
        if (!entry) return nothing("There is nothing to undo.");
        const applied = applyCommand(get().document, invertCommand(entry.command));
        if (!applied.ok) return refused(applied.error);
        return settle(applied.document, applied.focus, past.slice(0, -1), [...future, entry]);
      },

      redo() {
        const { past, future } = get();
        const entry = future.at(-1);
        if (!entry) return nothing("There is nothing to redo.");
        const applied = applyCommand(get().document, entry.command);
        if (!applied.ok) return refused(applied.error);
        return settle(applied.document, applied.focus, [...past, { command: entry.command, at: now() }].slice(-historyLimit), future.slice(0, -1));
      },

      load(next) {
        set({ document: next, past: [], future: [], focus: null, selection: null, drag: null, error: null });
      },

      select(id) {
        set({ selection: id !== null && hasBlock(get().document, id) ? id : null });
      },

      setDevice(device) {
        set({ device });
      },

      startDrag(source) {
        const started = startDrag(get().document, source);
        if (!started.ok) return refused(started.error);
        set({ drag: started.session, error: null });
        return { ok: true, focus: get().focus };
      },

      dragOver(target) {
        const session = get().drag;
        if (session) set({ drag: dragOver(session, target) });
      },

      drop() {
        const session = get().drag;
        if (!session) return nothing("Nothing is being dragged.");
        const dropped = drop(session);
        if (!dropped.ok) {
          set({ drag: null });
          return refused(dropped.error);
        }
        if (dropped.command === null) {
          set({ drag: null, focus: dropped.focus, selection: dropped.focus?.id ?? null });
          return { ok: true, focus: dropped.focus };
        }
        // The drop was planned on the page as the drag found it. If the page
        // changed meanwhile (a reload after a conflict), the command is
        // applied to the page as it is now, and refused if it no longer fits.
        if (session.base !== get().document) {
          set({ drag: null });
          return get().dispatch(dropped.command);
        }
        return settle(dropped.document, dropped.focus, record(dropped.command), []);
      },

      cancelDrag() {
        const session = get().drag;
        if (session) cancelDrag(session);
        set({ drag: null });
      },
    };
  });
}
