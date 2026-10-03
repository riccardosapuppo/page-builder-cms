// @vitest-environment jsdom
// The text editor itself, on texts nobody wrote out (fast-check, seeded as
// the document's property test is: DOC_PROPERTY_SEED and DOC_PROPERTY_RUNS):
// - a text in the form the text command keeps, read by the editor and given
//   back untouched, is the same text, so opening a text and leaving it
//   changes nothing;
// - random editing in the editor, as the canvas opens it (typing, tabs and
//   control characters, bold, italic, links good and bad, line breaks,
//   lists in and out, deletions, TipTap's own undo and redo), handed over
//   to the page after every step: the page always takes the text, and the
//   whole session undone through the page's history gives back exactly the
//   page it started from, byte for byte, and redone, exactly the last.
import fc from "fast-check";
import { TextSelection } from "@tiptap/pm/state";
import { isDeepStrictEqual } from "node:util";
import { afterEach, beforeAll, expect, test } from "vitest";
import { editorText, runSettings } from "../../../test/document-arbitraries.ts";
import { openTextKit, standInLayout, textPage, type TextKit } from "../../../test/text-editor-kit.ts";
import { richTextFromEditor } from "../../document/rich-text.ts";
import { validateDocument } from "../../shared/validate.ts";
import { createTextEditor } from "./setup.ts";

beforeAll(standInLayout);

let kits: TextKit[] = [];
afterEach(() => {
  for (const kit of kits) kit.close();
  kits = [];
});

test("a text in the kept form, read by the editor and given back untouched, is the same text", () => {
  const editor = createTextEditor({ element: document.createElement("div"), content: { type: "doc", content: [{ type: "paragraph" }] }, label: "Text" });
  let differentRaw = 0;
  try {
    fc.assert(fc.property(editorText, (raw) => {
      const kept = richTextFromEditor(raw);
      editor.commands.setContent(kept, { emitUpdate: false });
      const json = editor.getJSON();
      if (!isDeepStrictEqual(json, kept)) differentRaw += 1;
      expect(richTextFromEditor(json)).toEqual(kept);
    }), runSettings(200));
  } finally {
    editor.destroy();
  }
  // TipTap's own JSON is not the kept form (links' attributes, numbered
  // lists' starts): the check above is the form's doing, not TipTap's.
  expect(differentRaw).toBeGreaterThan(0);
});

type Step =
  | { kind: "type"; at: number; text: string }
  | { kind: "mark"; from: number; to: number; mark: "bold" | "italic" }
  | { kind: "link"; from: number; to: number; href: string }
  | { kind: "unlink"; at: number }
  | { kind: "split"; at: number }
  | { kind: "break"; at: number }
  | { kind: "list"; at: number; ordered: boolean }
  | { kind: "sink"; at: number }
  | { kind: "lift"; at: number }
  | { kind: "delete"; from: number; to: number }
  | { kind: "undo" }
  | { kind: "redo" };

const at = fc.nat({ max: 400 });
const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("type" as const), at, text: fc.constantFrom("a", " cold", "Tab\there", "bell\u0007", "日本語 🎉", "  ") }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("mark" as const), from: at, to: at, mark: fc.constantFrom("bold" as const, "italic" as const) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("link" as const), from: at, to: at, href: fc.constantFrom("/swims", "https://swims.example.org/", "#join", "javascript:alert(1)", "//elsewhere.example") }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("unlink" as const), at }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("split" as const), at }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("break" as const), at }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("list" as const), at, ordered: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("sink" as const), at }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("lift" as const), at }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("delete" as const), from: at, to: at }) },
  { weight: 2, arbitrary: fc.constant({ kind: "undo" as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: "redo" as const }) },
);

function play(kit: TextKit, s: Step): void {
  const editor = kit.session.editor;
  const size = editor.state.doc.content.size;
  const near = (pos: number) => TextSelection.near(editor.state.doc.resolve(Math.min(pos, size)));
  const select = (from: number, to = from) => {
    const a = near(Math.min(from, to));
    const b = near(Math.max(from, to));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, a.from, Math.max(a.from, b.to))));
  };
  switch (s.kind) {
    case "type":
      select(s.at);
      editor.commands.insertContent(s.text);
      break;
    case "mark":
      select(s.from, s.to);
      if (s.mark === "bold") editor.commands.toggleBold();
      else editor.commands.toggleItalic();
      break;
    case "link":
      select(s.from, s.to);
      editor.commands.setLink({ href: s.href });
      break;
    case "unlink":
      select(s.at);
      editor.chain().extendMarkRange("link").unsetLink().run();
      break;
    case "split":
      select(s.at);
      editor.commands.splitBlock();
      break;
    case "break":
      select(s.at);
      editor.commands.setHardBreak();
      break;
    case "list":
      select(s.at);
      if (s.ordered) editor.commands.toggleOrderedList();
      else editor.commands.toggleBulletList();
      break;
    case "sink":
      select(s.at);
      editor.commands.sinkListItem("listItem");
      break;
    case "lift":
      select(s.at);
      editor.commands.liftListItem("listItem");
      break;
    case "delete":
      select(s.from, s.to);
      editor.commands.deleteSelection();
      break;
    case "undo":
      editor.commands.undo();
      break;
    case "redo":
      editor.commands.redo();
      break;
  }
}

test("random editing in the editor, handed over after each step: the page takes every text, and undo and redo through the page give it back exactly", () => {
  let steps = 0;
  let kept = 0;
  fc.assert(fc.property(editorText, fc.array(step, { minLength: 1, maxLength: 12 }), (raw, session) => {
    const start = textPage(richTextFromEditor(raw));
    const kit = openTextKit(start);
    kits.push(kit);
    const first = JSON.stringify(kit.store.getState().document);
    for (const s of session) {
      play(kit, s);
      steps += 1;
      // Handed over, as before any command of the page.
      kit.ui.getState().pending.deliver();
      const page = kit.store.getState().document;
      expect(validateDocument(page).valid).toBe(true);
      // What the page holds is what the editor shows.
      expect(kit.stored()).toEqual(richTextFromEditor(kit.session.editor.getJSON()));
    }
    const last = kit.store.getState().document;
    const lastJson = JSON.stringify(last);
    const commands = kit.store.getState().past.length;
    kept += commands;
    kit.session.stop(false);
    for (let i = 0; i < commands; i += 1) expect(kit.store.getState().undo().ok).toBe(true);
    expect(JSON.stringify(kit.store.getState().document)).toBe(first);
    for (let i = 0; i < commands; i += 1) expect(kit.store.getState().redo().ok).toBe(true);
    expect(JSON.stringify(kit.store.getState().document)).toBe(lastJson);
    expect(kit.store.getState().document).toEqual(last);
    kit.close();
    kits = kits.filter((k) => k !== kit);
  }), runSettings(60));
  // The sessions changed texts, and the page kept them.
  expect(steps).toBeGreaterThan(100);
  expect(kept).toBeGreaterThan(30);
  console.log(`text editor sessions: ${steps} steps, ${kept} texts kept`);
});
