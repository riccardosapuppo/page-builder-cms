// The page being edited, as the shell (./App.tsx) holds it: the site's
// pages, the one open, its autosave, and the operations on pages that are
// not commands on the document (open another, make a new one, change its
// address, preview it, publish it, settle a conflict), and the site style's
// one way to the server. Given to the interface through a context, so a
// panel or a test can be drawn with a session of its own making.
import { createContext, useContext, useMemo } from "react";
import type { Autosave } from "../storage/autosave.ts";
import type { Capabilities, FieldError, NewPage, PageLinks, PageSummary, Published, SiteStyleChange } from "../storage/adapter.ts";
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
}

// Where the site style's last change is: on its way, confirmed, or refused
// with the reason. Kept apart from the page's own save state: the two are
// different things saved by different requests.
export type StyleSave = { phase: "idle" | "saving" | "saved" } | { phase: "failed"; message: string };

export interface Session {
  pages: readonly PageSummary[];
  current: OpenPage | null;
  autosave: Autosave | null;
  // What the storage has: no control is drawn for what it lacks.
  capabilities: Capabilities;
  // The CMS's own origin, where the preview and the live page open
  // (../storage/config.ts).
  cmsOrigin: string;
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
  // The draft moved on the server: take the server's (reload), or save
  // this tab's over it (keepMine).
  reload(): Promise<void>;
  keepMine(): void;
  // The site style: the canvas follows at once, the server after.
  saveSiteStyle(change: SiteStyleChange): void;
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
    capabilities: { publish: true, schedule: false, responses: false },
    cmsOrigin: DEFAULT_CMS_ORIGIN,
    publishing: false,
    styleSave: { phase: "idle" },
    openPage: async () => null,
    createPage: async () => null,
    setSlug: async () => null,
    preview: () => {},
    publish: async () => {},
    reload: async () => {},
    keepMine: () => {},
    saveSiteStyle: () => {},
    ...changes,
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
