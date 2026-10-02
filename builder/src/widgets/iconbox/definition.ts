import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { IconboxRender } from "./render.tsx";

export const iconbox: WidgetDefinition<"iconbox"> = {
  type: "iconbox",
  group: "content",
  label: TYPE_NAMES.iconbox,
  icon,
  needs: null,
  props: () => ({ icon: "info", title: "Title", text: "A short text." }),
  render: IconboxRender,
  traps: [
    "t-iconbox", "t-iconbox-markup-icon", "s-iconbox-styled",
    "e-iconbox-every-icon-1", "e-iconbox-every-icon-2", "e-iconbox-every-icon-3", "e-iconbox-every-icon-4",
    "e-iconbox-every-icon-5", "e-iconbox-every-icon-6", "e-iconbox-every-icon-7", "e-iconbox-every-icon-8",
  ],
};
