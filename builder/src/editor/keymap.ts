// The editor's keyboard map, in one table: the "?" window lists it
// (./ShortcutsDialog.tsx), the editor's one keydown listener runs the
// entries carried by the keymap (./keys.ts), the drag library's keyboard
// sensor is given the keys of the entries it carries (sensorCodes), and the
// browser carries the rest itself: Enter on a block in Insert is a button's
// key, Shift+F10 the context menu's, and Ctrl+C and Ctrl+V become its copy
// and paste events, which the editor answers (./keys.ts).
// e2e/keyboard.spec.ts presses every entry and checks what it did.
//
// Plain data, with no React and no DOM, so the tests of every kind can
// read it.
//
// Undo and redo run on the store's history, as the top bar's buttons do;
// Ctrl+S opens the history drawer on "Save version", asking for the name.
// The text of a text block is edited on the canvas (./rich/): Enter opens
// it, and inside it the text editor carries its own keys, listed in the
// Text group.
//
// The chords the approved layout adds (its NOTES.md, section 6) are
// Alt+Shift with a letter or a digit: never Ctrl+Alt, which is AltGr
// on many keyboards (the Italian one among them), and none of the letters
// the browsers keep for themselves with Alt+Shift or open their menus with
// Alt. They are matched by the key's place, so a Mac's Option characters
// and other layouts do not change them.
import { listed } from "./plain-words.ts";

export type KeyAction =
  | "selectNext" | "selectPrevious" | "selectParent" | "selectFirstChild" | "clearSelection" | "blockTools"
  | "pickUp" | "moveVertically" | "moveHorizontally" | "drop" | "cancelMove"
  | "addHere" | "addTile" | "pickUpTile"
  | "editText" | "blockMenu" | "copy" | "paste" | "duplicate" | "delete"
  | "bold" | "italic" | "link" | "leaveText"
  | "undo" | "redo" | "saveVersion"
  | "preview" | "publish"
  | "openInsert" | "openOutline" | "deviceDesktop" | "deviceTablet" | "devicePhone"
  | "showShortcuts";

// Where an entry works:
// - canvas: a block of the canvas has the focus;
// - selection: a block of the canvas, or a row of the navigator;
// - editor: anywhere in the editor;
// - tile: a block of the Insert drawer, or of the picker a "+" opens;
// - moving: while a block is picked up with the keyboard;
// - text: in the text of a text block, edited on the canvas.
// Never in a menu or a dialog, which keep their keys, and never in a text
// field or a text being written, whose typing keys are the text's (Delete
// deletes a letter there, not the block), but for the text editor's own
// keys and the entries marked `typing`.
export type Scope = "canvas" | "selection" | "editor" | "tile" | "moving" | "text";

// Who carries the entry out: the editor's keydown listener, the drag
// library's keyboard sensor, the text editor on the canvas (./rich/), or
// the browser (a button's own key, the clipboard's events).
export type Via = "keymap" | "drag" | "text" | "native";

