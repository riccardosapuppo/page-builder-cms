// The keyboard's moves while a block is picked up: one place along its
// container and on into the next one; across to the container before or
// after; containers that cannot take the block passed over.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../../test/document-page.ts";
import type { ParentId } from "../../document/tree.ts";
import type { Dragged } from "./place.ts";
import { containersFor, stepPlace, type Direction } from "./steps.ts";

const quote: Dragged = { id: "q1", type: "quote", fromPage: true };
const column: Dragged = { id: "c2", type: "column", fromPage: true };
const hero: Dragged = { id: "hero", type: "section", fromPage: true };
const any = () => true;

// Steps from a place, one key after another, with what each lands on.
function walk(dragged: Dragged, from: { parentId: ParentId; index: number }, keys: Direction[], open: (p: ParentId) => boolean = any) {
  const doc = page();
  const landed: Array<string | null> = [];
  let at = from;
  for (const key of keys) {
    const next = stepPlace(doc, dragged, at, key, open);
    landed.push(next ? `${next.parentId ?? "page"} ${next.index}` : null);
    if (next) at = next;
  }
  return landed;
}

test("the containers a block may go into, in reading order, but its own", () => {
  const doc = page();
  expect(containersFor(doc, quote)).toEqual(["c1", "c2", "c3"]);
  expect(containersFor(doc, column)).toEqual(["hero", "join"]);
  expect(containersFor(doc, hero)).toEqual([null]);
});

test("a widget goes up its column and on into the column before, at its end", () => {
  expect(walk(quote, { parentId: "c3", index: 1 }, ["up", "up", "up", "up", "up", "up", "up", "up"])).toEqual([
    "c3 0", "c2 1", "c2 0", "c1 3", "c1 2", "c1 1", "c1 0", null,
  ]);
  expect(walk(quote, { parentId: "c1", index: 3 }, ["down", "down"])).toEqual(["c2 0", "c2 1"]);
  expect(walk(quote, { parentId: "c3", index: 1 }, ["down", "down"])).toEqual(["c3 2", null]);
});

test("the side arrows take a widget to the column before or after, as far down as it goes", () => {
  expect(walk(quote, { parentId: "c3", index: 1 }, ["left", "left", "right"])).toEqual(["c2 1", "c1 1", "c2 1"]);
  expect(walk(quote, { parentId: "c1", index: 3 }, ["right"])).toEqual(["c2 1"]);
  expect(walk(quote, { parentId: "c1", index: 0 }, ["left"])).toEqual([null]);
});

test("a column moves along its section's row with the side arrows, and to another section with the others", () => {
  expect(walk(column, { parentId: "hero", index: 1 }, ["left", "left"])).toEqual(["hero 0", null]);
  expect(walk(column, { parentId: "hero", index: 1 }, ["right"])).toEqual(["join 0"]);
  expect(walk(column, { parentId: "hero", index: 1 }, ["down", "up"])).toEqual(["join 1", "hero 1"]);
  // A section that cannot take one more column is passed over.
  expect(walk(column, { parentId: "hero", index: 1 }, ["down"], (p) => p !== "join")).toEqual([null]);
});

test("a section moves up and down the page, and nowhere else", () => {
  expect(walk(hero, { parentId: null, index: 0 }, ["down", "down", "left", "up"])).toEqual(["page 1", null, null, "page 0"]);
});
