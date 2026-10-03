// @vitest-environment jsdom
// What is pasted into a text keeps only what the schema allows: HTML as a
// word processor puts it on the clipboard and as a browser copies a web
// page (../../../test/paste/), pasted into the editor as the canvas makes
// it, and the text it gives, as the page would store it. Scripts, styles,
// images, frames, drawings and form controls leave with their content;
// spans, headings, quotes, underline, code and the like leave their words;
// tables become a paragraph per row; links the URL policy refuses leave
// their words. The same paste without the cleaning shows what it is for.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Editor } from "@tiptap/core";
import { afterEach, expect, test } from "vitest";
import { richTextFromEditor } from "../../document/rich-text.ts";
import { validateDocument } from "../../shared/validate.ts";
import { textExtensions } from "./extensions.ts";
import { createTextEditor } from "./setup.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(here, "../../../test/paste", name), "utf8");

let editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };

function pasteInto(editor: Editor, html: string): unknown {
  editors.push(editor);
  // jsdom has no ClipboardEvent: a plain event stands in for the one
  // ProseMirror would make.
  editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
  return richTextFromEditor(editor.getJSON());
}

const pasted = (html: string) => pasteInto(createTextEditor({ element: document.createElement("div"), content: EMPTY, label: "Text" }), html);

// Whether a page holding this text passes the schema and the application rules.
const valid = (rich: unknown) => validateDocument({
  schemaVersion: 1,
  title: "Pasted",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [{ id: "t", type: "text", props: { doc: rich }, children: [], style: { base: {} } }] }] }],
}).valid;

const p = (...content: unknown[]) => (content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
const t = (text: string, ...marks: unknown[]) => (marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
const bold = { type: "bold" };
const italic = { type: "italic" };
const link = (href: string) => ({ type: "link", attrs: { href } });
const li = (...content: unknown[]) => ({ type: "listItem", content });

test("a word processor's clipboard keeps its paragraphs, bold, italic and links, and loses its bullets, markers, table and picture", () => {
  const out = pasted(fixture("word-processor.html"));
  expect(out).toEqual({
    type: "doc",
    content: [
      p(t("Winter swims", bold)),
      p(t("We meet at the slipway at "), t("first light", italic), t(", when the bay is flat. Bring a cap and a flask.")),
      p(),
      p(t("A towel")),
      p(t("A warm hat")),
      p(t("Day", bold), t(" "), t("Time", bold)),
      p(t("Saturday 07:15")),
      p(),
      p(t("Book at "), t("the club’s page", link("https://swims.example.org/book")), t(" or write to "), t("the club", link("mailto:club@example.org")), t(". Underlined and struck words stay as words.")),
    ],
  });
  expect(valid(out)).toBe(true);
});

test("a web page keeps its words, lists, bold, italic and the links the policy takes, and loses its script, style, picture, frame and form", () => {
  const out = pasted(fixture("web-page.html"));
  expect(out).toEqual({
    type: "doc",
    content: [
      p(t("Tide times")),
      p(t("Slack water comes "), t("twice a day", bold), t(", about an hour "), t("either side", italic), t(" of the turn."), { type: "hardBreak" }, t("Check before you "), t("swim", bold, italic), t(".")),
      p(t("The chart above is for the bay.")),
      { type: "bulletList", content: [li(p(t("A towel"))), li(p(t("A cap")), { type: "orderedList", attrs: { start: 3, type: "a" }, content: [li(p(t("bright"))), li(p(t("tight")))] })] },
      { type: "orderedList", content: [li(p(t("Zero is not a start")))] },
      p(t("Cold, then glad.")),
      p(t("Swims this week")),
      p(t("Day Time")),
      p(t("Saturday "), t("07:15", bold)),
      p(t("Links: a trick, "), t("the tide page", link("https://swims.example.org/tides")), t(", a relative one, "), t("mail", link("mailto:club@example.org")), t(" and an anchor.")),
      p(t("underlined struck code x2 marked")),
      p(t("one two")),
    ],
  });
  expect(valid(out)).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/alert|pasted|notice|drawn words|typed words|Press|chart of the tide/);
});

test("without the cleaning, the same pastes keep a word processor's bullets and run a table's rows together", () => {
  const plain = new Editor({ element: document.createElement("div"), extensions: textExtensions(), injectCSS: false, content: EMPTY });
  const word = JSON.stringify(pasteInto(plain, fixture("word-processor.html")));
  expect(word).toContain("·");
  expect(word).not.toContain("\"Saturday 07:15\"");
  const plainToo = new Editor({ element: document.createElement("div"), extensions: textExtensions(), injectCSS: false, content: EMPTY });
  expect(JSON.stringify(pasteInto(plainToo, fixture("web-page.html")))).toContain("drawn words");
});

test("plain text pasted keeps its lines and loses its tabs", () => {
  const editor = createTextEditor({ element: document.createElement("div"), content: EMPTY, label: "Text" });
  editors.push(editor);
  editor.view.pasteText("Day\tTime\nSaturday\t07:15", new Event("paste") as ClipboardEvent);
  const out = richTextFromEditor(editor.getJSON());
  expect(out).toEqual({ type: "doc", content: [p(t("Day Time")), p(t("Saturday 07:15"))] });
  expect(valid(out)).toBe(true);
});
