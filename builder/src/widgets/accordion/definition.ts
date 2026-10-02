import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { AccordionRender } from "./render.tsx";

export const accordion: WidgetDefinition<"accordion"> = {
  type: "accordion",
  group: "content",
  label: TYPE_NAMES.accordion,
  icon,
  needs: null,
  props: () => ({ items: [{ question: "A question?", answer: "Its answer." }] }),
  render: AccordionRender,
  traps: ["t-accordion", "e-accordion-one", "s-accordion-colored"],
};
