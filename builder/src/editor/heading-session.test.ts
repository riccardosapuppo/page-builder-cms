// A heading written on the canvas (./heading-session.ts), on the page of
// the text editor's tests (a text "t" and a heading "h", "Alpha", in a
// section "Story"), its line inside the heading's root as the canvas puts
// it: what it hands to the page and when, what closes it, and the rules of
// a heading's one line.
// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { textPage } from "../../test/text-editor-kit.ts";
import { makeSetProps } from "../document/commands.ts";
import { locate } from "../document/tree.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { COMMIT_AFTER_MS } from "./controls.tsx";
import { HEADING_MAX, HeadingSession, oneLine } from "./heading-session.ts";
import type { WaitingKey } from "./rich/tools.ts";
import { createUiStore } from "./ui-store.ts";

let close: (() => void) | null = null;
afterEach(() => {
  close?.();
  close = null;
});

function open(keys?: readonly WaitingKey[]) {
  const clock = new FakeClock(Date.UTC(2026, 9, 13, 9));
  const store = createEditorStore({ document: textPage(), now: () => clock.now() });
  store.getState().select("h");
  const ui = createUiStore();
  ui.setState({ editingText: keys ? { id: "h", at: "end", keys } : { id: "h", at: "end" } });
  const root = document.createElement("div");
  root.dataset.blockId = "h";
  root.tabIndex = 0;
  const heading = document.createElement("h2");
  const line = document.createElement("span");
  // As ./HeadingEditor.tsx makes it; jsdom does not make an editable
  // element focusable, as a browser does, so a tabindex stands in.
  line.setAttribute("contenteditable", "plaintext-only");
  line.tabIndex = -1;
  heading.append(line);
  root.append(heading);
  const outside = document.createElement("button");
  document.body.append(root, outside);
  const session = new HeadingSession({ store, ui, clock }, "h", line, "end");
  close = () => {
    session.dispose();
    root.remove();
    outside.remove();
  };
  const stored = () => {
    const block = locate(store.getState().document, "h")?.block;
    return block?.type === "heading" ? block.props.text : undefined;
  };
  // Words typed into the line, as the browser leaves them there.
  const type = (words: string) => {
    line.textContent = words;
    line.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (name: string) => line.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const notice = () => ui.getState().notice ?? "";
  return { clock, store, ui, root, line, outside, session, stored, type, key, notice };
}

test("the line opens with the heading's words and the focus in it; typing waits, then the pause hands it over as one command", async () => {
  const k = open();
  expect(k.line.textContent).toBe("Alpha");
  expect(document.activeElement).toBe(k.line);
  k.type("Alpha and");
  k.type("Alpha and Bravo");
  expect(k.ui.getState().pending.waiting).toBe(1);
  expect(k.store.getState().past).toEqual([]);
  await k.clock.advance(COMMIT_AFTER_MS);
  expect(k.ui.getState().pending.waiting).toBe(0);
  expect(k.stored()).toBe("Alpha and Bravo");
  expect(k.store.getState().past.map((entry) => entry.command.label)).toEqual(["Changed Heading in Story"]);
});

test("Esc and Enter leave it: the words handed over at once, the line closed, the focus on the block", () => {
  for (const leave of ["Escape", "Enter"]) {
    const k = open();
    k.type("Charlie");
    expect(k.key(leave), leave).toBe(false);
    expect(k.stored(), leave).toBe("Charlie");
    expect(k.session.stopped, leave).toBe(true);
    expect(k.ui.getState().editingText, leave).toBeNull();
    expect(document.activeElement, leave).toBe(k.root);
    close?.();
    close = null;
  }
});

test("a heading emptied is not handed over: the sentence says why, and it stays open until it has words again", async () => {
  const k = open();
  k.type("   ");
  await k.clock.advance(COMMIT_AFTER_MS);
  expect(k.stored()).toBe("Alpha");
  expect(k.notice()).toMatch(/^This heading cannot be kept yet: .+\. It stays open here until the page can take it\.$/);
  expect(k.ui.getState().pending.waiting).toBe(1);
  // Leaving would lose it: the line stays, the focus back in it.
  k.key("Escape");
  expect(k.session.stopped).toBe(false);
  expect(k.ui.getState().editingText?.id).toBe("h");
  expect(document.activeElement).toBe(k.line);
  k.type("Delta");
  await k.clock.advance(COMMIT_AFTER_MS);
  expect(k.stored()).toBe("Delta");
  expect(k.ui.getState().pending.waiting).toBe(0);
});

test("another block chosen hands the words over and closes the line; the words changed elsewhere close it too", () => {
  const k = open();
  k.type("Echo");
  k.store.getState().select("t");
  expect(k.stored()).toBe("Echo");
  expect(k.session.stopped).toBe(true);

  close?.();
  close = null;

  // The words changed other than here (an undo from the top bar, the
  // sidebar's field): the page's words are the truth, and the line goes.
  const m = open();
  const made = makeSetProps(m.store.getState().document, "h", { text: "Foxtrot" });
  if (!made.ok) throw new Error(made.error.message);
  m.store.getState().dispatch(made.command);
  expect(m.session.stopped).toBe(true);
  expect(m.ui.getState().editingText).toBeNull();
  expect(m.stored()).toBe("Foxtrot");
});

test("one line, of at most 200 characters: a break leaves it, a character past the last is not typed, a paste becomes one line cut to what fits", () => {
  const k = open();
  const breakIn = new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true });
  expect(k.line.dispatchEvent(breakIn)).toBe(false);
  expect(k.session.stopped).toBe(true);
  close?.();

  const m = open();
  m.type("x".repeat(HEADING_MAX));
  const over = new InputEvent("beforeinput", { inputType: "insertText", data: "y", bubbles: true, cancelable: true });
  expect(m.line.dispatchEvent(over)).toBe(false);
  expect(m.notice()).toBe("A heading takes up to 200 characters.");
  close?.();

  const p = open();
  p.type("x".repeat(HEADING_MAX - 8));
  p.line.dispatchEvent(new Event("focus"));
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(p.line);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(paste, "clipboardData", { value: { getData: () => `one${String.fromCharCode(13, 10)}two three` } });
  p.line.dispatchEvent(paste);
  expect(p.session.words).toBe(`${"x".repeat(HEADING_MAX - 8)}one two `);
  expect(p.notice()).toBe("A heading takes up to 200 characters: the rest of what was pasted is left out.");
});

test("keys pressed while the line was opening are typed into it at the end", () => {
  const k = open([{ key: "s", shift: false }, { key: "!", shift: true }, { key: "Backspace", shift: false }]);
  expect(k.session.words).toBe("Alphas");
  expect(k.ui.getState().editingText).toEqual({ id: "h", at: "end" });
});

test("a line holds no control character: each run of them is one space", () => {
  const separator = String.fromCharCode(0x2028);
  expect(oneLine(`a${String.fromCharCode(13, 10)}b${separator}c${String.fromCharCode(9)}d`)).toBe("a b c d");
  expect(oneLine("Swim at slack water")).toBe("Swim at slack water");
});
