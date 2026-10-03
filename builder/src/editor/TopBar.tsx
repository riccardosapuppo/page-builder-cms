// The top bar of the approved design (design/shots/editor.png): the mark
// and its menu (with the media library, to look after it outside any
// block), the open page and the switch to another one, whether the
// page is live, Site style, the device the canvas previews, undo, redo and
// the history (design/shots/history.png), where the edits are, Preview and
// Publish.
//
// What the design draws here and the editor does not have yet is not drawn
// (no control that does nothing).
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { runRedo, runUndo } from "./act.ts";
import { BlockIcon } from "./block-icon.tsx";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { Icon, Mark } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, entryKeysText } from "./keymap.ts";
import { useMediaService } from "./library/context.tsx";
import { MediaLibrary } from "./library/MediaLibrary.tsx";
import { Menu } from "./Menu.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { changesNotLive, PreviewButton, PublishButton } from "./Publish.tsx";
import { changes, SaveState, useSaveSnapshot, when } from "./SaveStatus.tsx";
import { useSession, type OpenPage } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { PREVIEWS, type Preview } from "./ui-store.ts";
import { DESKTOP_MIN, PREVIEW_WIDTHS } from "../shared/preview-widths.ts";

const PREVIEW_LABELS: Readonly<Record<Preview, { name: string; title: string; icon: "desktop" | "tablet" | "phone" }>> = {
  desktop: { name: "Desktop", title: `Desktop: the canvas at its full width, drawn smaller when that is under ${DESKTOP_MIN}`, icon: "desktop" },
  tablet: { name: "Tablet", title: `Tablet: the canvas at ${PREVIEW_WIDTHS.tablet} wide`, icon: "tablet" },
  phone: { name: "Phone", title: `Phone: the canvas at ${PREVIEW_WIDTHS.phone} wide`, icon: "phone" },
};

