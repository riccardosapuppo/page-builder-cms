import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { SpacerRender } from "./render.tsx";

export const spacer: WidgetDefinition<"spacer"> = {
  type: "spacer",
  group: "basic",
  label: TYPE_NAMES.spacer,
  icon,
  needs: null,
  props: () => ({ size: "m" }),
  render: SpacerRender,
  traps: ["t-spacer", "e-spacer", "s-spacers", "s-four-3-sp"],
};
