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
  // Every icon of the set, the site's eight and Lucide's forty, one box each.
  traps: ["t-iconbox", "t-iconbox-markup-icon", "s-iconbox-styled", ...Array.from({ length: 48 }, (_, k) => `e-iconbox-every-icon-${k + 1}`)],
};
