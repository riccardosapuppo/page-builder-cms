// The selected block's clamp (design/layout/NOTES.md, section 4.2): its
// tools in a graphite bar floating by the selection's frame, outside the
// block and over none of the page's words where a place is free of them
// (./clamp-place.ts says where). From the start: the yellow head naming
// the block, with its type's icon, which opens the block menu (the moves,
// then everything in More); the grip, which drags the block (or picks it
// up with Space); move up and move down (left and right for a column),
// each one command; and More (copy, paste after, duplicate, insert before
// or after, select the parent, delete), the menu a right click opens too.
// Every block, section and column gets the same toolbar.
//
// While its text is being written, the moving keys give their place to
// bold, italic and link (Up, Down and Space are the text's then), the
// head names the text, and Esc gives them back; the grip and More stay,
// so the block can still be dragged or duplicated without leaving it.
//
// One Tab stop, after the block's own (a toolbar): the arrows move along
// it, Esc goes back to the block, or into the text being written.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { makeMove } from "../document/commands.ts";
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { BlockType } from "../shared/document.ts";
import { afterRender, runCommand } from "./act.ts";
import { caretAtEnd, editableIn } from "./caret.ts";
import { BlockIcon } from "./block-icon.tsx";
import { canvasUi } from "./canvas-ui.ts";
import { placeToolbar, plusShift, toolbarBox, TOOLBAR_GAP, UNDER_PLUS, type Box, type ToolbarRoom } from "./clamp-place.ts";
import { useEnv, type EditorEnv } from "./context.tsx";
import { ariaKeyShortcuts, entry, entryKeysText } from "./keymap.ts";
import { Icon } from "./icons.tsx";
import type { TextTools } from "./rich/tools.ts";

export type ClampKind = "section" | "column" | "widget";

// What the clamp's moves are called, and why one cannot be made.
export const MOVES: Readonly<Record<ClampKind, { back: string; on: string; backIcon: "arrow-up" | "arrow-left"; onIcon: "arrow-down" | "arrow-right" }>> = {
  widget: { back: "Move up", on: "Move down", backIcon: "arrow-up", onIcon: "arrow-down" },
  section: { back: "Move up", on: "Move down", backIcon: "arrow-up", onIcon: "arrow-down" },
  column: { back: "Move left", on: "Move right", backIcon: "arrow-left", onIcon: "arrow-right" },
};

// Where the block stands among the blocks beside it, for its moves.
export interface Standing {
  index: number;
  count: number;
  // "Column 1", "the page": what the block is first or last in.
  within: string;
}

export function standingOf(doc: Parameters<typeof locate>[0], id: string): Standing | null {
  const found = locate(doc, id);
  if (!found) return null;
  const siblings = found.parentId === null ? doc.sections : locate(doc, found.parentId)?.block.children ?? [];
  return { index: found.index, count: siblings.length, within: found.parentId === null ? "the page" : blockName(doc, found.parentId) };
}

// Where a block is, for its head's title: "Column 1 of Hero" for a widget,
// "Hero" for a column, nothing for a section.
export function whereIn(doc: Parameters<typeof locate>[0], id: string): string {
  const found = locate(doc, id);
  if (!found || found.parentId === null) return "";
  const parent = locate(doc, found.parentId);
  if (!parent) return "";
  return parent.parentId === null ? blockName(doc, parent.block.id) : `${blockName(doc, parent.block.id)} of ${blockName(doc, parent.parentId)}`;
}

// Why a move cannot be made, or null: "Already the first block in Column 1".
export function moveRefusal(kind: ClampKind, standing: Standing, by: -1 | 1): string | null {
  const at = standing.index + by;
  if (at >= 0 && at < standing.count) return null;
  const end = by < 0 ? "first" : "last";
  if (kind === "section") return `Already the ${end} section`;
  if (kind === "column") return `Already the ${end} column`;
  return `Already the ${end} block in ${standing.within}`;
}

// The same, shorter, beside the move in a menu: "Last in Column 1".
export function moveWhy(kind: ClampKind, standing: Standing, by: -1 | 1): string | null {
  if (moveRefusal(kind, standing, by) === null) return null;
  const end = by < 0 ? "First" : "Last";
  if (kind === "section") return `${end} section`;
  if (kind === "column") return `${end} column`;
  return `${end} in ${standing.within}`;
}

