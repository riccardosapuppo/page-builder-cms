// The icon box's accessibility test (../a11y.ts): its title is a heading,
// its text a paragraph, and its icon, which only decorates, is not read,
// one of the site's own eight as one of Lucide's.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "iconbox",
  cases: [{
    name: "an icon box",
    props: { icon: "sunrise", title: "Dawn swims", text: "Twice a week, at first light." },
    exposes: [{ role: "heading", name: "Dawn swims", level: 3 }, { role: "paragraph" }, { role: "img", count: 0 }],
  }, {
    name: "an icon box with one of Lucide's icons",
    props: { icon: "dumbbell", title: "Strength", text: "Free weights and racks." },
    exposes: [{ role: "heading", name: "Strength", level: 3 }, { role: "paragraph" }, { role: "img", count: 0 }],
  }],
};
