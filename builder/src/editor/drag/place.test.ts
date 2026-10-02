// Where a dragged block lands, from the drag library's target: a block it
// may stand beside (before or after it, by the pointer against its middle,
// down a column or along a row), or a container that may take it (among
// its children); the keyboard's (target, side) round trip; and which
// targets take no part.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../../test/document-page.ts";
import { inRow, PAGE_TARGET, placeAtPoint, placeFromSide, roleOf, targetForPlace, type Dragged, type Rect } from "./place.ts";

const quote: Dragged = { id: "q1", type: "quote", fromPage: true };
const fresh: Dragged = { id: "new1", type: "heading", fromPage: false };
const column: Dragged = { id: "c2", type: "column", fromPage: true };
const hero: Dragged = { id: "hero", type: "section", fromPage: true };

const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, right: left + width, bottom: top + height });

// Column 1 of the hero (c1) at x 0-400 holds h1, t1, b1 stacked 100 high;
// c2 at x 420-820 holds i1. Join's column c3 below, at y 400.
const RECTS: Record<string, Rect> = {
  [PAGE_TARGET]: rect(0, 0, 820, 800),
  hero: rect(0, 0, 820, 380), c1: rect(0, 0, 400, 360), c2: rect(420, 0, 400, 360),
  h1: rect(0, 0, 400, 100), t1: rect(0, 120, 400, 100), b1: rect(0, 240, 400, 100), i1: rect(420, 0, 400, 300),
  join: rect(0, 400, 820, 380), c3: rect(0, 400, 820, 360),
  d1: rect(0, 400, 820, 40), q1: rect(0, 460, 820, 100), g1: rect(0, 580, 820, 160),
};
const rectOf = (id: string) => RECTS[id] ?? null;

test("a target is a place beside it, a container for it, or nothing", () => {
  const doc = page();
  expect(roleOf(doc, quote, "h1")).toEqual({ kind: "sibling", parentId: "c1" });
  expect(roleOf(doc, quote, "c2")).toEqual({ kind: "container", parentId: "c2" });
  expect(roleOf(doc, quote, "hero")).toBeNull();
  expect(roleOf(doc, quote, PAGE_TARGET)).toBeNull();
  expect(roleOf(doc, hero, "join")).toEqual({ kind: "sibling", parentId: null });
  expect(roleOf(doc, hero, PAGE_TARGET)).toEqual({ kind: "container", parentId: null });
  // A section never lands in a column: over one, its section stands for it.
  expect(roleOf(doc, hero, "c3")).toBeNull();
  // Nothing inside the dragged block takes part.
  expect(roleOf(doc, hero, "c1")).toBeNull();
  expect(roleOf(doc, hero, "h1")).toBeNull();
  expect(roleOf(doc, column, "c1")).toEqual({ kind: "sibling", parentId: "hero" });
  expect(roleOf(doc, column, "join")).toEqual({ kind: "container", parentId: "join" });
});

test("over a widget, the pointer's side of its middle says before or after it", () => {
  const doc = page();
  expect(placeAtPoint(doc, fresh, "t1", { x: 100, y: 130 }, rectOf)).toEqual({ parentId: "c1", index: 1 });
  expect(placeAtPoint(doc, fresh, "t1", { x: 100, y: 210 }, rectOf)).toEqual({ parentId: "c1", index: 2 });
  expect(placeAtPoint(doc, fresh, "h1", { x: 100, y: 5 }, rectOf)).toEqual({ parentId: "c1", index: 0 });
  // The dragged block leaves its place: the indices are the others'.
  expect(placeAtPoint(doc, quote, "g1", { x: 100, y: 700 }, rectOf)).toEqual({ parentId: "c3", index: 2 });
  expect(placeAtPoint(doc, quote, "d1", { x: 100, y: 405 }, rectOf)).toEqual({ parentId: "c3", index: 0 });
});

test("over a container's gap, the place among its children; over its own place, the drag keeps where it is", () => {
  const doc = page();
  expect(placeAtPoint(doc, fresh, "c1", { x: 100, y: 350 }, rectOf)).toEqual({ parentId: "c1", index: 3 });
  expect(placeAtPoint(doc, fresh, "c2", { x: 500, y: 330 }, rectOf)).toEqual({ parentId: "c2", index: 1 });
  expect(placeAtPoint(doc, quote, "q1", { x: 100, y: 500 }, rectOf)).toBe("keep");
  expect(placeAtPoint(doc, quote, "hero", { x: 100, y: 10 }, rectOf)).toBeNull();
});

test("columns side by side: the pointer's side along the row", () => {
  const doc = page();
  expect(inRow([RECTS.c1!, RECTS.c2!], RECTS.hero!)).toBe(true);
  expect(inRow([RECTS.h1!, RECTS.t1!], RECTS.c1!)).toBe(false);
  // One column left beside the dragged one, narrower than its section.
  expect(inRow([RECTS.c1!], RECTS.hero!)).toBe(true);
  expect(placeAtPoint(doc, column, "c1", { x: 100, y: 50 }, rectOf)).toEqual({ parentId: "hero", index: 0 });
  expect(placeAtPoint(doc, column, "c1", { x: 300, y: 50 }, rectOf)).toEqual({ parentId: "hero", index: 1 });
  // A section's one column as wide as the section: before or after it by
  // its top and bottom halves.
  expect(placeAtPoint(doc, column, "c3", { x: 600, y: 450 }, rectOf)).toEqual({ parentId: "join", index: 0 });
  expect(placeAtPoint(doc, column, "c3", { x: 100, y: 700 }, rectOf)).toEqual({ parentId: "join", index: 1 });
});

test("for the keyboard, a place and its (target, side) stand for each other", () => {
  const doc = page();
  const places = [
    { parentId: "c1", index: 0 }, { parentId: "c1", index: 2 }, { parentId: "c1", index: 3 },
    { parentId: "c2", index: 0 }, { parentId: "c2", index: 1 }, { parentId: "c3", index: 0 }, { parentId: "c3", index: 2 },
  ];
  for (const place of places) {
    const { id, side } = targetForPlace(doc, quote, place);
    expect(placeFromSide(doc, quote, id, side)).toEqual(place);
  }
  expect(targetForPlace(doc, quote, { parentId: "c3", index: 2 })).toEqual({ id: "g1", side: "after" });
  // An empty container stands for itself.
  const emptied = { ...doc, sections: [doc.sections[0]!] };
  emptied.sections[0] = { ...emptied.sections[0]!, children: [{ ...emptied.sections[0]!.children[0]!, children: [] }, emptied.sections[0]!.children[1]!] };
  expect(targetForPlace(emptied, fresh, { parentId: "c1", index: 0 })).toEqual({ id: "c1", side: "inside" });
  expect(placeFromSide(emptied, fresh, "c1", "inside")).toEqual({ parentId: "c1", index: 0 });
  expect(targetForPlace(doc, hero, { parentId: null, index: 1 })).toEqual({ id: "join", side: "after" });
});
