// The page being edited, as the shell (./App.tsx) holds it: the site's
// pages, the one open, its autosave, and the operations on pages that are
// not commands on the document (open another, make a new one, change its
// address, preview it, publish it now or at a set time, settle a conflict,
// keep a version of it and restore one), and the one way to the server of
// the site style and of the header and footer. Given to the interface
// through a context, so a panel or a test can be drawn with a session of
// its own making.
import { createContext, useContext, useMemo } from "react";
import type { Autosave } from "../storage/autosave.ts";
import type { Capabilities, FieldError, NewPage, PageLinks, PageSummary, Published, Schedule, SiteStyleChange, SiteValues, Version } from "../storage/adapter.ts";
import { DEFAULT_CMS_ORIGIN } from "../storage/config.ts";

export interface OpenPage {
  id: number;
  // The address the next publish applies, and whether the root serves it.
  slug: string;
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
}

// Where the site style's last change is: on its way, confirmed, or refused
// with the reason. Kept apart from the page's own save state: the two are
// different things saved by different requests.
export type StyleSave = { phase: "idle" | "saving" | "saved" } | { phase: "failed"; message: string };

// Where the header and footer's last save is: on its way, kept, refused
// with the reason (the values at fault are the interface store's
// siteErrors), or stopped by a change another tab saved first, held here
// with the revision it is at until the person chooses: take it (reload),
// or save this tab's over it.
export type SiteSave =
  | { phase: "idle" | "saving" | "saved" }
  // marked: refused for values the panel marks, each at its place.
  | { phase: "failed"; message: string; marked: boolean }
  | { phase: "conflict"; revision: number; theirs: SiteValues };

// What a save of the header and footer came to, for the panel to put the
// focus where the person has to look next.
export type SiteSaveResult = "saved" | "invalid" | "conflict" | "failed" | "busy";

// A section a link can lead to: its anchor, and the label the editor
// names it by, if it has one.
export interface SectionTarget {
  anchor: string;
  label: string | null;
}

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

export interface Session {
  pages: readonly PageSummary[];
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
  // A publish is on its way.
  publishing: boolean;
  styleSave: StyleSave;
  // Opens a page; resolves with why it did not, or null.
  openPage(id: number): Promise<string | null>;
  // Makes a page and opens it; resolves with the server's findings, or null.
  createPage(page: NewPage): Promise<FieldError[] | null>;
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
  // The header and footer: the canvas follows the panel's values as they
  // are typed (the interface store's siteDraft), and they reach the
  // storage, and every published page, when the person saves them.
  siteSave: SiteSave;
  // Checks the values as the storage will, then sends them whole from the
  // revision read (or `from`, the revision a conflict named, to save them
  // over another tab's); says what it came to.
  saveSite(values: SiteValues, from?: number): Promise<SiteSaveResult>;
  // Takes the header and footer as the storage has them now, leaving this
  // tab's change.
  reloadSite(): Promise<void>;
  // The sections of a page a link can lead to, from its draft; null when
  // the page cannot be read.
  pageSections(pageId: number): Promise<readonly SectionTarget[] | null>;
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
  return useMemo(() => (pages ?? []).map((page) => ({ value: page.home ? "/" : `/${page.slug}`, label: page.title })), [pages]);
}

// A session with nothing open and every operation doing nothing, for a
// test to complete with what it needs.
export function emptySession(changes: Partial<Session> = {}): Session {
  return {
    pages: [],
    current: null,
    autosave: null,
    capabilities: { publish: true, schedule: false, responses: false, headerFooter: false, imageVariants: false, livePages: true },
    cmsOrigin: DEFAULT_CMS_ORIGIN,
    publishedView: null,
    publishing: false,
    styleSave: { phase: "idle" },
    openPage: async () => null,
    createPage: async () => null,
    setSlug: async () => null,
    preview: () => {},
    publish: async () => {},
    schedulePublish: async () => null,
    scheduling: false,
    cancelSchedule: async () => {},
    reload: async () => {},
    keepMine: () => {},
    saveSiteStyle: () => {},
    siteSave: { phase: "idle" },
    saveSite: async () => "saved",
    reloadSite: async () => {},
    pageSections: async () => [],
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
