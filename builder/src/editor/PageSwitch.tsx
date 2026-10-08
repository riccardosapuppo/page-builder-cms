// The page's title in the middle of the top bar (the approved layout,
// design/layout/shots-extra/pages.png): the page being edited, like a
// document's name, with whether it is live under it; pressed, it opens the
// site's pages, a search over them, each with its address and whether it
// is live, and New page. A small window that stays beside its button (a
// non-modal dialog): its search takes the focus, the arrows move between
// the pages, Esc, a click elsewhere or the focus leaving it closes it, and
// the focus goes back to the title.
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import type { PageSummary } from "../storage/adapter.ts";
import { useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { changesNotLive, siteAddress } from "./Publish.tsx";
import { changes, useSaveSnapshot, when } from "./SaveStatus.tsx";
import { useScheduleLate } from "./schedule-late.ts";
import { publishWords, useSession, type OpenPage } from "./session.tsx";
import { shortWhen, siteWhen, wallClockAt } from "./site-time.ts";

interface PageSwitchProps {
  open: boolean;
  onOpen: (open: boolean) => void;
}

export function PageSwitch({ open, onOpen }: PageSwitchProps) {
  const session = useSession();
  const title = useSessionTitle();
  const [creating, setCreating] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const statusId = useId();
  const current = session.current;
  return (
    <div className="tb-switch">
      <button
        ref={button}
        className="tb-title"
        type="button"
        aria-label={current ? `Switch page. Open: ${title}` : "Pages"}
        aria-describedby={current ? statusId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
      >
        <span className="tb-title-row">
          <Icon name="page" className="i i-xs" />
          <span className="tb-page-title">{current ? title : "Pages"}</span>
          <Icon name="chevron-down" className="i i-xs" />
        </span>
        {current && <PublishedStatus page={current} id={statusId} />}
      </button>
      {open && (
        <PagesWindow
          button={button}
          title={title}
          onClose={() => onOpen(false)}
          onNew={() => {
            onOpen(false);
            button.current?.focus();
            setCreating(true);
          }}
        />
      )}
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

// The open page's title as the document holds it now.
function useSessionTitle(): string {
  const { store } = useEnv();
  return useSyncExternalStore(store.subscribe, () => store.getState().document.title);
}

// Whether visitors see the page, and how much of it: each save since the
// draft revision the live version was taken from is a change visitors do
// not see yet (the CMS's draftRevision), and a new address waits for the
// next publish too.
//
// A publish set for a time follows, by the site's clock: "Published, 6
// changes not live · scheduled for Oct 5 at 7:15 AM". Once its time has
// passed with the page still not live, it says so instead: "should have
// gone live on Oct 5 at 7:15 AM", since the CMS's job did not carry it out
// (it tries again by itself every few minutes).
export function PublishedStatus({ page, id }: { page: OpenPage; id?: string }) {
  const snapshot = useSaveSnapshot();
  // Where the storage serves pages the changes are "not live"; where it
  // only keeps them (the browser demo) they are "to publish".
  const serves = useSession().capabilities.livePages;
  const published = publishWords(serves);
  const zone = useUi((u) => u.site?.timeZone) ?? "UTC";
  const pending = page.scheduled ?? null;
  const late = useScheduleLate(pending?.at);
  const pendingAt = pending && shortWhen(wallClockAt(zone, Date.parse(pending.at)));
  const waiting = pending && (late
    ? <span className="tb-sched tb-sched-late"> · should have gone live on {pendingAt}</span>
    : <span className="tb-sched"> · scheduled for {pendingAt}</span>);
  const waitingTitle = pending
    ? late
      ? ` The publish scheduled for ${siteWhen(zone, pending.at)} has not happened yet. The CMS tries again every few minutes; Publish sends the page now, and the Publish menu cancels the schedule.`
      : ` A publish is scheduled for ${siteWhen(zone, pending.at)}: the Publish menu cancels it.`
    : "";
  if (!page.published) {
    return <span className="tb-status" id={id} title={waitingTitle.trim() || undefined}><span className="dot-draft" aria-hidden="true" />Not published yet{waiting}</span>;
  }
  const notLive = changesNotLive(page, snapshot);
  const moved = page.published.slug !== page.slug && !page.home;
  const since = `Published ${when(page.published.publishedAt)}.`;
  if (notLive > 0) {
    const what = changes(notLive);
    return <span className="tb-status" id={id} title={`${since} Your ${what} since then ${notLive === 1 ? "is" : "are"} saved${serves ? ` but not live yet: Publish sends ${notLive === 1 ? "it" : "them"}.` : ` in this browser but not published yet: Publish keeps ${notLive === 1 ? "it" : "them"}.`}${waitingTitle}`}><span className="dot-part" aria-hidden="true" />Published, {published.notLive(what)}{waiting}</span>;
  }
  if (moved) {
    return <span className="tb-status" id={id} title={`${since} The page’s new address, /${page.slug}, ${serves ? "is not live yet: Publish sends it." : "is not published yet: Publish keeps it."}${waitingTitle}`}><span className="dot-part" aria-hidden="true" />Published, {published.newAddressNotLive}{waiting}</span>;
  }
  return <span className="tb-status" id={id} title={`${since}${waitingTitle}`}><span className="dot-live" aria-hidden="true" />Published{waiting}</span>;
}

const matches = (page: PageSummary, query: string) => {
  const wanted = query.trim().toLowerCase();
  return wanted === "" || page.title.toLowerCase().includes(wanted) || page.slug.toLowerCase().includes(wanted);
};

interface PagesWindowProps {
  button: RefObject<HTMLButtonElement | null>;
  // The open page's title as it is now, which the list has from its last
  // reading.
  title: string;
  onClose: () => void;
  onNew: () => void;
}

function PagesWindow({ button, title, onClose, onNew }: PagesWindowProps) {
  const session = useSession();
  const { ui } = useEnv();
  const snapshot = useSaveSnapshot();
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  const current = session.current;
  const shown = session.pages.filter((page) => matches(page, query));

  useEffect(() => {
    search.current?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || button.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [button]);

  // A page's address as a person reads it, and whether it is live.
  const address = (page: PageSummary) => (page.home ? siteAddress("/", session.cmsOrigin) : `/${page.slug}`);
  const state = (page: PageSummary): { dot: string; words: string } => {
    const isOpen = current?.id === page.id;
    if (!(isOpen ? current.published : page.published)) return { dot: "dot-draft", words: "Not published yet" };
    const notLive = isOpen ? changesNotLive(current, snapshot) : Math.max(0, page.revision - (page.published?.draftRevision ?? page.revision));
    return notLive > 0 ? { dot: "dot-part", words: publishWords(session.capabilities.livePages).notLive(changes(notLive)) } : { dot: "dot-live", words: "Published" };
  };

  const rows = () => [...(box.current?.querySelectorAll<HTMLElement>(".page-row") ?? [])];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close.current();
      button.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const list = rows();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown"
      ? (at === -1 ? list[0] : list[Math.min(list.length - 1, at + 1)])
      : (at <= 0 ? search.current : list[at - 1]);
    event.preventDefault();
    next?.focus();
  };

  return (
    <div
      ref={box}
      className="pop pop-pages chrome"
      role="dialog"
      aria-label="Pages"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Tab past its last key, or a click elsewhere: it closes.
        const to = event.relatedTarget as Node | null;
        if (to && !box.current?.contains(to) && !button.current?.contains(to)) close.current();
      }}
    >
      <label className="search search-inline">
        <Icon name="search" />
        <input ref={search} type="search" placeholder="Find a page" aria-label="Find a page" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {shown.length > 0 && (
        <ul className="pages-list" aria-label="The site's pages">
          {shown.map((page) => {
            const isOpen = current?.id === page.id;
            const said = state(page);
            return (
              <li key={page.id}>
                <button
                  type="button"
                  className="page-row"
                  aria-current={isOpen ? "page" : undefined}
                  onClick={() => {
                    close.current();
                    if (isOpen) {
                      button.current?.focus();
                      return;
                    }
                    void session.openPage(page.id).then((why) => ui.getState().say(why));
                  }}
                >
                  <Icon name="page" />
                  <span className="page-row-name"><strong>{isOpen ? title : page.title}</strong><small>{address(page)}</small></span>
                  <span className="pr-state"><span className={said.dot} aria-hidden="true" />{said.words}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length === 0 && <p className="hint pages-none" role="status">{session.pages.length === 0 ? "No pages yet." : `No page is called “${query.trim()}”.`}</p>}
      <div className="pop-foot">
        <button className="btn btn-secondary" type="button" onClick={onNew}><Icon name="plus" />New page</button>
      </div>
    </div>
  );
}
