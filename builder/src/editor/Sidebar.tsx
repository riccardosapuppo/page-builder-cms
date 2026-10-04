// The one sidebar, on the right (the approved layout, design/layout/): the
// Page tab, the page's own settings and the way to the site style; the
// Block tab, the selected block's panel (./panels/EditPanel.tsx). The tab
// follows the selection: a block chosen shows Block, nothing selected shows
// Page, and either can be chosen by hand in between. Site style opens a
// level below Page, in the sidebar's place, and closes back to it. The top
// bar's sidebar key, or the sidebar's own close button, hides it, and the
// canvas takes its room.
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { afterRender } from "./act.ts";
import { useEditor, useEnv, useUi } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { BlockPanel, PagePanel } from "./panels/EditPanel.tsx";
import { SiteStylePanel } from "./SiteStylePanel.tsx";
import type { UiStore } from "./ui-store.ts";

const TABS = ["page", "block"] as const;
type Tab = (typeof TABS)[number];
const TAB_NAMES: Readonly<Record<Tab, string>> = { page: "Page", block: "Block" };

// Opens the site style in the sidebar, the sidebar shown if it was hidden,
// and puts the focus in it.
export function openSiteStyle(ui: UiStore): void {
  ui.setState({ sidebarOpen: true, tray: "site-style" });
  afterRender(() => document.querySelector<HTMLElement>(".site-style [data-autofocus]")?.focus());
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
  const { ui } = useEnv();
  const open = useUi((u) => u.sidebarOpen);
  const tray = useUi((u) => u.tray);
  if (!open) return null;
  if (tray === "site-style") {
    return (
      <aside className="sidebar chrome" aria-label="Site style">
        <SiteStylePanel
          onClose={() => {
            ui.getState().setTray("edit");
            // A level up: the Page tab, the focus on the way back in.
            afterRender(() => document.querySelector<HTMLElement>(".sidebar [data-site-style]")?.focus());
          }}
        />
      </aside>
    );
  }
  return <Settings />;
}

function Settings() {
  const { ui } = useEnv();
  const selection = useEditor((s) => s.selection);
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  // Follows the selection, as React keeps state that follows a value from
  // outside: adjusted while drawing.
  const [tab, setTab] = useState<Tab>(selection === null ? "page" : "block");
  const [seen, setSeen] = useState(selection);
  if (selection !== seen) {
    setSeen(selection);
    setTab(selection === null ? "page" : "block");
  }
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
        {tab === "page" ? <PageTab /> : selection === null ? <NoBlock /> : <BlockPanel id={selection} />}
      </div>
    </aside>
  );
}

function PageTab() {
  const { ui } = useEnv();
  const id = useId();
  return (
    <>
      <PagePanel />
      <button className="sb-link" type="button" data-site-style="" aria-label="Site style" aria-describedby={`${id}-what`} onClick={() => openSiteStyle(ui)}>
        <Icon name="style" />
        <span><strong>Site style</strong><small id={`${id}-what`}>Palette and type scale for every page</small></span>
        <Icon name="chevron-right" className="i i-xs" />
      </button>
    </>
  );
}

function NoBlock() {
  return (
    <div className="tray-body">
      <p className="hint">Nothing is selected. Select a block on the page, in the Outline or in the bottom line, and its settings show here.</p>
    </div>
  );
}
