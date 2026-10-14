// The Assistant's key keeper (./key.ts): what the interface sees of a key
// (the provider and four characters), when it goes (asked, idle, the page
// left), and that the module never names a store of the browser's.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { createKeyKeeper, IDLE_MS, type ForgetReason, type Held } from "./key.ts";

const KEY = "sk-ant-api03-not-a-real-key-a1b2";

function keeper() {
  const clock = new FakeClock();
  const page = new EventTarget();
  const keys = createKeyKeeper(clock);
  const unwatch = keys.watch(page);
  const told: Array<[Held | null, ForgetReason | null]> = [];
  keys.subscribe((held, why) => told.push([held, why]));
  return { clock, page, keys, told, unwatch };
}

test("a key kept shows only its provider and its last four characters, and is lent whole to a call", () => {
  const { keys, told } = keeper();
  expect(keys.held()).toBeNull();
  keys.keep("anthropic", `  ${KEY} `);
  expect(keys.held()).toEqual({ provider: "anthropic", hint: "…a1b2" });
  expect(told).toEqual([[{ provider: "anthropic", hint: "…a1b2" }, null]]);
  expect(keys.lend((key, provider) => [key, provider])).toEqual([KEY, "anthropic"]);
});

test("forgotten when asked: nothing is lent any more", () => {
  const { keys, told } = keeper();
  keys.keep("openai", KEY);
  keys.forget();
  expect(keys.held()).toBeNull();
  expect(told.at(-1)).toEqual([null, "asked"]);
  expect(() => keys.lend((key) => key)).toThrow("No key is kept.");
  // Forgetting nothing tells no one.
  keys.forget();
  expect(told).toHaveLength(2);
});

test("forgotten after half an hour without a call; each call starts the half hour again", async () => {
  const { clock, keys, told } = keeper();
  keys.keep("anthropic", KEY);
  await clock.advance(IDLE_MS - 1000);
  keys.lend(() => undefined);
  await clock.advance(IDLE_MS - 1000);
  expect(keys.held()).not.toBeNull();
  await clock.advance(1000);
  expect(keys.held()).toBeNull();
  expect(told.at(-1)).toEqual([null, "idle"]);
  expect(clock.pending).toBe(0);
});

test("forgotten when the page is left, the back-forward cache included", () => {
  const { page, keys, told } = keeper();
  keys.keep("openai", KEY);
  page.dispatchEvent(new Event("pagehide"));
  expect(keys.held()).toBeNull();
  expect(told.at(-1)).toEqual([null, "left"]);
});

test("an editor that stops watching the page forgets the key, and stops listening; watched again, it listens again", () => {
  const { clock, page, keys, told, unwatch } = keeper();
  keys.keep("anthropic", KEY);
  unwatch();
  expect(keys.held()).toBeNull();
  expect(told.at(-1)).toEqual([null, "left"]);
  expect(clock.pending).toBe(0);
  keys.keep("anthropic", KEY);
  page.dispatchEvent(new Event("pagehide"));
  expect(keys.held()).not.toBeNull();
  // As an effect run again does: the keeper is whole, and listens.
  keys.watch(page);
  page.dispatchEvent(new Event("pagehide"));
  expect(keys.held()).toBeNull();
});

test("a key kept or forgotten changes the ticket, and a call made for another ticket is lent nothing", () => {
  const { keys } = keeper();
  const first = keys.ticket();
  keys.keep("anthropic", KEY);
  const kept = keys.ticket();
  expect(kept).not.toBe(first);
  expect(keys.lend((key) => key, kept)).toBe(KEY);
  keys.forget();
  keys.keep("openai", "sk-other-not-a-real-key");
  expect(() => keys.lend((key) => key, kept)).toThrow("The key changed.");
  expect(keys.lend((key) => key)).toBe("sk-other-not-a-real-key");
});

test("an empty key is refused", () => {
  const { keys } = keeper();
  expect(() => keys.keep("anthropic", "   ")).toThrow("A key is needed.");
  expect(keys.held()).toBeNull();
});

test("the keeper names no store of the browser's: no storage, no cookie, no database, no address", () => {
  const source = readFileSync(new URL("./key.ts", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const store of ["localStorage", "sessionStorage", "indexedDB", "cookie", "caches", "history.", "location"]) expect(source).not.toContain(store);
});
