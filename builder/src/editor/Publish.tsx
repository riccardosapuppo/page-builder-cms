// The right end of the top bar (design/shots/publish.png): Preview, which
// opens the draft as the CMS would serve it, and the split Publish button,
// whose menu has Publish now, Schedule… (its own dialog, ./ScheduleDialog.tsx,
// which the top bar opens), the scheduled publish's cancel while one waits,
// and the live page's address. A storage without scheduling
// (capabilities) gets no Schedule item, one with no publishing at all no
// Publish. The browser demo's storage keeps a publish but serves no page:
// its menu says so, and links the page as published, which the demo draws.
//
// Publish waits while the page cannot go live as the editor shows it: a
// save the server has not confirmed (retrying, refused), the draft changed
// in another tab, an empty page. The button then says why, and is not
// pressable.
import { useId, useRef, useState } from "react";
import { cmsAddress } from "../storage/config.ts";
import type { SaveSnapshot } from "../storage/autosave.ts";
import { useEditor, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, entryKeysText } from "./keymap.ts";
import { Menu } from "./Menu.tsx";
import { changes, useSaveSnapshot, when } from "./SaveStatus.tsx";
import { templateOf, useSession, type OpenPage } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { siteWhen } from "./site-time.ts";

// Why Publish waits, or null when it can go. A header or a footer may go
// empty: published so, the site has none.
export function publishPaused(snapshot: SaveSnapshot | null, sections: number, part = false): string | null {
  if (sections === 0 && !part) return "Add a section first. An empty page has nothing to publish.";
  switch (snapshot?.phase) {
    case "conflict":
      return "Publish is paused until you choose Reload or Keep mine.";
    case "retrying":
      return "Publish is paused until the changes are saved.";
    case "invalid":
      return "Publish is paused until the value the server refused is fixed.";
    case "refused":
      return "Publish is paused until the changes are saved.";
    default:
      return null;
  }
}

// The changes visitors do not see yet: the saves since the draft revision
// the live version was taken from (the CMS's draftRevision). Counted in
// saves, as the chip counts them, never mixed with the edits a save
// carries.
export function changesNotLive(page: OpenPage, snapshot: SaveSnapshot | null): number {
  if (!page.published) return 0;
  const revision = snapshot?.revision ?? page.revision;
  return Math.max(0, revision - page.published.draftRevision);
}

// "127.0.0.1:3900/winter-series": an address as a person reads it.
export function shownAddress(href: string): string {
  const url = new URL(href);
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
}

// A page's address on the site, as a person reads it: on the CMS's origin
// ("127.0.0.1:3900/winter-series"), or, with no CMS (the browser demo,
// which serves no page), the path the site would give it ("/winter-series").
export function siteAddress(path: string, cmsOrigin: string | null): string {
  return cmsOrigin === null ? path : shownAddress(cmsAddress(path, cmsOrigin));
}

export function PreviewButton() {
  const session = useSession();
  const page = session.current;
  if (!page) return null;
  const href = cmsAddress(page.links.preview, session.cmsOrigin);
  const keys = entry("preview");
  return (
    <a
      className="btn btn-secondary tb-word-btn"
      href={href}
      target="_blank"
      rel="noopener"
      title={`Preview (${entryKeysText(keys)}): the draft as ${session.cmsOrigin === null ? "it would be published" : "the CMS would serve it"}, in a new tab`}
      aria-keyshortcuts={ariaKeyShortcuts(keys)}
      onClick={(event) => {
        // A plain click goes through the session, which sends the edits
        // still waiting first; a click asking for a window or a tab of its
        // own is the browser's.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        session.preview();
      }}
    >
      {/* The word gives way to the icon when the top bar is short of room
          (./TopBar.tsx, useLeftRoom). */}
      <Icon name="eye" /><span className="tb-word">Preview</span>
    </a>
  );
}

