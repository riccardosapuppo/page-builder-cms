// Drag and drop, between the drag library (./dnd.ts) and the editor
// store's drag (../../document/drag.ts): the library says what is under
// the pointer, or, with the keyboard, which place the keys stepped to; the
// store keeps the page untouched, works out the preview the canvas draws
// and the verdict, and makes ONE command on the drop. A cancelled drag
// (Esc) throws the preview away.
//
// The sources are the canvas's selected block (./dnd.ts, SELECTION_SOURCE)
// and the widget panel's tiles, each a new block made when its drag
// begins and validated by the store as a moved block is. Before either
// starts, the text still waiting in a panel's field is handed over.
//
// One live region says where the block will go while it moves, and how
// the drag ended; it is the caption at the bottom of the canvas
// (design/shots/drag.png).
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Block, PageDocument } from "../../shared/document.ts";
import { describeDrop, verdictFor, type DragSession, type DropTarget } from "../../document/drag.ts";
import { locate } from "../../document/tree.ts";
import { focusBlock, placeFocus } from "../act.ts";
import { BlockIcon } from "../block-icon.tsx";
import type { CommandError } from "../../document/check.ts";
import { useEditor, useEnv, useUi, type EditorEnv } from "../context.tsx";
import { DragDropProvider, DragOverlay, isKeyboardEvent, plugins, type DragDropManager } from "./dnd.ts";
import { draggedName, draggedOf, homeRule } from "./marks.ts";
import { PAGE_TARGET, placeAtPoint, placeFromSide, targetForPlace, type Point, type Rect, type Side } from "./place.ts";
import { stepPlace, type Direction } from "./steps.ts";
import { sensorCodes } from "../keymap.ts";

// What a drag source carries: the canvas's selection, or a widget panel
// tile, which makes its new block (with ids the page does not have) from
// the page as it is when the drag begins.
export type SourceData =
  | { kind: "selection" }
  | { kind: "tile"; make: (doc: PageDocument) => Block };

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
  ui.getState().pending.deliver();
  ui.getState().setBlockMenu(null);
  const { document: page, selection } = store.getState();
  const started = data.kind === "selection"
    ? selection === null
      ? { ok: false as const, error: { reason: "nothing" as const, message: "Select a block to move it." } }
      : store.getState().startDrag({ kind: "block", id: selection })
    : store.getState().startDrag({ kind: "palette", block: data.make(page) });
  if (!started.ok) {
    ui.getState().say(started.error.message);
    return started.error;
  }
  ui.setState({ dragMode: keyboard ? "keyboard" : "pointer", notice: null, hover: null, dragSaid: "" });
  const own = ownPlace(store.getState().drag!);
  if (own) store.getState().dragOver(own);
  return null;
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
          // The canvas scrolls under a pointer that stands still.
          const canvas = document.querySelector(".canvas");
          const resync = () => sync(manager);
          canvas?.addEventListener("scroll", resync, { passive: true });
          scrollListener.current = () => canvas?.removeEventListener("scroll", resync);
        }
      }}
      onDragStart={(_event, manager) => {
        const kept = early.current;
        early.current = null;
        kept?.stop();
        const session = store.getState().drag;
        if (!session || ui.getState().dragMode !== "keyboard") return;
        const own = ownPlace(session);
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
        scrollListener.current?.();
        scrollListener.current = null;
        const keyboard = ui.getState().dragMode === "keyboard";
        setGhost(null);
        pointer.current = null;
        const session = store.getState().drag;
        ui.setState({ dragMode: null });
        if (!session) return;
        const dragged = draggedOf(session);
        const name = draggedName(session);
        if (event.canceled) {
          store.getState().cancelDrag();
          ui.setState({ dragSaid: dragged.fromPage ? `Cancelled: ${name} is back where it was.` : `Cancelled: nothing was added.` });
          if (dragged.fromPage && keyboard) focusBlock(dragged.id);
          return;
        }
        const last = store.getState().past.at(-1);
        const outcome = store.getState().drop();
        if (!outcome.ok) {
          ui.getState().say(outcome.error.message);
          ui.setState({ dragSaid: `${name} was not ${dragged.fromPage ? "moved" : "added"}: ${outcome.error.message}` });
          if (dragged.fromPage) focusBlock(dragged.id);
          return;
        }
        // A drop where the block already was makes no command.
        const made = store.getState().past.at(-1);
        ui.setState({ tray: "edit", notice: null, dragSaid: made && made !== last ? `${made.command.label}.` : `${name} stays where it was.` });
        placeFocus(outcome.focus, "canvas");
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
      <LiveCaption />
    </DragDropProvider>
  );
}

// The sentence for where the block will go, or why it cannot.
export function dropSentence(session: DragSession): string {
  const own = ownPlace(session);
  if (own && session.target && same(own, session.target)) return `${draggedName(session)} is where it was.`;
  return describeDrop(session) ?? `Nowhere to drop it here. ${homeRule(session.type)}.`;
}

function LiveCaption() {
  const session = useEditor((s) => s.drag);
  const mode = useUi((u) => u.dragMode);
  const said = useUi((u) => u.dragSaid);
  const moving = session !== null && mode !== null;
  const help = mode === "keyboard"
    ? "The arrows move it, Space drops it here, Esc puts it back."
    : `Release to drop it.${session && session.type !== "section" ? ` Shaded areas cannot hold ${session.type === "column" ? "columns" : "widgets"}.` : ""} Esc cancels.`;
  // One element for the life of the editor, so a screen reader follows it.
  return (
    <p className={`live-caption chrome${moving ? "" : " live-caption-quiet"}`} role="status" aria-live="polite">
      {moving ? <><strong>{dropSentence(session)}</strong><span>{help}</span></> : said}
    </p>
  );
}
