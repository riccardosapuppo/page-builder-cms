// The top bar of the approved layout (design/layout/shots/editor.png): on
// the left, the mark and its menu (Site style, the pages, the media
// library, the form responses, the shortcuts, About), the three drawers (Insert, Outline and
// History, each opening and closing its own, ./Drawer.tsx), undo and redo;
// in the middle, the page's title, which switches pages, with whether it
// is live and how many saved changes are not (./PageSwitch.tsx); on the
// right, where the edits are, Preview, Publish and the sidebar's key.
//
// What the design draws here and the editor does not have yet is not drawn
// (no control that does nothing).
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { runRedo, runUndo } from "./act.ts";
import { BlockIcon } from "./block-icon.tsx";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { DRAWER_NAMES, toggleDrawer } from "./Drawer.tsx";
import { Icon, Mark, type IconName } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryCaps, entryKeysText, type KeyEntry } from "./keymap.ts";
import { useFinePointerToo } from "./layout-mode.ts";
import { useMediaService } from "./library/context.tsx";
import { MediaLibrary } from "./library/MediaLibrary.tsx";
import { Menu } from "./Menu.tsx";
import { PageSwitch } from "./PageSwitch.tsx";
import { PreviewButton, PublishButton } from "./Publish.tsx";
import { useResponsesStorage } from "./responses/context.ts";
import { ResponsesScreen } from "./responses/ResponsesScreen.tsx";
import { SaveState } from "./SaveStatus.tsx";
import { ScheduleDialog } from "./ScheduleDialog.tsx";
import { useSession } from "./session.tsx";
import { KeyCaps } from "./ShortcutsDialog.tsx";
import { openSiteStyle, toggleSidebar } from "./Sidebar.tsx";
import type { Drawer } from "./ui-store.ts";

export function TopBar() {
  const session = useSession();
  const { ui } = useEnv();
  // Keyboard shortcuts, offered where a mouse or a trackpad is: a phone has
  // no keys for them (./layout-mode.ts).
  const keysToo = useFinePointerToo();
  const [menu, setMenu] = useState<"app" | "pages" | null>(null);
  // The media library opened from the menu, to look after it.
  const media = useMediaService();
  const [libraryOpen, setLibraryOpen] = useState(false);
  // The site's form responses, beside the media library: like it, about
  // the whole site rather than the page open, so from the mark's menu and
  // not the bar's drawers. Only when the storage keeps them.
  const responses = useResponsesStorage();
  const [responsesOpen, setResponsesOpen] = useState(false);
  // Schedule… from the Publish menu opens its dialog here, beside the
  // media library's.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const markButton = useRef<HTMLButtonElement>(null);
  const current = session.current;
  const bar = useBarRoom();

  return (
    <header ref={bar} className="topbar chrome" aria-label="Editor">
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
                // The menu goes; the focus goes to the site style it opened.
                openSiteStyle(ui);
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
            {responses && (
              <button className="menu-item" role="menuitem" type="button" tabIndex={-1} aria-haspopup="dialog" onClick={() => { setMenu(null); markButton.current?.focus(); setResponsesOpen(true); }}>
                <BlockIcon type="form" className="i" /><span>Form responses</span>
              </button>
            )}
            {keysToo && (
              <button className="menu-item" role="menuitem" type="button" tabIndex={-1} aria-keyshortcuts={ariaKeyShortcuts(entry("showShortcuts"))} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setShortcutsOpen(true); }}>
                <Icon name="keyboard" /><span>Keyboard shortcuts</span>
                <span className="keys" aria-hidden="true"><KeyCaps caps={entryCaps(entry("showShortcuts"))} small /></span>
              </button>
            )}
            <hr className="menu-sep" />
            <button className="menu-item" role="menuitem" type="button" tabIndex={-1} onClick={() => { setMenu(null); markButton.current?.focus(); ui.getState().setAboutOpen(true); }}>
              <Icon name="info" /><span>About Page Builder CMS</span>
            </button>
          </Menu>
        )}
        {current && (
          <>
            <span className="tb-sep" aria-hidden="true" />
            <DrawerKey which="insert" icon="plus" keys={entry("openInsert")} title={`Insert: every block and ready-made section (${entryKeysText(entry("openInsert"))})`} />
            <DrawerKey which="outline" icon="tree" keys={entry("openOutline")} title={`Outline: the page's blocks and headings (${entryKeysText(entry("openOutline"))})`} />
            <DrawerKey which="history" icon="history" title={`History: this session's changes and the page's versions. ${entryKeysText(entry("saveVersion"))} saves a version.`} />
            <span className="tb-sep" aria-hidden="true" />
            <UndoRedo />
          </>
        )}
      </div>

      <div className="tb-center">
        <PageSwitch open={menu === "pages"} onOpen={(open) => setMenu(open ? "pages" : null)} />
      </div>

      <div className="tb-right">
        {session.autosave && <SaveState />}
        <PreviewButton />
        <PublishButton onSchedule={() => setScheduleOpen(true)} />
        <SidebarKey />
      </div>
      {libraryOpen && <MediaLibrary purpose={{ kind: "manage" }} onClose={() => setLibraryOpen(false)} />}
      {responsesOpen && <ResponsesScreen onClose={() => setResponsesOpen(false)} />}
      {scheduleOpen && <ScheduleDialog onClose={() => setScheduleOpen(false)} />}
    </header>
  );
}

