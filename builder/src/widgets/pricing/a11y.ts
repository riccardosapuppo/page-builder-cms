// The pricing block's accessibility test (../a11y.ts): one list of the
// plans, each plan an item of it with its name a heading of level 3, its
// features a list of their own and its button a link named by its words;
// the featured plan's badge is a paragraph the tree reads, before its
// name.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "pricing",
  cases: [{
    name: "three plans, the second featured with a badge",
    props: {
      plans: [
        {
          name: "Basic", price: "€9", period: "a month", text: "What most people need to start.",
          features: ["The thing that matters most", "Another one", "Help by email"],
          button: { label: "Choose Basic", href: "/join?plan=basic" }, featured: false, badge: "",
        },
        {
          name: "Plus", price: "€19", period: "a month", text: "For those who use it every day.",
          features: ["Everything in Basic", "One more thing that matters", "Help the same day"],
          button: { label: "Choose Plus", href: "/join?plan=plus" }, featured: true, badge: "Most chosen",
        },
        {
          name: "Team", price: "€49", period: "a month", text: "For a group working together,\non one bill.",
          features: ["Everything in Plus", "Up to ten people", "A call to set it up"],
          button: { label: "Choose Team", href: "mailto:team@example.org" }, featured: false, badge: "",
        },
      ],
    },
    exposes: [
      // The plans' list and each plan's features: four lists, twelve items.
      { role: "list", count: 4 },
      { role: "listitem", count: 12 },
      { role: "heading", name: "Basic", level: 3 },
      { role: "heading", name: "Plus", level: 3 },
      { role: "heading", name: "Team", level: 3 },
      { role: "link", name: "Choose Basic" },
      { role: "link", name: "Choose Plus" },
      { role: "link", name: "Choose Team" },
      { role: "paragraph", text: "Most chosen" },
    ],
  }],
};
