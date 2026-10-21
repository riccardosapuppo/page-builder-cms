// The Assistant as the interface knows it (./README.md): what it may see
// of the key (./key.ts: the provider and four characters, never the key),
// the models the key may use and the one chosen, the image model its
// photos are made with (OpenAI's), the page or the new site being written
// (./site.ts; the style a new site replaced kept with it, in memory), and
// what the requests since the key was kept used, priced at list price
// (./tally.ts): kept in memory like the key, and forgotten with it. A
// page's run, or a site's, is bound to the key it began with (Bound): its
// requests go with that key alone, and stop once it is forgotten or
// replaced. What the run being written has cost so far is kept too, live
// (./live.ts): its requests that ended as the provider counted them, and
// an estimate for each one in flight, told at most every LIVE_MS while
// answers stream in; runCost reads it for the run shown. One per editor,
// made by the shell (../editor/App.tsx) or a test, which gives the clock
// and, for a test, the providers.
import { createContext, useContext, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { Clock } from "../storage/clock.ts";
import { createKeyKeeper, type ForgetReason, type Held, type KeyKeeper, type ProviderId } from "./key.ts";
import { createLiveBook, photoPrice, questionChars, type RunCost } from "./live.ts";
import type { ImageQuality, ImageSize } from "./prices.ts";
import { AssistantError, providerClient, type Answer, type ModelChoice, type PhotoAnswer, type ProviderClient, type Question, type Usage } from "./providers.ts";
import type { SiteWriting } from "./site.ts";
import { addTallies, photoTallyOf, tallyOf, type Tally, type TallyKind } from "./tally.ts";
import type { Writing } from "./write.ts";

// The page being written as the drawer shows it: a sample written by hand
// says so, a model's work names the model and its run (Bound.run), whose
// cost is kept live.
export type ShownWriting = Writing & { sample?: boolean; model?: string; run?: number };

// A new site being written as the drawer shows it (./site.ts), naming the
// model; and what became of the person's choices once it is over: the home
// page made, the pages published, the old style put back, and the last of
// them said.
export interface SiteOutcome {
  home: boolean;
  published: boolean;
  styleBack: boolean;
  said: string | null;
}
export type ShownSite = SiteWriting & { model?: string; outcome?: SiteOutcome; run?: number };

// A run's key, bound when the run begins (bind): its provider, the
// keeper's ticket for it, the model chosen and the image model. A request
// made with it (ask, photo) is lent that key alone: once the key is
// forgotten or replaced, `gone` aborts, and every request made with it is
// refused, never sent with another key, nor counted toward another key's
// total. `run` names the run, whose cost is kept live while its requests
// are answered (AssistantState.live).
export interface Bound {
  provider: ProviderId;
  ticket: number;
  model: string;
  imageModel: string | null;
  gone: AbortSignal;
  run: number;
}

// What a request made with a key no longer kept is told.
export const KEY_GONE = "The key this was begun with is no longer kept: nothing more is asked with it.";

export interface AssistantState {
  held: Held | null;
  // Why the last key went, until another is kept.
  forgotten: ForgetReason | null;
  models: readonly ModelChoice[];
  model: string | null;
  // The image model the key's photos are made with: the newest GPT Image
  // model an OpenAI key may use; null for a key that makes none.
  imageModel: string | null;
  connecting: boolean;
  // Why the last key given was not kept.
  problem: string | null;
  writing: ShownWriting | null;
  // The new site being written, or the last one written, until cleared:
  // with it, in memory, the style it replaced (SiteWriting.before).
  site: ShownSite | null;
  // The page or the site being written can be stopped.
  running: AbortController | null;
  // Every request since the key was kept: its tokens and what they come to
  // at list price, as the provider counted them, never an estimate.
  // Emptied when a key is kept and when it is forgotten.
  spent: Tally;
  // What the run bound last has cost so far (./live.ts): its requests that
  // ended, as the provider counted them, and those in flight, each with its
  // estimate; told at most every LIVE_MS while answers stream in. Null
  // before any run is bound.
  live: RunCost | null;
  // Checks the key with its provider (the models it may use) and keeps it
  // only then.
  connect(provider: ProviderId, key: string): Promise<boolean>;
  forget(): void;
  choose(model: string): void;
  // The key kept now, with its models, bound for a run; null with none.
  // The run's cost starts at nothing (`live`).
  bind(): Bound | null;
  // Asks the chosen model, or a run's own (`bound`); the key is lent for
  // the call and nothing else. The question may take a moment to make (an
  // image made smaller). What the call used comes back priced (tally), and
  // is added to `spent` while its key is the one kept; an answer refused
  // or cut short says it in its error's tally. An illustration drawn for a
  // page is counted as one (`kind`). A run's call is in its live cost while
  // it is answered, estimated, then as counted.
  ask(question: (model: string) => Question | Promise<Question>, written: (piece: string) => void, signal?: AbortSignal, kind?: TallyKind, bound?: Bound): Promise<Answer & { tally: Tally }>;
  // Makes one photo with the key's image model, or a run's own (`bound`),
  // the key lent for the call; what it used comes back priced, and is
  // added to `spent` while its key is the one kept. A run's photo is in
  // its live cost at its price per image while it is made.
  photo(ask: { prompt: string; size: ImageSize; quality: ImageQuality }, signal?: AbortSignal, bound?: Bound): Promise<PhotoAnswer & { tally: Tally }>;
  setWriting(writing: ShownWriting | null): void;
  setSite(site: ShownSite | null): void;
  // A run starts, to be stopped with stop(); its end lets it go.
  begin(): AbortSignal;
  stop(): void;
  end(): void;
}

// watch(page): see KeyKeeper.watch; the editor calls it in an effect.
export type AssistantStore = StoreApi<AssistantState> & { watch(page: EventTarget): () => void };

// The cost of the run being shown, a page's or a new site's, as it grows:
// its requests that ended, as the provider counted them, and the estimates
// of those in flight (./live.ts, RunCost). Null for the sample, which asks
// no model, for a run whose cost is no longer kept (another was bound
// since), and with nothing shown. The same object until the cost changes,
// so a component may select it as it is.
export function runCost(state: Pick<AssistantState, "live" | "writing" | "site">): RunCost | null {
  const run = (state.site ?? state.writing)?.run;
  return run !== undefined && state.live?.run === run ? state.live : null;
}

export function createAssistant(clock: Clock, load: (id: ProviderId) => Promise<ProviderClient> = providerClient): AssistantStore {
  const keeper: KeyKeeper = createKeyKeeper(clock);
  // The runs bound to the key kept: each told when it goes.
  const bindings = new Set<AbortController>();
  // The cost of the run bound last, as its requests are answered.
  let runs = 0;
  const book = createLiveBook(clock, (live) => store.setState({ live }));
  const store = createStore<AssistantState>()((set, get) => ({
    held: null,
    forgotten: null,
    models: [],
    model: null,
    imageModel: null,
    connecting: false,
    problem: null,
    writing: null,
    site: null,
    running: null,
    spent: [],
    live: null,
    async connect(provider, key) {
      const given = key.trim();
      if (given === "") {
        set({ problem: "Paste a key first." });
        return false;
      }
      set({ connecting: true, problem: null });
      try {
        const client = await load(provider);
        const models = await client.models(given);
        if (models.length === 0) {
          set({ connecting: false, problem: "This key may use no model the Assistant can work with." });
          return false;
        }
        // Its photos' model, where the provider makes them: a listing that
        // fails leaves the key with none, and the page written without photos.
        const imageModel = client.photos ? await client.photos.model(given).catch(() => null) : null;
        keeper.keep(provider, given);
        set({ connecting: false, models, model: models[0]!.id, imageModel, forgotten: null });
        return true;
      } catch (error) {
        set({ connecting: false, problem: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },
    forget: () => keeper.forget("asked"),
    choose: (model) => set({ model }),
    bind() {
      const { held, model, imageModel } = get();
      if (held === null || model === null) return null;
      const going = new AbortController();
      bindings.add(going);
      runs += 1;
      book.begin(runs);
      return { provider: held.provider, ticket: keeper.ticket(), model, imageModel, gone: going.signal, run: runs };
    },
    async ask(question, written, signal, kind = "words", bound) {
      const { model, held } = get();
      // The key this question is for: the run's, or the one kept now. If
      // another is kept while the question is made, it is not lent to
      // this provider.
      const using = bound ?? (held === null || model === null ? null : { provider: held.provider, ticket: keeper.ticket(), model });
      if (using === null) throw new AssistantError("Connect a model first.", "key");
      const ticket = using.ticket;
      if (keeper.ticket() !== ticket) throw new AssistantError(KEY_GONE, "key");
      const client = await load(using.provider);
      const asked = await question(using.model);
      if (keeper.ticket() !== ticket) throw new AssistantError(bound ? KEY_GONE : "The key changed while the question was being made. Ask again.", "key");
      // What the call used, priced, and added to the key's total while that
      // key is still the one kept: a call answered after it went counts
      // toward no other key's.
      const counted = (usage: Usage): Tally => {
        const tally = tallyOf(using.provider, asked.model, usage, kind);
        if (keeper.ticket() === ticket) set((state) => ({ spent: addTallies(state.spent, tally) }));
        return tally;
      };
      // A run's call is in its cost while it is answered: estimated from
      // its question and what has streamed, the input as the provider says
      // it, then as the provider counted it, or dropped where it counted
      // nothing (./live.ts).
      const live = bound ? book.start(bound.run, { provider: using.provider, model: asked.model, kind: kind === "photo" ? "words" : kind, chars: questionChars(asked) }) : null;
      const streamed = live === null ? written : (piece: string) => {
        live.wrote(piece);
        written(piece);
      };
      try {
        const answer = await keeper.lend((key) => client.ask(key, asked, streamed, signal, live === null ? undefined : (input) => live.said(input)), ticket);
        const tally = counted(answer.usage);
        live?.end(tally);
        return { ...answer, tally };
      } catch (error) {
        if (error instanceof AssistantError && error.usage !== null) {
          const tally = counted(error.usage);
          live?.end(tally);
          throw new AssistantError(error.message, error.kind, error.usage, tally);
        }
        live?.end(null);
        throw error;
      }
    },
    async photo(ask, signal, bound) {
      const { held, imageModel } = get();
      const using = bound ?? (held === null ? null : { provider: held.provider, ticket: keeper.ticket(), imageModel });
      if (using === null || using.imageModel === null) throw new AssistantError("This key makes no photos.", "model");
      const ticket = using.ticket;
      const model = using.imageModel;
      if (keeper.ticket() !== ticket) throw new AssistantError(KEY_GONE, "key");
      const client = await load(using.provider);
      if (!client.photos) throw new AssistantError("This key makes no photos.", "model");
      const photos = client.photos;
      if (keeper.ticket() !== ticket) throw new AssistantError(KEY_GONE, "key");
      // A run's photo is in its cost while it is made, at its price per
      // image, then as the provider counted it (./live.ts).
      const live = bound ? book.start(bound.run, { provider: using.provider, model, kind: "photo", each: photoPrice(model, ask.quality, ask.size) }) : null;
      let answer: PhotoAnswer;
      try {
        answer = await keeper.lend((key) => photos.make(key, { model, ...ask }, signal), ticket);
      } catch (error) {
        live?.end(null);
        throw error;
      }
      const tally = answer.usage === null ? [] : photoTallyOf(model, answer.usage);
      if (keeper.ticket() === ticket) set((state) => ({ spent: addTallies(state.spent, tally) }));
      live?.end(answer.usage === null ? null : tally);
      return { ...answer, tally };
    },
    setWriting: (writing) => set({ writing }),
    setSite: (site) => set({ site }),
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
    // Every run bound to the key that went is told: nothing more of it is
    // asked, with that key or another.
    for (const binding of bindings) binding.abort();
    bindings.clear();
    if (held === null) store.setState({ held: null, forgotten: why, models: [], model: null, imageModel: null, spent: [] });
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
