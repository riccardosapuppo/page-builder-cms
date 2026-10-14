// Where a block dragged in the Outline lands, from the row under the
// pointer (../Navigator.tsx). The rows stand one under the other, each
// indented by its depth, so the pointer's height on the row says the
// place, as a fraction of the row from its top:
//
// - a row that can hold the dragged block (a column, for a widget): its
//   top quarter before it, its middle inside it (first, when the row is
//   open and its children stand right under it; last, when it is closed),
//   its bottom quarter after it, or inside it first when it is open with
//   children shown. Where it cannot stand beside the row (a widget beside
//   a column), the top quarter is inside it first, the bottom inside it
//   last;
// - a row that cannot hold it, whose children can (a section, for a
//   widget): the first of them that can, first from the top quarter and
//   last from the rest;
// - any other row: its top half before it, its bottom half after it, or,
//   where the row's own container cannot hold the dragged block (a column
//   over a widget's row), before or after the nearest of the row's
//   ancestors whose container can (the widget's column).
//
// The dragged block's own row, and the rows inside it, keep the place the
// drag last found. Pure: the store judges the place (a full section, a
// column at its limit) as it judges the canvas's.
import { canContain } from "../../document/nesting.ts";
import { childrenOf, locate, typeOf, type ParentId } from "../../document/tree.ts";
import type { DropTarget } from "../../document/drag.ts";
import type { PageDocument } from "../../shared/document.ts";
import { siblingsIn, type Dragged } from "./place.ts";

// Before or after a row, or the nearest ancestor of it whose container
// may hold the dragged block; null when none may.
function beside(doc: PageDocument, dragged: Dragged, rowId: string, after: boolean): DropTarget | null {
  for (let id: ParentId = rowId; id !== null; id = locate(doc, id)?.parentId ?? null) {
    const at = locate(doc, id);
    if (!at) return null;
    if (canContain(typeOf(doc, at.parentId) ?? "page", dragged.type)) {
      const ids = siblingsIn(doc, dragged, at.parentId);
      const index = ids.indexOf(id);
      return { parentId: at.parentId, index: after ? index + 1 : index };
    }
  }
  return null;
}

export function placeOverRow(doc: PageDocument, dragged: Dragged, rowId: string, fraction: number, open: boolean): DropTarget | "keep" | null {
  const row = locate(doc, rowId);
  if (!row) return null;
  for (let up: ParentId = rowId; up !== null; up = locate(doc, up)?.parentId ?? null) {
    if (up === dragged.id) return "keep";
  }
  const top = fraction < 0.25;
  const middle = !top && fraction <= 0.75;
  const children = siblingsIn(doc, dragged, rowId);
  if (canContain(row.block.type, dragged.type)) {
    const first: DropTarget = { parentId: rowId, index: 0 };
    const last: DropTarget = { parentId: rowId, index: children.length };
    if (middle) return open ? first : last;
    if (!top && open && children.length > 0) return first;
    return beside(doc, dragged, rowId, !top) ?? (top ? first : open ? first : last);
  }
  const home = (childrenOf(doc, rowId) ?? []).find((child) => child.id !== dragged.id && canContain(child.type, dragged.type));
  if (home) return { parentId: home.id, index: top ? 0 : siblingsIn(doc, dragged, home.id).length };
  return beside(doc, dragged, rowId, fraction >= 0.5);
}
