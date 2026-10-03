// @vitest-environment node
// What the canvas's text editor hands over, made into the schema's rich
// text (richTextFromEditor), and the command that keeps it (makeTextEdit):
// each difference between TipTap's JSON and the schema's form, one by one,
// and the command's inverse giving back the text the page held, in
// whatever form it was stored. The random texts of property.test.ts and
// ../editor/rich/editor.test.ts hold the same on texts nobody wrote out.
import { isDeepStrictEqual } from "node:util";
import { expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import type { PageDocument, TextProps } from "../shared/document.ts";
import { validateDocument } from "../shared/validate.ts";
import { invertCommand, makeSetProps } from "./commands.ts";
import type { Json } from "./json.ts";
import { applyCommand } from "./reducer.ts";
import { cleanPastedText, makeTextEdit, MAX_TEXT_RUN, richTextFromEditor } from "./rich-text.ts";
import { locate } from "./tree.ts";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
const text = (value: string, marks?: unknown[]) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });
// A link as TipTap's getJSON() writes it, with every attribute it has.
const editorLink = (href: string) => ({ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } });

const textOf = (d: PageDocument, id: string) => {
  const found = locate(d, id);
  if (!found) throw new Error(`no block ${id}`);
  return (found.block.props as TextProps).doc;
};
// Whether a page holding this text passes the schema and the application rules.
const valid = (rich: unknown) => validateDocument({
  schemaVersion: 1,
  title: "Rich text",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [{ id: "t", type: "text", props: { doc: rich }, children: [], style: { base: {} } }] }] }],
}).valid;

test("a link keeps its href alone, and the marks come bold, italic, link, once each", () => {
  const out = richTextFromEditor(doc(p(text("tide times", [editorLink("/swims"), { type: "italic" }, { type: "bold" }, { type: "bold" }, { type: "underline" }]))));
  expect(out).toEqual(doc(p(text("tide times", [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "/swims" } }]))));
  expect(valid(out)).toBe(true);
  // TipTap's own form is refused by the schema: the title it writes is not a link's.
  expect(valid(doc(p(text("tide times", [editorLink("/swims")]))))).toBe(false);
});

test("a numbered list keeps a start from 2 and a style of letters or numerals, and nothing else", () => {
  const item = { type: "listItem", content: [p(text("One"))] };
  const ordered = (attrs: unknown) => richTextFromEditor(doc({ type: "orderedList", attrs, content: [item] }));
  expect(ordered({ start: 1, type: null })).toEqual(doc({ type: "orderedList", content: [item] }));
  expect(ordered({ start: 3, type: "a" })).toEqual(doc({ type: "orderedList", attrs: { start: 3, type: "a" }, content: [item] }));
  expect(ordered({ start: 0, type: "1" })).toEqual(doc({ type: "orderedList", content: [item] }));
  expect(ordered({ start: Number.NaN, type: "disc" })).toEqual(doc({ type: "orderedList", content: [item] }));
  expect(ordered({ start: 250000, type: "I" })).toEqual(doc({ type: "orderedList", attrs: { start: 100000, type: "I" }, content: [item] }));
  for (const attrs of [{ start: 1, type: null }, { start: 3, type: "a" }, { start: 0 }, { start: 250000 }]) expect(valid(ordered(attrs))).toBe(true);
});

test("a line break carries no marks, text loses its control characters, and a long run is cut where the schema says", () => {
  const out = richTextFromEditor(doc(p(text("Tab\there", [{ type: "bold" }]), { type: "hardBreak", marks: [{ type: "bold" }] }, text("line\u2028sep"))));
  expect(out).toEqual(doc(p(text("Tab here", [{ type: "bold" }]), { type: "hardBreak" }, text("line sep"))));

  // 10001 characters, the last two of them a pair of UTF-16 halves.
  const long = `${"a".repeat(MAX_TEXT_RUN - 1)}🌊b`;
  const cut = richTextFromEditor(doc(p(text(long, [{ type: "italic" }]))));
  expect(cut).toEqual(doc(p(text(`${"a".repeat(MAX_TEXT_RUN - 1)}🌊`, [{ type: "italic" }]), text("b", [{ type: "italic" }]))));
  expect(valid(cut)).toBe(true);
  expect(valid(doc(p(text(long))))).toBe(false);
});

