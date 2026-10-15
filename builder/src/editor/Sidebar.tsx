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
// style opens a level below Page, in the sidebar's place, and closes back
// to it. The Page tab of a page leads to the site's header and footer,
// which open in the editor as pages do; the Page tab of a header or a
// footer says it is on every page, and leads back to the page around it.
// The top bar's sidebar key, or the sidebar's own close button, hides it,
// and the canvas takes its room.
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { isPartKind, PART_KINDS, type PartKind } from "../storage/adapter.ts";
import { afterRender, shownElement } from "./act.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { BlockPanel, MovingPanel, PagePanel, PartPanel } from "./panels/EditPanel.tsx";
import { PART_NAMES, partOf, useOpenKind, useSession } from "./session.tsx";
import { CustomCssPanel } from "./CustomCssPanel.tsx";
import { SheetGrip } from "./sheet-grip.tsx";
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

// Opens the site's custom CSS in the sidebar, as the site style opens.
export function openCustomCss(ui: UiStore): void {
  ui.setState({ sidebarOpen: true, tray: "custom-css" });
  afterRender(() => document.querySelector<HTMLElement>(".custom-css [data-autofocus]")?.focus());
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
  else if (inside) afterRender(() => shownElement("[data-sidebar]")?.focus());
}

export function Sidebar() {
  const { store, ui } = useEnv();
  const open = useUi((u) => u.sidebarOpen);
  const tray = useUi((u) => u.tray);
  if (!open) return null;
  if (tray === "site-style") {
    return (
      <aside className="sidebar chrome" aria-label="Site style">
        <SheetGrip name="Site style" onClose={() => toggleSidebar(ui)} />
        <SiteStylePanel onClose={() => backToPage(ui, store.getState().selection, "data-site-style")} onHide={() => toggleSidebar(ui)} />
      </aside>
    );
  }
  if (tray === "custom-css") {
    return (
      <aside className="sidebar chrome" aria-label="Custom CSS">
        <SheetGrip name="Custom CSS" onClose={() => toggleSidebar(ui)} />
        <CustomCssPanel onClose={() => backToPage(ui, store.getState().selection, "data-custom-css")} onHide={() => toggleSidebar(ui)} />
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
      <SheetGrip name="Settings" onClose={() => toggleSidebar(ui)} />
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
  const kind = useOpenKind();
  const style = (
    <button className="sb-link" type="button" data-site-style="" aria-label="Site style" aria-describedby={`${id}-what`} onClick={() => openSiteStyle(ui)}>
      <Icon name="style" />
      <span><strong>Site style</strong><small id={`${id}-what`}>Palette and type scale for every page</small></span>
      <Icon name="chevron-right" className="i i-xs" />
    </button>
  );
  const css = (
    <button className="sb-link" type="button" data-custom-css="" aria-label="Custom CSS" aria-describedby={`${id}-css`} onClick={() => openCustomCss(ui)}>
      <Icon name="code" />
      <span><strong>Custom CSS</strong><small id={`${id}-css`}>Your own rules for every page</small></span>
      <Icon name="chevron-right" className="i i-xs" />
    </button>
  );
  if (isPartKind(kind)) return <PartPanel kind={kind} after={<>{style}{css}</>} />;
  return (
    <PagePanel
      after={(
        <>
          {PART_KINDS.map((part) => <PartLink key={part} kind={part} />)}
          {style}
          {css}
        </>
      )}
    />
  );
}

// The way from a page to the site's header or footer, which opens in the
// editor as a page does, made of blocks like it.
function PartLink({ kind }: { kind: PartKind }) {
  const { ui } = useEnv();
  const session = useSession();
  const id = useId();
  const part = partOf(session, kind);
  const name = PART_NAMES[kind];
  const state = !part ? "Made of blocks, on every page" : part.published === null ? "Not published yet: every page shows the starting one" : part.revision > part.published.draftRevision ? "Changes not published yet" : "Published, on every page";
  return (
    <button
      className="sb-link"
      type="button"
      data-part-link={kind}
      aria-label={name}
      aria-describedby={`${id}-state`}
      disabled={!part}
      onClick={() => {
        if (!part) return;
        void session.openPage(part.id).then((why) => {
          if (why) ui.getState().say(why);
        });
      }}
    >
      <Icon name="globe" />
      <span><strong>{name}</strong><small id={`${id}-state`}>{state}</small></span>
      <Icon name="chevron-right" className="i i-xs" />
    </button>
  );
}

function NoBlock() {
  return (
    <div className="sb-body sb-body-pad">
      <p className="hint">Nothing is selected. Select a block on the page, in the Outline or in the bottom line, and its settings show here.</p>
    </div>
  );
}
