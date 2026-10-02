import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { MapRender } from "./render.tsx";

export const map: WidgetDefinition<"map"> = {
  type: "map",
  group: "media",
  label: TYPE_NAMES.map,
  icon,
  needs: null,
  // A shore to start from, where the example site's swims meet; the author
  // moves the point.
  props: () => ({ latitude: 54.5, longitude: -3.25, zoom: 13, label: "Meeting point" }),
  render: MapRender,
  traps: ["m-map", "m-map-southern-west", "m-map-out-of-range", "m-map-strings", "e-map-max-zoom", "e-map-pole"],
};
