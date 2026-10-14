// @vitest-environment node
// Each command on a page small enough to read: what it changes, what its
// label says in the history, where it leaves the focus, what it refuses
// and why. The random sessions of property.test.ts hold every command to
// its inverse; these hold each one to its meaning.
import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { counter, page } from "../../test/document-page.ts";
import type { Block, PageDocument } from "../shared/document.ts";
import { validateDocument } from "../shared/validate.ts";
import { clipboardText, copyBlock, readClipboard } from "./clipboard.ts";
import {
  invertCommand, makeDelete, makeDuplicate, makeInsert, makeInsertItems, makeInsertSection, makeInsertUploadedImage, makeMove,
  makeMoveItem, makePaste, makeRemoveItem, makeSetColumnCount, makeSetColumnWidths, makeSetItem, makeSetPage, makeSetProps,
  makeSetStack, makeSetStyle, pasteTarget, REMOVE, type Command, type Made,
} from "./commands.ts";
import { applyCommand, type Applied } from "./reducer.ts";
import { locate } from "./tree.ts";

function command(made: Made): Command {
  if (!made.ok) throw new Error(`refused: ${made.error.message}`);
  return made.command;
}
function done(applied: Applied): Extract<Applied, { ok: true }> {
  if (!applied.ok) throw new Error(`refused: ${applied.error.message}`);
  return applied;
}
// Applies a command, checks the page it gives is valid, and that its
// inverse gives back the page it started from.
function apply(doc: PageDocument, made: Made): Extract<Applied, { ok: true }> & { command: Command } {
  const c = command(made);
  const result = done(applyCommand(doc, c));
  expect(validateDocument(result.document).valid).toBe(true);
  const undone = done(applyCommand(result.document, invertCommand(c)));
  expect(isDeepStrictEqual(undone.document, doc)).toBe(true);
  expect(JSON.stringify(undone.document)).toBe(JSON.stringify(doc));
  return { ...result, command: c };
}
const block = (doc: PageDocument, id: string): Block => {
  const found = locate(doc, id);
  if (!found) throw new Error(`no ${id}`);
  return found.block;
};
const ids = (doc: PageDocument, id: string): string[] => block(doc, id).children.map((b) => b.id);

