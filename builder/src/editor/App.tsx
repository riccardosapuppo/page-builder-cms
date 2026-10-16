// The editor's shell, on the approved layout (design/layout/shots/
// editor.png): the top bar; the drawer open (Insert, Outline or History
// beside the canvas, pushing the page aside, Insert since the owner's
// report of 15 October 2026: the layout floats it over the canvas's left);
// the canvas, the page flush with its
// frame; the sidebar on the right, with its Page and Block tabs; the bottom
// line under the canvas, with the selection's path, the devices and the
// page's width. It holds the page being edited: it reads the site's pages,
// its parts (the header and the footer), media library, site style and
// settings through the storage adapter, opens a page or a part (its draft
// upgraded and checked, openDocument, before the store takes it), and gives
// every new document the store makes to its autosave. Nothing here talks to
// a server but through the adapter. A part is edited as a page is; the
// canvas draws the parts' drafts around a page, and around a part the page
// opened last (the interface store's parts and aroundPart), which this
// keeps as they are edited.
//
// It also publishes: the edits waiting are saved first (flush), then the
// draft is put live at the revision just saved, so what goes live is what
// the editor shows; the preview and the live page open on the CMS's own
// origin (../storage/config.ts). A publish set for a time goes the same
// way, saved first, and the page is read again when its time comes, since
// the CMS's job puts it live. It settles a conflict the person's way
// (reload, keep mine), and sends the site style's changes, one request at
// a time, the latest change last.
//
// The page's versions: the list the history panel shows (./HistoryPanel.tsx),
// "Save version" and restore, each after the edits waiting are saved. A
// restore puts the restored draft on the canvas only when this tab has
// nothing the restore did not keep; otherwise the conflict bar asks.
//
// Around it all: drag and drop (./drag/DragLayer.tsx), the keyboard map
// (./keys.ts) and its "?" window, the selected block's menu, the save
// state's banner and toast (./SaveStatus.tsx), About, the media library's
// work on this adapter (./library/context.tsx), the adapter's form
// responses when it keeps them (./responses/context.ts), and its
// collections and their screen when it keeps those (./collections/): a
// collection's template is opened here as a part is, by its id.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { makeReplacePage } from "../document/commands.ts";
import { sameJson } from "../document/json.ts";
import { openDocument } from "../document/upgrade.ts";
import type { PageDocument } from "../shared/document.ts";
import { errorsByBlock, isPartKind, isStorageError, type Draft, type FieldError, type NewPage, type PageSummary, type PartKind, type RestoreResult, type ScheduleState, type SiteStyle, type SiteStyleChange, type StorageAdapter, type Version } from "../storage/adapter.ts";
import { createAutosave, type Autosave, type SavePhase } from "../storage/autosave.ts";
import { cmsAddress } from "../storage/config.ts";
import { AboutDialog } from "./AboutDialog.tsx";
import { BlockMenu } from "./BlockMenu.tsx";
import { Canvas } from "./Canvas.tsx";
import { EditorProvider, useUi, type EditorEnv } from "./context.tsx";
import { DragLayer } from "./drag/DragLayer.tsx";
import { DrawerShell } from "./Drawer.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { AssistantPanel } from "./AssistantPanel.tsx";
import { AssistantProvider, createAssistant } from "../assistant/context.tsx";
import { versionInSentence } from "./history-words.ts";
import { Icon } from "./icons.tsx";
import { MediaProvider } from "./library/context.tsx";
import { ResponsesProvider, responsesOf } from "./responses/context.ts";
import { previewAddressOf, readSiteEntries } from "./collections/content.ts";
import { CollectionsProvider, collectionsOf } from "./collections/context.ts";
import { CollectionsScreen } from "./collections/CollectionsScreen.tsx";
import { Navigator } from "./Navigator.tsx";
import { EditorKeys, MODIFIERS } from "./keys.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { Palette } from "./Palette.tsx";
import { shownAddress } from "./Publish.tsx";
import { afterRender } from "./act.ts";
import { ConflictBanner, onlyAReloadHelps, SaveToast, thisTab } from "./SaveStatus.tsx";
import { keptWords, NO_VERSIONS, publishWords, SessionProvider, templateOf, type OpenPage, type Session, type StyleSave, type TemplateOf, type VersionList } from "./session.tsx";
import { STILL_HELD } from "./pending.ts";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { siteWhen } from "./site-time.ts";
import { Sidebar } from "./Sidebar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { PhoneBar } from "./PhoneBar.tsx";
import { useLayoutMode } from "./layout-mode.ts";
import { TopBar } from "./TopBar.tsx";
import { pushes } from "./ui-store.ts";

// Where the open page is remembered, so a reload opens it again: the
// address's ?page=<id>.
export interface PageAddress {
  read(): number | null;
  write(id: number): void;
}

// A collection's template by its id, as the address names it: null for an
// id that is no template, or that the storage no longer has. Any other
// failure is thrown, for the start to say.
async function templateNamed(adapter: StorageAdapter, id: number): Promise<{ id: number } | null> {
  if (!adapter.capabilities.collections) return null;
  try {
    return (await adapter.getPage(id)).page.kind === "template" ? { id } : null;
  } catch (error) {
    if (isStorageError(error) && error.failure.kind === "not-found") return null;
    throw error;
  }
}

export const locationAddress: PageAddress = {
  read() {
    const raw = new URLSearchParams(window.location.search).get("page");
    const id = raw === null ? Number.NaN : Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  },
  write(id) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(id));
    window.history.replaceState(null, "", url);
  },
};

// The document the store holds before any page is open.
export const NO_PAGE: PageDocument = { schemaVersion: 1, title: "", sections: [] };

// What a publish in the browser demo did, and what the full system does
// with it: the demo keeps it, and serves nothing.
export const PUBLISHED_IN_BROWSER = "Published in this browser. In the full system, Rails publishes and serves this page, with the cache.";

// The same for the header or the footer, which every page draws.
export function partPublishedInBrowser(kind: PartKind): string {
  return `Published in this browser: every page shown here draws this ${kind}. In the full system, Rails puts it on every page at once, with the cache.`;
}

