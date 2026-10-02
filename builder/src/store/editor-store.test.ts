// @vitest-environment node
// The store that hosts the reducer: the history the interface's undo and
// redo will use, the focus each step leaves, the selection, the clock it is
// given, and a drag that leaves the page alone until the drop.
import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { counter, page } from "../../test/document-page.ts";
import type { Block } from "../shared/document.ts";
import { makeDelete, makeDuplicate, makeInsert, makeSetProps, makeSetStyle, REMOVE, type Command, type Made } from "../document/commands.ts";
import { locate } from "../document/tree.ts";
import { createEditorStore } from "./editor-store.ts";

function command(made: Made): Command {
  if (!made.ok) throw new Error(made.error.message);
  return made.command;
}

function clock(start = 1_000): () => number {
  let t = start;
  return () => (t += 1_000);
}

describe("the editor's store", () => {
  test("undo and redo walk the history, and focus the block each touched", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const first = store.getState().document;
    const s = () => store.getState();

    expect(s().dispatch(command(makeDelete(s().document, "t1")))).toEqual({ ok: true, focus: { id: "b1" } });
    expect(s().selection).toBe("b1");
    expect(s().dispatch(command(makeSetProps(s().document, "q1", { attribution: REMOVE })))).toEqual({ ok: true, focus: { id: "q1" } });
    expect(s().past.map((e) => e.command.label)).toEqual(["Deleted Text in Hero", "Changed Quote attribution in Join"]);
    expect(s().past.map((e) => e.at)).toEqual([2_000, 3_000]);

    // Undo of the edit: the edited block. Undo of the delete: the block
    // that came back.
    expect(s().undo()).toEqual({ ok: true, focus: { id: "q1" } });
    expect(s().undo()).toEqual({ ok: true, focus: { id: "t1" } });
    expect(s().undo()).toMatchObject({ ok: false, error: { reason: "nothing", message: "There is nothing to undo." } });
    expect(isDeepStrictEqual(s().document, first)).toBe(true);
    expect(s().future.map((e) => e.command.label)).toEqual(["Changed Quote attribution in Join", "Deleted Text in Hero"]);

    expect(s().redo()).toEqual({ ok: true, focus: { id: "b1" } });
    expect(s().past.at(-1)?.at).toBe(4_000);
    // A new command drops what was left to redo.
    s().dispatch(command(makeSetStyle(s().document, "h1", "tablet", { align: "center" })));
    expect(s().future).toEqual([]);
    expect(s().redo()).toMatchObject({ ok: false, error: { reason: "nothing" } });
  });

  test("undo of an insert focuses where the block was; redo puts back the same block, same id", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    const duplicate = command(makeDuplicate(s().document, "b1", counter("copy")));
    s().dispatch(duplicate);
    const withCopy = s().document;
    expect(locate(withCopy, "copy1")?.index).toBe(3);
    expect(s().undo()).toEqual({ ok: true, focus: { id: "b1" } });
    expect(s().redo()).toEqual({ ok: true, focus: { id: "copy1" } });
    expect(isDeepStrictEqual(s().document, withCopy)).toBe(true);
  });

  test("a refused command leaves everything as it was and says why", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    const before = s().document;
    const last = s().dispatch(command(makeDelete(before, "c3")));
    expect(last).toMatchObject({ ok: false, error: { reason: "empty" } });
    expect(s().document).toBe(before);
    expect(s().past).toEqual([]);
    expect(s().error?.message).toBe("Join must keep at least 1 column.");
    s().dispatch(command(makeDelete(before, "d1")));
    expect(s().error).toBeNull();
  });

  test("the history keeps the most recent commands up to its limit", () => {
    const store = createEditorStore({ document: page(), now: clock(), historyLimit: 2 });
    const s = () => store.getState();
    for (const text of ["One", "Two", "Three"]) s().dispatch(command(makeSetProps(s().document, "b1", { label: text })));
    expect(s().past.map((e) => e.command.label)).toHaveLength(2);
    s().undo();
    s().undo();
    expect(s().undo().ok).toBe(false);
    expect((locate(s().document, "b1")?.block.props as { label: string }).label).toBe("One");
  });

  test("loading a page starts the history again; selecting a block that is not there selects nothing", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    s().dispatch(command(makeDelete(s().document, "d1")));
    s().select("h1");
    s().load(page());
    expect(s().past).toEqual([]);
    expect(s().selection).toBeNull();
    s().select("h1");
    expect(s().selection).toBe("h1");
    s().select("nope");
    expect(s().selection).toBeNull();
    s().setDevice("phone");
    expect(s().device).toBe("phone");
  });

  test("a subscriber sees each new page once per command", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const pages: unknown[] = [];
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) pages.push(state.document);
    });
    store.getState().dispatch(command(makeDelete(store.getState().document, "d1")));
    store.getState().undo();
    store.getState().select("h1");
    expect(pages).toHaveLength(2);
  });
});