export interface Chord {
  // KeyboardEvent.key: "ArrowDown", "Delete", "z", "?", " ". Letters are
  // compared without case, since Shift changes them.
  key: string;
  // KeyboardEvent.code, for the drag library, which reads codes, and for a
  // letter pressed with Alt, which some keyboards turn into another
  // character (Option+P is "π" on a Mac).
  code?: string;
  // Ctrl, or Cmd on a Mac.
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

// The approved layout's groups (design/layout/shots/shortcuts.png), in the
// order its "?" window lays them out, three columns of them
// (./ShortcutsDialog.tsx).
export const KEY_GROUPS = ["Selection", "Editing", "Moving", "Text, while you write", "Adding and looking", "History", "Publish"] as const;
export type KeyGroup = (typeof KEY_GROUPS)[number];

export interface KeyEntry {
  action: KeyAction;
  group: KeyGroup;
  // As the "?" window says it.
  label: string;
  // Every chord that does it. The window shows the first, or with
  // `each`, one key of each (a pair of arrows).
  chords: readonly Chord[];
  each?: boolean;
  scope: Scope;
  via: Via;
  // Works while the person types too, in a panel's field or a text on the
  // canvas: keys no text takes for itself, for what is wanted mid-sentence
  // (keep a version, preview, publish). The text being typed is handed
  // over first, as before any command.
  typing?: boolean;
}

const ARROW_UP: Chord = { key: "ArrowUp", code: "ArrowUp" };
const ARROW_DOWN: Chord = { key: "ArrowDown", code: "ArrowDown" };
const ARROW_LEFT: Chord = { key: "ArrowLeft", code: "ArrowLeft" };
const ARROW_RIGHT: Chord = { key: "ArrowRight", code: "ArrowRight" };
const SPACE: Chord = { key: " ", code: "Space" };
const ESCAPE: Chord = { key: "Escape", code: "Escape" };

export const KEYMAP: readonly KeyEntry[] = [
  { action: "selectNext", group: "Selection", label: "Select the next block", chords: [ARROW_DOWN], scope: "canvas", via: "keymap" },
  { action: "selectPrevious", group: "Selection", label: "Select the previous block", chords: [ARROW_UP], scope: "canvas", via: "keymap" },
  { action: "selectParent", group: "Selection", label: "Select the parent column or section", chords: [{ ...ARROW_UP, alt: true }], scope: "canvas", via: "keymap" },
  { action: "selectFirstChild", group: "Selection", label: "Select the first block inside", chords: [{ ...ARROW_DOWN, alt: true }], scope: "canvas", via: "keymap" },
  { action: "clearSelection", group: "Selection", label: "Clear the selection", chords: [ESCAPE], scope: "canvas", via: "keymap" },
  // The selected block's clamp is the Tab stop after the block's own
  // (./Clamp.tsx): the arrows go along it, Esc comes back to the block.
  { action: "blockTools", group: "Selection", label: "Go to the block's clamp, then the sidebar", chords: [{ key: "Tab", code: "Tab" }], scope: "canvas", via: "native" },

  { action: "pickUp", group: "Moving", label: "Pick up the selected block", chords: [SPACE], scope: "canvas", via: "drag" },
  { action: "moveVertically", group: "Moving", label: "Move it up or down", chords: [ARROW_UP, ARROW_DOWN], each: true, scope: "moving", via: "drag" },
  { action: "moveHorizontally", group: "Moving", label: "Move it to the next or previous column", chords: [ARROW_LEFT, ARROW_RIGHT], each: true, scope: "moving", via: "drag" },
  { action: "drop", group: "Moving", label: "Drop it here", chords: [SPACE], scope: "moving", via: "drag" },
  { action: "cancelMove", group: "Moving", label: "Cancel and put it back", chords: [ESCAPE], scope: "moving", via: "drag" },

  // The page's "+" from the keyboard: the picker after the selection,
  // offering what fits there (./InsertPicker.tsx). "+" is a key of
  // its own on some keyboards, Shift and "=" on others, and the number
  // pad's.
  { action: "addHere", group: "Adding and looking", label: "Add after the selection", chords: [{ key: "+" }], scope: "canvas", via: "keymap" },
  { action: "addTile", group: "Adding and looking", label: "Add the block chosen in Insert", chords: [{ key: "Enter" }], scope: "tile", via: "native" },
  // The keyboard's drag of a key, as the mouse's: picked up where Enter
  // would add it, then moved and dropped with the Moving keys; one that
  // needs an image or a video asks for it where it is dropped
  // (./drag/DragLayer.tsx).
  { action: "pickUpTile", group: "Adding and looking", label: "Pick up the block chosen in Insert, to place it", chords: [SPACE], scope: "tile", via: "drag" },

  { action: "editText", group: "Editing", label: "Edit the text of a block", chords: [{ key: "Enter" }], scope: "canvas", via: "keymap" },
  // The browser raises the context menu event for it, which the canvas and
  // the outline answer with the block's menu (./BlockMenu.tsx).
  { action: "blockMenu", group: "Editing", label: "Open the block menu", chords: [{ key: "F10", shift: true }], scope: "selection", via: "native" },
  { action: "copy", group: "Editing", label: "Copy", chords: [{ key: "c", mod: true }], scope: "selection", via: "native" },
  { action: "paste", group: "Editing", label: "Paste after the selection", chords: [{ key: "v", mod: true }], scope: "selection", via: "native" },
  { action: "duplicate", group: "Editing", label: "Duplicate", chords: [{ key: "d", mod: true }], scope: "selection", via: "keymap" },
  { action: "delete", group: "Editing", label: "Delete", chords: [{ key: "Delete" }, { key: "Backspace" }], scope: "selection", via: "keymap" },

  { action: "bold", group: "Text, while you write", label: "Bold", chords: [{ key: "b", mod: true }], scope: "text", via: "text" },
  { action: "italic", group: "Text, while you write", label: "Italic", chords: [{ key: "i", mod: true }], scope: "text", via: "text" },
  { action: "link", group: "Text, while you write", label: "Link the selected words", chords: [{ key: "k", mod: true }], scope: "text", via: "text" },
  { action: "leaveText", group: "Text, while you write", label: "Leave the text", chords: [ESCAPE], scope: "text", via: "text" },

  { action: "undo", group: "History", label: "Undo", chords: [{ key: "z", mod: true }], scope: "editor", via: "keymap" },
  { action: "redo", group: "History", label: "Redo", chords: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }], scope: "editor", via: "keymap" },
  { action: "saveVersion", group: "History", label: "Save a named version", chords: [{ key: "s", mod: true }], scope: "editor", via: "keymap", typing: true },

  { action: "preview", group: "Publish", label: "Preview", chords: [{ key: "p", code: "KeyP", alt: true, shift: true }], scope: "editor", via: "keymap", typing: true },
  { action: "publish", group: "Publish", label: "Publish now", chords: [{ key: "Enter", mod: true, shift: true }], scope: "editor", via: "keymap", typing: true },

  { action: "openInsert", group: "Adding and looking", label: "Open Insert", chords: [{ key: "n", code: "KeyN", alt: true, shift: true }], scope: "editor", via: "keymap" },
  { action: "openOutline", group: "Adding and looking", label: "Open the outline", chords: [{ key: "o", code: "KeyO", alt: true, shift: true }], scope: "editor", via: "keymap" },
  { action: "deviceDesktop", group: "Adding and looking", label: "Look at it on desktop", chords: [{ key: "1", code: "Digit1", alt: true, shift: true }], scope: "editor", via: "keymap" },
  // The widths are the previews' (../shared/preview-widths.ts), written out
  // so the browser tests read this file without the tokens: keymap.test.ts
  // holds them to it.
  { action: "deviceTablet", group: "Adding and looking", label: "On tablet, 768 wide", chords: [{ key: "2", code: "Digit2", alt: true, shift: true }], scope: "editor", via: "keymap" },
  { action: "devicePhone", group: "Adding and looking", label: "On phone, 390 wide", chords: [{ key: "3", code: "Digit3", alt: true, shift: true }], scope: "editor", via: "keymap" },

  { action: "showShortcuts", group: "Publish", label: "Show this list", chords: [{ key: "?" }], scope: "editor", via: "keymap" },
];

