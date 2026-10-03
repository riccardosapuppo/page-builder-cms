// The video's accessibility test (../a11y.ts): a closed disclosure, named
// by its title, that loads the player only when it is opened, so nothing
// is asked of the provider before.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "video",
  cases: [{ name: "a video, not loaded", props: { provider: "youtube", videoId: "abcdefghijk", title: "A dawn swim, from the buoy line" }, exposes: [{ role: "group" }] }],
};