describe("insert", () => {
  test("a widget goes into a column, focused, with a label naming where", () => {
    const doc = page();
    const quote: Block = { id: "q9", type: "quote", props: { text: "Bracing." }, children: [], style: { base: {} } };
    const { document, focus, command: c } = apply(doc, makeInsert(doc, quote, { parentId: "c2", index: 1 }));
    expect(ids(document, "c2")).toEqual(["i1", "q9"]);
    expect(focus).toEqual({ id: "q9" });
    expect(c.label).toBe("Added Quote to Column 2 in Hero");
    expect(c.kind).toBe("insert");
  });

  test("a widget is refused on the page and in a section, in the design's words", () => {
    const doc = page();
    const divider: Block = { id: "d9", type: "divider", props: {}, children: [], style: { base: {} } };
    const onPage = makeInsert(doc, divider, { parentId: null, index: 0 });
    expect(onPage.ok ? null : onPage.error).toEqual({ reason: "nesting", message: "Widgets go inside a column, not into the page." });
    const inSection = makeInsert(doc, divider, { parentId: "hero", index: 0 });
    expect(inSection.ok ? null : inSection.error.message).toBe("Widgets go inside a column, not into a section.");
    const section: Block = { id: "s9", type: "section", props: {}, children: [{ id: "s9c", type: "column", props: {}, children: [], style: { base: {} } }], style: { base: {} } };
    const intoColumn = makeInsert(doc, section, { parentId: "c1", index: 0 });
    expect(intoColumn.ok ? null : intoColumn.error.message).toBe("Sections go on the page, not into a column.");
    const column: Block = { id: "c9", type: "column", props: {}, children: [], style: { base: {} } };
    const columnOnPage = makeInsert(doc, column, { parentId: null, index: 0 });
    expect(columnOnPage.ok ? null : columnOnPage.error.message).toBe("Columns go inside a section, not into the page.");
  });

  test("a new section comes with its empty columns and ids drawn when the command is made", () => {
    const doc = page();
    const c = command(makeInsertSection(doc, 3, 1, counter("s")));
    const { document, focus } = apply(doc, makeInsertSection(doc, 3, 1, counter("s")));
    expect(c.label).toBe("Added a section with 3 columns");
    expect(document.sections.map((s) => s.id)).toEqual(["hero", "s1", "join"]);
    expect(ids(document, "s1")).toEqual(["s2", "s3", "s4"]);
    expect(focus).toEqual({ id: "s1" });
    // The ids are in the command: applying it twice gives the same blocks.
    expect(isDeepStrictEqual(done(applyCommand(doc, c)).document, document)).toBe(true);
  });

  test("a fifth column is refused by the schema's own limit, said as a count", () => {
    const doc = page();
    const four = done(applyCommand(doc, command(makeSetColumnCount(doc, "hero", 4, counter("x"))))).document;
    const fifth = applyCommand(four, command(makeDuplicate(four, "c1", counter("y"))));
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.error.reason).toBe("full");
      expect(fifth.error.message).toBe("Hero is full: it holds at most 4 columns.");
      expect(fifth.error.errors).toContainEqual(expect.objectContaining({ pointer: "/sections/0/children", keyword: "maxItems", limit: 4 }));
    }
  });

  test("an uploaded image is born with its media id and alt text", () => {
    const doc = page();
    const { document, focus, command: c } = apply(doc, makeInsertUploadedImage(doc, { mediaId: "up7", alt: "New pier" }, { parentId: "c3", index: 0 }, counter("img")));
    expect(block(document, "img1")).toEqual({ id: "img1", type: "image", props: { mediaId: "up7", alt: "New pier" }, children: [], style: { base: {} } });
    expect(focus).toEqual({ id: "img1" });
    expect(c.label).toBe("Added Image to Column 1 in Join");
    const decorative = command(makeInsertUploadedImage(doc, { mediaId: "up8", decorative: true }, { parentId: "c3", index: 0 }, counter("img")));
    expect((decorative.ops[0] as { block: Block }).block.props).toEqual({ mediaId: "up8", decorative: true });
  });
});

describe("delete", () => {
  test("the focus goes to the block now in its place, else the one before, else the container", () => {
    const doc = page();
    const middle = apply(doc, makeDelete(doc, "t1"));
    expect(ids(middle.document, "c1")).toEqual(["h1", "b1"]);
    expect(middle.focus).toEqual({ id: "b1" });
    expect(middle.command.label).toBe("Deleted Text in Hero");

    expect(apply(doc, makeDelete(doc, "b1")).focus).toEqual({ id: "t1" });
    expect(apply(doc, makeDelete(doc, "i1")).focus).toEqual({ id: "c2" });
    expect(apply(doc, makeDelete(doc, "join")).focus).toEqual({ id: "hero" });
    expect(apply(doc, makeDelete(doc, "hero")).command.label).toBe("Deleted Hero");

    const lone = done(applyCommand(doc, command(makeDelete(doc, "join")))).document;
    expect(done(applyCommand(lone, command(makeDelete(lone, "hero")))).focus).toBeNull();
  });

  test("the last column of a section stays, and a column that goes takes the widths with it", () => {
    const doc = page();
    const last = applyCommand(doc, command(makeDelete(doc, "c3")));
    expect(last.ok ? null : last.error).toMatchObject({ reason: "empty", message: "Join must keep at least 1 column." });

    const { document } = apply(doc, makeDelete(doc, "c2"));
    expect(block(document, "hero").props).toEqual({ label: "Hero" });
  });
});

