// The text's accessibility test (../a11y.ts): paragraphs with a link that
// says where it goes, and a list that is a list.
import type { WidgetA11y } from "../a11y.ts";

const text = (value: string, marks?: unknown[]) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });

export const A11Y: WidgetA11y = {
  type: "text",
  cases: [
    {
      name: "two paragraphs, one with a link",
      props: {
        doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [text("Twice a week, at "), text("first light", [{ type: "bold" }]), text(", when the bay is flat.")] },
            { type: "paragraph", content: [text("See the "), text("tide times", [{ type: "link", attrs: { href: "/swims" } }]), text(" first.")] },
          ],
        },
      },
      exposes: [{ role: "paragraph", count: 2 }, { role: "link", name: "tide times" }],
    },
    {
      name: "a list of three",
      props: {
        doc: {
          type: "doc",
          content: [{
            type: "bulletList",
            content: ["A towel", "A warm hat", "A flask of tea"].map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [text(item)] }] })),
          }],
        },
      },
      exposes: [{ role: "list" }, { role: "listitem", count: 3 }],
    },
  ],
};
