// The places the canvas's "+" adds at: beside a block, after the
// selection for the "+" key, still on the page or gone, and named as the
// picker names them.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import { placeBeside, placeExists, placeForKey, placeKey, placeWords } from "./insert-place.ts";

test("beside a widget, a place in its column; beside a section, a place on the page; none beside a column", () => {
  const doc = page();
  expect(placeBeside(doc, "t1", "after")).toEqual({ kind: "block", parentId: "c1", index: 2 });
  expect(placeBeside(doc, "t1", "before")).toEqual({ kind: "block", parentId: "c1", index: 1 });
  expect(placeBeside(doc, "join", "after")).toEqual({ kind: "section", index: 2 });
  expect(placeBeside(doc, "hero", "before")).toEqual({ kind: "section", index: 0 });
  expect(placeBeside(doc, "c2", "after")).toBeNull();
  expect(placeBeside(doc, "nothing", "after")).toBeNull();
});

test("the + key opens after the selection: a block after a widget, a section after a section, at the end of a column; a section at the page's end with nothing selected", () => {
  const doc = page();
  expect(placeForKey(doc, "q1")).toEqual({ kind: "block", parentId: "c3", index: 2 });
  expect(placeForKey(doc, "hero")).toEqual({ kind: "section", index: 1 });
  expect(placeForKey(doc, "c1")).toEqual({ kind: "block", parentId: "c1", index: 3 });
  expect(placeForKey(doc, null)).toEqual({ kind: "section", index: 2 });
});

test("a place is still there, or gone with its column or past its end", () => {
  const doc = page();
  expect(placeExists(doc, { kind: "block", parentId: "c2", index: 1 })).toBe(true);
  expect(placeExists(doc, { kind: "block", parentId: "c2", index: 2 })).toBe(false);
  expect(placeExists(doc, { kind: "block", parentId: "hero", index: 0 })).toBe(false);
  expect(placeExists(doc, { kind: "block", parentId: "gone", index: 0 })).toBe(false);
  expect(placeExists(doc, { kind: "section", index: 2 })).toBe(true);
  expect(placeExists(doc, { kind: "section", index: 3 })).toBe(false);
});

test("the picker names its place: after a block, before one, in an empty column; between two sections, before the first, after the last", () => {
  const doc = page();
  expect(placeWords(doc, { kind: "block", parentId: "c1", index: 1 })).toEqual({ title: "Add a block after Heading", lands: { before: "Heading", after: "Text", within: "Column 1" } });
  expect(placeWords(doc, { kind: "block", parentId: "c1", index: 0 })).toMatchObject({ title: "Add a block before Heading" });
  const empty: PageDocument = { ...doc, sections: [{ ...doc.sections[1]!, children: [{ ...doc.sections[1]!.children[0]!, children: [] }] }] };
  expect(placeWords(empty, { kind: "block", parentId: "c3", index: 0 })).toEqual({ title: "Add a block to Column 1", lands: { before: null, after: null, within: "Column 1" } });
  expect(placeWords(doc, { kind: "section", index: 1 })).toEqual({ title: "Add a section after Hero", lands: { before: "Hero", after: "Join", within: null } });
  expect(placeWords(doc, { kind: "section", index: 0 })).toMatchObject({ title: "Add a section before Hero" });
  expect(placeWords(doc, { kind: "section", index: 2 })).toMatchObject({ title: "Add a section after Join", lands: { before: "Join", after: null } });
  expect(placeKey({ kind: "block", parentId: "c1", index: 1 })).toBe("block:c1:1");
  expect(placeKey({ kind: "section", index: 0 })).toBe("section:0");
});
