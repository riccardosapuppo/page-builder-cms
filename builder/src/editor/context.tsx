// What every part of the interface reaches: the editor store (the page,
// the selection, the history), the interface's own store (./ui-store.ts),
// the clock and the source of new block ids. Passed down once, by the
// shell or by a test, so a panel can be rendered on its own with a page
// and nothing else.
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Made } from "../document/commands.ts";
import { refusal, type CommandError } from "../document/check.ts";
import type { NewId } from "../document/ids.ts";
import type { EditorState, EditorStore, StoreOutcome } from "../store/editor-store.ts";
import type { Clock } from "../storage/clock.ts";
import type { UiState, UiStore } from "./ui-store.ts";
import { STILL_HELD } from "./pending.ts";

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
// The text still waiting in another field goes first (./pending.ts); a
// command made a moment before it stays good, since its steps check what
// they change (../document/ops.ts) and text changes only its own key.
export function runMade(env: { store: EditorStore; ui: UiStore }, made: Made): { ok: true; outcome: Extract<StoreOutcome, { ok: true }> } | { ok: false; error: CommandError } {
  if (!made.ok) return { ok: false, error: made.error };
  // A text the page refused stays where it is written, and the command
  // waits (./act.ts, handOver).
  if (!env.ui.getState().pending.deliver()) return { ok: false, error: refusal("invalid", env.ui.getState().notice ?? STILL_HELD) };
  const outcome = env.store.getState().dispatch(made.command);
  return outcome.ok ? { ok: true, outcome } : { ok: false, error: outcome.error };
}

// runMade for a component: null when the command was applied, the refusal
// otherwise.
export function useRun(): (made: Made) => CommandError | null {
  const { store, ui } = useEnv();
  return useCallback((made: Made) => {
    const result = runMade({ store, ui }, made);
    return result.ok ? null : result.error;
  }, [store, ui]);
}