// A promise settled from outside, once: what a tab opened ahead waits for.
// Settling it again does nothing.
function later<T>(): { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  // Its refusal is expected, and handled where it is waited for, if anywhere.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "no-pages" }
  // reload: only a reload of this tab gets past it (the storage upgraded,
  // deleted or made by a newer build: ./SaveStatus.tsx, RELOAD_ONLY).
  | { kind: "failed"; message: string; reload?: boolean };

// Opens a new tab on an address, from a click or a key, while the browser
// still counts it as the person's: the tab is opened at once, blank, and
// sent to the address once it is known. Returns false when the browser
// would not open one.
export interface TabOpener {
  open(address: Promise<string>): boolean;
}

export const windowTabs: TabOpener = {
  open(address) {
    const tab = window.open("", "_blank");
    if (!tab) return false;
    // The CMS's page must not reach back into the editor.
    tab.opener = null;
    void address.then((href) => tab.location.replace(href), () => tab.close());
    return true;
  },
};

interface AppProps {
  env: EditorEnv;
  adapter: StorageAdapter;
  address?: PageAddress;
  // The CMS's own origin, where its pages open (../storage/config.ts); null
  // with no CMS, in the browser demo, which draws the preview itself.
  cmsOrigin: string | null;
  // Where a page as published in the browser opens, for a storage that
  // keeps a publish but serves no live page (capabilities.livePages): the
  // demo's own drawing of it. Publish opens it, and the Publish menu
  // links it.
  publishedView?: ((pageId: number) => string) | null;
  // The same for an entry of a collection: an entry's form links it as
  // View.
  entryView?: ((entryId: number) => string) | null;
  // A line under the bottom line, across the window: the demo's.
  foot?: ReactNode;
  tabs?: TabOpener;
}

export function App({ env, adapter, address = locationAddress, cmsOrigin, publishedView = null, entryView = null, foot, tabs = windowTabs }: AppProps) {
  const { store, ui, clock } = env;
  // The Assistant (../assistant/README.md): one for the editor's life; the
  // key it may hold is forgotten when the window is left, or the editor goes.
  const [assistant] = useState(() => createAssistant(clock));
  useEffect(() => assistant.watch(window), [assistant]);
  const words = useMemo(() => keptWords(cmsOrigin), [cmsOrigin]);
  const publishedWords = useMemo(() => publishWords(adapter.capabilities.livePages), [adapter]);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [pages, setPages] = useState<readonly PageSummary[]>([]);
  const [parts, setParts] = useState<readonly PageSummary[]>([]);
  const [current, setCurrent] = useState<OpenPage | null>(null);
  const [autosave, setAutosave] = useState<Autosave | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [styleSave, setStyleSave] = useState<StyleSave>({ phase: "idle" });
  const [versions, setVersions] = useState<VersionList>(NO_VERSIONS);
  const [restoring, setRestoring] = useState<number | null>(null);
  const live = useRef<{ autosave: Autosave | null; unsubscribe: () => void; adopting: boolean }>({ autosave: null, unsubscribe: () => {}, adopting: false });
  // The page as the latest render had it, for the operations that run
  // after an await.
  const opened = useRef<OpenPage | null>(null);
  useLayoutEffect(() => {
    opened.current = current;
  }, [current]);
  // The page whose document the editor holds, set as it is loaded: an open
  // a later one took the place of never sets it (Session.isOpen).
  const loaded = useRef<number | null>(null);

  // Hands over the text still being written; its holder's words when the
  // page refused one, which stays held where it is written (./pending.ts):
  // what asked waits, as a command does.
  const held = useCallback((): string | null => {
    if (ui.getState().pending.deliver()) return null;
    return ui.getState().notice ?? STILL_HELD;
  }, [ui]);

  const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

  // The pages and the parts, read again: a publish, a schedule, a new page
  // or address changes what the lists say of them.
  const refreshPages = useCallback(async () => {
    const [list, partList] = await Promise.all([adapter.listPages(), adapter.listParts()]);
    setPages(list);
    setParts(partList);
    return list;
  }, [adapter]);

  // The collections and their entries, which the canvas's lists and a
  // template's fields draw (./collections/content.ts), read again: as the
  // editor starts, and each time the Collections screen closes, where they
  // change. A storage that keeps none has none; a read that fails leaves
  // the canvas what it had, and answers why, for the notice to say: as
  // the screen closes, at once; as the editor starts, once the page is
  // open, since opening one clears the notice. The latest read asked for
  // wins, as a page's opening does: one that ends after a later one was
  // asked for changes nothing, and its failure is not said.
  const entriesReads = useRef(0);
  const refreshEntries = useCallback(async (): Promise<string | null> => {
    const storage = collectionsOf(adapter);
    if (!storage) return null;
    const ticket = ++entriesReads.current;
    try {
      const site = await readSiteEntries(storage);
      if (entriesReads.current !== ticket) return null;
      ui.getState().setSiteEntries(site);
      // A template opened while the collections could not be read was
      // named by none: its collection, read now, names it, and its fields
      // draw the entry; the entry its Page tab picked is kept.
      setCurrent((open) => {
        if (open?.kind !== "template" || open.collection) return open;
        const owner = site.collections.find((collection) => collection.template.id === open.id);
        return owner ? { ...open, collection: { id: owner.id, name: owner.name, prefix: owner.prefix } } : open;
      });
      return null;
    } catch (error) {
      if (entriesReads.current !== ticket) return null;
      return `The collections could not be read (${describe(error)}): lists and Field blocks show what was read before, if anything, until Collections closes and reads them again.`;
    }
  }, [adapter, ui]);
  useEffect(() => ui.subscribe((state, before) => {
    if (before.collections !== null && state.collections === null) {
      void refreshEntries().then((why) => {
        if (why) ui.getState().say(why);
      });
    }
  }), [ui, refreshEntries]);

  // A part's draft as the canvas draws it around a page, read again.
  const readPart = useCallback(async (part: PageSummary) => {
    const taken = openDocument((await adapter.getDraft(part.id)).document);
    if (taken.ok) ui.getState().setParts({ [part.kind]: taken.document });
  }, [adapter, ui]);

  // The latest page asked for: an earlier request still loading gives way.
  const opening = useRef(0);
  // The home page's draft, as the page drawn around a part, unless another
  // page was opened meanwhile.
  const aroundHome = useCallback(async (ticket: number) => {
    const home = (await adapter.listPages().catch(() => [])).find((p) => p.home);
    if (!home) return;
    try {
      const taken = openDocument((await adapter.getDraft(home.id)).document);
      if (taken.ok && opening.current === ticket && ui.getState().aroundPart === null) ui.getState().setAroundPart({ id: home.id, title: home.title, document: taken.document });
    } catch {
      // The part is drawn alone.
    }
  }, [adapter, ui]);

  // The same for the versions: only the latest read is shown.
  const versionReads = useRef(0);
  const openPage = useCallback(async (id: number): Promise<string | null> => {
    const ticket = ++opening.current;
    const previous = live.current.autosave;
    const kept = `This page has ${words.unsaved}: it stays open until they are saved.`;
    // Whether the page being left has every edit on the server: text still
    // in a field is handed over first, so it counts.
    const left = (): boolean => {
      ui.getState().pending.deliver();
      return !previous || !previous.getSnapshot().warnOnClose;
    };
    // Saves what waits for its pause or is on its way, until nothing does;
    // false when the server has not taken it all.
    const save = async (): Promise<boolean> => {
      while (previous && !left()) {
        const settled = await previous.flush();
        if (settled.warnOnClose) return false;
      }
      return true;
    };
    if (!(await save())) return kept;
    if (opening.current !== ticket) return null;
    let page;
    try {
      page = await adapter.getPage(id);
    } catch (error) {
      return opening.current === ticket ? `The page could not be opened: ${describe(error)}` : null;
    }
    if (opening.current !== ticket) return null;
    // A collection's template is named by its collection, which the page
    // does not say: found among the collections, or not named.
    let collection: TemplateOf | null = null;
    if (page.page.kind === "template" && adapter.capabilities.collections) {
      const owner = (await adapter.listCollections().catch(() => [])).find((c) => c.template.id === page.page.id);
      if (owner) collection = { id: owner.id, name: owner.name, prefix: owner.prefix };
      if (opening.current !== ticket) return null;
    }
    const taken = openDocument(page.draft.document);
    if (!taken.ok) return `The page could not be opened: ${taken.errors[0]?.message ?? "its document is not valid"}.`;
    // The page being left stayed open while the next one loaded, and the
    // person may have edited it meanwhile: those edits are saved too. The
    // last look (left) and the switch below run with no await between
    // them, so no edit can fall in between.
    while (!left()) {
      if (!(await save())) return opening.current === ticket ? kept : null;
      if (opening.current !== ticket) return null;
    }
    // A text the page refused stays where it is written, and the page with
    // it, as its holder says.
    const refused = held();
    if (refused) return opening.current === ticket ? refused : null;

    // A page left for a part is the page drawn around it, as it was left.
    const leaving = opened.current;
    if (leaving?.kind === "page" && page.page.kind !== "page") {
      ui.getState().setAroundPart({ id: leaving.id, title: store.getState().document.title, document: store.getState().document });
    }
    live.current.unsubscribe();
    previous?.dispose();
    store.getState().load(taken.document);
    loaded.current = page.page.id;
    ui.setState({ serverErrors: [], hover: null, notice: null, tray: "edit", sideTab: null });
    // The page left's versions, and any read of them still on its way, go.
    versionReads.current += 1;
    setVersions(NO_VERSIONS);

    // The document of each save, so the server's errors can be put on the
    // blocks of the document they were about.
    let sent: PageDocument = taken.document;
    const saving = createAutosave({
      adapter: {
        getDraft: (pageId, options) => adapter.getDraft(pageId, options),
        saveDraft: (pageId, save, options) => {
          sent = save.document;
          return adapter.saveDraft(pageId, save, options);
        },
      },
      pageId: page.page.id,
      revision: page.draft.revision,
      document: taken.document,
      savedAt: page.draft.updatedAt,
      clock,
    });
    // A part's draft, as it is edited, is what the canvas draws around the
    // pages opened after it. A template is drawn around nothing.
    const kind = page.page.kind;
    if (isPartKind(kind)) ui.getState().setParts({ [kind]: taken.document });
    const stopEdits = store.subscribe((state, before) => {
      if (state.document === before.document) return;
      if (isPartKind(kind)) ui.getState().setParts({ [kind]: state.document });
      // The server's own draft, taken after a conflict, is no edit.
      if (!live.current.adopting) saving.edit(state.document);
    });
    const stopErrors = saving.subscribe((snapshot) => {
      if (snapshot.phase === "invalid") ui.getState().setServerErrors(errorsByBlock(sent, snapshot.errors));
      else if (ui.getState().serverErrors.length > 0) ui.getState().setServerErrors([]);
    });
    live.current = {
      autosave: saving,
      unsubscribe: () => {
        stopEdits();
        stopErrors();
      },
      adopting: false,
    };
    setAutosave(saving);
    setCurrent({ id: page.page.id, kind, slug: page.page.slug, home: page.page.home, published: page.published, scheduled: page.scheduled, revision: page.draft.revision, links: { preview: page.links.preview, live: page.links.live }, ...(kind === "template" ? { collection } : {}) });
    setStatus({ kind: "ready" });
    address.write(page.page.id);
    // A part opened with no page before it (the address named it) is drawn
    // around the home page's draft, read now.
    if (kind !== "page" && ui.getState().aroundPart === null) void aroundHome(ticket);
    return null;
  }, [adapter, address, aroundHome, clock, held, store, ui, words]);

  // The site as the editor starts on it: its pages and parts, the parts'
  // drafts the canvas draws around a page, its library, style and
  // settings; then the page or part the address names, else the home page,
  // else the first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus({ kind: "loading" });
      try {
        const [list, partList, media, style, site] = await Promise.all([adapter.listPages(), adapter.listParts(), adapter.listMedia(), adapter.getSiteStyle(), adapter.getSite()]);
        const [entriesWhy] = await Promise.all([refreshEntries(), ...partList.map(readPart)]);
        if (cancelled) return;
        setPages(list);
        setParts(partList);
        ui.getState().setMedia(media);
        ui.getState().setSiteStyle(style);
        ui.getState().setSite(site);
        const wanted = address.read();
        // The page the address names: one the lists hold, or a
        // collection's template, which the address names once it is
        // opened (Edit the template) and a reload opens again. A template
        // is asked for by its id, whether the collections could be read
        // or not; an id no longer there leaves the home page to open, and
        // any other failure stops the start, which Try again takes up.
        const named = wanted === null ? undefined : ([...list, ...partList].find((p) => p.id === wanted) ?? (await templateNamed(adapter, wanted)));
        if (cancelled) return;
        const first = named ?? list.find((p) => p.home) ?? list[0];
        if (!first) {
          setStatus({ kind: "no-pages" });
          return;
        }
        const why = await openPage(first.id);
        if (!cancelled && why) setStatus({ kind: "failed", message: why });
        else if (!cancelled && entriesWhy) ui.getState().say(entriesWhy);
      } catch (error) {
        // The storage's own words say where it failed: the CMS out of
        // reach, or the browser's storage refused.
        if (!cancelled) setStatus({ kind: "failed", message: `The editor could not start: ${describe(error)}`, reload: isStorageError(error) && onlyAReloadHelps(error.failure) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, address, attempt, openPage, readPart, refreshEntries, ui]);

  useEffect(() => () => {
    live.current.unsubscribe();
    live.current.autosave?.dispose();
  }, []);

  const makePage = useCallback(async (page: NewPage): Promise<{ ok: true; id: number } | { ok: false; errors: FieldError[] }> => {
    let outcome;
    try {
      outcome = await adapter.createPage(page);
    } catch (error) {
      return { ok: false, errors: [{ pointer: "", keyword: "unknown", blockPointer: null, message: `The page could not be made: ${describe(error)}` }] };
    }
    if (!outcome.ok) return { ok: false, errors: outcome.problem.errors.length > 0 ? outcome.problem.errors : [{ pointer: "", keyword: "invalid", blockPointer: null, message: outcome.problem.message }] };
    await refreshPages().catch(() => undefined);
    const why = await openPage(outcome.value.page.id);
    if (why) ui.getState().say(why);
    return { ok: true, id: outcome.value.page.id };
  }, [adapter, openPage, refreshPages, ui]);

  const createPage = useCallback(async (page: NewPage): Promise<FieldError[] | null> => {
    const made = await makePage(page);
    return made.ok ? null : made.errors;
  }, [makePage]);

  const setSlug = useCallback(async (slug: string): Promise<FieldError[] | null> => {
    if (!current) return null;
    let outcome;
    try {
      outcome = await adapter.updatePage(current.id, { slug });
    } catch (error) {
      return [{ pointer: "/slug", keyword: "unknown", blockPointer: null, message: `The address could not be saved: ${describe(error)}` }];
    }
    if (!outcome.ok) return outcome.problem.errors.length > 0 ? outcome.problem.errors : [{ pointer: "/slug", keyword: "invalid", blockPointer: null, message: outcome.problem.message }];
    setCurrent((page) => (page ? { ...page, slug: outcome.value.page.slug } : page));
    await refreshPages().catch(() => undefined);
    return null;
  }, [adapter, current, refreshPages]);

  // The open page's versions, read again; the list on screen stays until
  // the answer replaces it, and a read that fails says why beside it, and
  // whether only a reload of this tab gets past it.
  const loadVersions = useCallback(() => {
    const page = opened.current;
    if (!page) return;
    const ticket = ++versionReads.current;
    setVersions((list) => ({ ...list, phase: "loading" }));
    Promise.resolve().then(() => adapter.listVersions(page.id)).then(
      (items) => {
        if (versionReads.current === ticket) setVersions({ phase: "ready", items, message: null });
      },
      (error: unknown) => {
        if (versionReads.current === ticket) setVersions((list) => ({ ...list, phase: "failed", message: `The versions could not be read: ${describe(error)}`, reload: isStorageError(error) && onlyAReloadHelps(error.failure) }));
      },
    );
  }, [adapter]);

  // The draft as the CMS would serve it, in a new tab, once the edits
  // waiting are on the server; if they cannot be, the preview shows the
  // last saved draft and the notice says so.
  // A template's preview is drawn with what the canvas draws it with: the
  // entry its Page tab picked, or the made-up values.
  const preview = useCallback(() => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page) return;
    const href = cmsAddress(previewAddressOf(page, ui.getState().siteEntries, ui.getState().previewEntry), cmsOrigin);
    const ready = (async () => {
      const refused = held();
      if (refused) ui.getState().say(`The preview shows the last saved draft. ${refused}`);
      const settled = saving ? await saving.flush() : null;
      if (settled && settled.phase !== "saved") ui.getState().say(`The preview shows the last saved draft: ${unsavedWhy(settled.phase, words.server)}`);
      return href;
    })();
    if (!tabs.open(ready)) ui.getState().say(`The browser did not open a new tab for the preview. It is at ${href}.`);
  }, [cmsOrigin, held, tabs, ui, words.server]);

  // Saves what waits, then puts the draft live at the revision just saved:
  // a save from elsewhere in between is refused by the CMS, not published
  // unseen. A storage that serves no live page (the browser demo) shows
  // the page as published instead, in a new tab: opened now, while the
  // click or the key still lets the editor open one, sent there once the
  // publish is kept, and closed if it is not.
  const publish = useCallback(async () => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving || !adapter.capabilities.publish) return;
    // A template has no page to show: its entries are drawn with it.
    const shown = !adapter.capabilities.livePages && publishedView && page.kind !== "template" ? later<string>() : null;
    if (shown) tabs.open(shown.promise);
    setPublishing(true);
    try {
      const refused = held();
      if (refused) {
        ui.getState().say(`Not published. ${refused}`);
        return;
      }
      const settled = await saving.flush();
      if (settled.phase !== "saved") {
        ui.getState().say(`Not published: ${unsavedWhy(settled.phase, words.server)}`);
        return;
      }
      // A header or footer may be empty: the site then has none.
      if (page.kind === "page" && store.getState().document.sections.length === 0) {
        ui.getState().say("Not published: an empty page has nothing to publish. Add a section first.");
        return;
      }
      let outcome;
      try {
        outcome = await adapter.publish(page.id, { revision: settled.revision });
      } catch (error) {
        const unknown = isStorageError(error) && error.failure.kind === "unknown";
        ui.getState().say(unknown
          ? `No answer from ${words.keeper} about the publish (${describe(error)}): ${publishedWords.maybe}`
          : `Not published: ${describe(error)}`);
        return;
      }
      if (!outcome.ok) {
        ui.getState().say(outcome.problem.kind === "conflict"
          ? `Not published: the page was saved somewhere else after this tab's last save. ${publishedWords.nothingWent}`
          : `Not published: ${outcome.problem.errors[0]?.message ?? outcome.problem.message}`);
        return;
      }
      const result = outcome.value;
      // A publish waiting for its time is superseded by this one, which
      // puts its revision or a later one live (the CMS settles it so).
      setCurrent((open) => (open?.id === page.id ? {
        ...open,
        published: result.published,
        scheduled: open.scheduled && open.scheduled.revision > result.published.draftRevision ? open.scheduled : null,
        links: { preview: result.links.preview, live: result.links.live },
      } : open));
      // The publish is a version of its own, and the live one now: the
      // history, if it shows the versions, lists it.
      if (opened.current?.id === page.id && ui.getState().historyOpen) loadVersions();
      const listed = await refreshPages().catch(() => null);
      if (page.kind === "template") {
        const of = templateOf(page);
        ui.getState().say(adapter.capabilities.livePages ? `Published: every entry of ${of} is drawn with this template.` : `Published in this browser. In the full system, every entry of ${of} is drawn with this template.`);
        return;
      }
      // A part has no page of its own: it is seen on the home page.
      const seenOn = page.kind === "page" ? page.id : (listed ?? []).find((p) => p.home)?.id ?? listed?.[0]?.id ?? null;
      if (shown && publishedView) {
        if (seenOn === null) {
          shown.reject(new Error("no page to show the part on"));
          ui.getState().say(isPartKind(page.kind) ? partPublishedInBrowser(page.kind) : PUBLISHED_IN_BROWSER);
          return;
        }
        const view = cmsAddress(publishedView(seenOn), cmsOrigin);
        shown.resolve(view);
        ui.getState().say(isPartKind(page.kind) ? partPublishedInBrowser(page.kind) : PUBLISHED_IN_BROWSER, { href: view, label: page.kind === "page" ? "View published page" : "View the home page" });
        return;
      }
      if (page.kind !== "page") {
        const home = cmsAddress("/", cmsOrigin);
        ui.getState().say(`Published: every page shows this ${page.kind} at its next visit.`, { href: home, label: "View the home page" });
        return;
      }
      const where = result.links.live === null ? null : cmsAddress(result.links.live, cmsOrigin);
      ui.getState().say(where ? `Published: visitors see this page at ${shownAddress(where)}.` : "Published.", where ? { href: where, label: "View live page" } : null);
    } finally {
      setPublishing(false);
      // Not published: the tab opened for it goes.
      shown?.reject(new Error("not published"));
    }
  }, [adapter, cmsOrigin, held, loadVersions, publishedView, refreshPages, store, tabs, ui, words, publishedWords.maybe, publishedWords.nothingWent]);

  // What is live and what waits to go live, read again from the CMS, for a
  // page still open: the draft on the canvas and its autosave stay as
  // they are.
  const refreshLive = useCallback(async (id: number) => {
    const page = await adapter.getPage(id);
    setCurrent((open) => (open?.id === id ? { ...open, published: page.published, scheduled: page.scheduled, links: { preview: page.links.preview, live: page.links.live } } : open));
    if (opened.current?.id === id && ui.getState().historyOpen) loadVersions();
    await refreshPages().catch(() => undefined);
  }, [adapter, loadVersions, refreshPages, ui]);

  // Saves what waits, then sets the draft at the revision just saved to go
  // live at `at`: what goes live then is what the editor shows now.
  const schedulePublish = useCallback(async (at: string): Promise<FieldError[] | null> => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving || !adapter.capabilities.schedule) return null;
    const problem = (keyword: string, message: string): FieldError[] => [{ pointer: "", keyword, blockPointer: null, message }];
    setScheduling(true);
    try {
      const refused = held();
      if (refused) return problem("refused", `Not scheduled. ${refused}`);
      const settled = await saving.flush();
      if (settled.phase !== "saved") return problem("unsaved", `Not scheduled: ${unsavedWhy(settled.phase, words.server)}`);
      if (page.kind === "page" && store.getState().document.sections.length === 0) return problem("empty", "Not scheduled: an empty page has nothing to publish. Add a section first.");
      let outcome;
      try {
        outcome = await adapter.schedulePublish(page.id, { revision: settled.revision, at });
      } catch (error) {
        const unknown = isStorageError(error) && error.failure.kind === "unknown";
        if (unknown) void refreshLive(page.id).catch(() => undefined);
        return problem("unknown", unknown
          ? `No answer from the CMS about the schedule (${describe(error)}): it may be set or not. The top bar shows it once the CMS answers again.`
          : `Not scheduled: ${describe(error)}`);
      }
      if (!outcome.ok) {
        if (outcome.problem.kind === "conflict") return problem("conflict", "Not scheduled: the page was saved somewhere else after this tab's last save.");
        return outcome.problem.errors.length > 0 ? outcome.problem.errors : problem("invalid", outcome.problem.message);
      }
      const { schedule } = outcome.value;
      setCurrent((open) => (open?.id === page.id ? { ...open, scheduled: schedule } : open));
      // The draft is kept as a version of its own: the history lists it.
      if (opened.current?.id === page.id && ui.getState().historyOpen) loadVersions();
      await refreshPages().catch(() => undefined);
      const zone = ui.getState().site?.timeZone ?? "UTC";
      ui.getState().say(page.kind === "template"
        ? `Scheduled: every entry of ${templateOf(page)} is drawn with these changes from ${siteWhen(zone, schedule.at)}.`
        : `Scheduled: visitors see these changes from ${siteWhen(zone, schedule.at)}. Until then the live page stays as it is.`);
      return null;
    } finally {
      setScheduling(false);
    }
  }, [adapter, held, loadVersions, refreshLive, refreshPages, store, ui, words.server]);

  // Cancels the open page's pending schedule. Too late (its job ran, or
  // another tab replaced or cancelled it), the CMS says what became of it,
  // and the page is read again to show that.
  const cancelSchedule = useCallback(async () => {
    const page = opened.current;
    const pending = page?.scheduled;
    if (!page || !pending) return;
    const say = ui.getState().say;
    let outcome;
    try {
      outcome = await adapter.cancelScheduledPublish(page.id, pending.id);
    } catch (error) {
      say(`Not cancelled: ${describe(error)}`);
      return;
    }
    if (!outcome.ok) {
      await refreshLive(page.id).catch(() => undefined);
      say(tooLateToCancel(outcome.problem.schedule.state));
      return;
    }
    setCurrent((open) => (open?.id === page.id && open.scheduled?.id === pending.id ? { ...open, scheduled: null } : open));
    await refreshPages().catch(() => undefined);
    say("Scheduled publish cancelled: the live page stays as it is.");
  }, [adapter, refreshLive, refreshPages, ui]);

  // When a scheduled publish's time comes, the CMS's own job puts it live;
  // the editor reads the page again then, so the top bar and the history
  // stop saying it waits. A browser runs a timer of more than about 24
  // days at once, so a long wait is taken in steps; past the time, the
  // page is read every few seconds for a minute, in case the job is late,
  // then every half minute for as long as it is still waiting: the CMS
  // sets a job that failed going again by itself after some minutes, and
  // the top bar says meanwhile that it should have happened
  // (./schedule-late.ts).
  const scheduledAt = current?.scheduled?.at ?? null;
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (scheduledAt === null || currentId === null) return undefined;
    const due = Date.parse(scheduledAt);
    let timer: ReturnType<typeof clock.setTimeout> | null = null;
    let reads = 0;
    let stopped = false;
    const wait = (ms: number) => {
      timer = clock.setTimeout(() => void check(), Math.min(Math.max(0, ms), LONGEST_TIMER_MS));
    };
    const check = async () => {
      const left = due - clock.now();
      if (left > 0) {
        wait(left + 1_000);
        return;
      }
      await refreshLive(currentId).catch(() => undefined);
      if (!stopped) wait(++reads < QUICK_READS ? 3_000 : SLOW_READ_MS);
    };
    wait(due - clock.now() + 1_000);
    return () => {
      stopped = true;
      if (timer !== null) clock.clearTimeout(timer);
    };
  }, [scheduledAt, currentId, clock, refreshLive]);

  // A draft the server holds, put on the canvas in place of this tab's
  // page: no edit, so the autosave sends nothing for it. The undo history
  // starts again, its steps having been made on the page replaced.
  const putDraft = useCallback((document: PageDocument) => {
    live.current.adopting = true;
    try {
      store.getState().load(document);
    } finally {
      live.current.adopting = false;
    }
    ui.setState({ serverErrors: [], hover: null });
  }, [store, ui]);

  // The conflict, settled the person's way, and either way undone from the
  // history, as the approved design says. Reload: the server's draft
  // replaces this tab's page as one step of this session, so Undo brings
  // this tab's page back, the steps before it still there. Keep mine: the
  // server's draft is kept as a version first, so Restore brings it back,
  // then this tab's page is saved over it.
  const reload = useCallback(async () => {
    const saving = live.current.autosave;
    if (!saving) return;
    // Words still in a field are part of this tab's page, which the step
    // keeps for undo.
    ui.getState().pending.deliver();
    let draft;
    try {
      draft = await saving.reload();
    } catch (error) {
      ui.getState().say(`The page could not be reloaded: ${describe(error)}`);
      return;
    }
    const taken = openDocument(draft.document);
    if (!taken.ok) {
      ui.getState().say(`The page ${words.there} could not be opened: ${taken.errors[0]?.message ?? "its document is not valid"}.`);
      return;
    }
    const made = makeReplacePage(store.getState().document, taken.document, "Reloaded the page saved in another tab");
    if (!made.ok) {
      ui.setState({ serverErrors: [], hover: null });
      ui.getState().say(`Reloaded: the page ${words.there} is the same as this tab's.`);
      return;
    }
    live.current.adopting = true;
    let outcome;
    try {
      outcome = store.getState().dispatch(made.command);
    } finally {
      live.current.adopting = false;
    }
    if (!outcome.ok) {
      // A step the page refuses (it cannot happen to a page the server
      // holds, but if it does): the server's page all the same.
      putDraft(taken.document);
      ui.getState().say(`Reloaded: this is the page as it is ${words.there}. ${UNDO_AGAIN}`);
      return;
    }
    ui.setState({ serverErrors: [], hover: null });
    ui.getState().say(`Reloaded: this is the page as it is ${words.there}. Undo brings this tab’s page back.`);
  }, [putDraft, store, ui, words]);

  // Keep mine: the page on the server now, read first (another tab may have
  // saved since the conflict was met), is kept as a version, unless the
  // page's newest version already holds it (Keep mine pressed again, as
  // the CMS's restore does); then this tab's page is saved over that very
  // revision. Said done only once the CMS has the save: a page saved on
  // the server in between meets the conflict again, and is said so.
  const keepMine = useCallback(async () => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving || saving.getSnapshot().phase !== "conflict") return;
    const say = ui.getState().say;
    let server;
    try {
      server = await adapter.getDraft(page.id);
    } catch (error) {
      say(`Nothing was saved over the other page: it could not be read first (${describe(error)}). Choose again.`);
      return;
    }
    let keptAlready = false;
    try {
      const [newest] = await adapter.listVersions(page.id);
      if (newest) keptAlready = sameJson((await adapter.getVersion(page.id, newest.number)).document, server.document);
    } catch {
      keptAlready = false;
    }
    if (!keptAlready) {
      let outcome;
      try {
        outcome = await adapter.saveVersion(page.id, { name: KEPT_BEFORE_OVERWRITE });
      } catch (error) {
        outcome = { ok: false as const, why: describe(error) };
      }
      if ("why" in outcome || !outcome.ok) {
        const why = "why" in outcome ? outcome.why : outcome.problem.errors[0]?.message ?? outcome.problem.message;
        say(`Nothing was saved over the other page: it could not be kept as a version first (${why}). Choose again.`);
        return;
      }
    }
    if (live.current.autosave !== saving || saving.getSnapshot().phase !== "conflict") return;
    saving.overwrite(server.revision);
    if (ui.getState().historyOpen) loadVersions();
    say(`Keeping this tab’s page: saving it over the one ${words.there}…`);
    const settled = await saving.flush();
    if (live.current.autosave !== saving) return;
    if (settled.phase === "saved") {
      say(`Kept this tab’s page: it is saved over the one ${words.there}, which is kept in Versions as “${KEPT_BEFORE_OVERWRITE}”.`);
    } else if (settled.phase === "conflict") {
      say("Not saved over it yet: the page was saved in another tab again while this one kept it. Choose again: Keep mine keeps that page as a version too.");
    } else {
      say(`This tab’s page is not saved over the other one yet: ${unsavedWhy(settled.phase, words.server)}`);
    }
  }, [adapter, loadVersions, ui, words]);

  // "Save version": the CMS keeps its draft, so what waits is saved first,
  // and the version holds what the canvas shows.
  const saveVersion = useCallback(async (name: string): Promise<FieldError[] | null> => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving) return null;
    const problem = (keyword: string, message: string): FieldError[] => [{ pointer: "", keyword, blockPointer: null, message }];
    const refused = held();
    if (refused) return problem("refused", `Not kept. ${refused}`);
    const settled = await saving.flush();
    if (settled.phase !== "saved") return problem("unsaved", `Not kept: ${unsavedWhy(settled.phase, words.server)}`);
    const named = name.trim();
    let outcome;
    try {
      outcome = await adapter.saveVersion(page.id, named === "" ? {} : { name: named });
    } catch (error) {
      const unknown = isStorageError(error) && error.failure.kind === "unknown";
      loadVersions();
      return problem("unknown", unknown
        ? `No answer from ${words.keeper} (${describe(error)}): the version may have been kept. The list below shows what it has.`
        : `Not kept: ${describe(error)}`);
    }
    if (!outcome.ok) return outcome.problem.errors.length > 0 ? outcome.problem.errors : problem("invalid", outcome.problem.message);
    if (opened.current?.id === page.id) loadVersions();
    ui.getState().say(named === "" ? "Kept as a version." : `Kept as a version: “${named}”.`);
    return null;
  }, [adapter, held, loadVersions, ui, words]);

  // Copies a version back into the draft. The edits waiting are saved
  // first, so the version the CMS keeps of the draft before the restore
  // holds them. Once the restore is made, the restored draft takes this
  // tab's place only if this tab has nothing the restore did not keep: an
  // edit made while it travelled, and saved after it, meets a conflict
  // instead, and the conflict bar lets the person choose.
  const restoringNow = useRef(false);
  // The versions as the panel shows them, for the restore's sentence.
  const versionsShown = useRef<readonly Version[]>([]);
  useLayoutEffect(() => {
    versionsShown.current = versions.items;
  }, [versions]);
  const restoreVersion = useCallback(async (number: number) => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving || restoringNow.current) return;
    const say = ui.getState().say;
    restoringNow.current = true;
    setRestoring(number);
    try {
      const refused = held();
      if (refused) {
        say(`Not restored. ${refused}`);
        return;
      }
      const settled = await saving.flush();
      if (settled.phase !== "saved") {
        say(`Not restored: ${unsavedWhy(settled.phase, words.server)}`);
        return;
      }
      if (live.current.autosave !== saving) return;
      let outcome;
      try {
        outcome = await adapter.restoreVersion(page.id, number);
      } catch (error) {
        const unknown = isStorageError(error) && error.failure.kind === "unknown";
        say(unknown
          ? `No answer from ${words.keeper} about the restore (${describe(error)}): it may have been made. If it was, the editor asks you to choose before it saves this page again.`
          : `Not restored: ${describe(error)}`);
        if (live.current.autosave === saving) loadVersions();
        return;
      }
      if (live.current.autosave !== saving) return;
      if (!outcome.ok) {
        say(`Not restored: ${outcome.problem.errors[0]?.message ?? outcome.problem.message}`);
        return;
      }
      const result = outcome.value;
      const shown = versionsShown.current;
      // What the person did while the restore travelled is settled first:
      // handed over, then saved. A text the page refused meanwhile stays
      // held where it is written, a change this tab has not saved, so the
      // restored page does not take its place.
      const late = held();
      const after = await saving.flush();
      if (live.current.autosave !== saving) return;
      loadVersions();
      const taken = openDocument(result.draft.document);
      if (late === null && after.phase === "saved" && after.revision < result.draft.revision && taken.ok && adopt(saving, result.draft)) {
        putDraft(taken.document);
        say(restoredSentence(result, shown, clock.now()));
      } else if (after.phase === "conflict") {
        say(`${words.restored}, but this tab changed the page while the restore was on its way. Reload takes the restored page; Keep mine saves this tab’s page over it.`);
      } else {
        say(`${words.restored}, but this tab changed the page while the restore was on its way, and has not saved that change yet. Saving it will ask you to choose between the two.`);
      }
    } finally {
      restoringNow.current = false;
      setRestoring(null);
    }
  }, [adapter, clock, held, loadVersions, putDraft, ui, words]);

  // The site style: the canvas takes a change at once; the CMS gets one
  // request at a time, and the latest change goes when the one on its way
  // is answered. A refusal puts back what the CMS last kept.
  const styleQueue = useRef<{ busy: boolean; next: SiteStyleChange | null; kept: SiteStyle | null }>({ busy: false, next: null, kept: null });
  const saveSiteStyle = useCallback((change: SiteStyleChange) => {
    const shown = ui.getState().siteStyle;
    if (!shown) return;
    const queue = styleQueue.current;
    queue.kept ??= shown;
    // The whole style as it is to be, every part named: a change that
    // names fewer parts keeps the others as shown, a change still waiting
    // for its turn included, which this one then stands in for.
    const whole = { palette: change.palette, typeScale: change.typeScale, letterWidth: change.letterWidth ?? shown.letterWidth, customCss: change.customCss ?? shown.customCss };
    ui.getState().setSiteStyle({ ...shown, ...whole });
    setStyleSave({ phase: "saving" });
    queue.next = whole;
    if (queue.busy) return;
    queue.busy = true;
    void (async () => {
      try {
        while (queue.next) {
          const sending = queue.next;
          queue.next = null;
          let outcome;
          try {
            outcome = await adapter.setSiteStyle(sending);
          } catch (error) {
            outcome = { ok: false as const, why: describe(error) };
          }
          if ("why" in outcome || !outcome.ok) {
            const why = "why" in outcome ? outcome.why : outcome.problem.errors[0]?.message ?? outcome.problem.message;
            queue.next = null;
            if (queue.kept) ui.getState().setSiteStyle(queue.kept);
            setStyleSave({ phase: "failed", message: `Not saved, the site keeps its style as it was: ${why}` });
            return;
          }
          queue.kept = outcome.value;
          if (!queue.next) {
            ui.getState().setSiteStyle(outcome.value);
            setStyleSave({ phase: "saved" });
          }
        }
      } finally {
        queue.busy = false;
      }
    })();
  }, [adapter, ui]);

  // Closing the tab while edits are only here asks first: the page's or
  // the part's edits, text typed in a field and not handed over yet
  // (handed over now, so the autosave counts it), a site style on its way
  // to the CMS or waiting behind the one that is, and custom CSS kept as a
  // draft because it does not keep to the site.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      // A text the page refused, still held where it is written, is an
      // edit the server does not have either.
      const refused = !ui.getState().pending.deliver();
      const style = styleQueue.current;
      const unsaved = refused || live.current.autosave?.getSnapshot().warnOnClose === true || style.busy || style.next !== null || ui.getState().customCssDraft !== null;
      if (unsaved) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ui]);

  const isOpen = useCallback((id: number) => loaded.current === id, []);
  const session = useMemo<Session>(() => ({
    pages, parts, current, autosave, capabilities: adapter.capabilities, cmsOrigin, publishedView, entryView, publishing, styleSave,
    openPage, isOpen, createPage, makePage, setSlug, preview, publish, schedulePublish, scheduling, cancelSchedule, reload, keepMine, saveSiteStyle,
    versions, loadVersions, saveVersion, restoreVersion, restoring,
  }), [pages, parts, current, autosave, adapter, cmsOrigin, publishedView, entryView, publishing, styleSave, openPage, isOpen, createPage, makePage, setSlug, preview, publish, schedulePublish, scheduling, cancelSchedule, reload, keepMine, saveSiteStyle, versions, loadVersions, saveVersion, restoreVersion, restoring]);
  // The form responses' screen reads through the adapter, when it keeps
  // them (./responses/context.ts), and the collections' screen the same
  // way (./collections/context.ts).
  const responses = useMemo(() => responsesOf(adapter), [adapter]);
  const collections = useMemo(() => collectionsOf(adapter), [adapter]);
  // A drawer shows only with a page open: each is about the page.
  const drawer = useStore(env.ui, (state) => (status.kind === "ready" ? state.drawer : null));
  const sidebarOpen = useStore(env.ui, (state) => state.sidebarOpen);
  // The editor's own layout, from its window (./layout-mode.ts): on a
  // tablet the sidebar and the drawers float over the canvas, on a phone
  // they are sheets and the bar at the foot holds the keys. Only in the
  // wide layout does a drawer take its room from the canvas, Insert as the
  // Outline and History do.
  const layout = useLayoutMode();
  const pushed = layout === "wide" && pushes(drawer, layout);
  useLayoutEffect(() => {
    env.ui.getState().setOnePanel(layout !== "wide");
  }, [env, layout]);

  return (
    <EditorProvider env={env}>
      <AssistantProvider value={assistant}>
      <SessionProvider value={session}>
        <MediaProvider adapter={adapter} inBrowser={cmsOrigin === null}>
          <ResponsesProvider value={responses}>
          <CollectionsProvider value={collections}>
            <DragLayer>
              {/* In the order the Tab key goes: the top bar, the drawer, the
                  canvas, the sidebar (Tab from the selection reaches its
                  settings), then the bottom line. The grid places each. */}
              <div className={`app${sidebarOpen ? "" : " app-wide"}${pushed ? " app-pushed" : ""}${foot ? " app-foot" : ""}`} data-layout={layout}>
                <TopBar />
                <ConflictBanner />
                {drawer === "insert" && <DrawerShell which="insert"><Palette /></DrawerShell>}
                {drawer === "outline" && <DrawerShell which="outline"><Navigator /></DrawerShell>}
                {drawer === "history" && <DrawerShell which="history"><HistoryPanel /></DrawerShell>}
                {drawer === "assistant" && <DrawerShell which="assistant"><AssistantPanel /></DrawerShell>}
                {status.kind === "ready" ? <Canvas /> : <Bench status={status} onRetry={() => setAttempt((n) => n + 1)} />}
                <Sidebar />
                <StatusBar />
                {layout === "narrow" && status.kind === "ready" && <PhoneBar />}
                {foot}
              </div>
            </DragLayer>
            <EditorKeys />
            <BlockMenu />
            <ShortcutsDialog />
            <AboutDialog />
            <CollectionsScreen />
            <SaveToast />
            <Notice />
          </CollectionsProvider>
          </ResponsesProvider>
        </MediaProvider>
      </SessionProvider>
      </AssistantProvider>
    </EditorProvider>
  );
}

