// Rich text through TipTap's static renderer: what the schema allows is
// drawn as the server's helper draws it, and this shows, case by case, what
// happens to everything else.
// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { cleanRichText, renderRichText } from "./rich-text.tsx";

const html = (doc: unknown) => renderToStaticMarkup(<>{renderRichText(doc)}</>);
const paragraph = (...content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });
const text = (value: unknown, marks?: unknown) => (marks === undefined ? { type: "text", text: value } : { type: "text", text: value, marks });

test("what the schema allows: paragraphs, breaks, lists, bold, italic, links", () => {
  expect(html({
    type: "doc",
    content: [
      { type: "paragraph", content: [text("a < b & "), text("bold", [{ type: "bold" }]), { type: "hardBreak" }, text("link", [{ type: "link", attrs: { href: "/join" } }])] },
      { type: "paragraph" },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("one")] }, { type: "orderedList", attrs: { start: 3, type: null }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("three")] }] }] }] }] },
      { type: "orderedList", attrs: { start: 1, type: "i" }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("i")] }] }] },
    ],
  })).toBe('<p>a &lt; b &amp; <strong>bold</strong><br/><a href="/join">link</a></p><p></p><ul><li><p>one</p><ol start="3"><li><p>three</p></li></ol></li></ul><ol type="i"><li><p>i</p></li></ol>');
});

test("marks nest in the order they are stored, the first innermost", () => {
  expect(html(paragraph(text("both", [{ type: "bold" }, { type: "italic" }])))).toBe("<p><em><strong>both</strong></em></p>");
  expect(html(paragraph(text("both", [{ type: "italic" }, { type: "bold" }])))).toBe("<p><strong><em>both</em></strong></p>");
  expect(html(paragraph(text("twice", [{ type: "bold" }, { type: "bold" }])))).toBe("<p><strong><strong>twice</strong></strong></p>");
});

describe("what the schema does not allow", () => {
  const cases: Array<[string, unknown, string]> = [
    ["a node it does not know is left out with all it holds", { type: "doc", content: [{ type: "heading", content: [text("gone")] }, { type: "paragraph", content: [text("kept"), { type: "image", attrs: { src: "https://evil.example/x.png" } }] }] }, "<p>kept</p>"],
    ["a mark it does not know is dropped, its text kept", paragraph(text("underlined", [{ type: "underline" }, { type: "bold" }])), "<p><strong>underlined</strong></p>"],
    ["a link the URL policy refuses is dropped, its text kept", paragraph(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]), text("y", [{ type: "link", attrs: { href: " JaVaScRiPt:alert(2)" } }]), text("z", [{ type: "link" }])), "<p>xyz</p>"],
    ["a link keeps its href only: no target, rel or class", paragraph(text("site", [{ type: "link", attrs: { href: "https://example.com/", target: "_blank", rel: "noopener noreferrer nofollow", class: "x", onclick: "alert(1)" } }])), '<p><a href="https://example.com/">site</a></p>'],
    ["marks on a line break are ignored", paragraph({ type: "hardBreak", marks: [{ type: "bold" }] }), "<p><br/></p>"],
    ["text that is not a string is empty", paragraph(text(42), text(null, [{ type: "bold" }])), "<p><strong></strong></p>"],
    ["content that is not a list is nothing", { type: "doc", content: [{ type: "paragraph", content: "a string" }, { type: "bulletList", content: { type: "listItem" } }] }, "<p></p><ul></ul>"],
    ["marks that are not a list are none", paragraph(text("plain", { type: "bold" })), "<p>plain</p>"],
    ["a node or a mark that is not an object is skipped", { type: "doc", content: ["paragraph", null, 3, { type: "paragraph", content: [text("ok", ["bold", null])] }] }, "<p>ok</p>"],
    ["a numbered list writes start only above 1, and type only for a, A, i, I", { type: "doc", content: [{ type: "orderedList", attrs: { start: 1, type: "1" }, content: [] }, { type: "orderedList", attrs: { start: 0, type: "x" }, content: [] }, { type: "orderedList", attrs: { start: 2.5, type: "A" }, content: [] }, { type: "orderedList", attrs: "start", content: [] }] }, '<ol></ol><ol></ol><ol type="A"></ol><ol></ol>'],
  ];
  test.each(cases)("%s", (_name, doc, expected) => {
    expect(html(doc)).toBe(expected);
  });

  test("a value that is not a doc draws nothing at all", () => {
    for (const value of [undefined, null, "text", [], { type: "paragraph" }, { content: [] }]) {
      expect(cleanRichText(value)).toBeNull();
      expect(html(value)).toBe("");
    }
  });
});