export function TopBar() {
  const session = useSession();
  const { ui } = useEnv();
  const preview = useUi((u) => u.preview);
  const tray = useUi((u) => u.tray);
  const title = useSessionTitle();
  const [menu, setMenu] = useState<"app" | "pages" | null>(null);
  const [creating, setCreating] = useState(false);
  // The media library opened from the menu, to look after it.
  const media = useMediaService();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const markButton = useRef<HTMLButtonElement>(null);
  const pageButton = useRef<HTMLButtonElement>(null);
  const current = session.current;
  const siteStyleOpen = tray === "site-style";
  const toggleSiteStyle = (open: boolean) => ui.getState().setTray(open ? "site-style" : "edit");
  const bar = useLeftRoom();

  return (
    <header ref={bar} className="topbar chrome">
      <div className="tb-left">
        <button
          ref={markButton}
          className="tb-mark"
          type="button"
          aria-label="Page Builder CMS menu"
          aria-haspopup="menu"
          aria-expanded={menu === "app"}
          onClick={() => setMenu(menu === "app" ? null : "app")}
        >
          <Mark />
          <Icon name="chevron-down" className="i i-xs" />
        </button>
        {menu === "app" && (
          <Menu label="Page Builder CMS" className="menu-app" button={markButton} onClose={() => setMenu(null)}>
            <button
              className="menu-item"
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                setMenu(null);
                toggleSiteStyle(true);
                // The menu goes; the focus goes to the panel it opened.
                requestAnimationFrame(() => document.querySelector<HTMLElement>(".site-style [data-autofocus]")?.focus());
              }}
            >
              <Icon name="style" /><span>Site style</span>
            </button>
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => setMenu("pages")}>
              <Icon name="page" /><span>All pages</span>
            </button>
            {media && (
              <button className="menu-item" role="menuitem" type="button" tabIndex={-1} aria-haspopup="dialog" onClick={() => { setMenu(null); markButton.current?.focus(); setLibraryOpen(true); }}>
                <BlockIcon type="image" className="i" /><span>Media library</span>
              </button>
            )}
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} aria-keyshortcuts={ariaKeyShortcuts(entry("showShortcuts"))} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setShortcutsOpen(true); }}>
              <Icon name="keyboard" /><span>Keyboard shortcuts</span>
              <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(entry("showShortcuts"))} small /></span>
            </button>
            <hr className="menu-sep" />
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setAboutOpen(true); }}>
              <Icon name="info" /><span>About Page Builder CMS</span>
            </button>
          </Menu>
        )}
        <button
          ref={pageButton}
          className="tb-page"
          type="button"
          aria-label={current ? `Switch page. Open: ${title}` : "Pages"}
          aria-haspopup="menu"
          aria-expanded={menu === "pages"}
          onClick={() => setMenu(menu === "pages" ? null : "pages")}
        >
          <Icon name="page" />
          <span className="tb-page-name">
            <span className="tb-page-title">{current ? title : "Pages"}</span>
            {current && !current.home && <span className="tb-page-path">/{current.slug}</span>}
          </span>
          <Icon name="chevron-down" className="i i-xs" />
        </button>
        {menu === "pages" && (
          <Menu label="Pages" className="menu-pages" button={pageButton} onClose={() => setMenu(null)}>
            {session.pages.map((page) => (
              <button
                key={page.id}
                className="menu-item menu-item-rich"
                role="menuitem"
                type="button"
                tabIndex={-1}
                aria-current={current?.id === page.id ? "page" : undefined}
                onClick={() => {
                  setMenu(null);
                  if (current?.id !== page.id) void session.openPage(page.id).then((why) => ui.getState().say(why));
                }}
              >
                <Icon name="page" />
                <span><strong>{current?.id === page.id ? title : page.title}</strong><small>{page.home ? "/, the home page" : `/${page.slug}`}{page.published ? "" : ", not published yet"}</small></span>
              </button>
            ))}
            {session.pages.length > 0 && <hr className="menu-sep" />}
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); pageButton.current?.focus(); setCreating(true); }}>
              <Icon name="plus" /><span>New page…</span>
            </button>
          </Menu>
        )}
        {current && <PublishedChip page={current} />}
        <button className="btn btn-quiet" type="button" data-site-style="" aria-pressed={siteStyleOpen} title="The site's palette and type scale, for every page" onClick={() => toggleSiteStyle(!siteStyleOpen)}>
          <Icon name="style" />Site style
        </button>
      </div>

      <div className="tb-center">
        <div className="seg seg-devices" role="group" aria-label="Device">
          {PREVIEWS.map((p) => (
            <button key={p} type="button" aria-pressed={preview === p} title={PREVIEW_LABELS[p].title} onClick={() => ui.getState().setPreview(p)}>
              <Icon name={PREVIEW_LABELS[p].icon} />{PREVIEW_LABELS[p].name}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-right">
        {current && <HistoryButtons />}
        {session.autosave && <SaveState />}
        <PreviewButton />
        <PublishButton />
      </div>
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
      {libraryOpen && <MediaLibrary purpose={{ kind: "manage" }} onClose={() => setLibraryOpen(false)} />}
    </header>
  );
}

// The bar's three groups share it evenly, so the device switch sits in the
// middle (editor.css, .topbar). When the left group needs more than half,
// for a long chip ("Published, 3 changes not live") beside the page's
// title, it takes it from the room the right group does not use, and the
// switch moves right; only past that does the page switch shorten, its
// address first, then its title. CSS cannot weigh one group's need against
// the other's, so the bar is measured with each group at its natural
// width, and the left group's floor, --tb-left-min, is the smaller of its
// need and what the other two leave it. Before the page switch shortens,
// the right group gives up the words it can do without (History's and
// Preview's; history.css, .tb-tight), each keeping its icon and its name
// for a screen reader. Measured again whenever the bar's width or anything
// drawn in it changes.
function useLeftRoom(): RefObject<HTMLElement | null> {
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return undefined;
    let changed: MutationObserver | null = null;
    const measure = () => {
      const [left, center, right] = Array.from(element.children) as HTMLElement[];
      if (!left || !center || !right) return;
      const shared = element.style.gridTemplateColumns;
      element.style.gridTemplateColumns = "max-content max-content max-content";
      const style = getComputedStyle(element);
      const inside = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - 2 * (parseFloat(style.columnGap) || 0);
      // Every word first; the right group tight only if the left would
      // otherwise be cut.
      element.classList.remove("tb-tight");
      const need = left.getBoundingClientRect().width;
      const middle = center.getBoundingClientRect().width;
      let others = right.getBoundingClientRect().width;
      const tight = Math.ceil(need) > Math.floor(inside - middle - Math.ceil(others));
      if (tight) {
        element.classList.add("tb-tight");
        others = right.getBoundingClientRect().width;
      }
      element.style.gridTemplateColumns = shared;
      const floor = Math.max(0, Math.min(Math.ceil(need), Math.floor(inside - middle - Math.ceil(others))));
      const value = `${floor}px`;
      if (element.style.getPropertyValue("--tb-left-min") !== value) element.style.setProperty("--tb-left-min", value);
      // The bar was just measured as it now is: the class measuring set and
      // took back is no change to answer.
      changed?.takeRecords();
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    changed = new MutationObserver(measure);
    changed.observe(element, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, []);
  return bar;
}

// Undo and redo, on the store's history, as their keys do (./act.ts: the
// text still waiting in a field goes first, the focus to the block the
// step touched); with nothing to undo or redo they stay where they are,
// greyed, and say so. History opens the panel in the navigator's place.
function HistoryButtons() {
  const env = useEnv();
  const last = useEditor((s) => s.past.at(-1));
  const next = useEditor((s) => s.future.at(-1));
  const open = useUi((u) => u.historyOpen);
  const undoKeys = entry("undo");
  const redoKeys = entry("redo");
  return (
    <>
      <button
        className="ibtn"
        type="button"
        aria-label="Undo"
        aria-keyshortcuts={ariaKeyShortcuts(undoKeys)}
        aria-disabled={last ? undefined : true}
        title={last ? `Undo “${last.command.label}” (${entryKeysText(undoKeys)})` : "Nothing to undo"}
        onClick={() => runUndo(env, "canvas")}
      >
        <Icon name="undo" />
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Redo"
        aria-keyshortcuts={ariaKeyShortcuts(redoKeys)}
        aria-disabled={next ? undefined : true}
        title={next ? `Redo “${next.command.label}” (${entryKeysText(redoKeys)})` : "Nothing to redo"}
        onClick={() => runRedo(env, "canvas")}
      >
        <Icon name="redo" />
      </button>
      <button
        className="btn btn-quiet tb-word-btn"
        type="button"
        data-history=""
        aria-pressed={open}
        title="History: this session's changes and the page's versions"
        onClick={() => env.ui.getState().setHistoryOpen(!open)}
      >
        {/* The word gives way to the icon when the bar is short of room
            (useLeftRoom), so the page's title keeps its own. */}
        <Icon name="history" /><span className="tb-word">History</span>
      </button>
    </>
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
export function PublishedChip({ page }: { page: OpenPage }) {
  const snapshot = useSaveSnapshot();
  if (!page.published) {
    return <span className="chip chip-draft"><span className="dot-draft" aria-hidden="true" />Not published yet</span>;
  }
  const notLive = changesNotLive(page, snapshot);
  const moved = page.published.slug !== page.slug && !page.home;
  const since = `Published ${when(page.published.publishedAt)}.`;
  if (notLive > 0) {
    const what = changes(notLive);
    return <span className="chip chip-draft" title={`${since} Your ${what} since then are saved but not live yet: Publish sends them.`}><span className="dot-part" aria-hidden="true" />Published, {what} not live</span>;
  }
  if (moved) {
    return <span className="chip chip-draft" title={`${since} The page’s new address, /${page.slug}, is not live yet: Publish sends it.`}><span className="dot-part" aria-hidden="true" />Published, new address not live</span>;
  }
  return <span className="chip chip-draft" title={since}><span className="dot-live" aria-hidden="true" />Published</span>;
}