// The entries that keep their keys while the person types, in words: "Save
// a named version, Preview and Publish now".
function typingWords(): string {
  return listed(KEYMAP.filter((e) => e.typing).map((e) => e.label));
}

// What the window says under a group.
export const GROUP_NOTES: Partial<Record<KeyGroup, string>> = {
  Moving: "While a block moves, the bottom line says where it will land, and screen readers hear the same sentence.",
  "Text, while you write": `In a text on the page, Ctrl+Z and Ctrl+Shift+Z undo and redo the typing; outside the text, whole changes. Delete and Backspace delete letters, not the block. Shift+Enter starts a new line in the same paragraph. ${typingWords()} work while you type, here and in the sidebar’s fields.`,
  "Adding and looking": "On the page, + opens a picker beside the selection with only what fits there. A block in Insert goes after the selection with Enter, or where it is dragged on the page, by the mouse or by Space and the arrows. One that needs an image or a video asks for it where it lands.",
};

// The keys of an event, as the chords name them. altGraph: the AltGr key
// is held, which a keyboard reports as Ctrl and Alt together, and which
// types a character (AltGr+P is "ö" on some layouts), not a shortcut.
export interface KeyPress {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  altGraph?: boolean;
}

// Whether a key press is a chord. Typing (in a text field or a text being
// written), a chord with Alt is its own key only: the character the
// press typed, never its place, and never with AltGr, so a letter a
// keyboard types with AltGr goes into the text instead of opening a
// preview.
export function matches(chord: Chord, event: KeyPress, typing = false): boolean {
  if (Boolean(chord.mod) !== (event.ctrlKey || event.metaKey)) return false;
  if (Boolean(chord.alt) !== event.altKey) return false;
  if (typing && chord.alt && event.altGraph) return false;
  // "?" is Shift and "/" on some keyboards and a key of its own on others;
  // so is "+", with "=".
  if (chord.key === "?" || chord.key === "+") return event.key === chord.key;
  if (Boolean(chord.shift) !== event.shiftKey) return false;
  if (chord.key.length !== 1) return event.key === chord.key;
  if (event.key.toLowerCase() === chord.key.toLowerCase()) return true;
  // With Alt, the key's character may be another one; its place is not.
  return Boolean(!typing && chord.alt && chord.code && event.code === chord.code);
}

