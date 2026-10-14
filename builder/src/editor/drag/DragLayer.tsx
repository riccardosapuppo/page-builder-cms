// Drag and drop, between the drag library (./dnd.ts) and the editor
// store's drag (../../document/drag.ts): the library says what is under
// the pointer, or, with the keyboard, which place the keys stepped to; the
// store keeps the page untouched, works out the preview the canvas draws
// and the verdict, and makes ONE command on the drop. A cancelled drag
// (Esc) throws the preview away.
//
// The sources are the canvas's selected block (./dnd.ts, SELECTION_SOURCE),
// the rows of the Outline, each its own block (../Navigator.tsx), and the
// keys of the Insert drawer and of a "+" picker (../tiles.ts), each a new
// block made when its drag begins and validated by the store as a moved
// block is. With the keyboard, a key starts where Enter would
// add it. Before any drag starts, the text still waiting in a panel's
// field is handed over.
//
// A key whose block needs something first (an image, images, a video, a
// picture) is dropped as no command: the place is kept, and the picker
// opens there with the key's window (../InsertPicker.tsx), which adds the
// block with what it is given, by one command, or nothing.
//
// One live region says where the block will go while it moves, and how
// the drag ended; it is the bottom line's (../StatusBar.tsx), drawn
// graphite while the block moves (design/layout/shots/drag.png). The
// pointer says it too: over no place for the block, it is the browser's
// no-drop cursor.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Block } from "../../shared/document.ts";
import { describeDrop, verdictFor, type DragSession, type DropTarget } from "../../document/drag.ts";
import { locate } from "../../document/tree.ts";
import { focusBlock, focusRow, handOver, placeFocus } from "../act.ts";
import { BlockIcon } from "../block-icon.tsx";
import type { CommandError } from "../../document/check.ts";
import { useEnv, type EditorEnv } from "../context.tsx";
import { nowhereMessage } from "../insert.ts";
import { closeInserter, openInserter } from "../InsertPicker.tsx";
import { askedWords, placeOfDrop, type TileSource } from "../tiles.ts";
import { DragDropProvider, DragOverlay, isKeyboardEvent, plugins, rowOfTarget, type DragDropManager } from "./dnd.ts";
import { draggedName, draggedOf, homeRule } from "./marks.ts";
import { placeOverRow } from "./outline-place.ts";
import { PAGE_TARGET, placeAtPoint, placeFromSide, targetForPlace, type Point, type Rect, type Side } from "./place.ts";
import { stepPlace, type Direction } from "./steps.ts";
import { sensorCodes } from "../keymap.ts";

// What a drag source carries: the canvas's selection, a row of the
// Outline and its block, or a key of Insert or of a picker, which makes
// its new block (with ids the page does not have) from the page as it is
// when the drag begins.
export type SourceData = { kind: "selection" } | { kind: "row"; id: string } | TileSource;

// The canvas's element for a block, never the inert copy a drag library
// may leave in its place (a block may be aria-hidden itself: a spacer).
export function liveBlock(id: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(`.canvas [data-block-id="${id}"]`)) {
    if (!element.closest("[inert], [data-dnd-placeholder]")) return element;
  }
  return null;
}

function rectOf(id: string): Rect | null {
  const element = id === PAGE_TARGET ? document.querySelector<HTMLElement>(".canvas .frame") : liveBlock(id);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width === 0 && box.height === 0 ? null : box;
}

const same = (a: DropTarget | null, b: DropTarget | null): boolean => a === b || (a !== null && b !== null && a.parentId === b.parentId && a.index === b.index);

function directionOf(by: Point | undefined): Direction | null {
  if (!by) return null;
  if (by.x > 0) return "right";
  if (by.x < 0) return "left";
  if (by.y > 0) return "down";
  if (by.y < 0) return "up";
  return null;
}

// Where the dragged block stands on the page as the drag found it.
function ownPlace(session: DragSession): DropTarget | null {
  if (session.source.kind !== "block") return null;
  const own = locate(session.base, session.source.id);
  return own ? { parentId: own.parentId, index: own.index } : null;
}