// Why the undo history is empty after the page on the canvas was replaced
// by one from the server.
const UNDO_AGAIN = "Undo starts again from here: its steps belonged to the page that was replaced.";

// The name of the version Keep mine keeps of the page it saves over.
export const KEPT_BEFORE_OVERWRITE = "Before Keep mine";

// The autosave takes the restored draft, unless a save went out after all
// (it refuses then): the caller falls back on the conflict's way.
function adopt(saving: Autosave, draft: Draft): boolean {
  try {
    saving.adopt(draft);
    return true;
  } catch {
    return false;
  }
}

// What a restore did, in one notice: which version came back (by its own
// time and name, as the panel lists it), where the draft it replaced is
// kept, and why undo starts again.
export function restoredSentence(result: RestoreResult, shown: readonly Version[], now: number, timeZone?: string): string {
  const source = shown.find((v) => v.number === result.version.restoredFrom);
  const which = source ? versionInSentence(source, now, timeZone) : `version ${result.version.restoredFrom ?? "?"}`;
  const kept = result.kept ? " The draft it replaced is kept in Versions, as “Before restoring”." : "";
  return `Restored ${which}.${kept} ${UNDO_AGAIN}`;
}

// The longest wait a browser's setTimeout keeps: past 2^31 - 1 ms it fires
// at once.
const LONGEST_TIMER_MS = 2_147_483_647;

