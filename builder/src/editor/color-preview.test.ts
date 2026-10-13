// A colour shown on the canvas while it is picked (./color-preview.ts): the
// site style with the slot in its colour; the document with the block's
// background or colour on its device, every other block the same object,
// so only the blocks on the way to it are drawn again; nothing changed
// when nothing is being picked.
// @vitest-environment node
import { expect, test } from "vitest";
import type { PageDocument } from "../shared/document.ts";
import { previewedStyle, withBlockPreview, withPalettePreview } from "./color-preview.ts";

const doc = {
  schemaVersion: 1,
  title: "Home",
  sections: [
    { id: "s1", type: "section", props: {}, style: { base: { background: "soft" } }, children: [{ id: "c1", type: "column", props: {}, style: { base: {} }, children: [{ id: "h1", type: "heading", props: { level: 1, text: "Swim" }, style: { base: {} }, children: [] }] }] },
    { id: "s2", type: "section", props: {}, style: { base: {} }, children: [] },
  ],
} as unknown as PageDocument;

test("a slot being picked colours the site style; another preview, or none, leaves it as it is", () => {
  const style = { palette: { primary: "site-signal", text: "site-deep-water" } };
  expect(withPalettePreview(style, { slot: "primary", color: "#1d4e6f" })).toEqual({ palette: { primary: "#1d4e6f", text: "site-deep-water" } });
  expect(withPalettePreview(style, null)).toBe(style);
  expect(withPalettePreview(style, { id: "h1", device: "base", key: "color", color: "#1d4e6f" })).toBe(style);
  expect(withPalettePreview(null, { slot: "primary", color: "#1d4e6f" })).toBeNull();
});

test("a block's colour being picked is drawn on its device, its path copied and every other block the same object", () => {
  const shown = withBlockPreview(doc, { id: "h1", device: "tablet", key: "color", color: "#c2352b" });
  const section = shown.sections[0]!;
  const heading = section.children[0]!.children[0]!;
  expect(heading.style).toEqual({ base: {}, tablet: { color: "#c2352b" } });
  expect(section).not.toBe(doc.sections[0]);
  expect(shown.sections[1]).toBe(doc.sections[1]);
  // The document itself is as it was.
  expect(doc.sections[0]!.children[0]!.children[0]!.style).toEqual({ base: {} });
  // A section's background, on the desktop's base.
  expect(withBlockPreview(doc, { id: "s1", device: "base", key: "background", color: "#e9dcc3" }).sections[0]!.style).toEqual({ base: { background: "#e9dcc3" } });
});

test("no preview, a slot's, or a block that is not on the page: the very same document", () => {
  expect(withBlockPreview(doc, null)).toBe(doc);
  expect(withBlockPreview(doc, { slot: "primary", color: "#1d4e6f" })).toBe(doc);
  expect(withBlockPreview(doc, { id: "gone", device: "base", key: "color", color: "#1d4e6f" })).toBe(doc);
  expect(previewedStyle(undefined, { id: "x", device: "phone", key: "background", color: "#101418" })).toEqual({ base: {}, phone: { background: "#101418" } });
});
