// The selected block's clamp (design/layout/NOTES.md, section 4.2): its
// tools in a vertical graphite bar in the page's margin, held to the block
// and never over it (./clamp-place.ts says where). From the top: the
// yellow head with the block's type, which opens the block menu (the
// moves, then everything in More); the grip, which drags the block (or
// picks it up with Space); move up and move down (left and right for a
// column), each one command; and More (copy, paste after, duplicate,
// insert before or after, select the parent, delete), the menu a right
// click opens too. Every block, section and column gets the same clamp,
// whatever its height: beside a short block it runs on below it.
//
// While its text is being written, the moving keys give their place to
// bold, italic and link (Up, Down and Space are the text's then), the
// head names the text, and Esc gives them back; the grip and More stay,
// so the block can still be dragged or duplicated without leaving it.
//
// One Tab stop, after the block's own (a toolbar): Up and Down move along
// it, Esc goes back to the block, or into the text being written.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { makeMove } from "../document/commands.ts";
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { BlockType } from "../shared/document.ts";
import { afterRender, runCommand } from "./act.ts";
import { BlockIcon } from "./block-icon.tsx";
import { canvasUi } from "./canvas-ui.ts";
import { placeClamp, type Box, type ClampRoom } from "./clamp-place.ts";
import { useEnv, type EditorEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { ariaKeyShortcuts, entry, entryKeysText } from "./keymap.ts";
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

// Opens the block's menu from the clamp: the head's, or More's, beside
// the clamp, at the key's height (./BlockMenu.tsx).
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
  env.ui.getState().setBlockMenu({ x: box.right + 12, y: which === "head" ? box.top : key.top, from: "canvas" });
}

// ------------------------------------------------------------- placing

// The room around the block, measured on the page as it is drawn.
function roomOf(own: HTMLElement, kind: ClampKind, clamp: HTMLElement): ClampRoom | null {
  const canvas = own.closest<HTMLElement>(".canvas");
  const frame = own.closest<HTMLElement>(".frame");
  if (!canvas || !frame) return null;
  const scale = Number(frame.dataset.scale ?? "1") || 1;
  const bench = canvas.getBoundingClientRect();
  const view: Box = { left: bench.left + canvas.clientLeft, top: bench.top + canvas.clientTop, right: bench.left + canvas.clientLeft + canvas.clientWidth, bottom: bench.top + canvas.clientTop + canvas.clientHeight };
  const section = kind === "section" ? own : own.closest<HTMLElement>("[data-block-type=section]");
  const row = section?.querySelector<HTMLElement>(":scope > .sw-inner");
  const columns = row ? [...row.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.dataset.blockType === "column") : [];
  const boxes = columns.map((column) => column.getBoundingClientRect());
  const ownBox = own.getBoundingClientRect();
  const contentLeft = boxes.length > 0 ? Math.min(...boxes.map((b) => b.left)) : ownBox.left;
  const contentRight = boxes.length > 0 ? Math.max(...boxes.map((b) => b.right)) : ownBox.right;
  let block: Box = ownBox;
  let leftLimit = view.left;
  let rightLimit = view.right;
  if (kind === "section") {
    block = { left: contentLeft, right: contentRight, top: ownBox.top, bottom: ownBox.bottom };
  } else {
    // The columns beside the block's own, in its row: a stacked column is
    // above or below it, not beside it.
    const column = kind === "column" ? own : own.closest<HTMLElement>("[data-block-type=column]");
    const mine = column?.getBoundingClientRect();
    if (mine) {
      for (const box of boxes) {
        if (box.top >= mine.bottom || box.bottom <= mine.top) continue;
        if (box.right <= mine.left + 0.5) leftLimit = Math.max(leftLimit, box.right);
        if (box.left >= mine.right - 0.5) rightLimit = Math.min(rightLimit, box.left);
      }
    }
  }
  const covers = [...document.querySelectorAll(".drawer")].map((drawer) => drawer.getBoundingClientRect());
  return { block, leftLimit, rightLimit, contentLeft, contentRight, view, covers, height: clamp.offsetHeight, scale, section: kind === "section" };
}

