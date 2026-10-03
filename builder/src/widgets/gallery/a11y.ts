// The gallery's accessibility test (../a11y.ts): a list of its pictures,
// each read by its alt text, a decorative one not read.
import { PICTURE, type WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "gallery",
  cases: [{
    name: "three pictures, one decorative",
    props: { items: [{ url: PICTURE("one"), alt: "Swimmers at the buoy line" }, { url: PICTURE("two"), alt: "Tea on the shingle" }, { url: PICTURE("three"), decorative: true }] },
    exposes: [{ role: "list" }, { role: "listitem", count: 3 }, { role: "img", name: "Swimmers at the buoy line" }, { role: "img", name: "Tea on the shingle" }, { role: "img", count: 2 }],
  }],
};
