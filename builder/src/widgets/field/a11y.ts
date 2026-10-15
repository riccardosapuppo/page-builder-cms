// The field's accessibility test (../a11y.ts), drawn in a collection's
// template on its entry's page: each value read as the widget it draws as
// is read, the entry's title as a heading of its level, a paragraph's
// lines as paragraphs, a day as words, a link as a link named by its
// words, a toggle that is on as its label.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "field",
  inTemplate: true,
  collection: {
    name: "Swims",
    fields: [
      { key: "summary", label: "Summary", type: "paragraph", required: false },
      { key: "date", label: "Date", type: "date", required: false },
      { key: "more", label: "Book", type: "link", required: false },
      { key: "members-only", label: "Members only", type: "toggle", required: false },
    ],
    entries: [
      { title: "The dawn swim", slug: "dawn-swim", values: { summary: "We meet at the slipway.\n\nBring a bright cap.", date: "2026-10-15", more: { label: "Book a place", href: "/join" }, "members-only": true } },
    ],
  },
  cases: [
    { name: "the entry's title as a heading of level 1", props: { field: "title", level: 1 }, exposes: [{ role: "heading", name: "The dawn swim", level: 1 }] },
    { name: "a paragraph field's two paragraphs", props: { field: "summary" }, exposes: [{ role: "paragraph", count: 2 }, { role: "paragraph", text: "Bring a bright cap." }] },
    { name: "a date field, in words", props: { field: "date" }, exposes: [{ role: "paragraph", text: "Oct 15, 2026" }] },
    { name: "a link field, as a button's link", props: { field: "more" }, exposes: [{ role: "link", name: "Book a place" }] },
    { name: "a toggle that is on, as its label", props: { field: "members-only" }, exposes: [{ role: "paragraph", text: "Members only" }] },
  ],
};
