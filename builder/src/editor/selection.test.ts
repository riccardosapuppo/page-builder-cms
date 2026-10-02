// The keyboard's selection moves in reading order: a section, its first
// column, that column's widgets, the next column; up to the container and
// down to the first block inside.
// @vitest-environment node
import { expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import { firstChildOf, parentOf, readingOrder, stepSelection } from "./selection.ts";

test("the blocks in reading order", () => {
  expect(readingOrder(page())).toEqual(["hero", "c1", "h1", "t1", "b1", "c2", "i1", "join", "c3", "d1", "q1", "g1"]);
});

test("the next and the previous block, from nothing and at the ends", () => {
  const doc = page();
  expect(stepSelection(doc, null, 1)).toBe("hero");
  expect(stepSelection(doc, null, -1)).toBe("g1");
  expect(stepSelection(doc, "b1", 1)).toBe("c2");
  expect(stepSelection(doc, "c2", -1)).toBe("b1");
  expect(stepSelection(doc, "i1", 1)).toBe("join");
  expect(stepSelection(doc, "g1", 1)).toBe("g1");
  expect(stepSelection(doc, "hero", -1)).toBe("hero");
  expect(stepSelection({ schemaVersion: 1, title: "Empty", sections: [] }, null, 1)).toBeNull();
});

test("up to the container, down to the first block inside", () => {
  const doc = page();
  expect(parentOf(doc, "t1")).toBe("c1");
  expect(parentOf(doc, "c1")).toBe("hero");
  expect(parentOf(doc, "hero")).toBeNull();
  expect(firstChildOf(doc, "hero")).toBe("c1");
  expect(firstChildOf(doc, "c2")).toBe("i1");
  expect(firstChildOf(doc, "i1")).toBeNull();
});
