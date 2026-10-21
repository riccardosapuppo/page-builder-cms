// The page being edited, as the shell (./App.tsx) holds it: the site's
// pages and its parts (the header and the footer, edited as pages are),
// the one open, its autosave, and the operations on pages that are not
// commands on the document (open another, make a new one, change its
// address, preview it, publish it now or at a set time, settle a conflict,
// keep a version of it and restore one), and the one way to the server of
// the site style. Given to the interface through a context, so a panel or
// a test can be drawn with a session of its own making.
import { createContext, useContext, useMemo } from "react";
import type { Autosave } from "../storage/autosave.ts";
import type { PageDocument } from "../shared/document.ts";
import type { Capabilities, FieldError, NewPage, PageKind, PageLinks, PageSummary, PartKind, Published, Schedule, SiteStyleChange, Version } from "../storage/adapter.ts";
import { DEFAULT_CMS_ORIGIN } from "../storage/config.ts";

export interface OpenPage {
  id: number;
  // A page, or the site's header or footer, which has no address and is
  // drawn on every page.
  kind: PageKind;
  // The address the next publish applies (null for a part), and whether
  // the root serves it.
  slug: string | null;
  home: boolean;
  published: Published | null;
  // The draft's revision when the page was opened; the autosave's
  // snapshot has it from then on.
  revision: number;
  // Where its draft's preview and its live page are: paths on the CMS's
  // origin (Session.cmsOrigin).
  links: Pick<PageLinks, "preview" | "live">;
  // The publish set for a time and still waiting for it; absent or null
  // when there is none.
  scheduled?: Schedule | null;
  // A collection's template: the collection whose entries it draws, its
  // name and the prefix of their addresses; absent for any other page,
  // null when the storage could not say.
  collection?: TemplateOf | null;
}

// The collection a template belongs to, as its words name it.
export interface TemplateOf {
  id: number;
  name: string;
  prefix: string;
}

// Where the site style's last change is: on its way, confirmed, or refused
// with the reason. Kept apart from the page's own save state: the two are
// different things saved by different requests.
export type StyleSave = { phase: "idle" | "saving" | "saved" } | { phase: "failed"; message: string };

// The open page's kept versions, newest first, as the CMS last listed them:
// kept on screen while they are read again, with why the last read failed,
// and whether only a reload of this tab gets past that (the browser's
// storage deleted or upgraded in another tab: ./SaveStatus.tsx,
// RELOAD_ONLY), where reading again would be refused again.
export interface VersionList {
  phase: "idle" | "loading" | "ready" | "failed";
  items: readonly Version[];
  message: string | null;
  reload?: boolean;
}

export const NO_VERSIONS: VersionList = { phase: "idle", items: [], message: null };

// What replacing a part answers: the draft it replaced; why not, for sure;
// or, the answer to its save lost and the draft not to be read back to
// tell, that it may be saved over `replaced`, which a version holds.
export type PartReplaced =
  | { ok: true; replaced: PageDocument }
  | { ok: false; why: string; unknown?: undefined }
  | { ok: false; why: string; unknown: true; replaced: PageDocument };

