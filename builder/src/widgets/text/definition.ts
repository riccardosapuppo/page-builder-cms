import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { TextRender } from "./render.tsx";

export const text: WidgetDefinition<"text"> = {
  type: "text",
  group: "basic",
  label: TYPE_NAMES.text,
  icon,
  needs: null,
  props: () => ({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Text" }] }] } }),
  render: TextRender,
  traps: ["t-text", "e-text-min", "e-text-only-break", "s-text-hidden-on-desktop"],
};
