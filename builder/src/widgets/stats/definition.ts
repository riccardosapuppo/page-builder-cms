import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { StatsRender } from "./render.tsx";

export const stats: WidgetDefinition<"stats"> = {
  type: "stats",
  group: "content",
  label: TYPE_NAMES.stats,
  icon,
  needs: null,
  // Three figures a club might give, each a value and what it counts:
  // a block that reads as it comes, to be written over.
  props: () => ({
    items: [
      { value: "12", label: "Years on the water" },
      { value: "300+", label: "Swimmers each season" },
      { value: "98%", label: "Who would come back" },
    ],
  }),
  render: StatsRender,
  traps: ["t-stats", "t-stats-no-list", "s-stats-styled", "s-stats-unlisted", "e-stats-one"],
};
