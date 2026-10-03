// The editor's shell, on the approved design (design/shots/editor.png): top
// bar, the widget and property tray on the left, the canvas, the navigator
// on the right. It holds the page being edited: it reads the site's pages,
// media library and site style through the storage adapter, opens a page
// (its draft upgraded and checked, openDocument, before the store takes
// it), and gives every new document the store makes to the page's
// autosave. Nothing here talks to a server but through the adapter.
//
// It also publishes: the edits waiting are saved first (flush), then the
// draft is put live at the revision just saved, so what goes live is what
// the editor shows; the preview and the live page open on the CMS's own
// origin (../storage/config.ts). It settles a conflict the person's way
// (reload, keep mine), and sends the site style's changes, one request at
// a time, the latest change last.
//
// Around it all: drag and drop (./drag/DragLayer.tsx), the keyboard map
// (./keys.ts) and its "?" window, the selected block's menu, the save
// state's banner and toast (./SaveStatus.tsx) and About.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { openDocument } from "../document/upgrade.ts";
import type { PageDocument } from "../shared/document.ts";
import { errorsByBlock, isStorageError, type FieldError, type NewPage, type PageSummary, type SiteStyle, type SiteStyleChange, type StorageAdapter } from "../storage/adapter.ts";
import { createAutosave, type Autosave, type SavePhase } from "../storage/autosave.ts";
import { cmsAddress, cmsOrigin as configuredCmsOrigin } from "../storage/config.ts";
import { AboutDialog } from "./AboutDialog.tsx";
import { BlockMenu } from "./BlockMenu.tsx";
import { Canvas } from "./Canvas.tsx";
import { EditorProvider, useUi, type EditorEnv } from "./context.tsx";
import { DragLayer } from "./drag/DragLayer.tsx";
import { Icon } from "./icons.tsx";
import { LeftTray } from "./LeftTray.tsx";
import { Navigator } from "./Navigator.tsx";
import { EditorKeys } from "./keys.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { shownAddress } from "./Publish.tsx";
import { ConflictBanner, SaveToast } from "./SaveStatus.tsx";
import { SessionProvider, type OpenPage, type Session, type StyleSave } from "./session.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
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
  // The CMS's own origin, where its pages open; from the build by default.
  cmsOrigin?: string;
  tabs?: TabOpener;
}