// A move by one place among its siblings: ONE command, the focus kept on
// the key that made it (the block is drawn again where it went).
export function moveBlock(env: Pick<EditorEnv, "store" | "ui">, id: string, by: -1 | 1, key?: string): void {
  const found = locate(env.store.getState().document, id);
  if (!found) return;
  const made = runCommand(env, (doc) => makeMove(doc, id, { parentId: found.parentId, index: found.index + by }), "canvas");
  if (made === null && key) afterRender(() => clampKey(id, key)?.focus({ preventScroll: true }));
}

// A key of the selected block's clamp, by its name (data-key).
export function clampKey(id: string, key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"] > .clamp [data-key="${key}"]`);
}

// Opens the block's menu from the clamp: the head's, or More's, under the
// toolbar, from the key's left (./BlockMenu.tsx).
export function openClampMenu(env: Pick<EditorEnv, "ui">, from: HTMLElement, which: "head" | "more"): void {
  const clamp = from.closest(".clamp");
  if (!clamp) return;
  // Pressed again, the key closes its menu.
  if (env.ui.getState().blockMenu && canvasUi(env.ui).getState().menuFrom === which) {
    env.ui.getState().setBlockMenu(null);
    return;
  }
  const box = clamp.getBoundingClientRect();
  const key = from.getBoundingClientRect();
  canvasUi(env.ui).getState().setMenu(which === "head" ? "block" : "more", which);
  env.ui.getState().setBlockMenu({ x: key.left, y: box.bottom + MENU_GAP, from: "canvas" });
}

// Between the toolbar and a menu opened from it.
export const MENU_GAP = 6;

// ------------------------------------------------------------- placing

const meets = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// What the toolbar keeps off near the frame, where it might stand: the
// lines of the other blocks' words, a section's blocks' included (its
// toolbar may stand inside it); the selected block's own lines; and the
// other widgets that hold no words (a picture, a gallery, a video, a map,
// a rule, a spacer), whose whole box counts. A block of words counts by
// its lines, read one by one (a block's element may have no box of its
// own, a folded menu's): the empty end of a short line is free. The
// editor's own words (names, tips, the toolbar's) are none of the page's,
// and the locked header and footer and the dimmed page around a part are
// not edited here: a toolbar may stand over them.
const NOT_PAGE = ".clamp, .ov, .ins, .ins-empty, .seam-tip, [data-theme-part], [data-around-page]";
const WORDLESS = ["image", "gallery", "video", "map", "divider", "spacer"].map((type) => `[data-block-type="${type}"]`).join(", ");
function coversNear(own: HTMLElement, frame: Box, width: number, height: number, section: boolean): Pick<ToolbarRoom, "words" | "ownWords" | "blocks"> {
  const page = own.closest(".frame");
  if (!page) return { words: [] };
  const reach = height + UNDER_PLUS + 2;
  const near: Box = { left: frame.left - width, right: frame.right + width, top: frame.top - reach, bottom: frame.bottom + reach };
  const words: Box[] = [];
  const ownWords: Box[] = [];
  const range = document.createRange();
  // A browser that cannot give a range's lines (jsdom) counts no words.
  const walker = typeof range.getClientRects === "function" ? document.createTreeWalker(page, NodeFilter.SHOW_TEXT) : null;
  for (let node = walker?.nextNode(); walker && node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || parent.closest(NOT_PAGE)) continue;
    const mine = !section && own.contains(parent);
    range.selectNodeContents(node);
    for (const line of range.getClientRects()) if (line.width > 0 && meets(line, near)) (mine ? ownWords : words).push(line);
  }
  const blocks: Box[] = [];
  for (const block of page.querySelectorAll<HTMLElement>(WORDLESS)) {
    if (block.closest(NOT_PAGE) || own.contains(block) || block.contains(own)) continue;
    const box = block.getBoundingClientRect();
    if (box.width > 0 && meets(box, near)) blocks.push(box);
  }
  return { words, ownWords, blocks };
}