export interface Session {
  pages: readonly PageSummary[];
  // The site's header then its footer, opened by their ids as pages are.
  parts: readonly PageSummary[];
  current: OpenPage | null;
  autosave: Autosave | null;
  // What the storage has: no control is drawn for what it lacks.
  capabilities: Capabilities;
  // The CMS's own origin, where the preview and the live page open
  // (../storage/config.ts); null with no CMS, in the browser demo, whose
  // pages are kept in this browser.
  cmsOrigin: string | null;
  // Where a page as published in the browser opens, when the storage
  // serves no live page (the demo's own drawing of it); null otherwise.
  publishedView: ((pageId: number) => string) | null;
  // The same for an entry of a collection, published in the browser.
  entryView: ((entryId: number) => string) | null;
  // A publish is on its way.
  publishing: boolean;
  styleSave: StyleSave;
  // Opens a page; resolves with why it did not, or null: null too when a
  // later open took its place, so isOpen says which page is open.
  openPage(id: number): Promise<string | null>;
  // Whether the page of `id` is the one open now, read when asked, not at
  // the session's last render.
  isOpen(id: number): boolean;
  // Makes a page and opens it; resolves with the server's findings, or null.
  createPage(page: NewPage): Promise<FieldError[] | null>;
  // The same, giving the new page's id: for the Assistant, which writes
  // into the page it made only while isOpen says it is still open.
  makePage(page: NewPage): Promise<{ ok: true; id: number } | { ok: false; errors: FieldError[] }>;
  // Changes the open page's address; resolves with the server's findings,
  // or null.
  setSlug(slug: string): Promise<FieldError[] | null>;
  // Opens the draft's preview in a new tab, once the edits waiting have
  // been sent. Called from a click or a key, while the browser still lets
  // the page open a tab.
  preview(): void;
  // Saves what waits, then puts the draft live; says how it went.
  publish(): Promise<void>;
  // Saves what waits, then sets the draft at the revision just saved to go
  // live at `at` (ISO 8601, UTC); resolves with the CMS's findings (at
  // /at for the time), or null once it is set. A schedule on its way is
  // `scheduling`.
  schedulePublish(at: string): Promise<FieldError[] | null>;
  scheduling: boolean;
  // Cancels the open page's pending schedule; says how it went, or what
  // became of it when it was too late.
  cancelSchedule(): Promise<void>;
  // The draft moved on the server: take the server's (reload), or save
  // this tab's over it (keepMine).
  reload(): Promise<void>;
  keepMine(): Promise<void> | void;
  // The site style: the canvas follows at once, the server after.
  saveSiteStyle(change: SiteStyleChange): void;
  // The same, in the same line of requests, for one who waits for it (the
  // Assistant's new site): resolves once the storage has kept it, with
  // null, or with why not.
  applySiteStyle(change: SiteStyleChange): Promise<string | null>;
  // A part's draft replaced by `document`, every draft it saves over kept
  // first as a version named `keep`, so History brings it back, unless it
  // is `ours` (the document the Assistant saved there itself): the draft is
  // read, kept, then saved over at the revision read, and a save from
  // elsewhere in between is kept in turn. The canvas draws the new one at
  // once. A part open in the editor takes it as a step of the Assistant's,
  // its edits saved and kept first. A save whose answer is lost is told
  // from the draft read back. Resolves with the document it replaced, why
  // not, or that it may be saved (PartReplaced).
  replacePart(kind: PartKind, document: PageDocument, keep: string, ours?: PageDocument | null): Promise<PartReplaced>;
  // A page's draft changed by `change`, given the page as it is (null:
  // nothing to change): while it is open, as one step of the Assistant's
  // named by `label`; else read and saved at the revision read, a save from
  // elsewhere in between read and changed again. Null once saved, or why not.
  changeDraft(id: number, change: (doc: PageDocument) => { document: PageDocument; label: string } | null): Promise<string | null>;
  // Makes the page of `id` the one the site's root address serves: null,
  // or why not.
  setHome(id: number): Promise<string | null>;
  // Publishes each page or part of `ids` as its draft is, the open one's
  // edits saved first, one after the other: for each, null once published,
  // or why not.
  publishAll(ids: readonly number[]): Promise<Array<{ id: number; why: string | null }>>;
  // The browser demo's way back to its example site, asked for by the
  // person (../demo/main.tsx): its pages, style and parts as the demo
  // first gives them, this browser's own let go of. Null with a CMS.
  startOver: (() => Promise<void>) | null;
  // The open page's versions (./HistoryPanel.tsx), read again by
  // loadVersions().
  versions: VersionList;
  loadVersions(): void;
  // "Save version": the edits waiting are saved first, then the draft is
  // kept under the name ("" for none); resolves with the server's findings
  // about the name, or null.
  saveVersion(name: string): Promise<FieldError[] | null>;
  // Copies a version back into the draft, once the edits waiting are
  // saved; the notice says how it went.
  restoreVersion(number: number): Promise<void>;
  // The version a restore is copying back, while it is on its way.
  restoring: number | null;
}

const SessionContext = createContext<Session | null>(null);
export const SessionProvider = SessionContext.Provider;

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("a page component was drawn outside SessionProvider");
  return session;
}

// For the parts that work without a page session too (the keyboard's
// listener in a test of its own).
export function useOptionalSession(): Session | null {
  return useContext(SessionContext);
}

// The site's pages as addresses a link field offers to choose from: "/"
// for the home page, "/<slug>" for the others, each named by its title.
export function usePageLinks(): Array<{ value: string; label: string }> {
  const pages = useOptionalSession()?.pages;
  return useMemo(() => (pages ?? []).map((page) => ({ value: page.home ? "/" : `/${page.slug ?? ""}`, label: page.title })), [pages]);
}

// What the open document is: a page, or the header or the footer.
export function useOpenKind(): PageKind {
  return useOptionalSession()?.current?.kind ?? "page";
}

