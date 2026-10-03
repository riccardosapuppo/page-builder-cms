// The quote's accessibility test (../a11y.ts): a quotation inside a figure
// whose caption says who said it.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "quote",
  cases: [
    { name: "a quote with who said it", props: { text: "Cold, then glad.", attribution: "A member since last winter" }, exposes: [{ role: "figure" }, { role: "blockquote" }] },
    { name: "a quote alone", props: { text: "The tide waits for nobody, and nobody minds." }, exposes: [{ role: "blockquote" }] },
  ],
};
