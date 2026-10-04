// The right end of the top bar (design/shots/publish.png): Preview, which
// opens the draft as the CMS would serve it, and the split Publish button,
// whose menu has Publish now, Schedule… (its own dialog, ./ScheduleDialog.tsx,
// which the top bar opens), the scheduled publish's cancel while one waits,
// and the live page's address. A storage without scheduling
// (capabilities) gets no Schedule item; with no publishing at all (the
// browser demo's storage), there is no Publish either.
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
import { useSession, type OpenPage } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { siteWhen } from "./site-time.ts";

// Why Publish waits, or null when it can go.
export function publishPaused(snapshot: SaveSnapshot | null, sections: number): string | null {
  if (sections === 0) return "Add a section first. An empty page has nothing to publish.";
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
      title={`Preview (${entryKeysText(keys)}): the draft as the CMS would serve it, in a new tab`}
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
  if (!page.published) return { line: "Choose the day and time visitors first see this page.", nothing: false };
  if (notLive === 0) return { line: "Visitors already see this draft: there is nothing to schedule.", nothing: true };
  return { line: `Choose the day and time visitors see your ${changes(notLive)}.`, nothing: false };
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

  const paused = publishPaused(snapshot, sections);
  const busy = session.publishing || session.scheduling;
  const keys = entry("publish");
  const off = paused !== null || busy;
  const notLive = changesNotLive(page, snapshot);
  const live = page.links.live === null ? null : cmsAddress(page.links.live, session.cmsOrigin);
  const schedule = session.capabilities.schedule && onSchedule ? scheduleLine(page, notLive, zone) : null;
  const pending = session.capabilities.schedule ? page.scheduled ?? null : null;

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
              <small>{page.published ? (notLive > 0 ? `Visitors see your ${changes(notLive)} right away.` : "Visitors already see this draft; publishing keeps it as a new version.") : `Visitors see this page at ${page.home ? "/" : `/${page.slug}`} right away.`}</small>
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
                <small>Set for {siteWhen(zone, pending.at)}. The live page stays as it is.</small>
              </span>
            </button>
          )}
          {live && page.published && <hr className="menu-sep" />}
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
                <strong>View live page</strong>
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
