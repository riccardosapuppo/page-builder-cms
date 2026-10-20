import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { LogoRender } from "./render.tsx";

export const logo: WidgetDefinition<"logo"> = {
  type: "logo",
  group: "site",
  label: TYPE_NAMES.logo,
  icon,
  needs: null,
  // The mark with a name beside it, which the author makes the site's own;
  // emptied, the mark alone.
  props: () => ({ name: "Site name" }),
  render: LogoRender,
  traps: ["l-markup", "l-mark-only", "l-name-number", "l-name-empty", "l-word", "l-word-no-name", "l-mark-not-false", "l-mark-true"],
};
