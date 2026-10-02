import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { HeadingRender } from "./render.tsx";

export const heading: WidgetDefinition<"heading"> = {
  type: "heading",
  group: "basic",
  label: TYPE_NAMES.heading,
  icon,
  needs: null,
  props: () => ({ level: 2, text: "Heading" }),
  render: HeadingRender,
  traps: [
    "t-heading-script", "t-heading-link", "t-heading-link-with-quote", "t-heading-javascript",
    "t-heading-level-out-of-range", "s-heading-styled", "s-bad-style-values", "e-heading-min", "e-missing-widget",
  ],
};