export function App({ env, adapter, address = locationAddress, cmsOrigin = configuredCmsOrigin(), tabs = windowTabs }: AppProps) {
  const { store, ui, clock } = env;
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [pages, setPages] = useState<readonly PageSummary[]>([]);
  const [current, setCurrent] = useState<OpenPage | null>(null);
  const [autosave, setAutosave] = useState<Autosave | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [styleSave, setStyleSave] = useState<StyleSave>({ phase: "idle" });
  const live = useRef<{ autosave: Autosave | null; unsubscribe: () => void; adopting: boolean }>({ autosave: null, unsubscribe: () => {}, adopting: false });
  // The page as the latest render had it, for the operations that run
  // after an await.
  const opened = useRef<OpenPage | null>(null);
  useLayoutEffect(() => {
    opened.current = current;
  }, [current]);

  const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

  const refreshPages = useCallback(async () => {
    const list = await adapter.listPages();
    setPages(list);
    return list;
  }, [adapter]);

  // The latest page asked for: an earlier request still loading gives way.
  const opening = useRef(0);
  const openPage = useCallback(async (id: number): Promise<string | null> => {
    const ticket = ++opening.current;
    const previous = live.current.autosave;
    const kept = "This page has changes the server has not saved yet: it stays open until they are saved.";
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
    const opened = openDocument(page.draft.document);
    if (!opened.ok) return `The page could not be opened: ${opened.errors[0]?.message ?? "its document is not valid"}.`;
    // The page being left stayed open while the next one loaded, and the
    // person may have edited it meanwhile: those edits are saved too. The
    // last look (left) and the switch below run with no await between
    // them, so no edit can fall in between.
    while (!left()) {
      if (!(await save())) return opening.current === ticket ? kept : null;
      if (opening.current !== ticket) return null;
    }

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
      // The server's own draft, taken after a conflict, is no edit.
      if (state.document !== before.document && !live.current.adopting) saving.edit(state.document);
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
    setCurrent({ id: page.page.id, slug: page.page.slug, home: page.page.home, published: page.published, revision: page.draft.revision, links: { preview: page.links.preview, live: page.links.live } });
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

  // The draft as the CMS would serve it, in a new tab, once the edits
  // waiting are on the server; if they cannot be, the preview shows the
  // last saved draft and the notice says so.
  const preview = useCallback(() => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page) return;
    const href = cmsAddress(page.links.preview, cmsOrigin);
    const ready = (async () => {
      ui.getState().pending.deliver();
      const settled = saving ? await saving.flush() : null;
      if (settled && settled.phase !== "saved") ui.getState().say(`The preview shows the last saved draft: ${unsavedWhy(settled.phase)}`);
      return href;
    })();
    if (!tabs.open(ready)) ui.getState().say(`The browser did not open a new tab for the preview. It is at ${href}.`);
  }, [cmsOrigin, tabs, ui]);

  // Saves what waits, then puts the draft live at the revision just saved:
  // a save from elsewhere in between is refused by the CMS, not published
  // unseen.
  const publish = useCallback(async () => {
    const page = opened.current;
    const saving = live.current.autosave;
    if (!page || !saving || !adapter.capabilities.publish) return;
    setPublishing(true);
    try {
      ui.getState().pending.deliver();
      const settled = await saving.flush();
      if (settled.phase !== "saved") {
        ui.getState().say(`Not published: ${unsavedWhy(settled.phase)}`);
        return;
      }
      if (store.getState().document.sections.length === 0) {
        ui.getState().say("Not published: an empty page has nothing to publish. Add a section first.");
        return;
      }
      let outcome;
      try {
        outcome = await adapter.publish(page.id, { revision: settled.revision });
      } catch (error) {
        const unknown = isStorageError(error) && error.failure.kind === "unknown";
        ui.getState().say(unknown
          ? `No answer from the CMS about the publish (${describe(error)}): the page may be live or not. Open the live page to see, or publish again.`
          : `Not published: ${describe(error)}`);
        return;
      }
      if (!outcome.ok) {
        ui.getState().say(outcome.problem.kind === "conflict"
          ? "Not published: the page was saved somewhere else after this tab's last save. Nothing went live."
          : `Not published: ${outcome.problem.errors[0]?.message ?? outcome.problem.message}`);
        return;
      }
      const result = outcome.value;
      setCurrent((open) => (open?.id === page.id ? { ...open, published: result.published, links: { preview: result.links.preview, live: result.links.live } } : open));
      await refreshPages().catch(() => undefined);
      const where = result.links.live === null ? null : cmsAddress(result.links.live, cmsOrigin);
      ui.getState().say(where ? `Published: visitors see this page at ${shownAddress(where)}.` : "Published.", where ? { href: where, label: "View live page" } : null);
    } finally {
      setPublishing(false);
    }
  }, [adapter, cmsOrigin, refreshPages, store, ui]);

  // The conflict, settled the person's way: the server's draft replaces
  // this tab's, or this tab's is saved over it.
  const reload = useCallback(async () => {
    const saving = live.current.autosave;
    if (!saving) return;
    let draft;
    try {
      draft = await saving.reload();
    } catch (error) {
      ui.getState().say(`The page could not be reloaded: ${describe(error)}`);
      return;
    }
    const taken = openDocument(draft.document);
    if (!taken.ok) {
      ui.getState().say(`The page on the server could not be opened: ${taken.errors[0]?.message ?? "its document is not valid"}.`);
      return;
    }
    live.current.adopting = true;
    try {
      store.getState().load(taken.document);
    } finally {
      live.current.adopting = false;
    }
    ui.setState({ serverErrors: [], hover: null });
    ui.getState().say("Reloaded: this is the page as it is on the server.");
  }, [store, ui]);

  const keepMine = useCallback(() => {
    live.current.autosave?.overwrite();
    ui.getState().say("Keeping this tab's page: it is saved over the one on the server.");
  }, [ui]);

  // The site style: the canvas takes a change at once; the CMS gets one
  // request at a time, and the latest change goes when the one on its way
  // is answered. A refusal puts back what the CMS last kept.
  const styleQueue = useRef<{ busy: boolean; next: SiteStyleChange | null; kept: SiteStyle | null }>({ busy: false, next: null, kept: null });
  const saveSiteStyle = useCallback((change: SiteStyleChange) => {
    const shown = ui.getState().siteStyle;
    if (!shown) return;
    const queue = styleQueue.current;
    queue.kept ??= shown;
    ui.getState().setSiteStyle({ ...shown, palette: change.palette, typeScale: change.typeScale });
    setStyleSave({ phase: "saving" });
    queue.next = change;
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

  // Closing the tab while edits are only here asks first: the page's
  // edits, text typed in a field and not handed over yet (handed over
  // now, so the autosave counts it), and a site style on its way to the
  // CMS or waiting behind the one that is.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      ui.getState().pending.deliver();
      const style = styleQueue.current;
      const unsaved = live.current.autosave?.getSnapshot().warnOnClose === true || style.busy || style.next !== null;
      if (unsaved) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ui]);

  const session = useMemo<Session>(() => ({
    pages, current, autosave, capabilities: adapter.capabilities, cmsOrigin, publishing, styleSave,
    openPage, createPage, setSlug, preview, publish, reload, keepMine, saveSiteStyle,
  }), [pages, current, autosave, adapter, cmsOrigin, publishing, styleSave, openPage, createPage, setSlug, preview, publish, reload, keepMine, saveSiteStyle]);
  const navigatorOpen = useStoreNavigator(env);

  return (
    <EditorProvider env={env}>
      <SessionProvider value={session}>
        <DragLayer>
          <div className={`app${navigatorOpen ? "" : " nav-closed"}`}>
            <TopBar />
            <ConflictBanner />
            <LeftTray />
            {status.kind === "ready" ? <Canvas /> : <Bench status={status} onRetry={() => setAttempt((n) => n + 1)} />}
            <Navigator />
          </div>
        </DragLayer>
        <EditorKeys />
        <BlockMenu />
        <ShortcutsDialog />
        <AboutDialog />
        <SaveToast />
        <Notice />
      </SessionProvider>
    </EditorProvider>
  );
}

// Why what waits for a save did not go ahead, as the end of a sentence.
function unsavedWhy(phase: SavePhase): string {
  switch (phase) {
    case "conflict":
      return "the page was changed in another tab. Choose Reload or Keep mine first.";
    case "retrying":
      return "the changes are not saved yet, and the editor is trying again.";
    case "invalid":
      return "the server refused a value. Fix the field it marks first.";
    case "refused":
      return "the server refused the save.";
    default:
      return "the changes are not saved yet.";
  }
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
  const link = useUi((u) => u.noticeLink);
  const say = useUi((u) => u.say);
  return (
    <div role="status" aria-live="polite" className="chrome">
      {notice && (
        <div className="notice">
          <span>{notice}</span>
          {link && <a className="notice-link" href={link.href} target="_blank" rel="noopener">{link.label}<Icon name="external" className="i i-xs" /></a>}
          <button className="ibtn ibtn-small" type="button" aria-label="Dismiss" onClick={() => say(null)}><Icon name="close" className="i i-xs" /></button>
        </div>
      )}
    </div>
  );
}