// The start of a drag: the text still being typed is handed over first,
// as a command of its own; then the store's drag, from the selected block
// or the tile's new block, with the block's own place as where it is.
// The refusal, said, when there is nothing to drag.
export function beginDrag(env: Pick<EditorEnv, "store" | "ui">, data: SourceData, keyboard: boolean): CommandError | null {
  const { store, ui } = env;
  // A text the page refused is still being written: no drag until it is
  // one the page takes (its sentence stays said).
  const held = handOver(env);
  if (held) return held;
  ui.getState().setBlockMenu(null);
  const { document: page, selection } = store.getState();
  // A key the keyboard picks up starts where Enter would add it: where
  // there is no such place (a widget, and no section yet), it stays put,
  // and the editor says why, as Enter would.
  if (data.kind === "tile" && keyboard && data.start(page) === null) {
    const message = nowhereMessage(page, data.type);
    ui.getState().say(message);
    return { reason: "noTarget", message };
  }
  // A row's drag: the Outline keeps its rows as the page is, and the
  // canvas draws the block as itself where it would land, from the first
  // frame the drag is drawn in.
  const fromRow = data.kind === "row";
  ui.setState({ dragFrom: fromRow ? "outline" : "page", dragLive: fromRow });
  const started = data.kind === "selection"
    ? selection === null
      ? { ok: false as const, error: { reason: "nothing" as const, message: "Select a block to move it." } }
      : store.getState().startDrag({ kind: "block", id: selection })
    : data.kind === "row"
      ? store.getState().startDrag({ kind: "block", id: data.id })
      : store.getState().startDrag({ kind: "palette", block: data.make(page) });
  if (!started.ok) {
    ui.setState({ dragFrom: null, dragLive: false });
    ui.getState().say(started.error.message);
    return started.error;
  }
  ui.setState({ dragMode: keyboard ? "keyboard" : "pointer", notice: null, hover: null, dragSaid: "", dragAsks: data.kind === "tile" && data.asks ? askedWords(data.asks) : null });
  const own = ownPlace(store.getState().drag!);
  if (own) store.getState().dragOver(own);
  return null;
}

// Whether the pointer is over no place for the dragged block: none under
// it, or one that cannot take the block.
function refusedHere(env: Pick<EditorEnv, "store" | "ui">): boolean {
  const session = env.store.getState().drag;
  return session !== null && env.ui.getState().dragMode === "pointer" && !(session.target !== null && session.verdict?.allowed === true);
}

interface Ghost {
  type: Block["type"];
  name: string;
  // Where the pointer took hold, from the dragged element's top left.
  at: Point;
}

