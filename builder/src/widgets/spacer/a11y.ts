// The spacer's accessibility test (../a11y.ts): space, which a screen
// reader has nothing to say about, so it is hidden from it.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "spacer",
  cases: [{ name: "a large space", props: { size: "l" }, exposes: [], hidden: true }],
};