// Once a scheduled publish's time has passed: how many reads, three
// seconds apart, then one every SLOW_READ_MS.
const QUICK_READS = 20;
const SLOW_READ_MS = 30_000;

// What became of a scheduled publish that could not be cancelled any more.
export function tooLateToCancel(state: ScheduleState): string {
  switch (state) {
    case "published":
      return "Not cancelled: the scheduled publish has already happened. Visitors see those changes now.";
    case "replaced":
      return "Not cancelled: that scheduled publish was replaced by a newer one, shown now.";
    case "cancelled":
      return "That scheduled publish was already cancelled.";
    case "superseded":
      return "Not cancelled: a publish since then already put those changes live, so it had nothing left to do.";
    case "failed":
      return "Not cancelled: that scheduled publish failed, and nothing went live.";
    case "pending":
      return "Not cancelled: the CMS says it still waits. Try again.";
  }
}

// Why what waits for a save did not go ahead, as the end of a sentence.
function unsavedWhy(phase: SavePhase, server: string): string {
  switch (phase) {
    case "conflict":
      return "the page was changed in another tab. Choose Reload or Keep mine first.";
    case "retrying":
      return "the changes are not saved yet, and the editor is trying again.";
    case "invalid":
      return `${server} refused a value. Fix the field it marks first.`;
    case "refused":
      return `${server} refused the save.`;
    default:
      return "the changes are not saved yet.";
  }
}

