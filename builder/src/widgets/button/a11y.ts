// The button's accessibility test (../a11y.ts): it goes somewhere, so it
// is a link, named by its label.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "button",
  cases: [
    { name: "a button to a page of the site", props: { label: "Join a trial swim", href: "/join" }, exposes: [{ role: "link", name: "Join a trial swim" }] },
    { name: "a button to another site", props: { label: "Read the tide tables", href: "https://tides.example.org/bay" }, exposes: [{ role: "link", name: "Read the tide tables" }] },
  ],
};
