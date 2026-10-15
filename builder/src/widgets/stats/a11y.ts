// The stats block's accessibility test (../a11y.ts): each figure a term,
// its label, and a definition, its value, in a description list, so a
// screen reader reads what a number counts with the number. The ARIA
// specification names neither from the words it holds (Chromium's tree
// names a term by its label all the same), so the case counts them.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "stats",
  cases: [{
    name: "three figures",
    props: { items: [{ value: "12", label: "Years on the water" }, { value: "300+", label: "Swimmers each season" }, { value: "98%", label: "Who would come back" }] },
    exposes: [{ role: "term", count: 3 }, { role: "definition", count: 3 }],
  }],
};
