// The top bar's three drawers (the approved layout, design/layout/: Insert,
// Outline and History): one open at a time. Insert floats over the left of
// the canvas at every window width, so the page keeps its width under it;
// Outline and History push the page aside, in a column of the frame's own
// (editor.css, .app-pushed), so what is picked in them is never under them.
// A drawer takes the focus when it opens (what it marks data-autofocus: its
// search, the selected row, Save version), unless something in it already
// took it (Ctrl+S's name field); Esc in it, or its close button, closes it
// and gives the focus back to where it was before it opened, or, when the
// selection was changed while the drawer was open, to the block now
// selected. Its top bar key, or its shortcut, opens and closes it the same
// way. A block that takes the focus entirely under Insert makes Insert give
// way (closes it), so the focused block is seen.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { afterRender, shownElement } from "./act.ts";
import { useEnv, type EditorEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { coarsePointer, TYPING } from "./layout-mode.ts";
import { SheetGrip } from "./sheet-grip.tsx";
import { pushes, type Drawer } from "./ui-store.ts";

export const DRAWER_NAMES: Readonly<Record<Drawer, string>> = { insert: "Insert", outline: "Outline", history: "History", assistant: "Assistant" };

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

type Env = Pick<EditorEnv, "store" | "ui">;

// Where the focus was when a drawer opened: it goes back there when the
// drawer closes from inside. Going from one drawer to another keeps the
// place the first one was opened from.
let returnTo: HTMLElement | null = null;

function focused(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

// Opens a drawer, the one open closing, and remembers where the focus was.
export function openDrawer(env: Env, which: Drawer): void {
  const { ui } = env;
  if (ui.getState().drawer === which) return;
  const active = focused();
  if (!active?.closest(".drawer")) returnTo = active;
  ui.getState().setDrawer(which);
}

// Opens a drawer, or closes it when it is the one open.
export function toggleDrawer(env: Env, which: Drawer): void {
  if (env.ui.getState().drawer === which) closeDrawer(env);
  else openDrawer(env, which);
}

// Where the focus goes back to: the place it came from. A block of the
// canvas that is no longer the selection is not that place: the canvas
// selects what takes its focus (./Canvas.tsx, onFocus), so going back to it
// would undo what was chosen in the drawer, the Outline's very job. The
// focus then goes to the block chosen, or to the canvas when none is.
function placeToReturn(env: Env, target: HTMLElement | null, which: Drawer): HTMLElement | null {
  const top = shownElement(`[data-drawer="${which}"]`);
  if (!target?.isConnected) return top;
  const block = target.closest<HTMLElement>(".canvas [data-block-id]");
  if (!block) return target;
  const selection = env.store.getState().selection;
  if (block.dataset.blockId === selection) return target;
  if (selection === null) return document.querySelector<HTMLElement>(".canvas") ?? top;
  return document.querySelector<HTMLElement>(`.canvas [data-block-id="${selection}"]`) ?? top;
}

// Closes the drawer open. The focus, when it was in the drawer (or lost
// with it), goes back to where it was before the drawer opened, else to
// the drawer's key in the top bar; anywhere else, it stays.
export function closeDrawer(env: Env): void {
  const { ui } = env;
  const which = ui.getState().drawer;
  if (which === null) return;
  const active = focused();
  const inside = active === null || active.closest(".drawer") !== null;
  ui.getState().setDrawer(null);
  const target = returnTo;
  returnTo = null;
  if (!inside) return;
  afterRender(() => placeToReturn(env, target, which)?.focus());
}

// Insert floats over the left of the canvas, so a block there may sit under
// it: at the page's width a first column of four is wholly hidden. A block
// that takes the focus with nothing of it in view would fail the person who
// moved to it (WCAG 2.2, 2.4.11), so Insert gives way: it closes, the focus
// staying on the block, and says so. One only partly under it stays, its
// clamp having moved to its other side (./clamp-place.ts). Judged once the
// block is where it will be (brought into view), not when it is focused.
export function giveWayTo(env: Env, block: HTMLElement): void {
  if (env.ui.getState().drawer !== "insert") return;
  afterRender(() => {
    if (env.ui.getState().drawer !== "insert" || document.activeElement !== block) return;
    const canvas = block.closest(".canvas");
    const drawer = document.querySelector(".drawer-float");
    if (!canvas || !drawer) return;
    const view = canvas.getBoundingClientRect();
    const box = block.getBoundingClientRect();
    const cover = drawer.getBoundingClientRect();
    // What of the block is in the canvas's view; none, nothing to hide.
    const seen = { left: Math.max(box.left, view.left), top: Math.max(box.top, view.top), right: Math.min(box.right, view.right), bottom: Math.min(box.bottom, view.bottom) };
    if (seen.right <= seen.left || seen.bottom <= seen.top) return;
    if (seen.left < cover.left || seen.right > cover.right || seen.top < cover.top || seen.bottom > cover.bottom) return;
    env.ui.getState().setDrawer(null);
    returnTo = null;
    env.ui.getState().say("Insert closed: it was covering the block.");
  });
}

interface DrawerShellProps {
  which: Drawer;
  children: ReactNode;
  // A line under everything (Outline's count).
  footer?: ReactNode;
}

export function DrawerShell({ which, children, footer }: DrawerShellProps) {
  const env = useEnv();
  const box = useRef<HTMLElement>(null);
  const name = DRAWER_NAMES[which];

  // After the drawer's own content: a field that took the focus for itself
  // keeps it. With a finger, no field to type in (./layout-mode.ts, TYPING).
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || element.contains(document.activeElement)) return;
    const touch = coarsePointer();
    const typed = (key: Element | null) => touch && key !== null && key.matches(TYPING);
    // What the content marks, else its first key, else the close button.
    const keys = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((key) => !typed(key));
    const marked = element.querySelector<HTMLElement>("[data-autofocus]");
    const first = (typed(marked) ? null : marked) ?? keys.find((key) => !key.closest(".drawer-head")) ?? keys[0];
    first?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      ref={box}
      className={`drawer drawer-${which} ${pushes(which) ? "drawer-push" : "drawer-float"} chrome`}
      id={`drawer_${which}`}
      aria-labelledby={`drawer_${which}_title`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A menu or a window opened from the drawer keeps its own Esc.
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[role=menu], [role=dialog]")) return;
        event.preventDefault();
        closeDrawer(env);
      }}
    >
      <SheetGrip name={name} onClose={() => closeDrawer(env)} />
      <header className="drawer-head">
        <h2 id={`drawer_${which}_title`}>{name}</h2>
        <button className="ibtn" type="button" aria-label={`Close ${name}`} title="Close (Esc)" onClick={() => closeDrawer(env)}><Icon name="close" /></button>
      </header>
      {children}
      {footer}
    </aside>
  );
}
