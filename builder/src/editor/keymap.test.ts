// The keymap is one table for the "?" window, the keydown listener and the
// drag library's sensor: every action once, in a group the window shows;
// a key press finds its entries (Ctrl or Cmd, "?" from any keyboard, Shift
// telling undo from redo), and while the person types only those that
// work there; the sensor's codes are the table's own.
// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { PREVIEW_WIDTHS } from "../shared/preview-widths.ts";
import { ariaKeyShortcuts, entriesFor, entry, entryCaps, entryKeysText, GROUP_NOTES, KEY_GROUPS, KEYMAP, matches, sensorCodes, type KeyPress } from "./keymap.ts";

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
  // Esc in a text leaves it; on a block it clears the selection; with a
  // block picked up it puts it back: three places, one key.
  expect(actions(press("Escape"))).toEqual(["clearSelection", "cancelMove", "leaveText"]);
  expect(actions(press("Enter"))).toEqual(["addTile", "editText"]);
  expect(actions(press("b", { ctrlKey: true }))).toEqual(["bold"]);
  expect(actions(press("I", { metaKey: true, shiftKey: true }))).toEqual([]);
  expect(actions(press("i", { metaKey: true }))).toEqual(["italic"]);
  expect(actions(press("k", { ctrlKey: true }))).toEqual(["link"]);
  expect(actions(press(" "))).toEqual(["pickUp", "drop"]);
  // "?" is Shift and "/" on one keyboard and a key of its own on another.
  expect(actions(press("?", { shiftKey: true }))).toEqual(["showShortcuts"]);
  expect(actions(press("?"))).toEqual(["showShortcuts"]);
  expect(actions(press("?", { ctrlKey: true }))).toEqual([]);
  // So is "+": Shift and "=" on one keyboard, a key of its own on
  // another, and the number pad's.
  expect(actions(press("+", { shiftKey: true, code: "Equal" }))).toEqual(["addHere"]);
  expect(actions(press("+", { code: "BracketRight" }))).toEqual(["addHere"]);
  expect(actions(press("+", { code: "NumpadAdd" }))).toEqual(["addHere"]);
  expect(actions(press("="))).toEqual([]);
  expect(actions(press("+", { ctrlKey: true }))).toEqual([]);
  // Tab is the browser's: from the selected block to its clamp.
  expect(actions(press("Tab"))).toEqual(["blockTools"]);
  expect(matches({ key: "c", mod: true }, press("C", { ctrlKey: true, shiftKey: true }))).toBe(false);
  expect(actions(press("Enter", { ctrlKey: true, shiftKey: true }))).toEqual(["publish"]);
  expect(actions(press("Enter", { ctrlKey: true }))).toEqual([]);
  expect(actions(press("F10", { shiftKey: true }))).toEqual(["blockMenu"]);
  expect(actions(press("F10"))).toEqual([]);
  expect(actions(press("P", { altKey: true, shiftKey: true, code: "KeyP" }))).toEqual(["preview"]);
  // Option+Shift+P on a Mac types "∏": the key's place still says P.
  expect(actions(press("∏", { altKey: true, shiftKey: true, code: "KeyP" }))).toEqual(["preview"]);
  expect(actions(press("∏", { shiftKey: true, code: "KeyP" }))).toEqual([]);
  expect(actions(press("p", { altKey: true, code: "KeyP" }))).toEqual([]);
  // The old chord, Ctrl+Alt, is AltGr on many keyboards: it does nothing.
  expect(actions(press("p", { ctrlKey: true, altKey: true, code: "KeyP" }))).toEqual([]);
  expect(actions(press("N", { altKey: true, shiftKey: true, code: "KeyN" }))).toEqual(["openInsert"]);
  expect(actions(press("O", { altKey: true, shiftKey: true, code: "KeyO" }))).toEqual(["openOutline"]);
  // A digit with Shift types a sign, a different one on each layout ("!"
  // and "@" on one, "!" and the quote on another): the place says which.
  expect(actions(press("!", { altKey: true, shiftKey: true, code: "Digit1" }))).toEqual(["deviceDesktop"]);
  expect(actions(press("@", { altKey: true, shiftKey: true, code: "Digit2" }))).toEqual(["deviceTablet"]);
  expect(actions(press("\"", { altKey: true, shiftKey: true, code: "Digit2" }))).toEqual(["deviceTablet"]);
  expect(actions(press("#", { altKey: true, shiftKey: true, code: "Digit3" }))).toEqual(["devicePhone"]);
  expect(actions(press("1", { altKey: true, code: "Digit1" }))).toEqual([]);
});

test("no chord holds Ctrl and Alt together, which many keyboards type as AltGr", () => {
  expect(KEYMAP.flatMap((e) => e.chords.filter((c) => c.mod && c.alt).map(() => e.action))).toEqual([]);
  // Every chord with Alt names its key's place, so it does not depend on
  // what the key types.
  expect(KEYMAP.flatMap((e) => e.chords.filter((c) => c.alt && c.key.length === 1 && !c.code).map(() => e.action))).toEqual([]);
});

