import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { QuoteRender } from "./render.tsx";

export const quote: WidgetDefinition<"quote"> = {
  type: "quote",
  group: "content",
  label: TYPE_NAMES.quote,
  icon,
  needs: null,
  props: () => ({ text: "A quotation." }),
  render: QuoteRender,
  traps: ["t-quote", "t-quote-no-attribution", "s-quote-styled", "e-quote-lines"],
};
