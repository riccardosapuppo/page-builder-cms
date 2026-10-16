import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { AddToCartRender } from "./render.tsx";

// Offered only in the template of the collection the shop sells from,
// while the shop is on, in This entry beside Field
// (../../editor/insert.ts), and refused on a page and in the site's parts
// (../../shared/validate.ts, CART_OUTSIDE). A new one asks how many, its
// button saying "Add to cart"; its panel changes both.
export const addToCart: WidgetDefinition<"addToCart"> = {
  type: "addToCart",
  group: "entry",
  label: TYPE_NAMES.addToCart,
  icon,
  needs: null,
  props: () => ({ label: "Add to cart", quantity: true }),
  render: AddToCartRender,
  traps: [
    "sh-cart-quantity", "sh-cart-one", "sh-cart-styled", "sh-cart-markup", "sh-cart-bad-props",
    "sp-cart-on-page", "so-cart", "sx-cart", "sn-cart", "sc-cart", "ss-cart",
  ],
};
