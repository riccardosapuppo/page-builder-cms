// A text sent to be written again and read back (./rewrite.ts): what the
// model reads of a text with lists and marks, and the answers made into
// what the page takes, or nothing.
import { expect, test } from "vitest";
import type { RichTextDoc } from "../shared/document.ts";
import { validateBlockSchema } from "../shared/validate.ts";
import { hasMarks, headingFrom, imageTextFrom, textFrom, textWords } from "./rewrite.ts";

const DOC: RichTextDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Meet at the " }, { type: "text", text: "slipway", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "at seven." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "A towel" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a dry one" }] }] }] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Book" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Swim" }] }] }] },
    { type: "paragraph" },
  ],
};

test("a text as the model reads it: paragraphs apart, items as lines; and whether it has marks to lose", () => {
  expect(textWords(DOC)).toBe("Meet at the slipway at seven.\n\n- A towel\n- a dry one\n\n1. Book\n2. Swim");
  expect(hasMarks(DOC)).toBe(true);
  expect(hasMarks({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Plain" }] }] })).toBe(false);
});

test("a text written again becomes paragraphs and lists the page takes; an answer with no words is nothing", () => {
  const doc = textFrom({ blocks: [{ kind: "paragraph", lines: ["Meet at seven.", ""] }, { kind: "bullets", lines: ["Towel", "Hat"] }, { kind: "numbers", lines: ["Book", "Swim"] }, { kind: "paragraph", lines: [] }] });
  expect(doc).toEqual({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Meet at seven." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Towel" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Hat" }] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Book" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Swim" }] }] }] },
  ] });
  expect(validateBlockSchema({ id: "t", type: "text", props: { doc }, children: [], style: { base: {} } }).valid).toBe(true);
  expect(textFrom({ blocks: [{ kind: "paragraph", lines: ["  "] }] })).toBeNull();
  expect(textFrom("nothing")).toBeNull();
});

test("a heading written again is one line, without quotation marks around it", () => {
  expect(headingFrom({ text: "“Swim at dawn”" })).toBe("Swim at dawn");
  expect(headingFrom({ text: "Two\nlines" })).toBe("Two lines");
  expect(headingFrom({ text: "" })).toBeNull();
  expect(headingFrom(null)).toBeNull();
});

test("an image described: its alt text, or decorative; nothing otherwise", () => {
  expect(imageTextFrom({ decorative: false, alt: "Swimmers at the slipway at dawn" })).toEqual({ alt: "Swimmers at the slipway at dawn" });
  expect(imageTextFrom({ decorative: true, alt: "" })).toEqual({ decorative: true });
  expect(imageTextFrom({ decorative: false, alt: " " })).toBeNull();
});
