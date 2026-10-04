// The copy of a widget left where it stood while it is dragged: the page the
// canvas draws is the store's preview with the copy added; the preview
// itself, and the drag model, are not touched.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../../test/document-page.ts";
import { dragOver, startDrag, type DragSession, type DragSource } from "../../document/drag.ts";
import { locate } from "../../document/tree.ts";
import type { PageDocument } from "../../shared/document.ts";
import { ghostIdOf, isGhostId, withGhost } from "./ghost.ts";

function session(doc: PageDocument, source: DragSource): DragSession {
  const started = startDrag(doc, source);
  if (!started.ok) throw new Error(started.error.message);
  return started.session;
}

const ids = (doc: PageDocument, column: string) => locate(doc, column)?.block.children.map((child) => child.id);

test("a widget moved to another column keeps a copy where it stood, between the widgets that were around it", () => {
  const moved = dragOver(session(page(), { kind: "block", id: "t1" }), { parentId: "c3", index: 1 });
  expect(ids(moved.preview, "c1")).toEqual(["h1", "b1"]);
  const drawn = withGhost(moved);
  expect(ids(drawn, "c1")).toEqual(["h1", ghostIdOf("t1"), "b1"]);
  // The preview, which the store holds, is as it was.
  expect(ids(moved.preview, "c1")).toEqual(["h1", "b1"]);
  expect(ids(drawn, "c3")).toEqual(["d1", "t1", "q1", "g1"]);
  // A copy of the widget itself, its ids apart from every block of the page.
  const copy = locate(drawn, ghostIdOf("t1"))!.block;
  expect(copy.type).toBe("text");
  expect(copy.props).toEqual(locate(moved.base, "t1")!.block.props);
  expect(isGhostId(copy.id)).toBe(true);
  expect(isGhostId("t1")).toBe(false);
  expect(isGhostId(null)).toBe(false);
});

test("first in its column, the copy is first; last, it is last", () => {
  const first = withGhost(dragOver(session(page(), { kind: "block", id: "h1" }), { parentId: "c2", index: 1 }));
  expect(ids(first, "c1")).toEqual([ghostIdOf("h1"), "t1", "b1"]);
  const last = withGhost(dragOver(session(page(), { kind: "block", id: "b1" }), { parentId: "c3", index: 0 }));
  expect(ids(last, "c1")).toEqual(["h1", "t1", ghostIdOf("b1")]);
});

test("moved within its column, the copy stands at the old place, the widget at the new", () => {
  const moved = dragOver(session(page(), { kind: "block", id: "h1" }), { parentId: "c1", index: 2 });
  expect(ids(moved.preview, "c1")).toEqual(["t1", "b1", "h1"]);
  expect(ids(withGhost(moved), "c1")).toEqual([ghostIdOf("h1"), "t1", "b1", "h1"]);
});

test("the copy is there from the pick-up: over its own place, over nothing or where it cannot land, it stands before the widget, which is drawn as the drop line", () => {
  const start = session(page(), { kind: "block", id: "t1" });
  for (const [why, now] of [
    ["picked up", start],
    ["over its own place", dragOver(start, { parentId: "c1", index: 1 })],
    ["over nothing", dragOver(start, null)],
    // A widget over a section is refused: the page stays as it was.
    ["where it cannot land", dragOver(start, { parentId: "join", index: 0 })],
  ] as const) {
    expect(ids(withGhost(now), "c1"), why).toEqual(["h1", ghostIdOf("t1"), "t1", "b1"]);
  }
});

test("only a widget leaves a copy: a column, a section and a new block from Insert do not", () => {
  const column = dragOver(session(page(), { kind: "block", id: "c2" }), { parentId: "join", index: 0 });
  expect(withGhost(column)).toBe(column.preview);
  const section = dragOver(session(page(), { kind: "block", id: "hero" }), { parentId: null, index: 1 });
  expect(withGhost(section)).toBe(section.preview);
  const added = dragOver(session(page(), { kind: "palette", block: { id: "fresh", type: "divider", props: {}, children: [], style: { base: {} } } }), { parentId: "c1", index: 0 });
  expect(withGhost(added)).toBe(added.preview);
});

test("the blocks that did not change keep their objects, so the canvas redraws only the column the copy is in", () => {
  const moved = dragOver(session(page(), { kind: "block", id: "t1" }), { parentId: "c3", index: 1 });
  const drawn = withGhost(moved);
  expect(locate(drawn, "c3")!.block).toBe(locate(moved.preview, "c3")!.block);
  expect(locate(drawn, "c2")!.block).toBe(locate(moved.preview, "c2")!.block);
  expect(locate(drawn, "h1")!.block).toBe(locate(moved.preview, "h1")!.block);
  expect(drawn.sections[1]).toBe(moved.preview.sections[1]);
});
