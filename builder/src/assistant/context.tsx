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
// answers stream in; runCost reads it for the run shown. So are whether
// the run window is open (../editor/AssistantRun.tsx), and the pages the
// run has written, in memory, as its preview draws them; and the pages
// whose last changes were not saved as their run ended (PendingPage), kept
// whatever run comes next, until they are saved after all or opened. One
// per editor, made by the shell (../editor/App.tsx) or a test, which gives
// the clock and, for a test, the providers.
import { createContext, useContext, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { PageDocument } from "../shared/document.ts";
import type { Clock } from "../storage/clock.ts";
import { createKeyKeeper, type ForgetReason, type Held, type KeyKeeper, type ProviderId } from "./key.ts";
import { createLiveBook, photoPrice, questionChars, type RunCost } from "./live.ts";
import type { ImageQuality, ImageSize } from "./prices.ts";
import { AssistantError, providerClient, type Answer, type ModelChoice, type PhotoAnswer, type ProviderClient, type Question, type Usage } from "./providers.ts";
import type { SiteWriting } from "./site.ts";
import { addTallies, photoTallyOf, tallyOf, type Tally, type TallyKind } from "./tally.ts";
import { unsavedNote, type Writing } from "./write.ts";

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

// A page the run has written, as far as it has come, by the page's id: its
// title and its document in memory, which the run window's preview draws.
export interface WrittenPage {
  id: number;
  title: string;
  document: PageDocument;
}

// A page written aside whose last changes were not saved as its run ended
// (../editor/assistant-aside.ts): kept in this tab, its own autosave alive
// (it sends again by itself a save whose answer was lost) and closing the
// tab asking first, whatever run comes next; until a save of it gets
// through after all, or the page is opened, where the editor takes it as a
// step of its own and saves it (../editor/App.tsx, openPage).
export interface PendingPage {
  id: number;
  title: string;
  // The page as this tab holds it: what its last save was to hold, and
  // what was changed on it since (a new site's buttons led elsewhere).
  document(): PageDocument;
  // The revision of the draft its last save left, or the page's as made.
  revision(): number;
  // Changed as this tab holds it, and tried again: whether it is saved.
  change(document: PageDocument): Promise<boolean>;
  // Its save on its way answered, then none sent any more: the draft read
  // next is the last its saves leave. It is kept still, and closing the tab
  // still asks first.
  settle(): Promise<void>;
  // Its autosave stopped, and closing the tab no longer asks about it.
  letGo(): void;
}

// What a page's run says once its last changes are no longer only in this
// tab, in place of the note that said they were not saved.
export const SETTLED_WORDS = {
  saved: "Its last changes were saved after all.",
  opened: "Its last changes, not saved before, were put back on it as it was opened, for the editor to save.",
} as const;

// A page's run once its last changes are saved after all, or put back on
// the page opened: no longer marked, its note saying so.
function settledWriting<W extends Writing>(writing: W, how: keyof typeof SETTLED_WORDS): W {
  if (writing.unsaved === undefined) return writing;
  const said = unsavedNote(writing.unsaved);
  const { unsaved: _settled, ...rest } = writing;
  return { ...rest, notes: writing.notes.map((note) => (note === said ? SETTLED_WORDS[how] : note)) } as W;
}

// How each page released since the run began was settled, by id.
type Settled = ReadonlyMap<number, keyof typeof SETTLED_WORDS>;

// A new site as its run tells it, with each of its pages released since
// the run began told so: the run keeps the mark it gave a page, and tells
// it again with every later step.
function settledSite(site: ShownSite, settled: Settled): ShownSite {
  if (settled.size === 0) return site;
  let changed = false;
  const pages = site.pages.map((page) => {
    const how = page.id === null ? undefined : settled.get(page.id);
    if (how === undefined || page.writing === null || page.writing.unsaved === undefined) return page;
    changed = true;
    return { ...page, writing: settledWriting(page.writing, how) };
  });
  return changed ? { ...site, pages } : site;
}

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
  // The run window (../editor/AssistantRun.tsx) is open: from the moment a
  // page's run, a new site's or the sample's begins, until the person
  // closes it.
  runWindow: boolean;
  // The pages the run has written, in the order they were made, each as
  // it was shown last (showPage): what the window's preview draws. Emptied
  // as a run begins.
  written: readonly WrittenPage[];
  // The pages whose last changes were not saved, by id (PendingPage): kept
  // as runs begin and end, until each is released.
  pending: ReadonlyMap<number, PendingPage>;
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
  // The run window opened, or closed.
  setRunWindow(open: boolean): void;
  // A page of the run, as it is now: in place of the one with its id, or
  // after the others.
  showPage(page: WrittenPage): void;
  // A page whose last changes were not saved, kept; or kept anew.
  keepPending(page: PendingPage): void;
  // The page of `id`, kept no more: saved after all, or opened, which its
  // run's summary says, where it is the one shown, and goes on saying with
  // each later step of that run, which still carries the mark it gave the
  // page (setSite, setWriting). Given back for the caller to let go; null
  // where none is kept.
  releasePending(id: number, how: keyof typeof SETTLED_WORDS): PendingPage | null;
  // A run starts, to be stopped with stop(); its end lets it go. The
  // pages written before it go from the preview; those kept with their
  // last changes not saved stay.
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
  // The pages released since the run began (releasePending), and how: the
  // run still tells each with the mark it gave it, and is corrected.
  let settled = new Map<number, keyof typeof SETTLED_WORDS>();
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
    runWindow: false,
    written: [],
    pending: new Map(),
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
    // A run's step, its pages released since it began told so (settled).
    setWriting: (writing) => set((state) => {
      const how = writing === null ? undefined : state.written.map((page) => settled.get(page.id)).find((one) => one !== undefined);
      return { writing: writing === null || how === undefined ? writing : settledWriting(writing, how) };
    }),
    setSite: (site) => set({ site: site === null ? null : settledSite(site, settled) }),
    setRunWindow: (runWindow) => set({ runWindow }),
    showPage: (page) => set((state) => {
      const at = state.written.findIndex((one) => one.id === page.id);
      return { written: at === -1 ? [...state.written, page] : state.written.map((one, index) => (index === at ? page : one)) };
    }),
    keepPending: (page) => set((state) => ({ pending: new Map(state.pending).set(page.id, page) })),
    releasePending(id, how) {
      const { pending, writing, site, written } = get();
      const page = pending.get(id);
      if (page === undefined) return null;
      const left = new Map(pending);
      left.delete(id);
      settled.set(id, how);
      set({
        pending: left,
        // Said in its run's summary, where that run is the one shown: a
        // new site's page by its id, a page's run by the page it wrote.
        ...(site !== null && site.pages.some((one) => one.id === id)
          ? { site: { ...site, pages: site.pages.map((one) => (one.id === id && one.writing !== null ? { ...one, writing: settledWriting(one.writing, how) } : one)) } }
          : {}),
        ...(writing !== null && written.some((one) => one.id === id) ? { writing: settledWriting(writing, how) } : {}),
      });
      return page;
    },
    begin() {
      get().running?.abort();
      const running = new AbortController();
      settled = new Map();
      set({ running, written: [] });
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
