// What every part of the interface reaches: the editor store (the page,
// the selection, the history), the interface's own store (./ui-store.ts),
// the clock and the source of new block ids. Passed down once, by the
// shell or by a test, so a panel can be rendered on its own with a page
// and nothing else.
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Made } from "../document/commands.ts";
import type { CommandError } from "../document/check.ts";
import type { NewId } from "../document/ids.ts";
import type { EditorState, EditorStore, StoreOutcome } from "../store/editor-store.ts";
import type { Clock } from "../storage/clock.ts";
import type { UiState, UiStore } from "./ui-store.ts";

export interface EditorEnv {
  store: EditorStore;
  ui: UiStore;
  clock: Clock;
  newId: NewId;
}

const EditorContext = createContext<EditorEnv | null>(null);

export function EditorProvider({ env, children }: { env: EditorEnv; children: ReactNode }) {
  return <EditorContext.Provider value={env}>{children}</EditorContext.Provider>;
}

export function useEnv(): EditorEnv {
  const env = useContext(EditorContext);
  if (!env) throw new Error("an editor component was drawn outside EditorProvider");
  return env;
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEnv().store, selector);
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(useEnv().ui, selector);
}

// Applies a command a maker made, or gives back why there is none: the
// maker's refusal, or the store's (the schema, the rules, a full section).
export function runMade(store: EditorStore, made: Made): { ok: true; outcome: Extract<StoreOutcome, { ok: true }> } | { ok: false; error: CommandError } {
  if (!made.ok) return { ok: false, error: made.error };
  const outcome = store.getState().dispatch(made.command);
  return outcome.ok ? { ok: true, outcome } : { ok: false, error: outcome.error };
}

// runMade for a component: null when the command was applied, the refusal
// otherwise.
export function useRun(): (made: Made) => CommandError | null {
  const { store } = useEnv();
  return useCallback((made: Made) => {
    const result = runMade(store, made);
    return result.ok ? null : result.error;
  }, [store]);
}
