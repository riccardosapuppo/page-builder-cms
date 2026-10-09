// The one sidebar, on the right (the approved layout, design/layout/): the
// Page tab, the page's own settings and the way to the site style; the
// Block tab, the selected block's panel (./panels/EditPanel.tsx), each in
// its collapsible groups. The tab follows the selection: a block chosen
// shows Block, nothing selected shows Page, and either can be chosen by
// hand in between; the choice holds for that selection only (ui-store's
// sideTab), so a key that edits the block's words finds its tab. While a
// block is dragged its settings wait: the Block tab says what moves and
// where from, its groups closed and out of reach, and the Page tab is
// inert, since the page changes under the drag. Site
// style, and the header and footer where the storage keeps a change of
// them (capabilities.headerFooter), open a level below Page, in the
// sidebar's place, and close back to it; a click on the header or the
// footer on the canvas opens the second too. The top bar's sidebar key,
// or the sidebar's own close button, hides it, and the canvas takes its
// room.
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { sameJson } from "../document/json.ts";
import { afterRender } from "./act.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { siteValues } from "./header-footer.ts";
import { focusSiteField, HeaderFooterPanel } from "./HeaderFooterPanel.tsx";
import { Icon } from "./icons.tsx";
import { BlockPanel, MovingPanel, PagePanel } from "./panels/EditPanel.tsx";
import { useOptionalSession } from "./session.tsx";
import { SiteStylePanel } from "./SiteStylePanel.tsx";
import type { SideTab, UiStore } from "./ui-store.ts";

const TABS: readonly SideTab[] = ["page", "block"];
type Tab = SideTab;
const TAB_NAMES: Readonly<Record<Tab, string>> = { page: "Page", block: "Block" };

// Opens the site style in the sidebar, the sidebar shown if it was hidden,
// and puts the focus in it.
export function openSiteStyle(ui: UiStore): void {
  ui.setState({ sidebarOpen: true, tray: "site-style" });
  afterRender(() => document.querySelector<HTMLElement>(".site-style [data-autofocus]")?.focus());
}

// Opens the header and footer in the sidebar the same way, the focus on
// the value `field` points at ("/menu/2/label"), else on the site's name.
export function openHeaderFooter(ui: UiStore, field = "/name"): void {
  ui.setState({ sidebarOpen: true, tray: "header-footer" });
  focusSiteField(field);
}

// A level below Page, back to it: the Page tab, whatever is selected, the
// focus on the way back in (the entry that opened the level).
function backToPage(ui: UiStore, selection: string | null, entry: string): void {
  ui.setState({ tray: "edit", sideTab: { tab: "page", selection } });
  afterRender(() => document.querySelector<HTMLElement>(`.sidebar [${entry}]`)?.focus());
}

// Hides or shows the sidebar. Hidden from inside, the focus goes to the top
// bar's key that brings it back; shown, to its tabs.
export function toggleSidebar(ui: UiStore): void {
  const open = !ui.getState().sidebarOpen;
  const active = document.activeElement;
  const inside = active instanceof Element && active.closest(".sidebar") !== null;
  ui.getState().setSidebarOpen(open);
  if (open) afterRender(() => document.querySelector<HTMLElement>(".sidebar [role=tab][aria-selected=true], .sidebar [data-autofocus]")?.focus());
  else if (inside) afterRender(() => document.querySelector<HTMLElement>(".topbar [data-sidebar]")?.focus());
}

export function Sidebar() {
  const { store, ui } = useEnv();
  const open = useUi((u) => u.sidebarOpen);
  const tray = useUi((u) => u.tray);
  if (!open) return null;
  if (tray === "site-style") {
    return (
      <aside className="sidebar chrome" aria-label="Site style">
        <SiteStylePanel onClose={() => backToPage(ui, store.getState().selection, "data-site-style")} onHide={() => toggleSidebar(ui)} />
      </aside>
    );
  }
  if (tray === "header-footer") {
    return (
      <aside className="sidebar chrome" aria-label="Header and footer">
        <HeaderFooterPanel onClose={() => backToPage(ui, store.getState().selection, "data-header-footer")} onHide={() => toggleSidebar(ui)} />
      </aside>
    );
  }
  return <Settings />;
}

function Settings() {
  const { ui } = useEnv();
  const selection = useEditor((s) => s.selection);
  const moving = useEditor((s) => s.drag !== null);
  const pick = useUi((u) => u.sideTab);
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  // The tab chosen by hand while this selection holds, else the one the
  // selection asks for.
  const tab: Tab = pick !== null && pick.selection === selection ? pick.tab : selection === null ? "page" : "block";
  const setTab = (next: Tab) => ui.getState().setSideTab({ tab: next, selection });
  // A choice made for another selection is let go, so it does not come
  // back when that selection does.
  useEffect(() => {
    const now = ui.getState().sideTab;
    if (now !== null && now.selection !== selection) ui.getState().setSideTab(null);
  }, [selection, ui]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = TABS[(index + 1) % TABS.length]!;
    setTab(next);
    refs.current[TABS.indexOf(next)]?.focus();
  };
  return (
    <aside className="sidebar chrome" aria-label="Settings">
      <div className="sb-tabs">
        <div role="tablist" aria-label="Settings">
          {TABS.map((t, index) => (
            <button
              key={t}
              ref={(element) => {
                refs.current[index] = element;
              }}
              id={`${id}-${t}`}
              className="sb-tab"
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {TAB_NAMES[t]}
            </button>
          ))}
        </div>
        <button className="ibtn" type="button" aria-label="Hide the sidebar" title="Hide the sidebar" onClick={() => toggleSidebar(ui)}><Icon name="close" /></button>
      </div>
      <div className="sb-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {moving
          // The page changes under a drag: its settings wait, out of reach.
          ? tab === "page"
            ? <div className="sb-wait" inert><PageTab /></div>
            : <MovingPanel />
          : tab === "page" ? <PageTab /> : selection === null ? <NoBlock /> : <BlockPanel id={selection} />}
      </div>
    </aside>
  );
}

function PageTab() {
  const { ui } = useEnv();
  const id = useId();
  // The header and footer only where the storage keeps a change of them;
  // a change not saved yet is said under their name.
  const headerFooter = useOptionalSession()?.capabilities.headerFooter ?? false;
  const waiting = useUi((u) => u.siteDraft !== null && u.site !== null && !sameJson(u.siteDraft, siteValues(u.site)));
  return (
    <PagePanel
      after={(
        <>
          {headerFooter && (
            <button className="sb-link" type="button" data-header-footer="" aria-label="Header and footer" aria-describedby={`${id}-frame`} onClick={() => openHeaderFooter(ui)}>
              <Icon name="globe" />
              <span><strong>Header and footer</strong><small id={`${id}-frame`}>{waiting ? "Changes not saved yet" : "Name, menu, button and footer of every page"}</small></span>
              <Icon name="chevron-right" className="i i-xs" />
            </button>
          )}
          <button className="sb-link" type="button" data-site-style="" aria-label="Site style" aria-describedby={`${id}-what`} onClick={() => openSiteStyle(ui)}>
            <Icon name="style" />
            <span><strong>Site style</strong><small id={`${id}-what`}>Palette and type scale for every page</small></span>
            <Icon name="chevron-right" className="i i-xs" />
          </button>
        </>
      )}
    />
  );
}

function NoBlock() {
  return (
    <div className="sb-body sb-body-pad">
      <p className="hint">Nothing is selected. Select a block on the page, in the Outline or in the bottom line, and its settings show here.</p>
    </div>
  );
}
