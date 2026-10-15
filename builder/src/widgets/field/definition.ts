import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { TITLE } from "./drawing.ts";
import { icon } from "./icon.ts";
import { FieldRender } from "./render.tsx";

// Offered only in a collection's template, in a group of its own (This
// entry), and refused anywhere else (../../shared/validate.ts,
// fieldFaults). A new one draws the entry's title as the page's heading:
// the field a template wants first; its panel picks another.
export const field: WidgetDefinition<"field"> = {
  type: "field",
  group: "entry",
  label: TYPE_NAMES.field,
  icon,
  needs: null,
  props: () => ({ field: TITLE, level: 1 }),
  render: FieldRender,
  traps: [
    "tf-title-h1", "tf-title-plain", "tf-text-heading", "tf-paragraph", "tf-rich", "tf-date", "tf-date-bad", "tf-number", "tf-number-bad",
    "tf-toggle-on", "tf-toggle-off", "tf-choice", "tf-image", "tf-image-decorative", "tf-image-missing", "tf-link", "tf-link-javascript",
    "tf-missing", "tf-wrong-type", "tf-markup", "tf-styled", "tf-level-out-of-range", "tf-not-a-key", "c-field-on-page",
  ],
};