// The room around the selection, measured on the page as it is drawn:
// the frame (a button's hugs its pill), the canvas's visible part, the
// drawer floating over it, the words near it.
function roomOf(own: HTMLElement, kind: ClampKind, clamp: HTMLElement): { room: ToolbarRoom; scale: number } | null {
  const canvas = own.closest<HTMLElement>(".canvas");
  const scaled = own.closest<HTMLElement>(".frame");
  if (!canvas || !scaled) return null;
  const scale = Number(scaled.dataset.scale ?? "1") || 1;
  const bench = canvas.getBoundingClientRect();
  const view: Box = { left: bench.left + canvas.clientLeft, top: bench.top + canvas.clientTop, right: bench.left + canvas.clientLeft + canvas.clientWidth, bottom: bench.top + canvas.clientTop + canvas.clientHeight };
  const frame = (own.querySelector(":scope > .ov-sel") ?? own).getBoundingClientRect();
  // Only the floating drawer (Insert) is over the canvas; the pushed ones
  // have a column of their own.
  const covers = [...document.querySelectorAll(".drawer-float")].map((drawer) => drawer.getBoundingClientRect());
  const width = clamp.offsetWidth;
  const height = clamp.offsetHeight;
  const section = kind === "section";
  return { scale, room: { frame, view, covers, ...coversNear(own, frame, width, height, section), width, height, section } };
}

// The seams whose "+" the clamp may stand on: the one below its section,
// and the one above it, which the section before draws, or the section
// itself above the page's first. A "+" is moved along its seam by a
// property of the section that draws it (canvas.css: --seam-shift for the
// seam below it, --seam-shift-top for the one above).
interface SeamPlus {
  host: HTMLElement;
  edge: "top" | "bottom";
}

const SEAM_SHIFT: Readonly<Record<SeamPlus["edge"], string>> = { bottom: "--seam-shift", top: "--seam-shift-top" };

function seamsBeside(own: HTMLElement, kind: ClampKind): SeamPlus[] {
  const section = kind === "section" ? own : own.closest<HTMLElement>("[data-block-type=section]");
  const row = section?.parentElement;
  if (!section || !row) return [];
  const sections = [...row.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.dataset.blockType === "section");
  const before = sections[sections.indexOf(section) - 1];
  return [{ host: section, edge: "bottom" }, before ? { host: before, edge: "bottom" } : { host: section, edge: "top" }];
}

// Moves each seam's "+" off the clamp, or back to the page's middle when
// the clamp leaves it clear (./clamp-place.ts, plusShift), in the page's
// pixels: the "+" is drawn on the page, which may be drawn smaller.
function clearSeams(seams: readonly SeamPlus[], clamp: Box, scale: number): void {
  for (const { host, edge } of seams) {
    const band = host.getBoundingClientRect();
    const shift = plusShift(clamp, { x: (band.left + band.right) / 2, y: edge === "top" ? band.top : band.bottom }, band);
    if (shift === 0) host.style.removeProperty(SEAM_SHIFT[edge]);
    else host.style.setProperty(SEAM_SHIFT[edge], `${shift / scale}px`);
  }
}

function forgetSeams(seams: readonly SeamPlus[]): void {
  for (const { host, edge } of seams) host.style.removeProperty(SEAM_SHIFT[edge]);
}

// Lays the toolbar where it goes, in the block's own pixels (the page may
// be drawn smaller: the toolbar is drawn back up to its size, canvas.css),
// and keeps room above the block and under it for the toolbar, so a block
// brought into view comes with a place for it outside the block on either
// side. Moves the seams' "+" off it, and says which seams it looked at.
function placeOnPage(clamp: HTMLElement, kind: ClampKind): SeamPlus[] {
  const own = clamp.parentElement;
  if (!own) return [];
  const measured = roomOf(own, kind, clamp);
  if (!measured) return [];
  const { room, scale } = measured;
  const place = placeToolbar(room);
  const box = own.getBoundingClientRect();
  clamp.style.left = `${(place.x - box.left) / scale - own.clientLeft}px`;
  clamp.style.top = `${(place.y - box.top) / scale - own.clientTop}px`;
  clamp.dataset.side = place.side;
  clamp.dataset.align = place.align;
  own.style.scrollMarginTop = `${Math.ceil((room.height + TOOLBAR_GAP + 16) / scale)}px`;
  own.style.scrollMarginBottom = `${Math.ceil((room.height + UNDER_PLUS + 16) / scale)}px`;
  const seams = seamsBeside(own, kind);
  clearSeams(seams, toolbarBox(room, place), scale);
  return seams;
}