describe("dragging through the store", () => {
  test("the page stays as it was while dragging; a cancel leaves no trace", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    const before = s().document;
    expect(s().startDrag({ kind: "block", id: "q1" }).ok).toBe(true);
    s().dragOver({ parentId: "c2", index: 0 });
    expect(s().document).toBe(before);
    expect(locate(s().drag?.preview ?? before, "q1")?.parentId).toBe("c2");
    s().cancelDrag();
    expect(s().drag).toBeNull();
    expect(s().document).toBe(before);
    expect(s().past).toEqual([]);
  });

  test("a drop is one command in the history, undone in one step", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    const before = s().document;
    s().startDrag({ kind: "block", id: "q1" });
    s().dragOver({ parentId: "c1", index: 3 });
    s().dragOver({ parentId: "c2", index: 1 });
    expect(s().drop()).toEqual({ ok: true, focus: { id: "q1" } });
    expect(s().past.map((e) => e.command.label)).toEqual(["Moved Quote to Column 2 in Hero"]);
    expect(locate(s().document, "q1")?.parentId).toBe("c2");
    s().undo();
    expect(isDeepStrictEqual(s().document, before)).toBe(true);
  });

  test("from the widget panel: an insert, refused where widgets cannot go", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    const spacer: Block = { id: "sp1", type: "spacer", props: { size: "l" }, children: [], style: { base: {} } };
    s().startDrag({ kind: "palette", block: spacer });
    s().dragOver({ parentId: null, index: 1 });
    expect(s().drag?.verdict).toMatchObject({ allowed: false, error: { message: "Widgets go inside a column, not into the page." } });
    expect(s().drop()).toMatchObject({ ok: false, error: { reason: "nesting" } });
    expect(s().past).toEqual([]);

    s().startDrag({ kind: "palette", block: spacer });
    s().dragOver({ parentId: "c3", index: 0 });
    expect(s().drop()).toEqual({ ok: true, focus: { id: "sp1" } });
    expect(s().past.map((e) => e.command.kind)).toEqual(["insert"]);
  });

  test("loading a page ends a drag", () => {
    const store = createEditorStore({ document: page(), now: clock() });
    const s = () => store.getState();
    s().startDrag({ kind: "block", id: "q1" });
    s().load(page());
    expect(s().drag).toBeNull();
  });

  test("a drop planned on a page that changed meanwhile is applied to the page as it is, or refused", () => {
    const divider = (id: string): Block => ({ id, type: "divider", props: {}, children: [], style: { base: {} } });
    // The page changes under a drag in progress (as a command from another
    // part of the interface would change it), and then the block is dropped.
    const dropAfter = (index: number) => {
      const store = createEditorStore({ document: page(), now: clock() });
      const s = () => store.getState();
      s().startDrag({ kind: "block", id: "q1" });
      s().dragOver({ parentId: "c2", index: 1 });
      const drag = s().drag;
      s().dispatch(command(makeInsert(s().document, divider("x1"), { parentId: "c3", index })));
      store.setState({ drag });
      return { outcome: s().drop(), s };
    };
    // A divider added after the quote: the quote is where the move expects.
    const fits = dropAfter(3);
    expect(fits.outcome).toEqual({ ok: true, focus: { id: "q1" } });
    expect(locate(fits.s().document, "q1")?.parentId).toBe("c2");
    expect(locate(fits.s().document, "x1")?.parentId).toBe("c3");
    // A divider added before it: the quote is no longer where the move
    // was planned, so the drop is refused rather than move another block.
    const moved = dropAfter(0);
    expect(moved.outcome).toMatchObject({ ok: false, error: { reason: "stale" } });
    expect(locate(moved.s().document, "q1")?.parentId).toBe("c3");
  });
});