describe("move", () => {
  test("a widget to another column, with the index counted once it has left", () => {
    const doc = page();
    const { document, focus, command: c } = apply(doc, makeMove(doc, "h1", { parentId: "c3", index: 1 }));
    expect(ids(document, "c3")).toEqual(["d1", "h1", "q1", "g1"]);
    expect(focus).toEqual({ id: "h1" });
    expect(c.label).toBe("Moved Heading to Column 1 in Join");
    const within = apply(doc, makeMove(doc, "h1", { parentId: "c1", index: 2 }));
    expect(ids(within.document, "c1")).toEqual(["t1", "b1", "h1"]);
    expect(within.command.label).toBe("Moved Heading in Hero");
  });

  test("a column moved inside its section takes its part of the widths along", () => {
    const doc = page();
    const { document } = apply(doc, makeMove(doc, "c2", { parentId: "hero", index: 0 }));
    expect(ids(document, "hero")).toEqual(["c2", "c1"]);
    expect(block(document, "hero").props).toEqual({ label: "Hero", columnWidths: "1:2" });
  });

  test("a column moved to another section clears the widths of both", () => {
    const doc = page();
    const { document } = apply(doc, makeMove(doc, "c2", { parentId: "join", index: 1 }));
    expect(block(document, "hero").props).toEqual({ label: "Hero" });
    expect(ids(document, "join")).toEqual(["c3", "c2"]);
  });

  test("refusals: into itself, into a widget, nowhere new", () => {
    const doc = page();
    const intoItself = makeMove(doc, "hero", { parentId: "c1", index: 0 });
    expect(intoItself.ok ? null : intoItself.error.reason).toBe("nesting");
    const intoWidget = makeMove(doc, "t1", { parentId: "h1", index: 0 });
    expect(intoWidget.ok ? null : intoWidget.error.message).toBe("Widgets go inside a column, not into a heading.");
    const same = makeMove(doc, "t1", { parentId: "c1", index: 1 });
    expect(same.ok ? null : same.error.reason).toBe("nothing");
  });
});

