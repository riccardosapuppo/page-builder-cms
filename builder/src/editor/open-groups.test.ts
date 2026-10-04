// The sidebar's open groups, kept in the browser for the person: read back
// as written; and a storage that throws, holds something else, or refuses
// a write leaves the sidebar as it would be without one.
// @vitest-environment node
import { expect, test } from "vitest";
import { keepOpenGroups, OPEN_GROUPS_KEY, readOpenGroups, type GroupStorage } from "./open-groups.ts";
import { createUiStore } from "./ui-store.ts";

function memory(initial: Record<string, string> = {}): GroupStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
  };
}

test("the groups opened and closed are written as they change, and read back as they were", () => {
  const storage = memory();
  const ui = createUiStore({ openGroups: readOpenGroups(storage) });
  expect(ui.getState().openGroups).toEqual({});
  const stop = keepOpenGroups(ui, storage);
  ui.getState().setGroupOpen("heading", "alignment", true);
  ui.getState().setGroupOpen("heading", "content", false);
  ui.getState().setGroupOpen("page", "search", false);
  expect(JSON.parse(storage.items[OPEN_GROUPS_KEY]!)).toEqual({ heading: { alignment: true, content: false }, page: { search: false } });
  // Another change of the interface writes nothing.
  storage.items[OPEN_GROUPS_KEY] = "untouched";
  ui.getState().setPreview("tablet");
  ui.getState().setGroupOpen("heading", "alignment", true);
  expect(storage.items[OPEN_GROUPS_KEY]).toBe("untouched");
  stop();
  ui.getState().setGroupOpen("text", "size", true);
  expect(storage.items[OPEN_GROUPS_KEY]).toBe("untouched");

  storage.items[OPEN_GROUPS_KEY] = JSON.stringify({ heading: { alignment: true, content: false }, page: { search: false } });
  expect(readOpenGroups(storage)).toEqual({ heading: { alignment: true, content: false }, page: { search: false } });
});

test("a storage that throws, or holds anything but groups, is read as nothing kept; a refused write leaves the groups on screen", () => {
  const throwing: GroupStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  expect(readOpenGroups(throwing)).toEqual({});
  expect(readOpenGroups(null)).toEqual({});
  const ui = createUiStore();
  keepOpenGroups(ui, throwing);
  expect(() => ui.getState().setGroupOpen("heading", "alignment", true)).not.toThrow();
  expect(ui.getState().openGroups).toEqual({ heading: { alignment: true } });

  for (const text of ["not json", "null", "[]", "3", JSON.stringify({ heading: [true] }), JSON.stringify({ heading: "open" })]) {
    expect(readOpenGroups(memory({ [OPEN_GROUPS_KEY]: text })), text).toEqual({});
  }
  // Only the booleans of the right shape are taken.
  expect(readOpenGroups(memory({ [OPEN_GROUPS_KEY]: JSON.stringify({ heading: { alignment: true, size: "yes" }, text: 1 }) }))).toEqual({ heading: { alignment: true } });
  // A key named __proto__ stays a key: no object's prototype changes.
  const read = readOpenGroups(memory({ [OPEN_GROUPS_KEY]: '{"__proto__":{"polluted":true},"heading":{"__proto__":true}}' }));
  expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(read.heading)).toBe(Object.prototype);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.hasOwn(read, "__proto__")).toBe(true);
});