// The entries a key press is, in the table's order; typing, only those
// that work while the person types.
export function entriesFor(event: KeyPress, typing = false): KeyEntry[] {
  return KEYMAP.filter((entry) => (!typing || entry.typing) && entry.chords.some((chord) => matches(chord, event, typing)));
}

export function entry(action: KeyAction): KeyEntry {
  const found = KEYMAP.find((e) => e.action === action);
  if (!found) throw new Error(`the keymap has no ${action}`);
  return found;
}

// A keycap as the window draws it: a word, or an arrow drawn as an icon
// and named for a screen reader.
export type Cap = { text: string } | { arrow: "up" | "down" | "left" | "right"; name: string };

const NAMED: Readonly<Record<string, string>> = { " ": "Space", Escape: "Esc", Delete: "Del", Backspace: "Backspace", Enter: "Enter" };
const ARROWS: Readonly<Record<string, "up" | "down" | "left" | "right">> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function keyCap(key: string): Cap {
  const arrow = ARROWS[key];
  if (arrow) return { arrow, name: `${arrow[0]!.toUpperCase()}${arrow.slice(1)} arrow` };
  return { text: NAMED[key] ?? (key.length === 1 ? key.toUpperCase() : key) };
}

export function chordCaps(chord: Chord): Cap[] {
  const caps: Cap[] = [];
  if (chord.mod) caps.push({ text: "Ctrl" });
  if (chord.alt) caps.push({ text: "Alt" });
  if (chord.shift) caps.push({ text: "Shift" });
  caps.push(keyCap(chord.key));
  return caps;
}

// The caps the window shows for an entry.
export function entryCaps(entry: KeyEntry): Cap[] {
  if (entry.each) return entry.chords.flatMap(chordCaps);
  const [first] = entry.chords;
  return first ? chordCaps(first) : [];
}

// The keys of an entry in words, for a tooltip or a screen reader:
// "Ctrl+D", "Up arrow or Down arrow".
export function entryKeysText(entry: KeyEntry): string {
  const words = (chord: Chord) => chordCaps(chord).map((cap) => ("text" in cap ? cap.text : cap.name)).join("+");
  return entry.each ? entry.chords.map(words).join(" or ") : words(entry.chords[0]!);
}

// The keys as aria-keyshortcuts writes them: "Control+D", "Delete Backspace".
export function ariaKeyShortcuts(entry: KeyEntry): string {
  // "+" joins the keys of a chord there: the key itself is "Plus".
  const one = (chord: Chord) => [chord.mod ? "Control" : null, chord.alt ? "Alt" : null, chord.shift ? "Shift" : null, chord.key === " " ? "Space" : chord.key === "+" ? "Plus" : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key]
    .filter((part): part is string => part !== null).join("+");
  return entry.chords.map(one).join(" ");
}

// The keys as the text editor's keymap names them ("Mod-b", "Escape"), for
// the entries it carries (./rich/extensions.ts): its bold, italic, link
// and leave are this table's, so the window and the text cannot disagree.
export function proseMirrorKeys(entry: KeyEntry): string[] {
  return entry.chords.map((chord) => [chord.mod ? "Mod-" : "", chord.alt ? "Alt-" : "", chord.shift ? "Shift-" : "", chord.key === " " ? "Space" : chord.key].join(""));
}

// The keyboard codes the drag library's keyboard sensor is given: those of
// the entries it carries, so the window and the sensor cannot disagree.
export interface SensorCodes {
  start: string[];
  end: string[];
  cancel: string[];
  up: string[];
  down: string[];
  left: string[];
  right: string[];
}

export function sensorCodes(): SensorCodes {
  const codes = (action: KeyAction, key?: string) => entry(action).chords
    .filter((chord) => key === undefined || chord.key === key)
    .map((chord) => {
      if (!chord.code) throw new Error(`${action} is carried by the drag library, which needs the code of ${chord.key}`);
      return chord.code;
    });
  return {
    start: codes("pickUp"),
    end: codes("drop"),
    cancel: codes("cancelMove"),
    up: codes("moveVertically", "ArrowUp"),
    down: codes("moveVertically", "ArrowDown"),
    left: codes("moveHorizontally", "ArrowLeft"),
    right: codes("moveHorizontally", "ArrowRight"),
  };
}
