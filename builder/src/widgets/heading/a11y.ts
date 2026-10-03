// The heading's accessibility test (../a11y.ts): a heading of its level,
// and as a link, a heading that is also that link.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "heading",
  cases: [
    { name: "a level 2 heading", props: { level: 2, text: "Dawn swims" }, exposes: [{ role: "heading", name: "Dawn swims", level: 2 }] },
    {
      name: "a level 3 heading that is a link",
      props: { level: 3, text: "Winter series", href: "/winter-series" },
      exposes: [{ role: "heading", name: "Winter series", level: 3 }, { role: "link", name: "Winter series" }],
    },
  ],
};
