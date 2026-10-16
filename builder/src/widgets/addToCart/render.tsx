// A product put in the visitor's cart: the twin of
// cms/app/views/blocks/_addToCart.html.erb. For a product for sale
// (./drawing.ts), a form posting to the cart's own address, /cart/items, as
// a browser posts a form, with no script and no token: the product's entry
// in "entry", and in "quantity" how many, from 1 to the most a cart's line
// holds, when the block asks (without, the cart puts one in); then its
// button, a button block's, its words, its colours and where it stands.
// For one out of stock or with no price, those words where the button
// goes, and no button. Anything else is not a product's: the root is
// there, empty and hidden, so it takes no room in its column, and the
// canvas shows it all the same, faintly, saying why
// (../../editor/Canvas.tsx). On the canvas the form is drawn as the site
// draws it, and sends nothing: the canvas takes the page's clicks and
// keys for itself.
import { BlockRoot, blockProps, blockStyle, classNames, idText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";
import { MOST_QUANTITY } from "../../shared/shop.ts";
import { cartDrawing } from "./drawing.ts";

// The cart's address a product is put in at (CartController#add).
export const CART_ITEMS = "/cart/items";

// data-<name> attributes for an element that is not a BlockRoot.
function dataAttributes(data: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]));
}

export function AddToCartRender({ block, ctx, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const drawing = cartDrawing(props, ctx.entry, ctx.shop);
  if (drawing === null) return <BlockRoot block={block} classes={["w", "w-addToCart"]} attributes={{ hidden: true }} decoration={decoration} />;
  const classes = ["w", "w-addToCart", styleClasses(style, "align"), visibilityClasses(style)];
  if (drawing.state !== "forSale") {
    return (
      <BlockRoot block={block} classes={classes} data={{ state: drawing.state }} decoration={decoration}>
        <p className="sw-btn sw-btn-off">{drawing.words}</p>
      </BlockRoot>
    );
  }
  const quantity = `${idText(block.id)}:quantity`;
  return (
    <BlockRoot block={block} classes={classes} data={{ state: drawing.state }} decoration={decoration}>
      <form className="sw-cart-add" method="post" action={CART_ITEMS}>
        <input type="hidden" name="entry" defaultValue={String(drawing.entryId)} />
        {drawing.quantity && (
          <div className="sw-field">
            <label htmlFor={quantity}>Quantity</label>
            <input id={quantity} name="quantity" type="number" inputMode="numeric" min={1} max={MOST_QUANTITY} defaultValue={1} required />
          </div>
        )}
        <button className={classNames("sw-btn", styleClasses(style, "background"), styleClasses(style, "color"))} type="submit" {...dataAttributes({ ...freeColorData(style, "background"), ...freeColorData(style, "color") })}>
          {drawing.label}
        </button>
      </form>
    </BlockRoot>
  );
}
