// @vitest-environment node
// Drag and drop as data: the preview is a tree of its own, the page is
// never touched before the drop, the drop is one command, a cancel leaves
// nothing behind, and where a block may land is the nesting rule's and the
// schema's to say, for blocks of the page and for new ones from the widget
// panel alike.
import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { counter, page } from "../../test/document-page.ts";
import type { Block, PageDocument } from "../shared/document.ts";
import { validateDocument } from "../shared/validate.ts";
import { makeSetColumnCount, newSection } from "./commands.ts";
import { cancelDrag, containerPriority, describeDrop, dragOver, drop, dropTargets, startDrag, type DragSession, type DragSource } from "./drag.ts";
import { applyCommand } from "./reducer.ts";
import { locate } from "./tree.ts";

function start(doc: PageDocument, source: DragSource): DragSession {
  const started = startDrag(doc, source);
  if (!started.ok) throw new Error(started.error.message);
  return started.session;
}
const quote = (id: string): Block => ({ id, type: "quote", props: { text: "New words." }, children: [], style: { base: {} } });

describe("a drag", () => {
  test("draws a preview on a tree of its own and leaves the page as it was", () => {
    const doc = page();
    const snapshot = JSON.stringify(doc);
    let session = start(doc, { kind: "block", id: "q1" });
    session = dragOver(session, { parentId: "c2", index: 0 });
    expect(session.verdict).toEqual({ allowed: true });
    expect(locate(session.preview, "q1")?.parentId).toBe("c2");
    expect(session.base).toBe(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
    // Over a place it cannot go, the preview is the page as it was.
    session = dragOver(session, { parentId: "hero", index: 0 });
    expect(session.verdict).toMatchObject({ allowed: false, error: { reason: "nesting" } });
    expect(session.preview).toBe(doc);
    // A cancel gives back the very page the drag began on.
    expect(cancelDrag(session)).toBe(doc);
  });

  test("ends in one command, and the page it gives is validated whole", () => {
    const doc = page();
    const session = dragOver(dragOver(start(doc, { kind: "block", id: "h1" }), { parentId: "c3", index: 0 }), { parentId: "c2", index: 1 });
    const dropped = drop(session);
    if (!dropped.ok || dropped.command === null) throw new Error("no command");
    expect(dropped.command.kind).toBe("move");
    expect(dropped.command.ops).toHaveLength(1);
    expect(dropped.focus).toEqual({ id: "h1" });
    expect(validateDocument(dropped.document).valid).toBe(true);
    expect(isDeepStrictEqual(dropped.document, session.preview)).toBe(true);
  });

  test("dropped where it was: no command, the focus on the block", () => {
    const doc = page();
    const dropped = drop(dragOver(start(doc, { kind: "block", id: "t1" }), { parentId: "c1", index: 1 }));
    expect(dropped).toEqual({ ok: true, command: null, document: doc, focus: { id: "t1" } });
  });

  test("dropped over nothing: refused, nothing changes", () => {
    const doc = page();
    const dropped = drop(dragOver(start(doc, { kind: "block", id: "t1" }), null));
    expect(dropped).toMatchObject({ ok: false, error: { reason: "noTarget" } });
  });

  test("a section that would lose its last column, or get a fifth, cannot take the drop", () => {
    const doc = page();
    const lastColumn = dragOver(start(doc, { kind: "block", id: "c3" }), { parentId: "hero", index: 0 });
    expect(lastColumn.verdict).toMatchObject({ allowed: false, error: { reason: "empty", message: "Join must keep at least 1 column." } });

    // Hero with four columns, Join with two: a column of Join has nowhere
    // to go in Hero.
    const columns = (from: PageDocument, id: string, count: number, prefix: string): PageDocument => {
      const made = makeSetColumnCount(from, id, count, counter(prefix));
      if (!made.ok) throw new Error(made.error.message);
      const applied = applyCommand(from, made.command);
      if (!applied.ok) throw new Error(applied.error.message);
      return applied.document;
    };
    const busy = columns(columns(doc, "hero", 4, "x"), "join", 2, "y");
    const full = dragOver(start(busy, { kind: "block", id: "c3" }), { parentId: "hero", index: 1 });
    expect(full.verdict).toMatchObject({ allowed: false, error: { reason: "full", message: "Hero is full: it holds at most 4 columns." } });
  });

  test("a column moved inside its own section is allowed, and keeps its part of the widths", () => {
    const doc = page();
    const dropped = drop(dragOver(start(doc, { kind: "block", id: "c2" }), { parentId: "hero", index: 0 }));
    if (!dropped.ok || dropped.command === null) throw new Error("no command");
    expect(locate(dropped.document, "hero")?.block.props).toEqual({ label: "Hero", columnWidths: "1:2" });
  });
});

describe("from the widget panel", () => {
  test("a new widget lands in a column as an insert, focused", () => {
    const doc = page();
    const session = dragOver(start(doc, { kind: "palette", block: quote("new1") }), { parentId: "c2", index: 1 });
    expect(describeDrop(session)).toBe("Quote will be added to Column 2 in Hero, after Image.");
    const dropped = drop(session);
    if (!dropped.ok || dropped.command === null) throw new Error("no command");
    expect(dropped.command.kind).toBe("insert");
    expect(dropped.command.label).toBe("Added Quote to Column 2 in Hero");
    expect(dropped.focus).toEqual({ id: "new1" });
  });

  test("a new section goes on the page only", () => {
    const doc = page();
    const section = newSection(2, counter("s"));
    const session = start(doc, { kind: "palette", block: section });
    expect(dragOver(session, { parentId: "c1", index: 0 }).verdict).toMatchObject({ allowed: false, error: { message: "Sections go on the page, not into a column." } });
    const onPage = dragOver(session, { parentId: null, index: 0 });
    expect(describeDrop(onPage)).toBe("A section with 2 columns will be added to the page, at the top.");
    const dropped = drop(onPage);
    expect(dropped.ok && dropped.document.sections[0]?.id).toBe("s1");
  });

  test("a new block is checked when the drag begins: the schema, and ids the page does not have", () => {
    const doc = page();
    const broken = { id: "z1", type: "quote", props: {}, children: [], style: { base: {} } } as unknown as Block;
    expect(startDrag(doc, { kind: "palette", block: broken })).toMatchObject({ ok: false, error: { reason: "invalid" } });
    expect(startDrag(doc, { kind: "palette", block: quote("q1") })).toMatchObject({ ok: false, error: { reason: "duplicateId" } });
    expect(startDrag(doc, { kind: "block", id: "nope" })).toMatchObject({ ok: false, error: { reason: "unknown" } });
  });
});

describe("where a block may land", () => {
  test("for a widget: every column; never the page, a section or a widget", () => {
    const doc = page();
    const targets = dropTargets(start(doc, { kind: "palette", block: quote("new1") }));
    const allowed = targets.filter((t) => t.verdict.allowed).map((t) => t.parentId);
    const refused = targets.filter((t) => !t.verdict.allowed).map((t) => t.parentId);
    expect(allowed).toEqual(["c1", "c2", "c3"]);
    expect(refused).toEqual([null, "hero", "join"]);
  });

  test("for a column: every section but a full one", () => {
    const doc = page();
    const targets = dropTargets(start(doc, { kind: "block", id: "c1" }));
    expect(targets.filter((t) => t.verdict.allowed).map((t) => t.parentId)).toEqual(["hero", "join"]);
  });

  test("an empty container keeps the drag library's default priority; a filled one ranks below its children", () => {
    expect(containerPriority(0)).toBe("default");
    expect(containerPriority(3)).toBe("low");
  });

  test("the announcement says where it goes, or why it cannot", () => {
    const doc = page();
    const session = start(doc, { kind: "block", id: "q1" });
    expect(describeDrop(session)).toBeNull();
    expect(describeDrop(dragOver(session, { parentId: "c1", index: 0 }))).toBe("Quote will move to Column 1 in Hero, at the top.");
    expect(describeDrop(dragOver(session, { parentId: "c3", index: 1 }))).toBe("Quote will move to Column 1 in Join, after Divider.");
    expect(describeDrop(dragOver(session, { parentId: null, index: 0 }))).toBe("Widgets go inside a column, not into the page.");
  });
});

describe("on 500 blocks", () => {
  test("moving the pointer validates each container once, and the drop validates the page whole", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const text = readFileSync(fileURLToPath(new URL("../../../contract/fixtures/large-500.json", import.meta.url)), "utf8");
    const checked = validateDocument(JSON.parse(text));
    if (!checked.valid) throw new Error("the 500-block fixture is not valid");
    const doc = checked.document;
    const widget = doc.sections[0]?.children[0]?.children[0];
    const target = doc.sections[24]?.children[0];
    if (!widget || !target) throw new Error("unexpected fixture");
    let session = start(doc, { kind: "block", id: widget.id });
    for (let index = 0; index <= target.children.length; index++) session = dragOver(session, { parentId: target.id, index });
    expect(session.verdicts.size).toBe(1);
    const dropped = drop(session);
    expect(dropped.ok && dropped.command?.kind).toBe("move");
  });
});
