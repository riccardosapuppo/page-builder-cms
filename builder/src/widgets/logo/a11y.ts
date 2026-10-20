// The logo's accessibility test (../a11y.ts): with a name, one link to the
// home page, named by the name, the mark not read, and the same for a word
// mark, the name alone; without one, nothing at all, the mark being a
// decoration.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "logo",
  cases: [
    { name: "a logo with the site's name", props: { name: "Slack Water" }, exposes: [{ role: "link", name: "Slack Water" }, { role: "img", count: 0 }] },
    { name: "a word mark, the name alone", props: { name: "Iron Forge", mark: false }, exposes: [{ role: "link", name: "Iron Forge" }, { role: "img", count: 0 }] },
    { name: "the mark alone", props: {}, exposes: [], hidden: true },
  ],
};