// The part of that kind, as the session lists it, if it has.
export function partOf(session: Pick<Session, "parts">, kind: PartKind): PageSummary | undefined {
  return session.parts.find((part) => part.kind === kind);
}

// How the interface names a part: "Header", "Footer".
export const PART_NAMES: Readonly<Record<PartKind, string>> = { header: "Header", footer: "Footer" };

// How the interface names the collection a template draws: "News", or,
// when the storage could not say which, "its collection".
export const templateOf = (page: Pick<OpenPage, "collection">): string => page.collection?.name ?? "its collection";

// A session with nothing open and every operation doing nothing, for a
// test to complete with what it needs.
export function emptySession(changes: Partial<Session> = {}): Session {
  return {
    pages: [],
    parts: [],
    current: null,
    autosave: null,
    capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true, collections: false, shop: false },
    cmsOrigin: DEFAULT_CMS_ORIGIN,
    publishedView: null,
    entryView: null,
    publishing: false,
    styleSave: { phase: "idle" },
    openPage: async () => null,
    isOpen: (id) => changes.current?.id === id,
    createPage: async () => null,
    makePage: async () => ({ ok: false, errors: [{ pointer: "", keyword: "unknown", blockPointer: null, message: "No page can be made here." }] }),
    setSlug: async () => null,
    preview: () => {},
    publish: async () => {},
    schedulePublish: async () => null,
    scheduling: false,
    cancelSchedule: async () => {},
    reload: async () => {},
    keepMine: () => {},
    saveSiteStyle: () => {},
    applySiteStyle: async () => null,
    replacePart: async (_kind, document) => ({ ok: true, replaced: document }),
    changeDraft: async () => null,
    setHome: async () => null,
    publishAll: async (ids) => ids.map((id) => ({ id, why: null })),
    startOver: null,
    versions: NO_VERSIONS,
    loadVersions: () => {},
    saveVersion: async () => null,
    restoreVersion: async () => {},
    restoring: null,
    ...changes,
  };
}

// How a sentence names where the pages are kept: the CMS's server or, with
// no CMS (the browser demo), this browser.
export function keptWords(cmsOrigin: string | null) {
  return cmsOrigin === null
    ? { there: "saved in this browser", restored: "Restored in this browser", unsaved: "changes this browser has not saved yet", keeper: "this browser's storage", Keeper: "This browser's storage", server: "this browser's storage", Server: "This browser's storage" }
    : { there: "on the server", restored: "Restored on the server", unsaved: "changes the server has not saved yet", keeper: "the CMS", Keeper: "The CMS", server: "the server", Server: "The server" };
}

// The same for the session in hand; the CMS's words where a part is drawn
// without one (a test of its own).
export function useKeptWords() {
  const session = useOptionalSession();
  // (Not the default origin itself: the browser build may not hold it.)
  return keptWords(session ? session.cmsOrigin : "the CMS");
}

// How a sentence names a page that was published: put in front of visitors
// ("live") where the storage serves pages (the CMS), or only kept and shown
// by the editor ("published") where it serves none (the browser demo, whose
// pages have no address of their own).
export function publishWords(livePages: boolean) {
  return livePages
    ? {
        homeLine: "The home page, the first one visitors see",
        searchTitle: "Shown in the browser tab and in search results.",
        searchText: "Search engines show it under the title. Up to 160 characters.",
        newAddress: "Lowercase letters, digits and hyphens. Visitors find the page there once it is published.",
        latest: "live now",
        draftSame: "The same as the live page",
        restoring: "Restoring copies that version into your draft. Nothing goes live until you publish.",
        notLive: (changes: string) => `${changes} not live`,
        newAddressNotLive: "new address not live",
        nothingWent: "Nothing went live.",
        maybe: "the page may be live or not. Open the live page to see, or publish again.",
      }
    : {
        homeLine: "The home page of the site",
        searchTitle: "Shown in the browser tab and, in the full system, in search results.",
        searchText: "In the full system, search engines show it under the title. Up to 160 characters.",
        newAddress: "Lowercase letters, digits and hyphens. In the full system, visitors find the page there once it is published.",
        latest: "latest publish",
        draftSame: "The same as the published page",
        restoring: "Restoring copies that version into your draft. The published page stays as it is until you publish.",
        notLive: (changes: string) => `${changes} to publish`,
        newAddressNotLive: "new address to publish",
        nothingWent: "Nothing was published.",
        maybe: "the page may be published or not. Publish again to be sure.",
      };
}

// Lowercase letters, digits and hyphens, from a title: the address a new
// page is offered. "Winter series" is winter-series.
export function slugFrom(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}
