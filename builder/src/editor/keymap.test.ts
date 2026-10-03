// The keymap is one table for the "?" window, the keydown listener and the
// drag library's sensor: every action once, in a group the window shows;
// a key press finds its entries (Ctrl or Cmd, "?" from any keyboard, Shift
// telling undo from redo); the sensor's codes are the table's own.
// @vitest-environment node
import { expect, test } from "vitest";
import { ariaKeyShortcuts, entriesFor, entry, entryCaps, entryKeysText, KEY_GROUPS, KEYMAP, matches, sensorCodes, type KeyPress } from "./keymap.ts";

const press = (key: string, mods: Partial<Omit<KeyPress, "key">> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const actions = (event: KeyPress) => entriesFor(event).map((e) => e.action);

test("every action is in the table once, in a group the window shows, with words and keys", () => {
  const seen = KEYMAP.map((e) => e.action);
  expect(new Set(seen).size).toBe(seen.length);
  for (const e of KEYMAP) {
    expect(KEY_GROUPS).toContain(e.group);
    expect(e.label.length).toBeGreaterThan(3);
    expect(e.chords.length).toBeGreaterThan(0);
    expect(entryCaps(e).length).toBeGreaterThan(0);
  }
  expect(KEY_GROUPS.filter((g) => KEYMAP.some((e) => e.group === g))).toEqual(KEY_GROUPS);
});

test("a key press finds its entries, Ctrl or Cmd alike, Shift and Alt telling them apart", () => {
  expect(actions(press("z", { ctrlKey: true }))).toEqual(["undo"]);
  expect(actions(press("z", { metaKey: true }))).toEqual(["undo"]);
  expect(actions(press("Z", { ctrlKey: true, shiftKey: true }))).toEqual(["redo"]);
  expect(actions(press("y", { ctrlKey: true }))).toEqual(["redo"]);
  expect(actions(press("s", { ctrlKey: true }))).toEqual(["saveVersion"]);
  expect(actions(press("s", { metaKey: true }))).toEqual(["saveVersion"]);
  expect(actions(press("S", { ctrlKey: true, shiftKey: true }))).toEqual([]);
  expect(actions(press("z"))).toEqual([]);
  expect(actions(press("d", { ctrlKey: true }))).toEqual(["duplicate"]);
  expect(actions(press("Delete"))).toEqual(["delete"]);
  expect(actions(press("Backspace"))).toEqual(["delete"]);
  expect(actions(press("ArrowUp"))).toEqual(["selectPrevious", "moveVertically"]);
  expect(actions(press("ArrowUp", { altKey: true }))).toEqual(["selectParent"]);
  expect(actions(press("ArrowDown", { altKey: true }))).toEqual(["selectFirstChild"]);
  expect(actions(press("Escape"))).toEqual(["clearSelection", "cancelMove"]);
  expect(actions(press(" "))).toEqual(["pickUp", "drop"]);
  // "?" is Shift and "/" on one keyboard and a key of its own on another.
  expect(actions(press("?", { shiftKey: true }))).toEqual(["showShortcuts"]);
  expect(actions(press("?"))).toEqual(["showShortcuts"]);
  expect(actions(press("?", { ctrlKey: true }))).toEqual([]);
  expect(matches({ key: "c", mod: true }, press("C", { ctrlKey: true, shiftKey: true }))).toBe(false);
  expect(actions(press("Enter", { ctrlKey: true, shiftKey: true }))).toEqual(["publish"]);
  expect(actions(press("Enter", { ctrlKey: true }))).toEqual([]);
  expect(actions(press("p", { ctrlKey: true, altKey: true, code: "KeyP" }))).toEqual(["preview"]);
  // Cmd+Option+P on a Mac types "π": the key's place still says P.
  expect(actions(press("π", { metaKey: true, altKey: true, code: "KeyP" }))).toEqual(["preview"]);
  expect(actions(press("π", { metaKey: true, code: "KeyP" }))).toEqual([]);
  expect(actions(press("p", { ctrlKey: true, code: "KeyP" }))).toEqual([]);
});

test("the drag library's keys are the table's", () => {
  expect(sensorCodes()).toEqual({
    start: ["Space"], end: ["Space"], cancel: ["Escape"],
    up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"],
  });
});

test("the window and the menus name the keys as the design does", () => {
  expect(entryCaps(entry("redo"))).toEqual([{ text: "Ctrl" }, { text: "Shift" }, { text: "Z" }]);
  expect(entryCaps(entry("selectParent"))).toEqual([{ text: "Alt" }, { arrow: "up", name: "Up arrow" }]);
  expect(entryCaps(entry("moveHorizontally"))).toEqual([{ arrow: "left", name: "Left arrow" }, { arrow: "right", name: "Right arrow" }]);
  expect(entryCaps(entry("delete"))).toEqual([{ text: "Del" }]);
  expect(entryCaps(entry("pickUp"))).toEqual([{ text: "Space" }]);
  expect(entryKeysText(entry("moveVertically"))).toBe("Up arrow or Down arrow");
  expect(ariaKeyShortcuts(entry("duplicate"))).toBe("Control+D");
  expect(ariaKeyShortcuts(entry("delete"))).toBe("Delete Backspace");
  expect(ariaKeyShortcuts(entry("pickUp"))).toBe("Space");
  expect(entryCaps(entry("publish"))).toEqual([{ text: "Ctrl" }, { text: "Shift" }, { text: "Enter" }]);
  expect(entryCaps(entry("preview"))).toEqual([{ text: "Ctrl" }, { text: "Alt" }, { text: "P" }]);
  expect(entryKeysText(entry("publish"))).toBe("Ctrl+Shift+Enter");
  expect(entryCaps(entry("saveVersion"))).toEqual([{ text: "Ctrl" }, { text: "S" }]);
  expect(ariaKeyShortcuts(entry("saveVersion"))).toBe("Control+S");
  expect(ariaKeyShortcuts(entry("preview"))).toBe("Control+Alt+P");
});
