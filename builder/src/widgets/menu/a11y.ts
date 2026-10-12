// The menu's accessibility test (../a11y.ts): a navigation landmark named
// by its label, holding its links once: the row where it fits, or Menu
// where it folds, never both.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "menu",
  cases: [
    {
      name: "a menu of three links",
      props: { label: "Main", items: [{ label: "Swims", href: "/#swims" }, { label: "Winter series", href: "/winter-series" }, { label: "Write to us", href: "mailto:hello@slackwater.example" }] },
      exposes: [{ role: "navigation", name: "Main" }, { role: "link", count: 3 }],
    },
  ],
};
