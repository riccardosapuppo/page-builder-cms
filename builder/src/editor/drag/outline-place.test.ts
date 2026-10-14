// Where a block dragged in the Outline lands, from the row under the
// pointer and the pointer's height on it: beside a row, inside a row that
// can hold it (first when open, last when closed), in the first column of
// a section for a widget, beside the nearest ancestor whose container can
// hold it, and its own rows keeping the place.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../../test/document-page.ts";
import { placeOverRow } from "./outline-place.ts";
import type { Dragged } from "./place.ts";

// The test page: hero (c1: h1, t1, b1; c2: i1), join (c3: d1, q1, g1).
const quote: Dragged = { id: "q1", type: "quote", fromPage: true };
const fresh: Dragged = { id: "new1", type: "heading", fromPage: false };
const column: Dragged = { id: "c2", type: "column", fromPage: true };
const join: Dragged = { id: "join", type: "section", fromPage: true };

test("over a widget's row, a widget goes before it from the row's top half, after it from the bottom half", () => {
  const doc = page();
  expect(placeOverRow(doc, quote, "h1", 0.1, false)).toEqual({ parentId: "c1", index: 0 });
  expect(placeOverRow(doc, quote, "h1", 0.49, false)).toEqual({ parentId: "c1", index: 0 });
  expect(placeOverRow(doc, quote, "h1", 0.5, false)).toEqual({ parentId: "c1", index: 1 });
  expect(placeOverRow(doc, quote, "b1", 0.9, false)).toEqual({ parentId: "c1", index: 3 });
  // In its own column, the places count without it: after the divider is
  // where it already is.
  expect(placeOverRow(doc, quote, "d1", 0.9, false)).toEqual({ parentId: "c3", index: 1 });
  expect(placeOverRow(doc, quote, "g1", 0.9, false)).toEqual({ parentId: "c3", index: 2 });
  expect(placeOverRow(doc, fresh, "i1", 0.2, false)).toEqual({ parentId: "c2", index: 0 });
});

test("over a column's row, a widget goes inside: from the middle last when the row is closed, first when it is open", () => {
  const doc = page();
  expect(placeOverRow(doc, quote, "c2", 0.5, false)).toEqual({ parentId: "c2", index: 1 });
  expect(placeOverRow(doc, quote, "c2", 0.5, true)).toEqual({ parentId: "c2", index: 0 });
  // A widget cannot stand beside a column: the top quarter is the column's
  // first place, the bottom quarter its last (first, when open, the row
  // right under the pointer being its first child).
  expect(placeOverRow(doc, quote, "c2", 0.1, false)).toEqual({ parentId: "c2", index: 0 });
  expect(placeOverRow(doc, quote, "c2", 0.9, false)).toEqual({ parentId: "c2", index: 1 });
  expect(placeOverRow(doc, quote, "c2", 0.9, true)).toEqual({ parentId: "c2", index: 0 });
  // Its own column, closed: last is where it would stand once it has left.
  expect(placeOverRow(doc, quote, "c3", 0.5, false)).toEqual({ parentId: "c3", index: 2 });
});

test("over a section's row, a widget goes into its first column: first from the top quarter, last from the rest", () => {
  const doc = page();
  expect(placeOverRow(doc, quote, "hero", 0.1, false)).toEqual({ parentId: "c1", index: 0 });
  expect(placeOverRow(doc, quote, "hero", 0.5, false)).toEqual({ parentId: "c1", index: 3 });
  expect(placeOverRow(doc, quote, "hero", 0.9, true)).toEqual({ parentId: "c1", index: 3 });
});

test("a column over a section's row goes inside it; over a column's row, beside it; over a widget's row, beside the widget's column", () => {
  const doc = page();
  expect(placeOverRow(doc, column, "join", 0.5, false)).toEqual({ parentId: "join", index: 1 });
  expect(placeOverRow(doc, column, "join", 0.5, true)).toEqual({ parentId: "join", index: 0 });
  // The section's top quarter: a column cannot stand between sections, so
  // it goes in first.
  expect(placeOverRow(doc, column, "join", 0.1, false)).toEqual({ parentId: "join", index: 0 });
  expect(placeOverRow(doc, column, "c3", 0.2, false)).toEqual({ parentId: "join", index: 0 });
  expect(placeOverRow(doc, column, "c3", 0.8, false)).toEqual({ parentId: "join", index: 1 });
  expect(placeOverRow(doc, column, "d1", 0.3, false)).toEqual({ parentId: "join", index: 0 });
  expect(placeOverRow(doc, column, "g1", 0.7, false)).toEqual({ parentId: "join", index: 1 });
  // Beside its neighbour in its own section: c1 alone counts.
  expect(placeOverRow(doc, column, "h1", 0.7, false)).toEqual({ parentId: "hero", index: 1 });
});

test("a section goes before or after the section a row is in, whatever the row", () => {
  const doc = page();
  expect(placeOverRow(doc, join, "hero", 0.2, false)).toEqual({ parentId: null, index: 0 });
  expect(placeOverRow(doc, join, "hero", 0.5, true)).toEqual({ parentId: null, index: 1 });
  expect(placeOverRow(doc, join, "c1", 0.1, false)).toEqual({ parentId: null, index: 0 });
  expect(placeOverRow(doc, join, "b1", 0.9, false)).toEqual({ parentId: null, index: 1 });
});

test("the dragged block's own row and the rows inside it keep the place; an unknown row is none", () => {
  const doc = page();
  expect(placeOverRow(doc, quote, "q1", 0.5, false)).toBe("keep");
  expect(placeOverRow(doc, join, "join", 0.9, true)).toBe("keep");
  expect(placeOverRow(doc, join, "c3", 0.5, false)).toBe("keep");
  expect(placeOverRow(doc, join, "g1", 0.1, false)).toBe("keep");
  expect(placeOverRow(doc, quote, "gone", 0.5, false)).toBeNull();
});