test("an empty text is one empty paragraph; what the schema has no node for is left out; a list item starts with a paragraph", () => {
  expect(richTextFromEditor(doc())).toEqual(doc(p()));
  expect(richTextFromEditor({ type: "doc" })).toEqual(doc(p()));
  expect(richTextFromEditor(null)).toEqual(doc(p()));
  expect(richTextFromEditor(doc({ type: "heading", content: [text("Gone")] }, p(text("Kept")), { type: "image" }))).toEqual(doc(p(text("Kept"))));
  const list = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(text("Deep"))] }] }] }] };
  const out = richTextFromEditor(doc(list));
  expect(out).toEqual(doc({ type: "bulletList", content: [{ type: "listItem", content: [p(), { type: "bulletList", content: [{ type: "listItem", content: [p(text("Deep"))] }] }] }] }));
  expect(valid(out)).toBe(true);
  // A list with no item is no list.
  expect(richTextFromEditor(doc({ type: "bulletList", content: [] }, p(text("After"))))).toEqual(doc(p(text("After"))));
});

test("a text in the canonical form comes back the same", () => {
  const canonical = doc(
    p(text("Twice a week, at "), text("first light", [{ type: "bold" }, { type: "link", attrs: { href: "https://swims.example.org/" } }]), { type: "hardBreak" }, text("then tea.")),
    { type: "orderedList", attrs: { start: 4 }, content: [{ type: "listItem", content: [p(text("Cap")), { type: "bulletList", content: [{ type: "listItem", content: [p()] }] }] }] },
  );
  expect(richTextFromEditor(structuredClone(canonical))).toEqual(canonical);
});

test("pasted plain text keeps its line breaks and loses every other control character", () => {
  expect(cleanPastedText("One\tTwo\r\nThree\u000bFour\u0085\u2029")).toBe("One Two\r\nThree Four  ");
});

test("the text command replaces the block's document, and its inverse gives back the stored one, form and all", () => {
  // The page holds a text in a form the editor would not write: marks in
  // another order, a link's nulls, a numbered list starting at 1.
  const stored = doc(
    p(text("Cold", [{ type: "link", attrs: { href: "/join", target: null, rel: null, class: null } }, { type: "bold" }])),
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p(text("Cap"))] }] },
  );
  const set = makeSetProps(page(), "t1", { doc: stored as unknown as Json });
  if (!set.ok) throw new Error(set.error.message);
  const before = applyCommand(page(), set.command);
  if (!before.ok) throw new Error(before.error.message);

  const typed = doc(p(text("Cold water", [{ type: "bold" }, editorLink("/join")])));
  const made = makeTextEdit(before.document, "t1", typed);
  if (!made.ok) throw new Error(made.error.message);
  expect(made.command).toMatchObject({ kind: "props", label: "Changed Text in Hero", subject: { id: "t1" } });
  const after = applyCommand(before.document, made.command);
  if (!after.ok) throw new Error(after.error.message);
  expect(textOf(after.document, "t1")).toEqual(doc(p(text("Cold water", [{ type: "bold" }, { type: "link", attrs: { href: "/join" } }]))));
  expect(validateDocument(after.document).valid).toBe(true);

  const undone = applyCommand(after.document, invertCommand(made.command));
  if (!undone.ok) throw new Error(undone.error.message);
  expect(isDeepStrictEqual(undone.document, before.document)).toBe(true);
  expect(JSON.stringify(undone.document)).toBe(JSON.stringify(before.document));
  const redone = applyCommand(undone.document, made.command);
  expect(redone.ok && isDeepStrictEqual(redone.document, after.document)).toBe(true);
});

test("the text command says nothing changed for the same text, and refuses a block that holds no rich text", () => {
  const same = makeTextEdit(page(), "t1", doc(p(text("Meet at the slipway."))));
  expect(same).toMatchObject({ ok: false, error: { reason: "nothing" } });
  expect(makeTextEdit(page(), "h1", doc(p(text("A heading"))))).toMatchObject({ ok: false, error: { reason: "invalid" } });
  expect(makeTextEdit(page(), "gone", doc(p(text("Nowhere"))))).toMatchObject({ ok: false, error: { reason: "unknown" } });
});

test("a text the schema still refuses is refused by the reducer, with the page unchanged", () => {
  // 501 paragraphs: more than a text holds, which the form cannot mend.
  const tooMany = doc(...Array.from({ length: 501 }, () => p(text("Line"))));
  const made = makeTextEdit(page(), "t1", tooMany);
  if (!made.ok) throw new Error(made.error.message);
  const start = page();
  const applied = applyCommand(start, made.command);
  expect(applied).toMatchObject({ ok: false, error: { reason: "invalid" } });
  expect(start).toEqual(page());
});
