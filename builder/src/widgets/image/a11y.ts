// The image's accessibility test (../a11y.ts): an image is read by its alt
// text, and one marked decorative is not read at all.
import { PICTURE, type WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "image",
  cases: [
    { name: "an image with alt text", props: { url: PICTURE("bay"), alt: "The bay at dawn, the buoys in a line" }, exposes: [{ role: "img", name: "The bay at dawn, the buoys in a line" }] },
    { name: "a decorative image", props: { url: PICTURE("waves"), decorative: true }, exposes: [{ role: "img", count: 0 }] },
  ],
};
