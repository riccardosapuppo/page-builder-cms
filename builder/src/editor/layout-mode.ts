// The editor's own layout, from the window it has (not the device the
// canvas previews, which is the page's): wide, the layout of the approved
// design, with the sidebar beside the canvas; medium, a tablet's, the
// sidebar a panel over the canvas that opens and closes; and narrow, a
// phone's, the canvas the whole width, its panels sheets from the bottom
// and its navigation a bar at the foot, within reach of a thumb. One
// editor, one document and one set of commands in all three: only where
// things stand changes.
//
// The widths are where the approved layout stops fitting: the canvas needs
// about 680 beside a 296 sidebar to draw a tablet's page at a readable
// scale (wide from 1100), and under 700 there is no room for the sidebar
// beside anything (narrow). Between them a tablet's layout is for a
// finger: pointed at with a mouse, a desktop's window of that width keeps
// the approved layout, the page drawn smaller to fit as that layout draws
// it (design/layout/NOTES.md, 4.8).
import { useSyncExternalStore } from "react";
import type { Preview } from "./ui-store.ts";

export type LayoutMode = "wide" | "medium" | "narrow";

export const LAYOUT_WIDTHS = { medium: 700, wide: 1100 } as const;

const QUERIES = {
  wide: `(min-width: ${LAYOUT_WIDTHS.wide}px)`,
  medium: `(min-width: ${LAYOUT_WIDTHS.medium}px) and (max-width: ${LAYOUT_WIDTHS.wide - 0.02}px)`,
  coarse: "(pointer: coarse)",
} as const;

function readMode(): LayoutMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "wide";
  if (window.matchMedia(QUERIES.wide).matches) return "wide";
  if (window.matchMedia(QUERIES.medium).matches) return window.matchMedia(QUERIES.coarse).matches ? "medium" : "wide";
  return "narrow";
}

function subscribe(changed: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lists = Object.values(QUERIES).map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", changed);
  return () => {
    for (const list of lists) list.removeEventListener("change", changed);
  };
}

// The layout the editor draws now, drawn again when the window crosses a
// width. A browser with no matchMedia (a test's) is wide.
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, readMode, () => "wide");
}

// What the editor starts with in the layout it opens in. On a phone, the
// page as a phone shows it, drawn at its size, and the settings shut (a
// sheet the bar opens); on a tablet, the settings shut, a panel over the
// canvas; on both, one panel over the canvas at a time. A phone's settings edit what a phone shows, as they do on any
// window with Phone chosen (./panels/StyleFields.tsx), each saying so.
export function layoutStart(mode: LayoutMode = readMode()): { preview?: Preview; sidebarOpen?: boolean; onePanel?: boolean } {
  if (mode === "narrow") return { preview: "phone", sidebarOpen: false, onePanel: true };
  if (mode === "medium") return { sidebarOpen: false, onePanel: true };
  return {};
}

function readCoarse(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERIES.coarse).matches;
}

function subscribeCoarse(changed: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(QUERIES.coarse);
  list.addEventListener("change", changed);
  return () => list.removeEventListener("change", changed);
}

// Whether the person points with a finger: the keys grow to 44 (the
// stylesheets' own (pointer: coarse)), and the words say tap, not click.
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false);
}

export function coarsePointer(): boolean {
  return readCoarse();
}

// Whether a mouse or a trackpad is there too (any-pointer: fine), where a
// keyboard often is: the editor offers its keyboard shortcuts then.
export function useFinePointerToo(): boolean {
  return useSyncExternalStore(subscribeFine, readFine, () => true);
}

function readFine(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(any-pointer: fine)").matches;
}

function subscribeFine(changed: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia("(any-pointer: fine)");
  list.addEventListener("change", changed);
  return () => list.removeEventListener("change", changed);
}

// A field that takes typing: focused, a phone opens its keyboard over half
// the window. With a finger, the editor never focuses one for the person
// (a drawer's search, a picker's): it is a tap away when they want it.
export const TYPING = "input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file]), textarea, [contenteditable='true']";

// While a field that takes typing has the focus, the editor's root says so
// (data-typing): on a phone's window, with a finger, the keyboard takes the
// window's foot, so the bar gives it its room and a sheet stands on the
// keyboard (editor.css). The mark comes the moment such a field takes the
// focus, and goes only a task after the focus has left them all: a tap's
// press moves the focus, and its release and its click follow in the same
// task, so the sheet under the finger stays where it is until the tap has
// landed. (Drawn from the focus alone, the sheet moved down by the bar's
// height between the press and the release, and the first tap on a
// sheet's key, the brief's field focused, missed the key.)
export function markTyping(root: HTMLElement, schedule: (then: () => void) => void = (then) => window.setTimeout(then, 0)): () => void {
  let waiting = false;
  const typingNow = () => document.activeElement instanceof Element && document.activeElement.matches(TYPING);
  const later = () => {
    if (waiting) return;
    waiting = true;
    schedule(() => {
      waiting = false;
      if (!root.isConnected) return;
      root.toggleAttribute("data-typing", typingNow());
    });
  };
  const focusIn = () => {
    if (typingNow()) root.toggleAttribute("data-typing", true);
    else later();
  };
  root.toggleAttribute("data-typing", typingNow());
  document.addEventListener("focusin", focusIn);
  document.addEventListener("focusout", later);
  return () => {
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("focusout", later);
    root.removeAttribute("data-typing");
  };
}
