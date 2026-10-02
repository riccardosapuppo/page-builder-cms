// Moving the selection with the keyboard, as pure functions of the page:
// the next and the previous block in reading order (a section, its first
// column, the column's widgets, the next column...), the block a block is
// in, and the first block inside it.
import { allBlocks, locate } from "../document/tree.ts";
import type { PageDocument } from "../shared/document.ts";

// Every block of the page in reading order: a container before what it
// holds.
export function readingOrder(doc: PageDocument): string[] {
  return [...allBlocks(doc)].map((found) => found.block.id);
}

// The block after (step 1) or before (step -1) the selection. With nothing
// selected, the first block or the last. At either end the selection stays.
export function stepSelection(doc: PageDocument, selection: string | null, step: 1 | -1): string | null {
  const order = readingOrder(doc);
  if (order.length === 0) return null;
  const at = selection === null ? -1 : order.indexOf(selection);
  if (at === -1) return step === 1 ? order[0]! : order.at(-1)!;
  return order[Math.min(order.length - 1, Math.max(0, at + step))] ?? null;
}

// The column or section the block is in; a section has none.
export function parentOf(doc: PageDocument, id: string): string | null {
  return locate(doc, id)?.parentId ?? null;
}

// The first block inside, if it holds any.
export function firstChildOf(doc: PageDocument, id: string): string | null {
  return locate(doc, id)?.block.children[0]?.id ?? null;
}