test("while the person types, only the entries marked so, each by the key it types and never by AltGr", () => {
  const typing = (event: KeyPress) => entriesFor(event, true).map((e) => e.action);
  expect(KEYMAP.filter((e) => e.typing).map((e) => e.action)).toEqual(["saveVersion", "preview", "publish"]);
  // The text's own keys.
  for (const key of ["Delete", "Backspace", "ArrowUp", "Enter", "Escape", " ", "?"]) expect(typing(press(key))).toEqual([]);
  expect(typing(press("d", { ctrlKey: true }))).toEqual([]);
  expect(typing(press("z", { ctrlKey: true }))).toEqual([]);
  expect(typing(press("c", { ctrlKey: true }))).toEqual([]);
  // The keys no text takes.
  expect(typing(press("s", { ctrlKey: true }))).toEqual(["saveVersion"]);
  expect(typing(press("Enter", { ctrlKey: true, shiftKey: true }))).toEqual(["publish"]);
  expect(typing(press("P", { altKey: true, shiftKey: true, code: "KeyP" }))).toEqual(["preview"]);
  // In a text a chord with Alt is the key it types: Option+Shift+P types
  // "∏" on a Mac, which stays the text's; and AltGr, Ctrl and Alt
  // together, never presses it.
  expect(typing(press("∏", { altKey: true, shiftKey: true, code: "KeyP" }))).toEqual([]);
  expect(typing(press("P", { ctrlKey: true, altKey: true, shiftKey: true, code: "KeyP", altGraph: true }))).toEqual([]);
  expect(actions(press("P", { ctrlKey: true, altKey: true, shiftKey: true, code: "KeyP", altGraph: true }))).toEqual([]);
  // The drawers and the devices are not opened from inside a text: their
  // keys are the text's there.
  expect(typing(press("N", { altKey: true, shiftKey: true, code: "KeyN" }))).toEqual([]);
  expect(typing(press("!", { altKey: true, shiftKey: true, code: "Digit1" }))).toEqual([]);
  // The window says which ones, from the table.
  expect(GROUP_NOTES["Text, while you write"]).toContain("Save a named version, Preview and Publish now work while you type");
});

// Keys written by hand anywhere but the keymap, in code and words a person
// sees (titles, labels, notes), but not in comments: "Ctrl+D", "Shift+Tab".
function handWritten(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  return code.match(/\b(?:Ctrl|Control|Cmd|Shift|Alt|Option)\+[A-Za-z?]\w*/g) ?? [];
}

test("no part of the interface names a key by hand: each takes it from the keymap", () => {
  const src = fileURLToPath(new URL("..", import.meta.url));
  const files = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith("keymap.ts"));
  expect(files.length).toBeGreaterThan(100);
  const found = files.flatMap((file) => handWritten(readFileSync(join(src, file), "utf8")).map((key) => `${file}: ${key}`));
  expect(found).toEqual([]);
  // The check finds what it is there to find, and leaves comments alone.
  expect(handWritten('<button title="Duplicate (Ctrl+D)" />')).toEqual(["Ctrl+D"]);
  expect(handWritten("const hint = `Press Shift+Tab to go back`; // Ctrl+Z is the text's")).toEqual(["Shift+Tab"]);
  expect(handWritten("// Ctrl+S opens the history\n/* Alt+P */ const url = \"https://example.org\";")).toEqual([]);
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
  expect(entryCaps(entry("preview"))).toEqual([{ text: "Alt" }, { text: "Shift" }, { text: "P" }]);
  expect(entryKeysText(entry("publish"))).toBe("Ctrl+Shift+Enter");
  expect(entryCaps(entry("saveVersion"))).toEqual([{ text: "Ctrl" }, { text: "S" }]);
  expect(ariaKeyShortcuts(entry("saveVersion"))).toBe("Control+S");
  expect(ariaKeyShortcuts(entry("preview"))).toBe("Alt+Shift+P");
  expect(entryCaps(entry("openInsert"))).toEqual([{ text: "Alt" }, { text: "Shift" }, { text: "N" }]);
  expect(entryCaps(entry("deviceTablet"))).toEqual([{ text: "Alt" }, { text: "Shift" }, { text: "2" }]);
  expect(ariaKeyShortcuts(entry("devicePhone"))).toBe("Alt+Shift+3");
  expect(entryCaps(entry("blockMenu"))).toEqual([{ text: "Shift" }, { text: "F10" }]);
  expect(entryCaps(entry("addHere"))).toEqual([{ text: "+" }]);
  expect(ariaKeyShortcuts(entry("addHere"))).toBe("Plus");
  expect(entryCaps(entry("blockTools"))).toEqual([{ text: "Tab" }]);
  // The words of the approved layout's window, the widths the previews'.
  expect(KEYMAP.filter((e) => e.group === "Adding and looking").map((e) => e.label)).toEqual(["Add after the selection", "Add the block chosen in Insert", "Open Insert", "Open the outline", "Look at it on desktop", `On tablet, ${PREVIEW_WIDTHS.tablet} wide`, `On phone, ${PREVIEW_WIDTHS.phone} wide`]);
});
