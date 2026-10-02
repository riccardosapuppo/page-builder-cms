import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { DividerRender } from "./render.tsx";

export const divider: WidgetDefinition<"divider"> = {
  type: "divider",
  group: "basic",
  label: TYPE_NAMES.divider,
  icon,
  needs: null,
  props: () => ({}),
  render: DividerRender,
  traps: ["t-divider", "e-divider", "s-divider-colored", "s-four-4-d"],
};
