// The top bar's three drawers (the approved layout, design/layout/: Insert,
// Outline and History): one open at a time, each floating over the left of
// the canvas at every window width, so the page keeps its width under it.
// A drawer takes the focus when it opens (what it marks data-autofocus: its
// search, the selected row, Save version), unless something in it already
// took it (Ctrl+S's name field); Esc in it, or its close button, closes it
// and gives the focus back to where it was before it opened. Its top bar
// key, or its shortcut, opens and closes it the same way.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { afterRender } from "./act.ts";
import { useEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import type { Drawer, UiStore } from "./ui-store.ts";

export const DRAWER_NAMES: Readonly<Record<Drawer, string>> = { insert: "Insert", outline: "Outline", history: "History" };

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Where the focus was when a drawer opened: it goes back there when the
// drawer closes from inside. Going from one drawer to another keeps the
// place the first one was opened from.
let returnTo: HTMLElement | null = null;

function focused(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

// Opens a drawer, the one open closing, and remembers where the focus was.
export function openDrawer(ui: UiStore, which: Drawer): void {
  if (ui.getState().drawer === which) return;
  const active = focused();
  if (!active?.closest(".drawer")) returnTo = active;
  ui.getState().setDrawer(which);
}

// Opens a drawer, or closes it when it is the one open.
export function toggleDrawer(ui: UiStore, which: Drawer): void {
  if (ui.getState().drawer === which) closeDrawer(ui);
  else openDrawer(ui, which);
}

// Closes the drawer open. The focus, when it was in the drawer (or lost
// with it), goes back to where it was before the drawer opened, else to
// the drawer's key in the top bar; anywhere else, it stays.
export function closeDrawer(ui: UiStore): void {
  const which = ui.getState().drawer;
  if (which === null) return;
  const active = focused();
  const inside = active === null || active.closest(".drawer") !== null;
  ui.getState().setDrawer(null);
  const target = returnTo;
  returnTo = null;
  if (!inside) return;
  afterRender(() => {
    const back = target?.isConnected ? target : document.querySelector<HTMLElement>(`.topbar [data-drawer="${which}"]`);
    back?.focus();
  });
}

interface DrawerShellProps {
  which: Drawer;
  children: ReactNode;
  // A line under everything (Outline's count).
  footer?: ReactNode;
}

export function DrawerShell({ which, children, footer }: DrawerShellProps) {
  const { ui } = useEnv();
  const box = useRef<HTMLElement>(null);
  const name = DRAWER_NAMES[which];

  // After the drawer's own content: a field that took the focus for itself
  // keeps it.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || element.contains(document.activeElement)) return;
    // What the content marks, else its first key, else the close button.
    const keys = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = element.querySelector<HTMLElement>("[data-autofocus]") ?? keys.find((key) => !key.closest(".drawer-head")) ?? keys[0];
    first?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      ref={box}
      className={`drawer drawer-${which} chrome`}
      id={`drawer_${which}`}
      aria-labelledby={`drawer_${which}_title`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A menu or a window opened from the drawer keeps its own Esc.
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[role=menu], [role=dialog]")) return;
        event.preventDefault();
        closeDrawer(ui);
      }}
    >
      <header className="drawer-head">
        <h2 id={`drawer_${which}_title`}>{name}</h2>
        <button className="ibtn" type="button" aria-label={`Close ${name}`} title="Close (Esc)" onClick={() => closeDrawer(ui)}><Icon name="close" /></button>
      </header>
      {children}
      {footer}
    </aside>
  );
}