// The canvas's place while there is no page to show on it. An editor that
// could not start says why, with Try again, or with Reload this tab when
// only that gets past it, as on a refused save (./SaveStatus.tsx).
function Bench({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <main className="canvas chrome" aria-label="Page canvas" aria-busy={status.kind === "loading" ? true : undefined}>
      {status.kind === "loading" && <div className="bench-note" role="status"><h2>Opening the page…</h2></div>}
      {status.kind === "failed" && (
        <div className="bench-note" role="alert">
          <h2>Nothing to edit yet</h2>
          <p>{status.message}</p>
          {status.reload
            ? <button className="btn btn-dark" type="button" onClick={() => thisTab.reload()}><Icon name="refresh" />Reload this tab</button>
            : <button className="btn btn-dark" type="button" onClick={onRetry}><Icon name="refresh" />Try again</button>}
        </div>
      )}
      {status.kind === "no-pages" && (
        <div className="bench-note">
          <h2>This site has no pages yet</h2>
          <p>Make the first one: give it a title and an address, then add its sections.</p>
          <button className="btn btn-dark" type="button" onClick={() => setCreating(true)}><Icon name="plus" />New page</button>
          {creating && <NewPageDialog onClose={() => setCreating(false)} />}
        </div>
      )}
    </main>
  );
}

