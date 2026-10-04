// Where a dragged block would land, from what the drag library says it is
// over. The library's targets are blocks of the canvas and the page
// itself (./DragLayer.tsx, ../Canvas.tsx); a target stands for a place in
// one of two ways:
//
// - a block the dragged one could stand beside (its container may hold
//   the dragged type): the place before or after it;
// - a container that may hold the dragged type (an empty column, the gap
//   between two widgets): a place among its children.
//
// Which side, or where among the children, comes from the pointer's
// coordinates with the mouse, and from the keyboard's step with the keys
// (./steps.ts): one function each, both landing on the same kind of place,
// the store's DropTarget. Pure: the geometry comes in as a function.
import { canContain, type ContainerType } from "../../document/nesting.ts";
import { childrenOf, locate, typeOf, type ParentId } from "../../document/tree.ts";
import type { DropTarget } from "../../document/drag.ts";
import type { BlockType, PageDocument } from "../../shared/document.ts";

// The page itself as a drag target: the canvas's frame.
export const PAGE_TARGET = "page";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

// What is dragged: a block of the page (its id), or a new one from the
// Insert drawer, which the page does not hold (its id is the new block's).
export interface Dragged {
  id: string;
  type: BlockType;
  fromPage: boolean;
}

export type Side = "before" | "after" | "inside";

// Whether a block is the dragged one or inside it: it takes no part in
// the drag, as no block can go inside itself.
function isOwn(doc: PageDocument, dragged: Dragged, id: string): boolean {
  if (!dragged.fromPage) return id === dragged.id;
  for (let up: ParentId = id; up !== null; up = locate(doc, up)?.parentId ?? null) {
    if (up === dragged.id) return true;
  }
  return false;
}

// How a target stands to the dragged block: a sibling to stand beside, a
// container to go into, or nothing at all (the drag library then never
// offers it).
export type Role = { kind: "sibling"; parentId: ParentId } | { kind: "container"; parentId: ParentId } | null;

export function roleOf(doc: PageDocument, dragged: Dragged, targetId: string): Role {
  if (targetId === PAGE_TARGET) return canContain("page", dragged.type) ? { kind: "container", parentId: null } : null;
  if (targetId === dragged.id) {
    // The dragged block's own place: beside its siblings.
    const own = locate(doc, targetId);
    return own ? { kind: "sibling", parentId: own.parentId } : null;
  }
  if (isOwn(doc, dragged, targetId)) return null;
  const found = locate(doc, targetId);
  if (!found) return null;
  const container: ContainerType = typeOf(doc, found.parentId) ?? "page";
  if (canContain(container, dragged.type)) return { kind: "sibling", parentId: found.parentId };
  if (canContain(found.block.type, dragged.type)) return { kind: "container", parentId: targetId };
  return null;
}

// The children of a container the dragged block would stand among: all of
// them but the dragged block itself.
export function siblingsIn(doc: PageDocument, dragged: Dragged, parentId: ParentId): string[] {
  return (childrenOf(doc, parentId) ?? []).map((b) => b.id).filter((id) => id !== dragged.id);
}

// Whether a container lays its children out in a row: two of them side by
// side, or its one child narrower than most of it.
export function inRow(rects: readonly Rect[], container: Rect | null): boolean {
  const [a, b] = rects;
  if (a && b) return b.top < a.bottom - 2 && (b.left >= a.right - 2 || b.right <= a.left + 2);
  if (a && container) return a.right - a.left < 0.7 * (container.right - container.left);
  return false;
}

const middle = (rect: Rect, row: boolean): number => (row ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2);

// Whether a block comes before the point in reading order: above it, or in
// a row, to its left on its line.
function before(rect: Rect, point: Point, row: boolean): boolean {
  if (!row) return point.y > middle(rect, false);
  if (point.y > rect.bottom) return true;
  return point.y >= rect.top && point.x > middle(rect, true);
}

// The place under the pointer on a target: among the target's children
// (a container), or before or after it (a sibling), by the pointer's
// coordinates against the middle of each block. Null when the target
// takes no part; "keep" when the pointer is over the dragged block's own
// place, which stays where the drag last put it.
export function placeAtPoint(doc: PageDocument, dragged: Dragged, targetId: string, point: Point, rectOf: (id: string) => Rect | null): DropTarget | "keep" | null {
  if (targetId === dragged.id) return "keep";
  const role = roleOf(doc, dragged, targetId);
  if (!role) return null;
  const ids = siblingsIn(doc, dragged, role.parentId);
  const rects = ids.map(rectOf);
  const present = rects.filter((r): r is Rect => r !== null);
  const row = inRow(present, role.parentId === null ? rectOf(PAGE_TARGET) : rectOf(role.parentId));
  const index = rects.filter((rect) => rect !== null && before(rect, point, row)).length;
  return { parentId: role.parentId, index };
}

// The place a target and a side stand for: what the keyboard's step set.
export function placeFromSide(doc: PageDocument, dragged: Dragged, targetId: string, side: Side): DropTarget | null {
  const role = roleOf(doc, dragged, targetId);
  if (!role) return null;
  const ids = siblingsIn(doc, dragged, role.parentId);
  if (role.kind === "container") return { parentId: role.parentId, index: side === "before" ? 0 : ids.length };
  const at = ids.indexOf(targetId);
  if (at === -1) return null;
  return { parentId: role.parentId, index: side === "after" ? at + 1 : at };
}

// The target and side that stand for a place, for the keyboard's step to
// give the drag library: the block the place is before, else the last one
// it is after, else the empty container itself.
export function targetForPlace(doc: PageDocument, dragged: Dragged, place: DropTarget): { id: string; side: Side } {
  const ids = siblingsIn(doc, dragged, place.parentId);
  const container = place.parentId ?? PAGE_TARGET;
  if (ids.length === 0) return { id: container, side: "inside" };
  const at = ids[place.index];
  if (at !== undefined) return { id: at, side: "before" };
  return { id: ids.at(-1)!, side: "after" };
}
