// The accordion's accessibility test (../a11y.ts): each question a
// disclosure a keyboard opens, the first open.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "accordion",
  cases: [{
    name: "two questions",
    props: { items: [{ question: "Do I need a wetsuit?", answer: "No. Most of us swim in a costume and a hat." }, { question: "How cold is it?", answer: "Between 6 and 16 degrees, by season." }] },
    exposes: [{ role: "group", count: 2 }],
  }],
};
