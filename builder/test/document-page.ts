// A small page the example tests of src/document and src/store share: two
// sections, with labels, column widths, overrides on tablet and phone, and
// a widget of most kinds. Each test gets a fresh copy.
import type { PageDocument } from "../src/shared/document.ts";
import { validateDocument } from "../src/shared/validate.ts";

const PAGE = {
  schemaVersion: 1,
  title: "Winter series",
  description: "Short, cold swims from November to March.",
  sections: [
    {
      id: "hero", type: "section", props: { label: "Hero", columnWidths: "2:1" }, style: { base: { spaceAbove: "section-l" } },
      children: [
        {
          id: "c1", type: "column", props: {}, style: { base: { spaceInside: "m" }, tablet: { spaceInside: "l", align: "center" } },
          children: [
            { id: "h1", type: "heading", props: { level: 1, text: "Winter series", href: "/join" }, children: [], style: { base: { textSize: "display" }, phone: { textSize: "heading-1" } } },
            { id: "t1", type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Meet at the slipway." }] }] } }, children: [], style: { base: {} } },
            { id: "b1", type: "button", props: { label: "Join", href: "/join" }, children: [], style: { base: {} } },
          ],
        },
        {
          id: "c2", type: "column", props: {}, style: { base: {} },
          children: [
            { id: "i1", type: "image", props: { url: "https://images.example.org/swim.jpg", alt: "Swimmers at dawn" }, children: [], style: { base: { aspect: "4:3" } } },
          ],
        },
      ],
    },
    {
      id: "join", type: "section", props: { label: "Join", anchor: "join" }, style: { base: {} },
      children: [
        {
          id: "c3", type: "column", props: {}, style: { base: {} },
          children: [
            { id: "d1", type: "divider", props: {}, children: [], style: { base: {} } },
            { id: "q1", type: "quote", props: { text: "Cold, then glad.", attribution: "A member" }, children: [], style: { base: {} } },
            { id: "g1", type: "gallery", props: { items: [{ mediaId: "m1", alt: "Pier" }, { url: "/media/buoy.png", alt: "Buoy" }] }, children: [], style: { base: {} } },
          ],
        },
      ],
    },
  ],
};

export function page(): PageDocument {
  const result = validateDocument(structuredClone(PAGE));
  if (!result.valid) throw new Error(`the test page is not valid: ${JSON.stringify(result.errors)}`);
  return result.document;
}

// Ids from a counter, as a test wants them: the same on every run.
export function counter(prefix = "new"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
