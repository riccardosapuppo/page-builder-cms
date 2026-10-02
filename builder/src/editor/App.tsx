// The editor's shell, on the approved design (design/shots/editor.png): top
// bar, the widget and property tray on the left, the canvas, the navigator
// on the right. It holds the page being edited: it reads the site's pages,
// media library and site style through the storage adapter, opens a page
// (its draft upgraded and checked, openDocument, before the store takes
// it), and gives every new document the store makes to the page's
// autosave. Nothing here talks to a server but through the adapter.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { openDocument } from "../document/upgrade.ts";
import type { PageDocument } from "../shared/document.ts";
import { errorsByBlock, isStorageError, type FieldError, type NewPage, type PageSummary, type StorageAdapter } from "../storage/adapter.ts";
import { createAutosave, type Autosave } from "../storage/autosave.ts";
import { Canvas } from "./Canvas.tsx";
import { EditorProvider, useUi, type EditorEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { LeftTray } from "./LeftTray.tsx";
import { Navigator } from "./Navigator.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { SessionProvider, type OpenPage, type Session } from "./session.tsx";
import { TopBar } from "./TopBar.tsx";

// Where the open page is remembered, so a reload opens it again: the
// address's ?page=<id>.
export interface PageAddress {
  read(): number | null;
  write(id: number): void;
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

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "no-pages" }
  | { kind: "failed"; message: string };

interface AppProps {
  env: EditorEnv;
  adapter: StorageAdapter;
  address?: PageAddress;
}

export function App({ env, adapter, address = locationAddress }: AppProps) {
  const { store, ui, clock } = env;
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [pages, setPages] = useState<readonly PageSummary[]>([]);
  const [current, setCurrent] = useState<OpenPage | null>(null);
  const [autosave, setAutosave] = useState<Autosave | null>(null);
  const [attempt, setAttempt] = useState(0);
  const live = useRef<{ autosave: Autosave | null; unsubscribe: () => void }>({ autosave: null, unsubscribe: () => {} });

  const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

  const refreshPages = useCallback(async () => {
    const list = await adapter.listPages();
    setPages(list);
    return list;
  }, [adapter]);

  const openPage = useCallback(async (id: number): Promise<string | null> => {
    const previous = live.current.autosave;
    if (previous) {
      const settled = await previous.flush();
      if (settled.warnOnClose) return "This page has changes the server has not saved yet: it stays open until they are saved.";
    }
    let page;
    try {
      page = await adapter.getPage(id);
    } catch (error) {
      return `The page could not be opened: ${describe(error)}`;
    }
    const opened = openDocument(page.draft.document);
    if (!opened.ok) return `The page could not be opened: ${opened.errors[0]?.message ?? "its document is not valid"}.`;

    live.current.unsubscribe();
    previous?.dispose();
    store.getState().load(opened.document);
    ui.setState({ serverErrors: [], hover: null, notice: null, tray: "edit", panelTab: "content" });

    // The document of each save, so the server's errors can be put on the
    // blocks of the document they were about.
    let sent: PageDocument = opened.document;
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
      document: opened.document,
      savedAt: page.draft.updatedAt,
      clock,
    });
    const stopEdits = store.subscribe((state, before) => {
      if (state.document !== before.document) saving.edit(state.document);
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
    };
    setAutosave(saving);
    setCurrent({ id: page.page.id, slug: page.page.slug, home: page.page.home, published: page.published, savedAt: page.draft.updatedAt });
    setStatus({ kind: "ready" });
    address.write(page.page.id);
    return null;
  }, [adapter, address, clock, store, ui]);

  // The site as the editor starts on it: its pages, library and style;
  // then the page the address names, else the home page, else the first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus({ kind: "loading" });
      try {
        const [list, media, style] = await Promise.all([adapter.listPages(), adapter.listMedia(), adapter.getSiteStyle()]);
        if (cancelled) return;
        setPages(list);
        ui.getState().setMedia(media);
        ui.getState().setSiteStyle(style);
        const wanted = address.read();
        const first = list.find((p) => p.id === wanted) ?? list.find((p) => p.home) ?? list[0];
        if (!first) {
          setStatus({ kind: "no-pages" });
          return;
        }
        const why = await openPage(first.id);
        if (!cancelled && why) setStatus({ kind: "failed", message: why });
      } catch (error) {
        if (!cancelled) setStatus({ kind: "failed", message: `The editor could not reach the CMS: ${describe(error)}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, address, attempt, openPage, ui]);

  // Closing the tab while edits are only here asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (live.current.autosave?.getSnapshot().warnOnClose) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => () => {
    live.current.unsubscribe();
    live.current.autosave?.dispose();
  }, []);

  const createPage = useCallback(async (page: NewPage): Promise<FieldError[] | null> => {
    let outcome;
    try {
      outcome = await adapter.createPage(page);
    } catch (error) {
      return [{ pointer: "", keyword: "unknown", blockPointer: null, message: `The page could not be made: ${describe(error)}` }];
    }
    if (!outcome.ok) return outcome.problem.errors.length > 0 ? outcome.problem.errors : [{ pointer: "", keyword: "invalid", blockPointer: null, message: outcome.problem.message }];
    await refreshPages().catch(() => undefined);
    const why = await openPage(outcome.value.page.id);
    if (why) ui.getState().say(why);
    return null;
  }, [adapter, openPage, refreshPages, ui]);

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

  const session = useMemo<Session>(() => ({ pages, current, autosave, openPage, createPage, setSlug }), [pages, current, autosave, openPage, createPage, setSlug]);
  const navigatorOpen = useStoreNavigator(env);

  return (
    <EditorProvider env={env}>
      <SessionProvider value={session}>
        <div className={`app${navigatorOpen ? "" : " nav-closed"}`}>
          <TopBar />
          <LeftTray />
          {status.kind === "ready" ? <Canvas /> : <Bench status={status} onRetry={() => setAttempt((n) => n + 1)} />}
          <Navigator />
        </div>
        <Notice />
      </SessionProvider>
    </EditorProvider>
  );
}

// Read here, above the provider the other parts read it through.
function useStoreNavigator(env: EditorEnv): boolean {
  return useStore(env.ui, (state) => state.navigatorOpen);
}

// The canvas's place while there is no page to show on it.
function Bench({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <main className="canvas chrome" aria-label="Page canvas" aria-busy={status.kind === "loading" ? true : undefined}>
      {status.kind === "loading" && <div className="bench-note" role="status"><h2>Opening the page…</h2></div>}
      {status.kind === "failed" && (
        <div className="bench-note" role="alert">
          <h2>Nothing to edit yet</h2>
          <p>{status.message}</p>
          <button className="btn btn-dark" type="button" onClick={onRetry}><Icon name="refresh" />Try again</button>
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
function Notice() {
  const notice = useUi((u) => u.notice);
  const say = useUi((u) => u.say);
  return (
    <div role="status" aria-live="polite" className="chrome">
      {notice && (
        <div className="notice">
          <span>{notice}</span>
          <button className="ibtn ibtn-small" type="button" aria-label="Dismiss" onClick={() => say(null)}><Icon name="close" className="i i-xs" /></button>
        </div>
      )}
    </div>
  );
}
