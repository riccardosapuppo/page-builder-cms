// @vitest-environment jsdom
// The two histories of a text being edited, kept apart and in step
// (./text-session.ts): typing waits, and becomes ONE command of the page
// when the person pauses, before any other command, at the start of a
// drag and when the text is left; TipTap's history is closed there, so
// Ctrl+Z in the text stops where the page's history has its step. The
// editor closes on Esc, when the focus leaves the block, on another
// selection, and when the text changes from elsewhere. Shown failing: the
// same typing in an editor whose history nobody closes is undone in one go.
import { closeHistory } from "@tiptap/pm/history";
import { afterEach, beforeAll, expect, test } from "vitest";
import { openTextKit, standInLayout, type TextKit } from "../../../test/text-editor-kit.ts";
import { makeDuplicate } from "../../document/commands.ts";
import { runCommand } from "../act.ts";
import { COMMIT_AFTER_MS } from "../controls.tsx";
import { beginDrag } from "../drag/DragLayer.tsx";
import { createTextEditor } from "./setup.ts";

beforeAll(standInLayout);

let kit: TextKit | null = null;
afterEach(() => {
  kit?.close();
  kit = null;
});

const open = () => {
  kit = openTextKit();
  return kit;
};

// Typing at the end of the text, as one transaction of the editor.
function type(k: TextKit, words: string) {
  const editor = k.session.editor;
  editor.view.dispatch(editor.state.tr.insertText(words, editor.state.doc.content.size - 1));
}

const words = (k: TextKit) => JSON.stringify(k.stored());

test("typing waits, then the pause hands it over as one command, and Ctrl+Z in the text stops there", async () => {
  const k = open();
  type(k, " and");
  type(k, " tea");
  expect(k.ui.getState().pending.waiting).toBe(1);
  expect(k.store.getState().past).toEqual([]);
  await k.clock.advance(COMMIT_AFTER_MS);
  expect(k.ui.getState().pending.waiting).toBe(0);
  expect(k.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Text in Story"]);
  expect(words(k)).toContain("Cold water and tea");

  // More typing, inside TipTap's time for one step: the undo takes it, and
  // not the words already handed over.
  type(k, " now");
  k.session.editor.commands.undo();
  expect(k.session.editor.getText()).toBe("Cold water and tea");
  await k.clock.advance(COMMIT_AFTER_MS);
  // Back to what the page holds: nothing more to keep.
  expect(k.store.getState().past).toHaveLength(1);
});

test("the same typing, with nobody closing TipTap's history, is undone in one go", () => {
  const editor = createTextEditor({ element: document.createElement("div"), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold water" }] }] }, label: "Text" });
  const typeHere = (text: string) => editor.view.dispatch(editor.state.tr.insertText(text, editor.state.doc.content.size - 1));
  typeHere(" and tea");
  typeHere(" now");
  editor.commands.undo();
  expect(editor.getText()).toBe("Cold water");
  // And closed between them, as the session closes it, the undo stops there.
  typeHere(" and tea");
  editor.view.dispatch(closeHistory(editor.state.tr));
  typeHere(" now");
  editor.commands.undo();
  expect(editor.getText()).toBe("Cold water and tea");
  editor.destroy();
});

test("another command hands the waiting text over first, as a step of its own before it", () => {
  const k = open();
  type(k, ", warm tea");
  runCommand(k.env, (doc) => makeDuplicate(doc, "h", k.env.newId), "canvas");
  expect(k.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Text in Story", "Duplicated Heading in Story"]);
  expect(words(k)).toContain("Cold water, warm tea");
});

test("a drag's start hands the text over and closes the editor", () => {
  const k = open();
  type(k, " today");
  expect(beginDrag(k.env, { kind: "selection" }, false)).toBeNull();
  expect(k.store.getState().drag).not.toBeNull();
  expect(k.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Text in Story"]);
  expect(words(k)).toContain("Cold water today");
  expect(k.session.stopped).toBe(true);
  expect(k.ui.getState().editingText).toBeNull();
  expect(k.ui.getState().textTools).toBeNull();
});

test("Esc leaves the text for the block, the typing handed over", () => {
  const k = open();
  type(k, "!");
  k.session.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(k.session.stopped).toBe(true);
  expect(document.activeElement).toBe(k.root);
  expect(words(k)).toContain("Cold water!");
  expect(k.ui.getState().editingText).toBeNull();
});

test("the focus going to the block's own bar keeps the editor; going elsewhere closes it, the typing kept", () => {
  const k = open();
  type(k, " here");
  k.root.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: k.bar }));
  expect(k.session.stopped).toBe(false);
  expect(k.store.getState().past).toEqual([]);
  k.root.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: k.outside }));
  expect(k.session.stopped).toBe(true);
  expect(words(k)).toContain("Cold water here");
});

test("another block selected closes the editor, the typing kept", () => {
  const k = open();
  type(k, " too");
  k.store.getState().select("h");
  expect(k.session.stopped).toBe(true);
  expect(words(k)).toContain("Cold water too");
});

test("the text changed from elsewhere closes the editor, the typing handed over onto the page as it now is", async () => {
  const k = open();
  type(k, " one");
  await k.clock.advance(COMMIT_AFTER_MS);
  type(k, " two");
  // An undo from the top bar, say: the page's text goes back.
  expect(k.store.getState().undo().ok).toBe(true);
  expect(k.session.stopped).toBe(true);
  // The words typed since are not lost: kept as a step after the undo.
  expect(words(k)).toContain("Cold water one two");
  expect(k.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Text in Story"]);
});

test("the bar's commands: bold and italic on the selection, a link refused with its reason or set, and taken off", () => {
  const k = open();
  const tools = () => {
    const now = k.ui.getState().textTools;
    if (!now) throw new Error("no text tools");
    return now;
  };
  k.session.editor.commands.setTextSelection({ from: 1, to: 5 });
  tools().run.toggleBold();
  tools().run.toggleItalic();
  expect(tools()).toMatchObject({ id: "t", bold: true, italic: true, link: null, linkOpen: false });
  tools().run.openLink();
  expect(tools().linkOpen).toBe(true);
  expect(tools().run.applyLink("javascript:alert(1)")).toMatch(/^A link cannot go to a javascript: address\./);
  expect(tools().linkOpen).toBe(true);
  expect(tools().run.applyLink("/swims")).toBeNull();
  expect(tools()).toMatchObject({ link: "/swims", linkOpen: false });
  tools().run.removeLink();
  expect(tools().link).toBeNull();
  k.session.stop(false);
  expect(k.stored()).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cold", marks: [{ type: "bold" }, { type: "italic" }] }, { type: "text", text: " water" }] }] });
});
