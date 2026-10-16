// Add to cart's accessibility test (../a11y.ts), drawn in the template of
// the collection the shop sells from, on its first entry's page: a form
// whose quantity is a spin button named Quantity, from its label, and
// whose button is a button named by its words; without the quantity, the
// button alone.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "addToCart",
  inTemplate: true,
  sells: { priceField: "price" },
  collection: {
    name: "Swim kit",
    fields: [
      { key: "summary", label: "Summary", type: "paragraph", required: false },
      { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100_000 },
      { key: "in-stock", label: "In stock", type: "toggle", required: false },
    ],
    entries: [{ title: "Swim cap", slug: "swim-cap", values: { summary: "Bright orange, seen from the shore.", price: 12, "in-stock": true } }],
  },
  cases: [
    { name: "a quantity and the button", props: { label: "Add to cart", quantity: true }, exposes: [{ role: "spinbutton", name: "Quantity" }, { role: "button", name: "Add to cart" }] },
    { name: "the button alone", props: { label: "Buy a cap", quantity: false }, exposes: [{ role: "button", name: "Buy a cap" }] },
  ],
};
