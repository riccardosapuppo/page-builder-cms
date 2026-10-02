// @vitest-environment node
// The small pieces the commands stand on: finding blocks, where a block is
// once another has left, the nesting rule as the editor reads it, JSON
// values with absent keys, and the ids.
import { describe, expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import { idDraw, randomIds } from "./ids.ts";
import { sameJson, withKey, withoutKey } from "./json.ts";
import { canContain, childTypes, containersFor, isContainer } from "./nesting.ts";
import { allBlocks, blockAtPath, depthOf, duplicateId, locate, pathAfterRemoval, pointerOf } from "./tree.ts";

describe("the tree", () => {
  test("finds a block, its container, its place and its pointer", () => {
    const doc = page();
    expect(locate(doc, "b1")).toMatchObject({ parentId: "c1", index: 2, path: [0, 0, 2] });
    expect(pointerOf([0, 0, 2])).toBe("/sections/0/children/0/children/2");
    expect(depthOf([0, 0, 2])).toBe(6);
    expect(blockAtPath(doc, [1, 0, 1])?.id).toBe("q1");
    expect(locate(doc, "nope")).toBeUndefined();
    expect([...allBlocks(doc)].map((b) => b.block.id)).toEqual(["hero", "c1", "h1", "t1", "b1", "c2", "i1", "join", "c3", "d1", "q1", "g1"]);
  });

  test("an id held twice is found, the second one reported", () => {
    const doc = page();
    const twice = { ...doc, sections: [...doc.sections, { ...doc.sections[1], id: "join2" } as (typeof doc.sections)[number]] };
    expect(duplicateId(twice)).toEqual({ id: "c3", path: [2, 0] });
    expect(duplicateId(doc)).toBeNull();
  });

  test("where a block is once another has left its container", () => {
    // A later sibling, or anything under one, moves one place up.
    expect(pathAfterRemoval([0, 2], [0, 1])).toEqual([0, 1]);
    expect(pathAfterRemoval([0, 2, 5], [0, 1])).toEqual([0, 1, 5]);
    // An earlier sibling, another container, or a block above stays.
    expect(pathAfterRemoval([0, 0], [0, 1])).toEqual([0, 0]);
    expect(pathAfterRemoval([1, 2], [0, 1])).toEqual([1, 2]);
    expect(pathAfterRemoval([0], [0, 1])).toEqual([0]);
    expect(pathAfterRemoval([], [3])).toEqual([]);
    expect(pathAfterRemoval([4, 0], [3])).toEqual([3, 0]);
  });
});

describe("the nesting rule, as the editor reads it", () => {
  test("page > section > column > widget", () => {
    expect(childTypes("page")).toEqual(["section"]);
    expect(childTypes("section")).toEqual(["column"]);
    expect(childTypes("column")).toContain("quote");
    expect(childTypes("quote")).toEqual([]);
    expect(canContain("column", "image")).toBe(true);
    expect(canContain("section", "image")).toBe(false);
    expect(containersFor("column")).toEqual(["section"]);
    expect(containersFor("section")).toEqual(["page"]);
    expect(isContainer("divider")).toBe(false);
  });
});

describe("JSON values", () => {
  test("an absent key is not a key holding undefined, and key order does not matter", () => {
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameJson({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(sameJson([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
  });

  test("a key goes where it is told, and __proto__ stays an ordinary key", () => {
    expect(Object.keys(withKey({ a: 1, c: 3 }, "b", 2, 1))).toEqual(["a", "b", "c"]);
    expect(Object.keys(withKey({ a: 1, b: 2 }, "a", 9))).toEqual(["a", "b"]);
    const odd = withKey({}, "__proto__", { polluted: true });
    expect(Object.hasOwn(odd, "__proto__")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(withoutKey({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
  });
});

describe("ids", () => {
  test("random ids are 12 characters of the schema's id alphabet, from the bytes given", () => {
    const ids = randomIds((bytes) => bytes.fill(0));
    expect(ids()).toBe("AAAAAAAAAAAA");
    const real = randomIds();
    const drawn = new Set(Array.from({ length: 1000 }, real));
    expect(drawn.size).toBe(1000);
    for (const id of drawn) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  test("a draw never gives an id the page has, or one it gave before", () => {
    const doc = page();
    const given = ["h1", "x", "x", "y"];
    const draw = idDraw(doc, () => given.shift() ?? "z");
    expect([draw(), draw()]).toEqual(["x", "y"]);
  });
});