// One sentence about what just happened, or why nothing did.
//
// Dismiss takes the notice away, and the focus with it if it was there: it
// goes back to the control the person came to Dismiss from, else to Publish
// (the notice most often says how a publish went), else to the page, never
// to the document, where the next Tab would start again from the top.
//
// Came from by a click, a shortcut or the editor, that is the last control
// the focus was on. Came from by a walk with Tab, it is where the walk set
// out from, the last control the person chose (clicked, pressed a key in,
// or was put on) rather than only passed through: the notice comes last in
// the page, so the walk's last step before it is whatever control ends the
// page (in the demo, the bottom line's link), and from there the next Tab
// would have nowhere to go but out of the page. A click or a key elsewhere
// that already took the focus is left alone.
export function Notice() {
  const notice = useUi((u) => u.notice);
  const link = useUi((u) => u.noticeLink);
  const say = useUi((u) => u.say);
  const last = useRef<HTMLElement | null>(null);
  const chosen = useRef<HTMLElement | null>(null);
  const walkedIn = useRef(false);
  useEffect(() => {
    let walking = false;
    const inNotice = (target: EventTarget | null) => target instanceof Element && target.closest(".notice") !== null;
    const control = (target: EventTarget | null): target is HTMLElement => target instanceof HTMLElement && target !== document.body && !inNotice(target);
    const key = (event: KeyboardEvent) => {
      // Shift, held for Shift+Tab, is neither a step nor a choice.
      if (MODIFIERS.has(event.key)) return;
      walking = event.key === "Tab";
      if (!walking && control(event.target)) chosen.current = event.target;
    };
    const pointer = () => {
      walking = false;
    };
    const focus = (event: FocusEvent) => {
      if (control(event.target)) {
        last.current = event.target;
        if (!walking) chosen.current = event.target;
      } else if (inNotice(event.target) && !inNotice(event.relatedTarget)) {
        walkedIn.current = walking;
      }
      walking = false;
    };
    // Captured, so a key a dialog keeps to itself is still seen.
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("focusin", focus, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("focusin", focus, true);
    };
  }, []);
  const dismiss = () => {
    const back = walkedIn.current ? chosen.current : last.current;
    say(null);
    afterRender(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      for (const target of [back?.isConnected ? back : null, document.querySelector<HTMLElement>(".split-main"), document.querySelector<HTMLElement>(".canvas")]) {
        target?.focus();
        if (target && document.activeElement === target) return;
      }
    });
  };
  return (
    <div role="status" aria-live="polite" className="chrome">
      {notice && (
        <div className="notice">
          <span>{notice}</span>
          {link && <a className="notice-link" href={link.href} target="_blank" rel="noopener">{link.label}<Icon name="external" className="i i-xs" /></a>}
          <button className="ibtn ibtn-small" type="button" aria-label="Dismiss" onClick={dismiss}><Icon name="close" className="i i-xs" /></button>
        </div>
      )}
    </div>
  );
}
