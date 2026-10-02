// What each block draws while a block is dragged, from the drag session
// alone: the dragged block as a line where it would land, or the frame of
// a container it would be alone in; that container framed; for a widget,
// the columns outlined and what is above them shaded, with the rule; a
// container that cannot take one more, shaded with why.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../../test/document-page.ts";
import { dragOver, startDrag, type DragSession, type DragSource } from "../../document/drag.ts";
import type { PageDocument } from "../../shared/document.ts";
import { containerMark, dragMarkOf, draggedName, homeRule } from "./marks.ts";
import { PAGE_TARGET } from "./place.ts";

function session(doc: PageDocument, source: DragSource): DragSession {
  const started = startDrag(doc, source);
  if (!started.ok) throw new Error(started.error.message);
  return started.session;
}

const marks = (s: DragSession, ids: string[]) => Object.fromEntries(ids.map((id) => [id, dragMarkOf(s, s.preview, id)]));

test("a widget over a column: a line where it would land, the column framed, the sections shaded", () => {
  const s = dragOver(session(page(), { kind: "block", id: "q1" }), { parentId: "c1", index: 1 });
  expect(marks(s, ["q1", "c1", "c2", "c3", "hero", "join", "h1"])).toEqual({
    q1: { kind: "slot", mode: "line", row: false, label: "Quote" },
    c1: { kind: "target", label: "Column 1" },
    c2: { kind: "open" },
    c3: { kind: "open" },
    hero: { kind: "shut", note: "Widgets go inside a column." },
    join: { kind: "shut", note: "Widgets go inside a column." },
    h1: null,
  });
  expect(containerMark(s, s.preview, PAGE_TARGET)).toEqual({ kind: "shut", note: "Widgets go inside a column." });
  expect(homeRule("quote")).toBe("Widgets go inside a column");
});

test("alone in a column, the dragged block is the frame of that column", () => {
  const doc = page();
  const emptied: PageDocument = { ...doc, sections: [doc.sections[0]!, { ...doc.sections[1]!, children: [{ ...doc.sections[1]!.children[0]!, children: [] }] }] };
  const s = dragOver(session(emptied, { kind: "palette", block: { id: "new1", type: "divider", props: {}, children: [], style: { base: {} } } }), { parentId: "c3", index: 0 });
  expect(dragMarkOf(s, s.preview, "new1")).toEqual({ kind: "slot", mode: "frame", row: false, label: "Divider" });
  expect(draggedName(s)).toBe("Divider");
});

test("a section: a line between sections, nothing shaded, nothing inside it taking part", () => {
  const s = dragOver(session(page(), { kind: "block", id: "hero" }), { parentId: null, index: 1 });
  expect(marks(s, ["hero", "join", "c1", "c3", "h1"])).toEqual({
    hero: { kind: "slot", mode: "line", row: false, label: "Hero" },
    join: null,
    c1: null,
    c3: null,
    h1: null,
  });
  expect(containerMark(s, s.preview, PAGE_TARGET)).toEqual({ kind: "target", label: "The page" });
});

test("a column: along a section's row; a section that cannot take one more is shaded with why", () => {
  const doc = page();
  const full: PageDocument = {
    ...doc,
    sections: [doc.sections[0]!, { ...doc.sections[1]!, children: [0, 1, 2, 3].map((n) => ({ id: `k${n}`, type: "column", props: {}, children: [], style: { base: {} } })) }],
  } as PageDocument;
  const s = dragOver(session(full, { kind: "block", id: "c2" }), { parentId: "hero", index: 0 });
  expect(dragMarkOf(s, s.preview, "c2")).toEqual({ kind: "slot", mode: "line", row: true, label: "Column 2" });
  expect(dragMarkOf(s, s.preview, "hero")).toEqual({ kind: "target", label: "Hero" });
  expect(dragMarkOf(s, s.preview, "join")).toMatchObject({ kind: "shut" });
  expect((dragMarkOf(s, s.preview, "join") as { note: string }).note).toMatch(/4 columns|at most 4/);
  // The page cannot take a column: shaded around the sections.
  expect(containerMark(s, s.preview, PAGE_TARGET)).toEqual({ kind: "shut", note: "Columns go inside a section." });
});
