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
import { openTextKit, standInLayout, textPage, type TextKit } from "../../../test/text-editor-kit.ts";
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

test("the keys pressed while the editor was on its way are typed into it as it opens, the focus in it at once", () => {
  const k = (kit = openTextKit(textPage(), [
    { key: "!", shift: true }, { key: "Backspace", shift: false }, { key: "?", shift: true }, { key: "Enter", shift: false }, { key: "x", shift: false },
    { key: "😀", shift: false }, { key: "Backspace", shift: false },
  ]));
  expect(document.activeElement).toBe(k.session.editor.view.dom);
  expect(k.session.editor.getJSON().content).toEqual([
    { type: "paragraph", content: [{ type: "text", text: "Cold water?" }] },
    { type: "paragraph", content: [{ type: "text", text: "x" }] },
  ]);
  expect(k.ui.getState().editingText).toEqual({ id: "t", at: "end" });
  // Typed, so handed over as one step at the pause like any typing.
  expect(k.ui.getState().pending.waiting).toBe(1);
});

// The words of the text the page holds, and of the one the editor holds.
const held = (k: TextKit) => JSON.stringify(k.stored());
// jsdom has no ClipboardEvent: the paste is ProseMirror's own, from its text.
const pasteEvent = () => new Event("paste") as ClipboardEvent;
const press = (k: TextKit, key: string, shiftKey = false) => k.session.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));

test("a paste past what a text holds is cut to what the page takes, said, and every word typed around it is kept", () => {
  const k = open();
  type(k, " typed-before");
  k.session.editor.view.pasteText(Array.from({ length: 600 }, (_, n) => `line ${n}`).join("\n"), pasteEvent());
  expect(k.ui.getState().notice).toBe("Only the start of the paste was kept: a text holds at most 500 paragraphs and lists.");
  // The first line joins the paragraph the caret was in; 499 more follow.
  expect(k.session.editor.state.doc.childCount).toBe(500);
  type(k, " typed-after");
  press(k, "Escape");
  expect(k.session.stopped).toBe(true);
  const kept = k.stored() as { content: unknown[] };
  expect(kept.content).toHaveLength(500);
  expect(held(k)).toContain("Cold water typed-beforeline 0");
  expect(held(k)).toContain("line 499 typed-after");
  expect(held(k)).not.toContain("line 500");
  expect(k.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Text in Story"]);
});

test("a text at its limit takes what still fits of a paste, and a paste of which nothing fits is not kept, saying why", () => {
  const full = { type: "doc", content: Array.from({ length: 500 }, (_, n) => ({ type: "paragraph", content: [{ type: "text", text: `p${n}` }] })) };
  let k = (kit = openTextKit(textPage(full)));
  // The first line joins the last paragraph; the second would be the 501st.
  k.session.editor.view.pasteText("one\ntwo", pasteEvent());
  expect(k.ui.getState().notice).toBe("Only the start of the paste was kept: a text holds at most 500 paragraphs and lists.");
  expect(k.session.editor.state.doc.childCount).toBe(500);
  expect(k.session.editor.getText()).toMatch(/p499one$/);
  k.close();

  // A paragraph of 2000 runs and line breaks: a bold word would be one more.
  const runs = Array.from({ length: 1000 }, () => [{ type: "hardBreak" }, { type: "text", text: "a" }]).flat();
  k = (kit = openTextKit(textPage({ type: "doc", content: [{ type: "paragraph", content: runs }] })));
  k.session.editor.view.pasteHTML("<b>x</b>", pasteEvent());
  expect(k.ui.getState().notice).toBe("The paste was not kept: a paragraph holds at most 2000 line breaks and changes of bold, italic or link.");
  expect(k.session.editor.state.doc.firstChild?.childCount).toBe(2000);
  // Typing in a run that is there already adds none.
  k.ui.getState().say(null);
  type(k, "b");
  expect(k.ui.getState().notice).toBeNull();
});

test("Enter and Tab past the depth a text's lists may take are not done, say why, and the words typed stay", () => {
  const list = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "level0" }] }] }] }] };
  const k = (kit = openTextKit(textPage(list)));
  const editor = k.session.editor;
  for (let level = 1; level <= 14; level += 1) {
    press(k, "Enter");
    press(k, "Tab");
    editor.view.dispatch(editor.state.tr.insertText(`level${level}`));
  }
  expect(k.ui.getState().notice).toBe("Not done: lists cannot be nested any deeper in a text.");
  press(k, "Escape");
  expect(k.session.stopped).toBe(true);
  const kept = held(k);
  for (let level = 0; level <= 14; level += 1) expect(kept).toContain(`"level${level}"`);
  // Twelve lists deep, a linked word in the deepest still within the page's nesting.
  let depth = 0;
  for (let node = (k.stored() as { content: unknown[] }).content[0] as { type: string; content?: Array<{ content?: unknown[] }> } | undefined; node?.type === "bulletList"; depth += 1) {
    node = node.content?.at(-1)?.content?.at(-1) as typeof node;
  }
  expect(depth).toBe(12);
});

test("a text the page refuses is never dropped: commands and drags wait, Esc and another selection leave it open, and the sentence stays", async () => {
  const k = open();
  const dispatch = k.store.getState().dispatch;
  let refusing = true;
  // A refusal the guard did not see coming: the store's own, for the text.
  k.store.setState({
    dispatch: (command) => (refusing && command.label.startsWith("Changed Text") ? { ok: false, error: { reason: "invalid", message: "The page would not be valid." } } : dispatch(command)),
  });
  type(k, " typed-before");
  await k.clock.advance(COMMIT_AFTER_MS);
  const said = k.ui.getState().notice;
  expect(said).toBe("This text cannot be kept yet: The page would not be valid. It stays open here until the page can take it.");
  expect(k.ui.getState().pending.waiting).toBe(1);
  type(k, " typed-after");
  expect(runCommand(k.env, (doc) => makeDuplicate(doc, "h", k.env.newId), "canvas")?.message).toBe(k.ui.getState().notice);
  expect(k.store.getState().past).toEqual([]);
  expect(beginDrag(k.env, { kind: "selection" }, false)).not.toBeNull();
  expect(k.store.getState().drag).toBeNull();
  press(k, "Escape");
  expect(k.session.stopped).toBe(false);
  k.store.getState().select("h");
  expect(k.store.getState().selection).toBe("t");
  expect(k.session.stopped).toBe(false);
  expect(k.ui.getState().notice).toContain("This text cannot be kept yet");
  // Once the page takes it, everything typed is kept, in one step.
  refusing = false;
  press(k, "Escape");
  expect(k.session.stopped).toBe(true);
  expect(held(k)).toContain("Cold water typed-before typed-after");
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