// The bar's three groups: the title in the middle, the two sides sharing
// what is left evenly, so the title is centred. A side that needs more than
// half takes it from the room the other side does not use, and the title
// moves over; only past that is the title cut. CSS cannot weigh one
// group's need against the other's, so the bar is measured with each group
// at its natural width, and each side's floor (--tb-left-min,
// --tb-right-min) is its need. Before the title would be cut, the save
// state draws closer to its neighbours (.tb-snug, a dozen pixels), and then
// the side buttons give up the words they can do without (Insert's,
// Outline's, History's and Preview's; history.css, .tb-tight), each keeping
// its icon and its name for a screen reader. The save state takes the
// same room saying Saved as saying Saving… (editor.css), so a save does
// not move the bar. Measured again whenever the bar's width or anything
// drawn in it changes.
function useBarRoom(): RefObject<HTMLElement | null> {
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
      element.classList.remove("tb-tight", "tb-snug");
      const width = (group: HTMLElement) => Math.ceil(group.getBoundingClientRect().width);
      const middle = width(center);
      const short = () => width(left) + middle + width(right) > Math.floor(inside);
      // A few pixels short: the save state draws closer to its neighbours
      // first (history.css, .tb-snug); more, and the words go.
      if (short()) {
        element.classList.add("tb-snug");
        if (short()) element.classList.replace("tb-snug", "tb-tight");
      }
      const leftNeed = width(left);
      const rightNeed = width(right);
      element.style.gridTemplateColumns = shared;
      const set = (name: string, px: number) => {
        const value = `${Math.max(0, px)}px`;
        if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
      };
      set("--tb-left-min", leftNeed);
      set("--tb-right-min", rightNeed);
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

// A drawer's key: pressed while its drawer is open; its words give way to
// its icon when the bar is short of room (useBarRoom).
function DrawerKey({ which, icon, keys, title }: { which: Drawer; icon: IconName; keys?: KeyEntry; title: string }) {
  const env = useEnv();
  const open = useUi((u) => u.drawer === which);
  return (
    <button
      className="btn btn-quiet tb-word-btn"
      type="button"
      data-drawer={which}
      aria-pressed={open}
      aria-controls={open ? `drawer_${which}` : undefined}
      aria-keyshortcuts={keys ? ariaKeyShortcuts(keys) : undefined}
      title={title}
      onClick={() => toggleDrawer(env, which)}
    >
      <Icon name={icon} /><span className="tb-word">{DRAWER_NAMES[which]}</span>
    </button>
  );
}

// Undo and redo, on the store's history, as their keys do (./act.ts: the
// text still waiting in a field goes first, the focus to the block the
// step touched); with nothing to undo or redo they stay where they are,
// greyed, and say so.
function UndoRedo() {
  const env = useEnv();
  const last = useEditor((s) => s.past.at(-1));
  const next = useEditor((s) => s.future.at(-1));
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
    </>
  );
}

// The sidebar's key: pressed while the sidebar shows.
function SidebarKey() {
  const { ui } = useEnv();
  const open = useUi((u) => u.sidebarOpen);
  return (
    <button className="ibtn ibtn-side" type="button" data-sidebar="" aria-pressed={open} aria-label="Settings sidebar" title={open ? "Hide the settings sidebar" : "Show the settings sidebar"} onClick={() => toggleSidebar(ui)}>
      <Icon name="panel-right" />
    </button>
  );
}