// What the Schedule… item says under its name, and whether there is
// anything to schedule: nothing when visitors already see the draft and no
// publish waits.
export function scheduleLine(page: OpenPage, notLive: number, zone: string): { line: string; nothing: boolean } {
  const pending = page.scheduled ?? null;
  if (pending) return { line: `Set for ${siteWhen(zone, pending.at)}. Choose another time.`, nothing: false };
  if (page.kind === "template") {
    if (!page.published) return { line: `Choose the day and time every entry of ${templateOf(page)} is first drawn with this template.`, nothing: false };
    if (notLive === 0) return { line: "Its entries are drawn with this draft already: there is nothing to schedule.", nothing: true };
    return { line: `Choose the day and time its entries are drawn with your ${changes(notLive)}.`, nothing: false };
  }
  if (!page.published) return { line: page.kind === "page" ? "Choose the day and time visitors first see this page." : `Choose the day and time every page first shows this ${page.kind}.`, nothing: false };
  if (notLive === 0) return { line: "Visitors already see this draft: there is nothing to schedule.", nothing: true };
  return { line: `Choose the day and time visitors see your ${changes(notLive)}.`, nothing: false };
}

// What Publish now does, under its name: on a storage that serves the
// page, what visitors see; on one that only keeps it (the browser demo),
// what is kept, and where it shows. A header or a footer has no address:
// it goes onto every page at once; a template neither, its collection's
// entries are drawn with it.
function nowLine(page: OpenPage, notLive: number): string {
  if (page.kind === "template") {
    if (!page.published) return `Every entry of ${templateOf(page)} is drawn with this template right away.`;
    return notLive > 0 ? `Its entries are drawn with your ${changes(notLive)} right away.` : "Its entries are drawn with this draft already; publishing keeps it as a new version.";
  }
  if (page.kind !== "page") {
    if (!page.published) return `Every page shows this ${page.kind} right away.`;
    return notLive > 0 ? `Every page shows your ${changes(notLive)} right away.` : "Every page already shows this draft; publishing keeps it as a new version.";
  }
  if (!page.published) return `Visitors see this page at ${page.home ? "/" : `/${page.slug}`} right away.`;
  return notLive > 0 ? `Visitors see your ${changes(notLive)} right away.` : "Visitors already see this draft; publishing keeps it as a new version.";
}

function keptLine(page: OpenPage, notLive: number): string {
  if (page.kind === "template") {
    if (!page.published) return "Kept as published in this browser. In the full system, its entries are drawn with it.";
    return notLive > 0 ? `Your ${changes(notLive)} go into the published template, kept in this browser.` : "The published template is this draft already; publishing keeps it as a new version.";
  }
  if (page.kind !== "page") {
    if (!page.published) return "Kept as published in this browser, on every page published here; the home page shows it in a new tab.";
    return notLive > 0 ? `Your ${changes(notLive)} go onto every page published here; the home page shows them in a new tab.` : `The published ${page.kind} is this draft already; publishing keeps it as a new version.`;
  }
  if (!page.published) return "Kept as published in this browser, and shown in a new tab.";
  return notLive > 0 ? `Your ${changes(notLive)} go into the published page, shown in a new tab.` : "The published page is this draft already; publishing keeps it as a new version.";
}

