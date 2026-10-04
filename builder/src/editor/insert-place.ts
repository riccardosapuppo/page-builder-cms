// The places the canvas's "+" adds at (./canvas-ui.ts, InsertPlace), as
// pure functions of the page: the place after or before a block, the
// place the "+" key opens at, whether a place is still on the page, and
// how the picker names it.
//
// What fits where follows the page's hierarchy: a widget goes in a column,
// a section on the page. A column takes no "+" of its own: a block goes
// inside it, at its end.
import { blockName } from "../document/labels.ts";
import { locate } from "../document/tree.ts";
import type { PageDocument } from "../shared/document.ts";
import type { InsertPlace } from "./canvas-ui.ts";

// The place right after a block (or right before it): a widget's in its
// column, a section's on the page. None for a column.
export function placeBeside(doc: PageDocument, id: string, side: "before" | "after"): InsertPlace | null {
  const found = locate(doc, id);
  if (!found) return null;
  const index = found.index + (side === "after" ? 1 : 0);
  if (found.block.type === "section") return { kind: "section", index };
  if (found.block.type === "column" || found.parentId === null) return null;
  return { kind: "block", parentId: found.parentId, index };
}

// Where the "+" key opens the picker: after the selection (a block after a
// widget, a section after a section), at the end of a selected column,
// and with nothing selected, a section at the end of the page.
export function placeForKey(doc: PageDocument, selection: string | null): InsertPlace | null {
  if (selection === null) return { kind: "section", index: doc.sections.length };
  const found = locate(doc, selection);
  if (!found) return null;
  if (found.block.type === "column") return { kind: "block", parentId: selection, index: found.block.children.length };
  return placeBeside(doc, selection, "after");
}

// Whether the place is still one on the page as it is now.
export function placeExists(doc: PageDocument, place: InsertPlace): boolean {
  if (place.kind === "section") return place.index >= 0 && place.index <= doc.sections.length;
  const column = locate(doc, place.parentId)?.block;
  return column?.type === "column" && place.index >= 0 && place.index <= column.children.length;
}

// The words for a place: the picker's title, and the sentence that says
// where the yellow line is. `between` holds the names on each side, for
// the sentence to set in bold.
export interface PlaceWords {
  title: string;
  lands: { before: string | null; after: string | null; within: string | null };
}

export function placeWords(doc: PageDocument, place: InsertPlace): PlaceWords {
  if (place.kind === "section") {
    const above = doc.sections[place.index - 1];
    const below = doc.sections[place.index];
    const before = above ? blockName(doc, above.id) : null;
    const after = below ? blockName(doc, below.id) : null;
    const title = before ? `Add a section after ${before}` : after ? `Add a section before ${after}` : "Add a section";
    return { title, lands: { before, after, within: null } };
  }
  const column = locate(doc, place.parentId)?.block;
  const columnName = column ? blockName(doc, column.id) : "the column";
  const above = column?.children[place.index - 1];
  const below = column?.children[place.index];
  const before = above ? blockName(doc, above.id) : null;
  const after = below ? blockName(doc, below.id) : null;
  const title = before ? `Add a block after ${before}` : after ? `Add a block before ${after}` : `Add a block to ${columnName}`;
  return { title, lands: { before, after, within: columnName } };
}

// A short key for a place, for React and for the "+" that opened it.
export function placeKey(place: InsertPlace): string {
  return place.kind === "section" ? `section:${place.index}` : `block:${place.parentId}:${place.index}`;
}