describe("duplicate and paste", () => {
  test("a duplicate goes right after the original, with new ids for every block in it, drawn when made", () => {
    const doc = page();
    const c = command(makeDuplicate(doc, "hero", counter("dup")));
    const { document, focus } = apply(doc, makeDuplicate(doc, "hero", counter("dup")));
    expect(document.sections.map((s) => s.id)).toEqual(["hero", "dup1", "join"]);
    // Drawn in document order: the section, its first column and that
    // column's widgets, then the second column and its image.
    expect(ids(document, "dup1")).toEqual(["dup2", "dup6"]);
    expect(ids(document, "dup2")).toEqual(["dup3", "dup4", "dup5"]);
    expect(ids(document, "dup6")).toEqual(["dup7"]);
    expect(block(document, "dup3").props).toEqual(block(doc, "h1").props);
    expect(focus).toEqual({ id: "dup1" });
    expect(c.label).toBe("Duplicated Hero");
    // Applied twice, the same command gives the same ids.
    expect(isDeepStrictEqual(done(applyCommand(doc, c)).document, document)).toBe(true);
    // Every id on the page is still unique: the application rules agree.
    expect(validateDocument(document).valid).toBe(true);
  });

  test("the id source is asked again when it gives an id the page has, and stops a source that only does", () => {
    const doc = page();
    const given = ["h1", "t1", "fresh"];
    const c = command(makeDuplicate(doc, "q1", () => given.shift() ?? "never"));
    expect(c.subject).toEqual({ id: "fresh" });
    expect(() => makeDuplicate(doc, "q1", () => "h1")).toThrow(/100 ids in a row/);
    expect(() => makeDuplicate(doc, "q1", () => "not an id")).toThrow(/not a block id/);
  });

  test("copy, then paste after the selection, with new ids", () => {
    const doc = page();
    const copied = copyBlock(doc, "q1");
    if (!copied) throw new Error("nothing copied");
    const read = readClipboard(clipboardText(copied));
    if (!read.ok) throw new Error(read.error.message);
    const { document, focus, command: c } = apply(doc, makePaste(doc, read.block, "h1", counter("p")));
    expect(ids(document, "c1")).toEqual(["h1", "p1", "t1", "b1"]);
    expect(block(document, "p1").props).toEqual(block(doc, "q1").props);
    expect(focus).toEqual({ id: "p1" });
    expect(c.label).toBe("Pasted Quote into Column 1 in Hero");
  });

  test("a copied section keeps its anchor only where the page does not use it: a duplicate never, a paste from another page may", () => {
    const doc = page();
    const duplicated = apply(doc, makeDuplicate(doc, "join", counter("dup"))).document;
    expect(block(duplicated, "join").props).toEqual({ label: "Join", anchor: "join" });
    expect(block(duplicated, "dup1").props).toEqual({ label: "Join" });
    const copied = copyBlock(doc, "join");
    if (!copied) throw new Error("nothing copied");
    const here = apply(doc, makePaste(doc, copied, "hero", counter("p"))).document;
    expect(block(here, "p1").props).toEqual({ label: "Join" });
    // A page with no section at #join, as another page would be.
    const elsewhere = done(applyCommand(doc, command(makeDelete(doc, "join")))).document;
    const there = apply(elsewhere, makePaste(elsewhere, copied, "hero", counter("p"))).document;
    expect(block(there, "p1").props).toEqual({ label: "Join", anchor: "join" });
    // The copy in the clipboard is left as it was.
    expect(copied.props).toEqual({ label: "Join", anchor: "join" });
  });

  test("a copy keeps no anchor the page uses anywhere under it, a column's and a widget's as a section's; a paste elsewhere keeps the free ones", () => {
    const anchors = (doc: PageDocument) => [...JSON.stringify(doc).matchAll(/"anchor":"([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    const start = page();
    const button = apply(start, makeSetProps(start, "b1", { anchor: "cta" })).document;
    const doc = apply(button, makeSetProps(button, "c1", { anchor: "side" })).document;
    const duplicated = apply(doc, makeDuplicate(doc, "hero", counter("dup"))).document;
    expect(anchors(duplicated)).toEqual(["cta", "join", "side"]);
    expect(validateDocument(duplicated).valid).toBe(true);
    const copied = copyBlock(doc, "hero");
    if (!copied) throw new Error("nothing copied");
    const elsewhere = done(applyCommand(doc, command(makeDelete(doc, "hero")))).document;
    const there = apply(elsewhere, makePaste(elsewhere, copied, "join", counter("p"))).document;
    expect(anchors(there)).toEqual(["cta", "join", "side"]);
  });

  test("where a paste goes: beside the selection, else inside it, else beside a block above", () => {
    const doc = page();
    expect(pasteTarget(doc, "quote", "c2")).toEqual({ parentId: "c2", index: 1 });
    expect(pasteTarget(doc, "column", "h1")).toEqual({ parentId: "hero", index: 1 });
    expect(pasteTarget(doc, "section", "h1")).toEqual({ parentId: null, index: 1 });
    expect(pasteTarget(doc, "section", null)).toEqual({ parentId: null, index: 2 });
    expect(pasteTarget(doc, "quote", null)).toBeNull();
    expect(pasteTarget(doc, "quote", "hero")).toBeNull();
    const nowhere = makePaste(doc, block(doc, "q1"), "hero", counter());
    expect(nowhere.ok ? null : nowhere.error.reason).toBe("noTarget");
  });

  test("the clipboard refuses what is not a block of this editor, or not a valid one", () => {
    expect(readClipboard("Just some text").ok).toBe(false);
    expect(readClipboard('{"kind":"page-builder-cms/block","schemaVersion":1,"block":{}}')).toMatchObject({ ok: false, error: { reason: "invalid" } });
    const doubled = '{"kind":"page-builder-cms/block","kind":"x","schemaVersion":1,"block":{}}';
    expect(readClipboard(doubled).ok).toBe(false);
    const script = clipboardText({ id: "b9", type: "button", props: { label: "Go", href: "javascript:alert(1)" }, children: [], style: { base: {} } } as Block);
    expect(readClipboard(script)).toMatchObject({ ok: false, error: { reason: "invalid" } });
    const later = JSON.stringify({ kind: "page-builder-cms/block", schemaVersion: 2, block: {} });
    expect(readClipboard(later)).toMatchObject({ ok: false, error: { message: "The copied block is from schemaVersion 2, and this editor reads 1." } });
  });
});

describe("properties and style", () => {
  test("props: a field by its name in the history, an unset field absent", () => {
    const doc = page();
    const label = apply(doc, makeSetProps(doc, "b1", { label: "Sign up" }));
    expect(label.command.label).toBe("Changed Button text in Hero");
    expect(block(label.document, "b1").props).toEqual({ label: "Sign up", href: "/join" });

    const unlink = apply(doc, makeSetProps(doc, "h1", { href: REMOVE }));
    expect(block(unlink.document, "h1").props).toEqual({ level: 1, text: "Winter series" });
    expect(Object.hasOwn(block(unlink.document, "h1").props, "href")).toBe(false);

    expect(apply(doc, makeSetProps(doc, "join", { label: "Questions" })).command.label).toBe("Renamed section to Questions");
    expect(apply(doc, makeSetProps(doc, "q1", { text: "Glad." })).command.label).toBe("Changed Quote in Join");
    const nothing = makeSetProps(doc, "b1", { label: "Join" });
    expect(nothing.ok ? null : nothing.error.reason).toBe("nothing");
  });

  test("an image switched to an uploaded file: the url key goes, the media id comes, in the schema's order", () => {
    const doc = page();
    const { document } = apply(doc, makeSetProps(doc, "i1", { url: REMOVE, mediaId: "up1" }));
    expect(Object.keys(block(document, "i1").props)).toEqual(["mediaId", "alt"]);
  });

  test("an override set and cleared: the key, and the last one the device's object, become absent", () => {
    const doc = page();
    const set = apply(doc, makeSetStyle(doc, "c1", "tablet", { spaceInside: "xl" }));
    expect(set.command.label).toBe("Set Space inside to XL on tablet, Column 1 in Hero");

    const once = done(applyCommand(doc, command(makeSetStyle(doc, "c1", "tablet", { spaceInside: REMOVE }))));
    expect(block(once.document, "c1").style).toEqual({ base: { spaceInside: "m" }, tablet: { align: "center" } });
    const last = apply(once.document, makeSetStyle(once.document, "c1", "tablet", { align: REMOVE }));
    expect(last.command.label).toBe("Cleared Alignment on tablet, Column 1 in Hero");
    expect(block(last.document, "c1").style).toEqual({ base: { spaceInside: "m" } });
    expect(Object.hasOwn(block(last.document, "c1").style, "tablet")).toBe(false);

    // A phone override where there was none makes the object, after tablet.
    const phone = apply(doc, makeSetStyle(doc, "c1", "phone", { verticalAlign: "bottom" }));
    expect(Object.keys(block(phone.document, "c1").style)).toEqual(["base", "tablet", "phone"]);
    const nothing = makeSetStyle(doc, "t1", "phone", { color: REMOVE });
    expect(nothing.ok ? null : nothing.error.reason).toBe("nothing");
  });

  test("a style key the block type does not take is refused by the schema", () => {
    const doc = page();
    const result = applyCommand(doc, command(makeSetStyle(doc, "d1", "base", { textSize: "large" })));
    expect(result.ok ? null : result.error.reason).toBe("invalid");
  });

  test("the page's title and description", () => {
    const doc = page();
    expect(apply(doc, makeSetPage(doc, { title: "Summer series" })).command.label).toBe("Changed the page title");
    const removed = apply(doc, makeSetPage(doc, { description: REMOVE }));
    expect(removed.command.label).toBe("Removed the page description");
    expect(Object.keys(removed.document)).toEqual(["schemaVersion", "title", "sections"]);
    expect(removed.focus).toBeNull();
    const blank = applyCommand(doc, command(makeSetPage(doc, { title: "   " })));
    expect(blank.ok ? null : blank.error.reason).toBe("invalid");
  });

  test("the header stays at the top, or scrolls with the page again: one step each, which undo takes back", () => {
    const doc = page();
    const on = apply(doc, makeSetPage(doc, { sticky: true }));
    expect(on.command.label).toBe("Made the header stay at the top");
    expect(Object.keys(on.document)).toEqual(["schemaVersion", "title", "description", "sticky", "sections"]);
    const off = apply(on.document, makeSetPage(on.document, { sticky: REMOVE }));
    expect(off.command.label).toBe("Let the header scroll with the page");
    expect("sticky" in off.document).toBe(false);
    expect(done(applyCommand(off.document, invertCommand(off.command))).document.sticky).toBe(true);
  });
});

describe("columns", () => {
  test("widths: a preset for that many columns, or equal, which is no key at all", () => {
    const doc = page();
    const set = apply(doc, makeSetColumnWidths(doc, "hero", "3:2"));
    expect(set.command.label).toBe("Set the column widths of Hero to 3:2");
    const equal = apply(doc, makeSetColumnWidths(doc, "hero", "equal"));
    expect(block(equal.document, "hero").props).toEqual({ label: "Hero" });
    expect(equal.command.label).toBe("Set equal column widths in Hero");
    const wrong = makeSetColumnWidths(doc, "hero", "2:1:1");
    expect(wrong.ok ? null : wrong.error.message).toBe("Hero has 2 columns: its widths can be 3:2, 2:3, 2:1, 1:2, fit:1 or 1:fit.");
    // A fit part: a column as wide as what it holds.
    const fit = apply(doc, makeSetColumnWidths(doc, "hero", "fit:1"));
    expect(block(fit.document, "hero").props).toEqual({ label: "Hero", columnWidths: "fit:1" });
    const single = makeSetColumnWidths(doc, "join", "2:1");
    expect(single.ok ? null : single.error.message).toBe("Join has 1 column: its widths can be only equal widths.");
  });

  test("more columns: empty ones at the end, the widths cleared", () => {
    const doc = page();
    const { document, focus, command: c } = apply(doc, makeSetColumnCount(doc, "hero", 3, counter("col")));
    expect(ids(document, "hero")).toEqual(["c1", "c2", "col1"]);
    expect(block(document, "hero").props).toEqual({ label: "Hero" });
    expect(focus).toEqual({ id: "hero" });
    expect(c.label).toBe("Changed Hero to 3 columns");
  });

  test("fewer columns: the widgets of those that go move, in order, to the end of the last that stays", () => {
    const doc = page();
    const three = done(applyCommand(doc, command(makeSetColumnCount(doc, "hero", 3, counter("col"))))).document;
    const withWidget = done(applyCommand(three, command(makeMove(three, "t1", { parentId: "col1", index: 0 })))).document;
    const { document } = apply(withWidget, makeSetColumnCount(withWidget, "hero", 1, counter("x")));
    expect(ids(document, "hero")).toEqual(["c1"]);
    expect(ids(document, "c1")).toEqual(["h1", "b1", "i1", "t1"]);
  });

  test("stacking: on phones only, or never, for two columns or more; on tablets and phones is no key at all", () => {
    const doc = page();
    const never = apply(doc, makeSetStack(doc, "hero", "never"));
    expect(block(never.document, "hero").props).toEqual({ label: "Hero", columnWidths: "2:1", stack: "never" });
    expect(never.command.label).toBe("Set the columns of Hero to never stack");
    expect(never.command.kind).toBe("stack");
    expect(never.focus).toEqual({ id: "hero" });
    const phone = apply(never.document, makeSetStack(never.document, "hero", "phone"));
    expect(block(phone.document, "hero").props).toEqual({ label: "Hero", columnWidths: "2:1", stack: "phone" });
    expect(phone.command.label).toBe("Set the columns of Hero to stack on phones only");
    const back = apply(phone.document, makeSetStack(phone.document, "hero", "tablet"));
    expect(block(back.document, "hero").props).toEqual({ label: "Hero", columnWidths: "2:1" });
    expect(back.command.label).toBe("Set the columns of Hero to stack on tablets and phones");
    const single = makeSetStack(doc, "join", "never");
    expect(single.ok ? null : single.error).toMatchObject({ reason: "invalid", message: "Join has 1 column: there is nothing to stack." });
  });

  test("one column left: the stacking goes with the widths, and an undo gives both back in their places", () => {
    const doc = page();
    const widths = done(applyCommand(doc, command(makeSetColumnWidths(doc, "hero", "fit:1")))).document;
    const stacked = done(applyCommand(widths, command(makeSetStack(widths, "hero", "never")))).document;
    const one = apply(stacked, makeSetColumnCount(stacked, "hero", 1, counter("x")));
    expect(block(one.document, "hero").props).toEqual({ label: "Hero" });
    // Columns left to stack: the stacking stays; the widths of two go.
    const three = apply(stacked, makeSetColumnCount(stacked, "hero", 3, counter("x")));
    expect(block(three.document, "hero").props).toEqual({ label: "Hero", stack: "never" });
  });
});

describe("items", () => {
  test("a gallery's images, one command each, with the focus on the item", () => {
    const doc = page();
    const added = apply(doc, makeInsertItems(doc, "g1", 1, [{ mediaId: "up3", alt: "Rocks" }, { mediaId: "up4", alt: "Kelp" }]));
    expect((block(added.document, "g1").props as { items: unknown[] }).items).toHaveLength(4);
    expect(added.focus).toEqual({ id: "g1", item: 1 });
    expect(added.command.label).toBe("Added 2 images to Gallery in Join");

    const removed = apply(doc, makeRemoveItem(doc, "g1", 1));
    expect(removed.focus).toEqual({ id: "g1", item: 0 });
    expect(removed.command.label).toBe("Removed image 2 from Gallery in Join");

    const moved = apply(doc, makeMoveItem(doc, "g1", 0, 1));
    expect((block(moved.document, "g1").props as { items: Array<{ alt: string }> }).items.map((i) => i.alt)).toEqual(["Buoy", "Pier"]);
    expect(moved.focus).toEqual({ id: "g1", item: 1 });

    const alt = apply(doc, makeSetItem(doc, "g1", 0, { alt: "The pier at dawn" }));
    expect(alt.command.label).toBe("Changed the alt text of image 1 in Gallery in Join");
    const decorative = apply(doc, makeSetItem(doc, "g1", 0, { alt: REMOVE, decorative: true }));
    expect((block(decorative.document, "g1").props as { items: unknown[] }).items[0]).toEqual({ mediaId: "m1", decorative: true });
  });

  test("a gallery keeps at least one image", () => {
    const doc = page();
    const one = done(applyCommand(doc, command(makeRemoveItem(doc, "g1", 0)))).document;
    const none = applyCommand(one, command(makeRemoveItem(one, "g1", 0)));
    expect(none.ok ? null : none.error).toMatchObject({ reason: "empty", message: "Gallery in Join must keep at least 1 image." });
  });
});

describe("a menu's links", () => {
  // A page with a menu of three links at the top of its first column.
  const withMenu = (): PageDocument => {
    const doc = page();
    const menu: Block = {
      id: "m9",
      type: "menu",
      props: { label: "Main", items: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Join", href: "/#join" }] },
      children: [],
      style: { base: {} },
    };
    return done(applyCommand(doc, command(makeInsert(doc, menu, { parentId: "c1", index: 0 })))).document;
  };
  const links = (doc: PageDocument) => (block(doc, "m9").props as { items: Array<{ label: string; href: string }> }).items;

  test("a link is added, moved, changed and removed by one command each, with the focus on it", () => {
    const doc = withMenu();
    const added = apply(doc, makeInsertItems(doc, "m9", 3, [{ label: "Meet us", href: "/#meet" }]));
    expect(links(added.document).map((link) => link.label)).toEqual(["Swims", "Gallery", "Join", "Meet us"]);
    expect(added.focus).toEqual({ id: "m9", item: 3 });
    const moved = apply(doc, makeMoveItem(doc, "m9", 2, 0));
    expect(links(moved.document).map((link) => link.label)).toEqual(["Join", "Swims", "Gallery"]);
    // A link's keys stay in the schema's order, whatever order the change names.
    const changed = apply(doc, makeSetItem(doc, "m9", 1, { href: "/gallery", label: "Pictures" }));
    expect(links(changed.document)[1]).toEqual({ label: "Pictures", href: "/gallery" });
    expect(Object.keys(links(changed.document)[1]!)).toEqual(["label", "href"]);
    const removed = apply(doc, makeRemoveItem(doc, "m9", 0));
    expect(links(removed.document).map((link) => link.label)).toEqual(["Gallery", "Join"]);
  });

  test("a menu keeps at least one link", () => {
    let doc = withMenu();
    doc = done(applyCommand(doc, command(makeRemoveItem(doc, "m9", 0)))).document;
    doc = done(applyCommand(doc, command(makeRemoveItem(doc, "m9", 0)))).document;
    const none = applyCommand(doc, command(makeRemoveItem(doc, "m9", 0)));
    expect(none.ok ? null : none.error).toMatchObject({ reason: "empty" });
  });
});

describe("the reducer", () => {
  test("a command made for another page is refused, and the page it was given is untouched", () => {
    const doc = page();
    const c = command(makeDelete(doc, "t1"));
    const changed = done(applyCommand(doc, command(makeSetProps(doc, "t1", { doc: { type: "doc", content: [{ type: "paragraph" }] } })))).document;
    const before = JSON.stringify(changed);
    const result = applyCommand(changed, c);
    expect(result.ok ? null : result.error.reason).toBe("stale");
    expect(JSON.stringify(changed)).toBe(before);
  });

  test("the inverse of the inverse is the command, and the command survives JSON", () => {
    const doc = page();
    for (const made of [makeDelete(doc, "hero"), makeSetStyle(doc, "c1", "tablet", { align: REMOVE }), makeMoveItem(doc, "g1", 0, 1)]) {
      const c = command(made);
      expect(invertCommand(invertCommand(c))).toEqual(c);
      expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    }
  });

  test("text that the application rules refuse is refused when it comes in, not when the page is saved", () => {
    const doc = page();
    const lone = applyCommand(doc, command(makeSetProps(doc, "b1", { label: "Half \ud83d" })));
    expect(lone.ok ? null : lone.error.errors?.[0]).toMatchObject({ keyword: "wellFormed", layer: "rules", pointer: "/sections/0/children/0/children/2/props/label" });
  });

  test("a block brought in with an id the page has is refused", () => {
    const doc = page();
    const copy: Block = { ...block(doc, "q1") };
    const result = applyCommand(doc, command(makeInsert(doc, copy, { parentId: "c1", index: 0 })));
    expect(result.ok ? null : result.error).toMatchObject({ reason: "duplicateId", message: "The id q1 is already used by another block." });
  });

  test("an anchor is unique across every block: a heading's that a later section has is refused at the section, as on the server, naming it", () => {
    const doc = page();
    const taken = applyCommand(doc, command(makeSetProps(doc, "h1", { anchor: "join" })));
    expect(taken.ok ? null : taken.error).toMatchObject({
      reason: "duplicateAnchor",
      message: "The anchor #join is already used by Join.",
      errors: [{ pointer: "/sections/1/props/anchor", keyword: "uniqueAnchor", layer: "rules" }],
    });
  });

  test("an anchor another section has is refused, at the second section in page order as on the server, naming the other", () => {
    const doc = page();
    const taken = applyCommand(doc, command(makeSetProps(doc, "hero", { anchor: "join" })));
    expect(taken.ok ? null : taken.error).toEqual({
      reason: "duplicateAnchor",
      message: "The anchor #join is already used by Join.",
      errors: [{ pointer: "/sections/1/props/anchor", keyword: "uniqueAnchor", message: "The anchor \"join\" is already used by another block.", layer: "rules" }],
    });
    // A section brought back by an undo is held to it too.
    const removed = command(makeDelete(doc, "join"));
    const without = done(applyCommand(doc, removed)).document;
    const reused = done(applyCommand(without, command(makeSetProps(without, "hero", { anchor: "join" })))).document;
    const back = applyCommand(reused, invertCommand(removed));
    expect(back.ok ? null : back.error.reason).toBe("duplicateAnchor");
    // A free anchor goes through.
    expect(block(apply(doc, makeSetProps(doc, "hero", { anchor: "top" })).document, "hero").props).toMatchObject({ anchor: "top" });
  });
});
