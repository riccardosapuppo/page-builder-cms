import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { MenuRender } from "./render.tsx";

export const menu: WidgetDefinition<"menu"> = {
  type: "menu",
  group: "site",
  label: TYPE_NAMES.menu,
  icon,
  needs: null,
  // One link, to the home page, under the name a header's menu has; the
  // author adds the others.
  props: () => ({ label: "Main", items: [{ label: "Home", href: "/" }] }),
  render: MenuRender,
  traps: ["m-refused", "m-markup", "m-no-links", "m-items-junk", "m-label-missing", "m-long", "m-scripts"],
};