export function PublishButton({ onSchedule }: { onSchedule?: () => void }) {
  const session = useSession();
  const snapshot = useSaveSnapshot();
  const sections = useEditor((s) => s.document.sections.length);
  const zone = useUi((u) => u.site?.timeZone) ?? "UTC";
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const whyId = useId();
  const page = session.current;
  if (!session.capabilities.publish || !page) return null;

  // A header, a footer or a template may go empty: published so, the
  // site has none, or its entries are drawn with the header and footer
  // alone.
  const part = page.kind !== "page";
  const template = page.kind === "template";
  const paused = publishPaused(snapshot, sections, part);
  const busy = session.publishing || session.scheduling;
  const keys = entry("publish");
  const off = paused !== null || busy;
  const notLive = changesNotLive(page, snapshot);
  // A header or a footer has no address of its own: it is seen on the home
  // page, as on every other. A template has none either, and no page to
  // open: its entries have theirs.
  const livePath = template ? null : part ? session.pages.find((p) => p.home)?.links.live ?? null : page.links.live;
  const live = livePath === null ? null : cmsAddress(livePath, session.cmsOrigin);
  const schedule = session.capabilities.schedule && onSchedule ? scheduleLine(page, notLive, zone) : null;
  const pending = session.capabilities.schedule ? page.scheduled ?? null : null;
  // With no live page (the browser demo), the page as published opens from
  // the demo itself.
  const view = live === null && !template && !session.capabilities.livePages && session.publishedView ? cmsAddress(session.publishedView(page.id), session.cmsOrigin) : null;

  return (
    <div className={`split${off ? " split-off" : ""}`}>
      <button
        className={`btn split-main${off ? "" : " btn-primary"}`}
        type="button"
        aria-disabled={off || undefined}
        aria-describedby={paused ? whyId : undefined}
        aria-keyshortcuts={ariaKeyShortcuts(keys)}
        title={paused ?? `Publish now (${entryKeysText(keys)})`}
        onClick={() => {
          if (!off) void session.publish();
        }}
      >
        {session.publishing ? "Publishing…" : session.scheduling ? "Scheduling…" : "Publish"}
      </button>
      <button
        ref={more}
        className={`btn split-more${off ? "" : " btn-primary"}`}
        type="button"
        aria-label="More publish options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={off || undefined}
        aria-describedby={paused ? whyId : undefined}
        onClick={() => {
          if (!off) setOpen(!open);
        }}
      >
        <Icon name="chevron-down" />
      </button>
      {paused && <span id={whyId} className="visually-hidden">{paused}</span>}
      {open && !off && (
        <Menu label="Publish options" className="menu-publish" button={more} onClose={() => setOpen(false)}>
          <button
            className="menu-item menu-item-rich"
            role="menuitem"
            type="button"
            tabIndex={-1}
            aria-keyshortcuts={ariaKeyShortcuts(keys)}
            onClick={() => {
              setOpen(false);
              more.current?.focus();
              void session.publish();
            }}
          >
            <Icon name="upload" />
            <span>
              <strong>Publish now</strong>
              <small>{session.capabilities.livePages ? nowLine(page, notLive) : keptLine(page, notLive)}</small>
            </span>
            <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(keys)} small /></span>
          </button>
          {schedule && onSchedule && (
            <button
              className="menu-item menu-item-rich"
              role="menuitem"
              type="button"
              tabIndex={-1}
              aria-haspopup="dialog"
              aria-disabled={schedule.nothing || undefined}
              onClick={() => {
                if (schedule.nothing) return;
                // The menu goes; the dialog takes the focus, and gives it
                // back to the button that opened the menu.
                setOpen(false);
                more.current?.focus();
                onSchedule();
              }}
            >
              <Icon name="calendar" />
              <span>
                <strong>Schedule…</strong>
                <small>{schedule.line}</small>
              </span>
            </button>
          )}
          {pending && (
            <button
              className="menu-item menu-item-rich"
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                more.current?.focus();
                void session.cancelSchedule();
              }}
            >
              <Icon name="close" />
              <span>
                <strong>Cancel scheduled publish</strong>
                <small>Set for {siteWhen(zone, pending.at)}. {template ? "Its entries stay" : part ? "Every page stays" : "The live page stays"} as it is.</small>
              </span>
            </button>
          )}
          {(live || view) && page.published && <hr className="menu-sep" />}
          {view && page.published && (
            <a
              className="menu-item menu-item-rich menu-link"
              role="menuitem"
              tabIndex={-1}
              href={view}
              target="_blank"
              rel="noopener"
              onClick={() => {
                setOpen(false);
                more.current?.focus();
              }}
            >
              <Icon name="external" />
              <span>
                <strong>{part ? "View published home page" : "View published page"}</strong>
                <small>Published {when(page.published.publishedAt)} in this browser. Opens in a new tab.</small>
              </span>
            </a>
          )}
          {live && page.published && (
            <a
              className="menu-item menu-item-rich menu-link"
              role="menuitem"
              tabIndex={-1}
              href={live}
              target="_blank"
              rel="noopener"
              onClick={() => {
                // The page opens in a tab of its own; the menu goes, and
                // the focus comes back to the button that opened it.
                setOpen(false);
                more.current?.focus();
              }}
            >
              <Icon name="external" />
              <span>
                <strong>{part ? "View live home page" : "View live page"}</strong>
                <small className="menu-addr">{shownAddress(live)}</small>
                <small>Published {when(page.published.publishedAt)}. Opens in a new tab.</small>
              </span>
            </a>
          )}
        </Menu>
      )}
    </div>
  );
}
