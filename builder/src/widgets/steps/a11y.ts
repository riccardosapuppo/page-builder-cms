// The steps block's accessibility test (../a11y.ts): one list, an item for
// each step, each step's title a heading of level 3 and its text a
// paragraph. The number in each disc is the stylesheet's counter, not text
// the page writes: the ordered list is what gives a screen reader the
// order.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "steps",
  cases: [{
    name: "three steps",
    props: {
      items: [
        { title: "Get in touch", text: "Tell us what you would like to do and when." },
        { title: "Try it", text: "Come along once, with someone to show you how." },
        { title: "Join", text: "Stay on if it suits you,\nand we will see you there." },
      ],
    },
    exposes: [
      { role: "list" },
      { role: "listitem", count: 3 },
      { role: "heading", name: "Get in touch", level: 3 },
      { role: "heading", name: "Try it", level: 3 },
      { role: "heading", name: "Join", level: 3 },
      { role: "paragraph", count: 3 },
    ],
  }],
};
