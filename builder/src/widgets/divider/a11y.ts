// The divider's accessibility test (../a11y.ts): a separator, said as one.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "divider",
  cases: [{ name: "a divider", props: {}, exposes: [{ role: "separator" }] }],
};