export function DragLayer({ children }: { children: ReactNode }) {
  const { store, ui } = useEnv();
  const side = useRef<Side>("inside");
  const pointer = useRef<Point | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // What the drag started from, kept for its end: a key's own data and
  // element (a picker's key, the picker closes once its block is added).
  const source = useRef<{ data: SourceData; element: Element | null } | null>(null);
  // The row of the Outline under the pointer, and whether it was open when
  // the pointer came onto it: a row the drag opens (../Navigator.tsx) does
  // not change the place the same pointer says.
  const rowSeen = useRef<{ id: string; open: boolean } | null>(null);

  // The cursor over no place for the block: no-drop (editor.css), for a
  // person who does not read the shading or the bottom line.
  useEffect(() => {
    const mark = () => document.documentElement.toggleAttribute("data-drop-refused", refusedHere({ store, ui }));
    const stopStore = store.subscribe(mark);
    const stopUi = ui.subscribe(mark);
    return () => {
      stopStore();
      stopUi();
      document.documentElement.removeAttribute("data-drop-refused");
    };
  }, [store, ui]);

  const over = useCallback((target: DropTarget | null) => {
    const session = store.getState().drag;
    if (session && !same(session.target, target)) store.getState().dragOver(target);
  }, [store]);

  // The place the library's target stands for, by the pointer or by the
  // keyboard's last step.
  const sync = useCallback((manager: DragDropManager, point?: Point) => {
    const session = store.getState().drag;
    if (!session) return;
    const dragged = draggedOf(session);
    const targetId = manager.dragOperation.target?.id;
    const keyboard = ui.getState().dragMode === "keyboard";
    if (targetId === undefined || targetId === null) {
      if (!keyboard) over(null);
      return;
    }
    if (keyboard) {
      const place = placeFromSide(session.base, dragged, String(targetId), side.current);
      if (place) over(place);
      return;
    }
    const at = point ?? pointer.current;
    if (!at) return;
    const row = rowOfTarget(String(targetId));
    if (row !== null) {
      // A row of the Outline: the place the pointer's height on it says
      // (./outline-place.ts), and the canvas draws the block there as
      // itself.
      const element = manager.dragOperation.target?.element;
      const box = element?.getBoundingClientRect();
      if (!element || !box || box.height === 0) return;
      const seen = rowSeen.current?.id === row ? rowSeen.current : { id: row, open: element.closest("[role=treeitem]")?.getAttribute("aria-expanded") === "true" };
      rowSeen.current = seen;
      const place = placeOverRow(session.base, dragged, row, (at.y - box.top) / box.height, seen.open);
      if (ui.getState().dragFrom === "outline" && !ui.getState().dragLive) ui.setState({ dragLive: true });
      if (place !== "keep") over(place);
      return;
    }
    // Over the canvas, the canvas's own marks: the page does not move
    // under the pointer.
    rowSeen.current = null;
    if (ui.getState().dragLive) ui.setState({ dragLive: false });
    const place = placeAtPoint(session.base, dragged, String(targetId), at, rectOf);
    if (place !== "keep") over(place);
  }, [over, store, ui]);

  // Gives the library the target that stands for a place, for the keyboard.
  const aim = useCallback((manager: DragDropManager, place: DropTarget) => {
    const session = store.getState().drag;
    if (!session) return;
    const { id, side: at } = targetForPlace(session.base, draggedOf(session), place);
    side.current = at;
    void manager.actions.setDropTarget(id);
    sync(manager);
  }, [store, sync]);

  // One keyboard step: the next place that way, as the library's target.
  const step = useCallback((manager: DragDropManager, direction: Direction) => {
    const session = store.getState().drag;
    if (!session) return;
    const from = session.target ?? ownPlace(session);
    if (!from) return;
    const next = stepPlace(session.base, draggedOf(session), from, direction, (parentId) => verdictFor(session, parentId).allowed);
    if (next) aim(manager, next);
  }, [aim, store]);

  const scrollListener = useRef<(() => void) | null>(null);
  // The library takes no move until the drag has started, a frame after
  // Space: arrows pressed in between are kept and taken then, not lost.
  const early = useRef<{ directions: Direction[]; stop: () => void } | null>(null);

  return (
    <DragDropProvider
      plugins={plugins}
      onBeforeDragStart={(event, manager) => {
        const data = event.operation.source?.data as SourceData | undefined;
        if (!data) return;
        const keyboard = isKeyboardEvent(event.operation.activatorEvent);
        if (beginDrag({ store, ui }, data, keyboard)) {
          event.preventDefault();
          return;
        }
        source.current = { data, element: event.operation.source?.element ?? null };
        const session = store.getState().drag!;
        if (keyboard) {
          const directions: Direction[] = [];
          const codes = sensorCodes();
          const keep = (key: KeyboardEvent) => {
            if (manager.dragOperation.status.dragging) return;
            const direction = ((["up", "down", "left", "right"] as const).find((d) => codes[d].includes(key.code)));
            if (direction) directions.push(direction);
          };
          window.addEventListener("keydown", keep, true);
          early.current = { directions, stop: () => window.removeEventListener("keydown", keep, true) };
        } else {
          const element = event.operation.source?.element;
          const box = element?.getBoundingClientRect();
          const start = event.operation.position.current;
          setGhost({
            type: session.type,
            name: draggedName(session),
            at: box ? { x: start.x - box.left, y: start.y - box.top } : { x: 0, y: 0 },
          });
          pointer.current = start;
          // The canvas, or the Outline, scrolls under a pointer that stands
          // still.
          const canvas = document.querySelector(".canvas");
          const tree = document.querySelector(".drawer-body-tree");
          const resync = () => sync(manager);
          canvas?.addEventListener("scroll", resync, { passive: true });
          tree?.addEventListener("scroll", resync, { passive: true });
          // Space drops it where it is, as releasing does (the caption says
          // so): a hand that holds the button can still use the keyboard.
          // Esc is the drag library's, which cancels: it is marked taken
          // on its way down, so the drawer the key was taken from (Insert)
          // stays open, as it does for a key moved with the keyboard.
          const keys = (key: KeyboardEvent) => {
            if (!manager.dragOperation.status.dragging) return;
            if (key.code === "Escape") {
              key.preventDefault();
              return;
            }
            if (key.code !== "Space" || key.repeat) return;
            key.preventDefault();
            key.stopPropagation();
            void manager.actions.stop({ event: key });
          };
          window.addEventListener("keydown", keys, true);
          scrollListener.current = () => {
            canvas?.removeEventListener("scroll", resync);
            tree?.removeEventListener("scroll", resync);
            window.removeEventListener("keydown", keys, true);
          };
        }
      }}
      onDragStart={(_event, manager) => {
        const kept = early.current;
        early.current = null;
        kept?.stop();
        const session = store.getState().drag;
        if (!session || ui.getState().dragMode !== "keyboard") return;
        // A block of the page starts where it is; a key's, where Enter
        // would add it.
        const data = source.current?.data;
        const own = ownPlace(session) ?? (data?.kind === "tile" ? data.start(session.base) : null);
        if (own) aim(manager, own);
        for (const direction of kept?.directions ?? []) step(manager, direction);
      }}
      onCollision={(event) => {
        // With the keyboard, the keys choose the target, not the geometry.
        if (ui.getState().dragMode === "keyboard") event.preventDefault();
      }}
      onDragMove={(event, manager) => {
        if (ui.getState().dragMode === "keyboard") {
          // The library would move the block by a few pixels; the editor
          // moves it by one place on the page.
          event.preventDefault();
          const direction = directionOf(event.by);
          if (direction) step(manager, direction);
          return;
        }
        if (event.to) {
          pointer.current = event.to;
          sync(manager, event.to);
        }
      }}
      onDragOver={(_event, manager) => {
        if (ui.getState().dragMode === "pointer") sync(manager);
      }}
      onDragEnd={(event) => {
        early.current?.stop();
        early.current = null;
        rowSeen.current = null;
        scrollListener.current?.();
        scrollListener.current = null;
        const keyboard = ui.getState().dragMode === "keyboard";
        setGhost(null);
        pointer.current = null;
        const session = store.getState().drag;
        const from = source.current;
        source.current = null;
        ui.setState({ dragMode: null, dragAsks: null, dragFrom: null, dragLive: false });
        if (!session) return;
        const dragged = draggedOf(session);
        const name = draggedName(session);
        // A row's block comes back to its row, as the canvas's to the canvas.
        const fromRow = from?.data.kind === "row";
        const back = (id: string) => (fromRow ? focusRow(id) : focusBlock(id));
        if (event.canceled) {
          store.getState().cancelDrag();
          ui.setState({ dragSaid: dragged.fromPage ? `Cancelled: ${name} is back where it was.` : `Cancelled: nothing was added.` });
          if (dragged.fromPage && keyboard) back(dragged.id);
          return;
        }
        // A key whose block needs something first, dropped where it may
        // go: no command yet. The place is kept, and the picker opens
        // there with the key's window; the focus comes back to the key if
        // the window adds nothing.
        const tile = from?.data.kind === "tile" ? from.data : null;
        if (tile?.asks && session.target !== null && session.verdict?.allowed) {
          const sentence = describeDrop(session) ?? `${name} goes here.`;
          store.getState().cancelDrag();
          ui.setState({ tray: "edit", notice: null, dragSaid: `${sentence.replace(/\.$/, "")}, once you choose ${askedWords(tile.asks)}.` });
          openInserter({ ui }, placeOfDrop(session.target), from?.element ?? null, tile.asks);
          return;
        }
        const last = store.getState().past.at(-1);
        const outcome = store.getState().drop();
        if (!outcome.ok) {
          ui.getState().say(outcome.error.message);
          ui.setState({ dragSaid: `${name} was not ${dragged.fromPage ? "moved" : "added"}: ${outcome.error.message}` });
          if (dragged.fromPage) back(dragged.id);
          return;
        }
        // A drop where the block already was makes no command.
        const made = store.getState().past.at(-1);
        ui.setState({ tray: "edit", notice: null, dragSaid: made && made !== last ? `${made.command.label}.` : `${name} stays where it was.` });
        // A key of a picker added its block elsewhere: the picker's place
        // is done with.
        if (tile && from?.element?.closest(".picker")) closeInserter({ ui }, false);
        placeFocus(outcome.focus, fromRow ? "navigator" : "canvas");
      }}
    >
      {children}
      <DragOverlay className="drag-overlay" dropAnimation={null}>
        {ghost && (
          <span className="drag-ghost" style={{ left: ghost.at.x, top: ghost.at.y }} aria-hidden="true">
            <span className="tile tile-ghost"><BlockIcon type={ghost.type} />{ghost.name}</span>
          </span>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}

// The sentence for where the block will go, or why it cannot.
export function dropSentence(session: DragSession): string {
  const own = ownPlace(session);
  if (own && session.target && same(own, session.target)) return `${draggedName(session)} is where it was.`;
  return describeDrop(session) ?? `Nowhere to drop it here. ${homeRule(session.type)}.`;
}
