// The keyboard's moves while a block is picked up, as places on the page
// (the store's DropTarget), worked out from the page as the drag found it.
//
// The containers that may take the dragged type are lined up in reading
// order: for a widget, every column of the page; for a column, every
// section; for a section, the page. A section lays its columns out in a
// row, the page and a column lay theirs out down the page. So:
//
// - the arrows along that line (up and down in a column or the page, left
//   and right in a section) move the block one place, and past either end
//   into the container before or after, at its end or its start;
// - the other arrows move it to the container before or after, at the same
//   place as far as it goes.
//
// Containers that cannot take the block (a section that would hold five
// columns) are passed over. Null: there is nowhere further that way.
import { canContain } from "../../document/nesting.ts";
import { allBlocks, locate, type ParentId } from "../../document/tree.ts";
import type { DropTarget } from "../../document/drag.ts";
import type { PageDocument } from "../../shared/document.ts";
import { siblingsIn, type Dragged } from "./place.ts";

export type Direction = "up" | "down" | "left" | "right";

// The containers the dragged block may go into, in reading order, but
// those inside the block itself.
export function containersFor(doc: PageDocument, dragged: Dragged): ParentId[] {
  const list: ParentId[] = canContain("page", dragged.type) ? [null] : [];
  for (const { block } of allBlocks(doc)) {
    if (!canContain(block.type, dragged.type)) continue;
    if (dragged.fromPage && insideDragged(doc, dragged.id, block.id)) continue;
    list.push(block.id);
  }
  return list;
}

function insideDragged(doc: PageDocument, draggedId: string, id: string): boolean {
  for (let up: ParentId = id; up !== null; up = locate(doc, up)?.parentId ?? null) if (up === draggedId) return true;
  return false;
}

// Whether a container lays its children out in a row: a section's
// columns. The others stack them.
function laysInRow(doc: PageDocument, parentId: ParentId): boolean {
  return parentId !== null && locate(doc, parentId)?.block.type === "section";
}

export function stepPlace(doc: PageDocument, dragged: Dragged, current: DropTarget, direction: Direction, open: (parentId: ParentId) => boolean): DropTarget | null {
  const containers = containersFor(doc, dragged).filter((c) => c === current.parentId || open(c));
  const at = containers.indexOf(current.parentId);
  if (at === -1) return null;
  const row = laysInRow(doc, current.parentId);
  const along = row ? direction === "left" || direction === "right" : direction === "up" || direction === "down";
  const forward = direction === "down" || direction === "right";
  const count = (parentId: ParentId) => siblingsIn(doc, dragged, parentId).length;

  if (along) {
    const index = current.index + (forward ? 1 : -1);
    if (index >= 0 && index <= count(current.parentId)) return { parentId: current.parentId, index };
    const next = containers[at + (forward ? 1 : -1)];
    if (next === undefined) return null;
    return { parentId: next, index: forward ? 0 : count(next) };
  }
  const next = containers[at + (forward ? 1 : -1)];
  if (next === undefined) return null;
  return { parentId: next, index: Math.min(current.index, count(next)) };
}