// Places the toolbar now, and again whenever the block, the page, the
// canvas or the toolbar changes size, the canvas scrolls (the toolbar
// keeps in view, by a tall block at the canvas's top), the page is drawn
// at a new scale, or a drawer opens or closes over the canvas. Gone, it
// gives the seams' "+" back their places and the block its scroll margins.
function useClampPlace(ref: { current: HTMLDivElement | null }, kind: ClampKind, writing: boolean): void {
  const { ui } = useEnv();
  useLayoutEffect(() => {
    const clamp = ref.current;
    const own = clamp?.parentElement;
    if (!clamp || !own) return undefined;
    let frame = 0;
    // The seams looked at last: a section moved by its clamp has another
    // section before it, whose "+" goes back to its place.
    let seams: SeamPlus[] = [];
    const place = () => {
      const now = placeOnPage(clamp, kind);
      forgetSeams(seams.filter((seam) => !now.some((other) => other.host === seam.host && other.edge === seam.edge)));
      seams = now;
    };
    const soon = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    place();
    const resized = new ResizeObserver(place);
    resized.observe(clamp);
    resized.observe(own);
    const page = own.closest(".site");
    if (page) resized.observe(page);
    const canvas = own.closest(".canvas");
    if (canvas) resized.observe(canvas);
    const rescaled = new MutationObserver(place);
    const scaled = own.closest(".frame");
    if (scaled) rescaled.observe(scaled, { attributes: true, attributeFilter: ["style", "data-scale"] });
    canvas?.addEventListener("scroll", soon, { passive: true });
    const unsubscribe = ui.subscribe((state, before) => {
      if (state.drawer !== before.drawer) afterRender(place);
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resized.disconnect();
      rescaled.disconnect();
      canvas?.removeEventListener("scroll", soon);
      unsubscribe();
      own.style.scrollMarginTop = "";
      own.style.scrollMarginBottom = "";
      forgetSeams(seams);
    };
  }, [ref, kind, writing, ui]);
}

// ------------------------------------------------------------- the clamp

interface ClampProps {
  id: string;
  kind: ClampKind;
  type: BlockType;
  name: string;
  // The text being written in the block, with its formatting.
  tools: TextTools | null;
}

const PICK_UP = entryKeysText(entry("pickUp"));
const MENU_KEY = entryKeysText(entry("blockMenu"));
const LEAVE = entryKeysText(entry("leaveText"));

export function Clamp({ id, kind, type, name, tools }: ClampProps) {
  const env = useEnv();
  const { store, ui } = env;
  const ref = useRef<HTMLDivElement>(null);
  const standing = useStore(store, useShallow((s) => standingOf(s.document, id)));
  const place = useStore(store, (s) => whereIn(s.document, id));
  const menu = useStore(ui, (u) => u.blockMenu !== null);
  const menuFrom = useStore(canvasUi(ui), (s) => s.menuFrom);
  const writing = tools !== null;
  useClampPlace(ref, kind, writing);

  // The one key the Tab key lands on: the head, or, writing, Bold; the
  // arrows move it.
  const first = writing ? 1 : 0;
  const [tabStop, setTabStop] = useState({ writing, at: first });
  const current = tabStop.writing === writing ? tabStop.at : first;
  const setCurrent = (at: number) => setTabStop({ writing, at });
  const keys = () => [...(ref.current?.querySelectorAll<HTMLElement>(":scope > button") ?? [])];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = keys();
    const at = all.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(all.length - 1, at + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = all.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      // Back to the text being written, to the line of a heading being
      // written, or to the block.
      const block = ref.current?.parentElement ?? null;
      const line = !tools && block ? editableIn(block) : null;
      if (tools) tools.run.closeLink(true);
      else if (line) caretAtEnd(line);
      else (block as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setCurrent(next);
    all[next]?.focus();
  };
  const roving = (index: number) => ({ tabIndex: index === current ? 0 : -1, onFocus: () => setCurrent(index) });

  if (!standing) return null;
  const moves = MOVES[kind];
  const back = moveRefusal(kind, standing, -1);
  const on = moveRefusal(kind, standing, 1);
  const where = place ? `, in ${place}` : "";
  const keep = (event: { preventDefault(): void }) => event.preventDefault();

  // The grip and More stay while a text is written: the block can still be
  // dragged, duplicated or deleted from its clamp, its text handed over
  // first. Only the moves, whose keys the text takes, give their place.
  // Keyed, so the two clamps share these two elements as the text opens
  // and closes: a menu opened from More keeps its key to go back to.
  const grip = (index: number) => <button key="grip" type="button" className="clamp-grip" data-key="grip" data-grip aria-label={`Drag to move, or press ${PICK_UP} to pick up`} title="Drag to move" {...roving(index)}><Icon name="grip" className="li" /></button>;
  const more = (index: number) => (
    <button
      key="more"
      type="button"
      data-key="more"
      aria-label="More: copy, paste, duplicate, insert, delete"
      aria-haspopup="menu"
      aria-expanded={menu && menuFrom === "more"}
      title="More (or right-click the block)"
      onClick={(event) => openClampMenu(env, event.currentTarget, "more")}
      {...roving(index)}
    >
      <Icon name="more" className="li" />
    </button>
  );

  if (tools) {
    return (
      <div ref={ref} className="clamp clamp-text" role="toolbar" aria-orientation="horizontal" aria-label="Text formatting" onKeyDown={onKeyDown}>
        <span key="head-static" className="clamp-head clamp-head-static" role="img" aria-label={`${name}, being written`} title={`${name}, being written. ${LEAVE} to finish`}><BlockIcon type={type} className="i" /><span className="clamp-name" aria-hidden="true">{name}</span></span>
        {grip(0)}
        <button key="bold" type="button" data-key="bold" aria-label="Bold" aria-pressed={tools.bold} aria-keyshortcuts={ariaKeyShortcuts(entry("bold"))} title={`Bold (${entryKeysText(entry("bold"))})`} onMouseDown={keep} onClick={() => tools.run.toggleBold()} {...roving(1)}><Icon name="bold" className="li" /></button>
        <button key="italic" type="button" data-key="italic" aria-label="Italic" aria-pressed={tools.italic} aria-keyshortcuts={ariaKeyShortcuts(entry("italic"))} title={`Italic (${entryKeysText(entry("italic"))})`} onMouseDown={keep} onClick={() => tools.run.toggleItalic()} {...roving(2)}><Icon name="italic" className="li" /></button>
        <button
          type="button"
          key="link"
          data-key="link"
          aria-label={tools.link ? `Link to ${tools.link}` : "Link"}
          aria-pressed={tools.link !== null}
          aria-expanded={tools.linkOpen}
          aria-keyshortcuts={ariaKeyShortcuts(entry("link"))}
          title={`Link the selected words (${entryKeysText(entry("link"))})`}
          onMouseDown={keep}
          onClick={() => (tools.linkOpen ? tools.run.closeLink(true) : tools.run.openLink())}
          {...roving(3)}
        >
          <Icon name="link" className="li" />
        </button>
        <hr key="rule" aria-hidden="true" />
        {more(4)}
      </div>
    );
  }

  return (
    <div ref={ref} className={`clamp${kind === "section" ? " clamp-in" : ""}`} role="toolbar" aria-orientation="horizontal" aria-label={`${name} tools`} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="clamp-head"
        key="head"
        data-key="head"
        aria-haspopup="menu"
        aria-expanded={menu && menuFrom === "head"}
        aria-label={`${name}: block menu`}
        aria-keyshortcuts={ariaKeyShortcuts(entry("blockMenu"))}
        title={`${name}${where}. Block menu (${MENU_KEY})`}
        onClick={(event) => openClampMenu(env, event.currentTarget, "head")}
        {...roving(0)}
      >
        <BlockIcon type={type} className="i" />
        <span className="clamp-name" aria-hidden="true">{name}</span>
        <Icon name="chevron-down" className="li li-xs" />
      </button>
      {grip(1)}
      <button key="back" type="button" data-key="back" aria-label={moves.back} aria-disabled={back ? true : undefined} title={back ?? moves.back} onClick={() => (back ? undefined : moveBlock(env, id, -1, "back"))} {...roving(2)}><Icon name={moves.backIcon} className="li" /></button>
      <button key="on" type="button" data-key="on" aria-label={moves.on} aria-disabled={on ? true : undefined} title={on ?? moves.on} onClick={() => (on ? undefined : moveBlock(env, id, 1, "on"))} {...roving(3)}><Icon name={moves.onIcon} className="li" /></button>
      <hr key="rule" aria-hidden="true" />
      {more(4)}
    </div>
  );
}
