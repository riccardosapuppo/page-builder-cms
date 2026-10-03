// The map's accessibility test (../a11y.ts): a closed disclosure, named by
// its place, that loads the map only when it is opened.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "map",
  cases: [{ name: "a map, not loaded", props: { latitude: 54.5, longitude: -3.25, zoom: 13, label: "Meeting point by the boathouse" }, exposes: [{ role: "group" }] }],
};
