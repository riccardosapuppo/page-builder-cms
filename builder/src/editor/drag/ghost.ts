// The place a widget is dragged from, kept on the page while it moves
// (design/layout/, the drag state): a dimmed copy where the widget stood,
// with a "Moving" chip, while the widget itself is drawn where it would
// land. The copy belongs to the canvas alone: the store's preview, and so
// the drag model, are untouched. The canvas draws a page made from the
// preview with the copy added, under an id of its own that no block of a
// page can have (a block's id is letters, digits, "_" and "-"), so it is
// never selected, dropped on or found by a lookup for the block.
//
// The copy is there from the moment the widget is picked up, not once it
// has left: the place it takes is then the same wherever the drop line
// goes, and the page never moves under a pointer that is aiming at a
// place (the line moving down a column changes nothing below it). Over the
// widget's own place the line stands beside the copy.
import type { DragSession } from "../../document/drag.ts";
import { locate } from "../../document/tree.ts";
import type { Block, PageDocument } from "../../shared/document.ts";

const GHOST_SUFFIX = "~moving";

export const ghostIdOf = (id: string): string => `${id}${GHOST_SUFFIX}`;
export const isGhostId = (id: string | null): boolean => id !== null && id.endsWith(GHOST_SUFFIX);

// The page the canvas draws for a drag: the session's preview, and, when a
// widget of the page is dragged, a copy of it where it stood. Only a widget
// has one: a column or a section leaves no copy, since their places are
// the page's own rows and a copy of a section would be a second one; a new
// block from Insert has no place to leave.
export function withGhost(session: DragSession): PageDocument {
  const { source, base, preview } = session;
  if (source.kind !== "block") return preview;
  const was = locate(base, source.id);
  if (!was || was.parentId === null || was.block.type === "section" || was.block.type === "column") return preview;
  const column = locate(preview, was.parentId);
  if (!column || column.path.length !== 2) return preview;
  // The widgets that stood before it keep their order in the preview: the
  // copy stands after the last of them, else first in its column.
  const last = (locate(base, was.parentId)?.block.children ?? []).slice(0, was.index).at(-1)?.id ?? null;
  const copy = { ...was.block, id: ghostIdOf(was.block.id) } as Block;
  const [s, c] = column.path as [number, number];
  const section = preview.sections[s]!;
  const holder = section.children[c]!;
  const kids = [...holder.children] as Block[];
  kids.splice(last === null ? 0 : kids.findIndex((kid) => kid.id === last) + 1, 0, copy);
  const sections = preview.sections.map((one, i) => (i === s
    ? { ...section, children: section.children.map((two, j) => (j === c ? { ...holder, children: kids } : two)) }
    : one));
  return { ...preview, sections } as PageDocument;
}
