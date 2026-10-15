import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { StepsRender } from "./render.tsx";

export const steps: WidgetDefinition<"steps"> = {
  type: "steps",
  group: "content",
  label: TYPE_NAMES.steps,
  icon,
  needs: null,
  // Three steps a club might ask of a newcomer, each a title and what it
  // means: a block that reads as it comes, to be written over.
  props: () => ({
    items: [
      { title: "Get in touch", text: "Tell us what you would like to do and when." },
      { title: "Try it", text: "Come along once, with someone to show you how." },
      { title: "Join", text: "Stay on if it suits you, and we will see you there." },
    ],
  }),
  render: StepsRender,
  traps: ["t-steps", "t-steps-no-list", "s-steps-styled", "s-steps-unlisted", "e-steps-two"],
};