// Lays the clamp where it goes, in the block's own pixels (the page may be
// drawn smaller: the clamp is drawn back up to its size, editor.css), and
// keeps room under the block for a clamp that runs on below it, so a
// block brought into view brings its whole clamp.
function placeOnPage(clamp: HTMLElement, kind: ClampKind): void {
  const own = clamp.parentElement;
  if (!own) return;
  const room = roomOf(own, kind, clamp);
  if (!room) return;
  const place = placeClamp(room);
  const box = own.getBoundingClientRect();
  const { scale } = room;
  clamp.style.left = `${(place.x - box.left) / scale - own.clientLeft}px`;
  clamp.style.top = `${(place.y - box.top) / scale - own.clientTop}px`;
  clamp.dataset.size = place.size;
  clamp.dataset.side = place.side;
  if (place.tie === null) clamp.style.removeProperty("--tie");
  else clamp.style.setProperty("--tie", `${place.tie}px`);
  clamp.dataset.tie = place.tie === null ? "none" : "on";
  const below = place.y + room.height - box.bottom;
  own.style.scrollMarginBottom = below > 0 ? `${Math.ceil(below / scale) + 24}px` : "";
}

// Places the clamp now, and again whenever the block, the page, the canvas
// or the clamp changes size, the canvas scrolls (a tall block's clamp
// keeps to the canvas's top), the page is drawn at a new scale, or a
// drawer opens or closes over the canvas.
function useClampPlace(ref: { current: HTMLDivElement | null }, kind: ClampKind, writing: boolean): void {
  const { ui } = useEnv();
  useLayoutEffect(() => {
    const clamp = ref.current;
    const own = clamp?.parentElement;
    if (!clamp || !own) return undefined;
    let frame = 0;
    const place = () => placeOnPage(clamp, kind);
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
      own.style.scrollMarginBottom = "";
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
    if (event.key === "ArrowDown") next = Math.min(all.length - 1, at + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = all.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      // Back to the text being written, or to the block.
      if (tools) tools.run.closeLink(true);
      else (ref.current?.parentElement as HTMLElement | null)?.focus({ preventScroll: true });
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
  const grip = (index: number) => <button key="grip" type="button" className="clamp-grip" data-key="grip" data-grip aria-label={`Drag to move, or press ${PICK_UP} to pick up`} title="Drag to move" {...roving(index)}><Icon name="grip" /></button>;
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
      <Icon name="more" />
    </button>
  );

  if (tools) {
    return (
      <div ref={ref} className="clamp clamp-text" role="toolbar" aria-orientation="vertical" aria-label="Text formatting" onKeyDown={onKeyDown}>
        <span key="head-static" className="clamp-head clamp-head-static" role="img" aria-label={`${name}, being written`} title={`${name}, being written. ${LEAVE} to finish`}><BlockIcon type={type} className="i" /></span>
        {grip(0)}
        <button key="bold" type="button" data-key="bold" aria-label="Bold" aria-pressed={tools.bold} aria-keyshortcuts={ariaKeyShortcuts(entry("bold"))} title={`Bold (${entryKeysText(entry("bold"))})`} onMouseDown={keep} onClick={() => tools.run.toggleBold()} {...roving(1)}><Icon name="bold" className="i i-strong" /></button>
        <button key="italic" type="button" data-key="italic" aria-label="Italic" aria-pressed={tools.italic} aria-keyshortcuts={ariaKeyShortcuts(entry("italic"))} title={`Italic (${entryKeysText(entry("italic"))})`} onMouseDown={keep} onClick={() => tools.run.toggleItalic()} {...roving(2)}><Icon name="italic" className="i i-strong" /></button>
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
          <Icon name="link" />
        </button>
        <hr key="rule" aria-hidden="true" />
        {more(4)}
      </div>
    );
  }

  return (
    <div ref={ref} className={`clamp${kind === "section" ? " clamp-in" : ""}`} role="toolbar" aria-orientation="vertical" aria-label={`${name} tools`} onKeyDown={onKeyDown}>
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
      </button>
      {grip(1)}
      <button key="back" type="button" data-key="back" aria-label={moves.back} aria-disabled={back ? true : undefined} title={back ?? moves.back} onClick={() => (back ? undefined : moveBlock(env, id, -1, "back"))} {...roving(2)}><Icon name={moves.backIcon} /></button>
      <button key="on" type="button" data-key="on" aria-label={moves.on} aria-disabled={on ? true : undefined} title={on ?? moves.on} onClick={() => (on ? undefined : moveBlock(env, id, 1, "on"))} {...roving(3)}><Icon name={moves.onIcon} /></button>
      <hr key="rule" aria-hidden="true" />
      {more(4)}
    </div>
  );
}
