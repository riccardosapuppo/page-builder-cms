// The text widget's document as plain text and back: a document of plain
// paragraphs reads as text and comes back the same, byte for byte; one
// with formatting does not read as plain text at all.
// @vitest-environment node
import fc from "fast-check";
import { expect, test } from "vitest";
import type { RichTextDoc } from "../../shared/document.ts";
import { docFromPlain, flattenText, plainText } from "./plain.ts";

test("plain text comes back from the document it makes, whatever its blank lines", () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom("a", "b", " ", "\n", "é"), { maxLength: 40 }), (chars) => {
      const text = chars.join("");
      expect(plainText(docFromPlain(text))).toBe(text);
    }),
    { seed: 2026, numRuns: 500 },
  );
});

test("a blank line is a new paragraph, a single break a break", () => {
  expect(docFromPlain("One\nline\n\nTwo")).toEqual({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "One" }, { type: "hardBreak" }, { type: "text", text: "line" }] },
      { type: "paragraph", content: [{ type: "text", text: "Two" }] },
    ],
  });
});

test("formatting is no plain text, and flattening keeps the words of every block", () => {
  const formatted: RichTextDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Bring", marks: [{ type: "bold" }] }, { type: "text", text: ":" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a cap" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "goggles" }] }] }] },
    ],
  };
  expect(plainText(formatted)).toBeNull();
  expect(flattenText(formatted)).toBe("Bring:\n\na cap\n\ngoggles");
});
