// The collection list's accessibility test (../a11y.ts): one list, an item
// for each entry, each entry's title a heading of level 3 and the one link
// of its card, named by the title alone; the words at a card's foot say
// again what its link does, and are not read. A list with nothing to show
// is a paragraph of its empty words.
import { A11Y_COLLECTION, type WidgetA11y } from "../a11y.ts";

const order = { by: "date", direction: "desc" };

export const A11Y: WidgetA11y = {
  type: "collectionList",
  collection: {
    name: "Club news",
    fields: [
      { key: "summary", label: "Summary", type: "paragraph", required: false },
      { key: "date", label: "Date", type: "date", required: false },
    ],
    entries: [
      { title: "First swim of the season", slug: "first-swim", values: { summary: "Cold water, warm hearts.", date: "2026-05-02" } },
      { title: "Winter series opens", slug: "winter-series", values: { summary: "Ten swims from November to March.", date: "2026-11-01" } },
      { title: "Tide tables for the autumn", slug: "tide-tables", values: { summary: "When the water stands still.", date: "2026-09-01" } },
    ],
  },
  cases: [
    {
      name: "a grid of three entries, each titled by a heading that is its link",
      props: { collection: A11Y_COLLECTION, count: 3, order, layout: "grid", columns: 3, date: "date", excerpt: "summary", linkLabel: "Read more", emptyText: "Nothing here yet." },
      exposes: [
        { role: "list" },
        { role: "listitem", count: 3 },
        { role: "heading", name: "Winter series opens", level: 3 },
        { role: "heading", name: "Tide tables for the autumn", level: 3 },
        { role: "heading", name: "First swim of the season", level: 3 },
        { role: "link", count: 3 },
        { role: "link", name: "Winter series opens" },
        { role: "paragraph", text: "Read more", count: 0 },
      ],
    },
    {
      name: "a compact list of two",
      props: { collection: A11Y_COLLECTION, count: 2, order, layout: "compact", columns: 3, date: "date", linkLabel: "Read more", emptyText: "Nothing here yet." },
      exposes: [{ role: "list" }, { role: "listitem", count: 2 }, { role: "link", name: "Tide tables for the autumn" }],
    },
    {
      name: "a list with nothing to show",
      props: { collection: A11Y_COLLECTION, count: 3, order, filter: { field: "summary", value: "None" }, layout: "list", columns: 3, linkLabel: "Read more", emptyText: "No news this week." },
      exposes: [{ role: "list", count: 0 }, { role: "paragraph", text: "No news this week." }],
    },
  ],
};
