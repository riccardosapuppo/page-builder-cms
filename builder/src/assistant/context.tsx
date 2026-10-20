// The Assistant as the interface knows it (./README.md): what it may see
// of the key (./key.ts: the provider and four characters, never the key),
// the models the key may use and the one chosen, the page being written,
// and what the requests since the key was kept used, priced at list price
// (./tally.ts): kept in memory like the key, and forgotten with it. One per
// editor, made by the shell (../editor/App.tsx) or a test, which gives the
// clock and, for a test, the providers.
import { createContext, useContext, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { Clock } from "../storage/clock.ts";
import { createKeyKeeper, type ForgetReason, type Held, type KeyKeeper, type ProviderId } from "./key.ts";
import { AssistantError, providerClient, type Answer, type ModelChoice, type ProviderClient, type Question, type Usage } from "./providers.ts";
import { addTallies, tallyOf, type Tally } from "./tally.ts";
import type { Writing } from "./write.ts";

// The page being written as the drawer shows it: a sample written by hand
// says so, a model's work names the model.
export type ShownWriting = Writing & { sample?: boolean; model?: string };

export interface AssistantState {
  held: Held | null;
  // Why the last key went, until another is kept.
  forgotten: ForgetReason | null;
  models: readonly ModelChoice[];
  model: string | null;
  connecting: boolean;
  // Why the last key given was not kept.
  problem: string | null;
  writing: ShownWriting | null;
  // The page being written can be stopped.
  running: AbortController | null;
  // Every request since the key was kept: its tokens and what they come to
  // at list price. Emptied when a key is kept and when it is forgotten.
  spent: Tally;
  // Checks the key with its provider (the models it may use) and keeps it
  // only then.
  connect(provider: ProviderId, key: string): Promise<boolean>;
  forget(): void;
  choose(model: string): void;
  // Asks the chosen model; the key is lent for the call and nothing else.
  // The question may take a moment to make (an image made smaller). What
  // the call used comes back priced (tally), and is added to `spent`; an
  // answer refused or cut short says it in its error's tally.
  ask(question: (model: string) => Question | Promise<Question>, written: (piece: string) => void, signal?: AbortSignal): Promise<Answer & { tally: Tally }>;
  setWriting(writing: ShownWriting | null): void;
  // A run starts, to be stopped with stop(); its end lets it go.
  begin(): AbortSignal;
  stop(): void;
  end(): void;
}

// watch(page): see KeyKeeper.watch; the editor calls it in an effect.
export type AssistantStore = StoreApi<AssistantState> & { watch(page: EventTarget): () => void };

export function createAssistant(clock: Clock, load: (id: ProviderId) => Promise<ProviderClient> = providerClient): AssistantStore {
  const keeper: KeyKeeper = createKeyKeeper(clock);
  const store = createStore<AssistantState>()((set, get) => ({
    held: null,
    forgotten: null,
    models: [],
    model: null,
    connecting: false,
    problem: null,
    writing: null,
    running: null,
    spent: [],
    async connect(provider, key) {
      const given = key.trim();
      if (given === "") {
        set({ problem: "Paste a key first." });
        return false;
      }
      set({ connecting: true, problem: null });
      try {
        const models = await (await load(provider)).models(given);
        if (models.length === 0) {
          set({ connecting: false, problem: "This key may use no model the Assistant can work with." });
          return false;
        }
        keeper.keep(provider, given);
        set({ connecting: false, models, model: models[0]!.id, forgotten: null });
        return true;
      } catch (error) {
        set({ connecting: false, problem: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },
    forget: () => keeper.forget("asked"),
    choose: (model) => set({ model }),
    async ask(question, written, signal) {
      const { model, held } = get();
      if (held === null || model === null) throw new AssistantError("Connect a model first.", "key");
      // The key this question is for: if another is kept while the
      // question is made, it is not lent to this provider.
      const ticket = keeper.ticket();
      const client = await load(held.provider);
      const asked = await question(model);
      if (keeper.ticket() !== ticket) throw new AssistantError("The key changed while the question was being made. Ask again.", "key");
      // What the call used, priced, and added to the key's total while that
      // key is still the one kept: a call answered after it went counts
      // toward no other key's.
      const counted = (usage: Usage): Tally => {
        const tally = tallyOf(held.provider, asked.model, usage);
        if (keeper.ticket() === ticket) set((state) => ({ spent: addTallies(state.spent, tally) }));
        return tally;
      };
      try {
        const answer = await keeper.lend((key) => client.ask(key, asked, written, signal), ticket);
        return { ...answer, tally: counted(answer.usage) };
      } catch (error) {
        if (error instanceof AssistantError && error.usage !== null) throw new AssistantError(error.message, error.kind, error.usage, counted(error.usage));
        throw error;
      }
    },
    setWriting: (writing) => set({ writing }),
    begin() {
      get().running?.abort();
      const running = new AbortController();
      set({ running });
      return running.signal;
    },
    stop: () => get().running?.abort(),
    end: () => set({ running: null }),
  }));
  keeper.subscribe((held, why) => {
    if (held === null) store.setState({ held: null, forgotten: why, models: [], model: null, spent: [] });
    else store.setState({ held, spent: [] });
  });
  return Object.assign(store, { watch: (page: EventTarget) => keeper.watch(page) });
}

const AssistantContext = createContext<AssistantStore | null>(null);

export function AssistantProvider({ value, children }: { value: AssistantStore; children: ReactNode }) {
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistantStore(): AssistantStore {
  const store = useContext(AssistantContext);
  if (!store) throw new Error("an Assistant component was drawn outside AssistantProvider");
  return store;
}

export function useAssistant<T>(selector: (state: AssistantState) => T): T {
  return useStore(useAssistantStore(), selector);
}
