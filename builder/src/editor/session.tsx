// The page being edited, as the shell (./App.tsx) holds it: the site's
// pages, the one open, its autosave, and the operations on pages that are
// not commands on the document (open another, make a new one, change its
// address). Given to the interface through a context, so a panel or a test
// can be drawn with a session of its own making.
import { createContext, useContext } from "react";
import type { Autosave } from "../storage/autosave.ts";
import type { FieldError, NewPage, PageSummary, Published } from "../storage/adapter.ts";

export interface OpenPage {
  id: number;
  // The address the next publish applies, and whether the root serves it.
  slug: string;
  home: boolean;
  published: Published | null;
  // The draft's last save the server confirmed when the page was opened.
  savedAt: string | null;
}

export interface Session {
  pages: readonly PageSummary[];
  current: OpenPage | null;
  autosave: Autosave | null;
  // Opens a page; resolves with why it did not, or null.
  openPage(id: number): Promise<string | null>;
  // Makes a page and opens it; resolves with the server's findings, or null.
  createPage(page: NewPage): Promise<FieldError[] | null>;
  // Changes the open page's address; resolves with the server's findings,
  // or null.
  setSlug(slug: string): Promise<FieldError[] | null>;
}

const SessionContext = createContext<Session | null>(null);
export const SessionProvider = SessionContext.Provider;

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("a page component was drawn outside SessionProvider");
  return session;
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
