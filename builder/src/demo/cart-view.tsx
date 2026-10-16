// The cart's pages as the browser demo draws them, inside the site's
// header and footer (./PageView.tsx): the twins of the CMS's
// (cms/app/helpers/cart_helper.rb, which draws /cart and /cart/thanks),
// element for element, class for class and word for word, so the demo's
// cart is the page a visitor gets from the full system; the cart's
// contract holds the two to the same tree (contract/cart/,
// ./cart.contract.test.tsx). What the demo does with their forms is
// ./PageView.tsx's.
import { BlockImg, blockImage } from "../render/media.tsx";
import type { MediaResolver } from "../render/context.ts";
import { MOST_QUANTITY, moneyWords, type Currency, type OrderLine, type PricedCart, type PricedLine } from "../shared/shop.ts";
import { GONE_TITLE, LINE_STATES, orderLineWords, type CartShown } from "./cart-page.ts";

// The band of deep water at the head of a cart's page: its title, and the
// line under it when there is one.
export function CartHead({ title, said }: { title: string; said: string | null }) {
  return (
    <section className="sec bg-text space-above-section-s space-below-section-s phone-space-above-l sw-cart-head">
      <div className="sw-inner cols cols-1">
        <div className="col gap-m">
          <div className="w w-heading size-heading-1"><h1>{title}</h1></div>
          {said !== null && <div className="w w-text size-large"><p>{said}</p></div>}
        </div>
      </div>
    </section>
  );
}

function CartTotal({ total, currency }: { total: number; currency: Currency }) {
  return <p className="sw-cart-total"><span>Total</span>{" "}<strong>{moneyWords(total, currency)}</strong></p>;
}

function CartLineItem({ line, shown, media, currency }: { line: PricedLine; shown: CartShown | undefined; media: MediaResolver; currency: Currency }) {
  const title = line.title ?? GONE_TITLE;
  const forSale = line.state === "forSale";
  const image = shown?.image ? blockImage(shown.image, media) : null;
  const field = `quantity-${line.entryId}`;
  return (
    <li className="sw-cart-line" data-entry-id={line.entryId} data-state={line.state}>
      {shown?.image && image && <figure className="sw-cart-picture"><BlockImg item={shown.image} image={image} /></figure>}
      <div className="sw-cart-about">
        <h2 className="sw-cart-title">{shown?.href ? <a href={shown.href}>{title}</a> : title}</h2>
        {line.state === "forSale" ? <p className="sw-cart-price">{`${moneyWords(line.unitAmount!, currency)} each`}</p> : <p className="sw-cart-state">{LINE_STATES[line.state]}</p>}
      </div>
      {forSale && <p className="sw-cart-amount">{moneyWords(line.amount!, currency)}</p>}
      <div className="sw-cart-change">
        {forSale && (
          // Drawn anew when the quantity changes, so its field shows it.
          <form key={line.quantity} className="sw-cart-quantity" method="post" action={`/cart/items/${line.entryId}`}>
            <div className="sw-field">
              <label htmlFor={field}>Quantity<span className="sw-cart-unseen">{` of ${title}`}</span></label>
              <input id={field} name="quantity" type="number" inputMode="numeric" min={0} max={MOST_QUANTITY} defaultValue={line.quantity} required />
            </div>
            <button className="sw-btn sw-btn-small sw-btn-line" type="submit" aria-label={`Update ${title}`}>Update</button>
          </form>
        )}
        <form className="sw-cart-remove" method="post" action={`/cart/items/${line.entryId}`}>
          <input type="hidden" name="quantity" defaultValue="0" />
          <button type="submit" aria-label={`Remove ${title}`}>Remove</button>
        </form>
      </div>
    </li>
  );
}

export interface CartBodyProps {
  // The cart priced, or null for one not read (a change refused before).
  priced: PricedCart | null;
  shown: ReadonlyMap<number, CartShown>;
  media: MediaResolver;
  currency: Currency;
  // What the last change said, above the cart.
  said: string | null;
  // Why there is no checkout's button, or null.
  closed: string | null;
  shopPath: string;
}

// The cart on the page's own band: what the last change said, and its
// lines and its card; or, for a cart not read, the way back to it; or,
// empty, the way to the shop.
export function CartBody({ priced, shown, media, currency, said, closed, shopPath }: CartBodyProps) {
  return (
    <section className="sec space-above-section-s space-below-section-s sw-cart">
      <div className="sw-inner">
        {said !== null && <p className="sw-cart-notice" role="alert">{said}</p>}
        {priced === null ? (
          <p className="sw-cart-empty"><a className="sw-btn sw-btn-primary" href="/cart">Back to your cart</a></p>
        ) : priced.lines.length === 0 ? (
          <p className="sw-cart-empty"><a className="sw-btn sw-btn-primary" href={shopPath}>See what the shop sells</a></p>
        ) : (
          <div className="sw-cart-body">
            <ul className="sw-cart-lines" aria-label="In your cart">
              {priced.lines.map((line) => <CartLineItem key={line.entryId} line={line} shown={shown.get(line.entryId)} media={media} currency={currency} />)}
            </ul>
            <div className="sw-cart-summary">
              <CartTotal total={priced.total} currency={currency} />
              {closed !== null ? (
                <p className="sw-cart-closed">{closed}</p>
              ) : (
                <form method="post" action="/cart/checkout"><button className="sw-btn sw-btn-primary" type="submit">Checkout</button></form>
              )}
              <p className="sw-cart-back"><a href={shopPath}>Back to the shop</a></p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// An order's lines as they were sold, its total, and the way back.
export function OrderBody({ lines, total, currency, back }: { lines: readonly OrderLine[]; total: number; currency: Currency; back: { href: string; words: string } }) {
  return (
    <section className="sec space-above-section-s space-below-section-s sw-cart sw-order">
      <div className="sw-inner">
        <div className="sw-cart-body">
          <ul className="sw-cart-lines" aria-label="Your order">
            {lines.map((line, at) => (
              <li key={at} className="sw-cart-line" data-entry-id={line.entryId}>
                <div className="sw-cart-about">
                  <h2 className="sw-cart-title">{line.title}</h2>
                  <p className="sw-cart-price">{orderLineWords(line, currency)}</p>
                </div>
                <p className="sw-cart-amount">{moneyWords(line.unitAmount * line.quantity, currency)}</p>
              </li>
            ))}
          </ul>
          <div className="sw-cart-summary">
            <CartTotal total={total} currency={currency} />
            <p><a className="sw-btn sw-btn-primary" href={back.href}>{back.words}</a></p>
          </div>
        </div>
      </div>
    </section>
  );
}
