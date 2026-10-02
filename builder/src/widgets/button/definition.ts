import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { ButtonRender } from "./render.tsx";

export const button: WidgetDefinition<"button"> = {
  type: "button",
  group: "basic",
  label: TYPE_NAMES.button,
  icon,
  needs: null,
  // "#", the top of the page: a link that goes nowhere else until the
  // author gives it an address.
  props: () => ({ label: "Button", href: "#" }),
  render: ButtonRender,
  traps: ["t-button-safe", "t-button-javascript", "t-button-tel", "e-button-path", "e-button-query", "s-button-styled"],
};
