// The cart's pages as the browser demo draws them (./cart-view.tsx), and
// the cart it keeps: the twins of the CMS's words for them
// (cms/app/helpers/cart_helper.rb) and of what a line shows of its
// product (cms/app/models/cart_page.rb, CartPage.shown), held to the CMS's
// page by the cart's contract (contract/cart/, ./cart.contract.test.tsx);
// and the cart a visitor fills in this browser, kept in localStorage as
// the CMS keeps one in a cookie, lines of a product and a quantity, never
// a price, read and changed by the shop's rules (../shared/shop.ts).
import { keptCart, moneyWords, readCart, type CartLine, type Currency, type OrderLine, type PricedLine, type ProductState } from "../shared/shop.ts";

// Why a line cannot be bought, under its title.
export const LINE_STATES: Readonly<Record<Exclude<ProductState, "forSale">, string>> = {
  outOfStock: "Out of stock: the checkout leaves it out.",
  noPrice: "It has no price, so it is not for sale: the checkout leaves it out.",
  gone: "No longer sold: the checkout leaves it out.",
};

// Why a product was not put in, or its quantity not set, said above the
// cart: the twin of CartController::WORDS[:states].
export const REFUSED_STATES: Readonly<Record<Exclude<ProductState, "forSale">, string>> = {
  outOfStock: "This product is out of stock.",
  noPrice: "This product has no price, so it is not for sale.",
  gone: "This product is no longer sold.",
};

// The title of a line whose product is no longer sold.
export const GONE_TITLE = "A product no longer sold";
export const EMPTY = "Your cart is empty.";

// The line under the cart's title: how many items it holds, every line
// counted, a line that cannot be bought too.
export function cartCountWords(lines: ReadonlyArray<Pick<CartLine, "quantity">>): string {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return count === 1 ? "You have 1 item in your cart." : `You have ${count} items in your cart.`;
}

// A line of an order as it was sold: "2 × £12.00".
export const orderLineWords = (line: Pick<OrderLine, "quantity" | "unitAmount">, currency: Currency): string => `${line.quantity} × ${moneyWords(line.unitAmount, currency)}`;

// What a line shows of its product besides its words: the address of its
// page, while its collection's template is live, and the value of the
// collection's first image field, its picture.
export interface CartShown {
  href: string | null;
  image: Record<string, unknown> | null;
}

export interface ShownCollection {
  fields: ReadonlyArray<{ key: string; type: string }>;
  prefix: string;
  live: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// By entry id, for each line whose product is published (published: what
// each went live with, its slug and values): a product gone has none.
export function cartShown(lines: readonly PricedLine[], collection: ShownCollection, published: ReadonlyMap<number, { slug: string; values: unknown }>): Map<number, CartShown> {
  const picture = collection.fields.find((field) => field.type === "image")?.key;
  const shown = new Map<number, CartShown>();
  for (const line of lines) {
    const row = published.get(line.entryId);
    if (!row) continue;
    const value = picture !== undefined && isRecord(row.values) ? row.values[picture] : undefined;
    const image = isRecord(value) && typeof value.mediaId === "string" ? value : null;
    shown.set(line.entryId, { href: collection.live ? `/${collection.prefix}/${row.slug}` : null, image });
  }
  return shown;
}

// ------------------------------------------------- the cart kept here

export const CART_KEY = "page-builder-cms:demo-cart";

// The cart this browser keeps, read by the shop's rules: a line they do
// not take is left out; anything unreadable, or a browser that keeps
// nothing, an empty cart.
export function readDemoCart(): CartLine[] {
  try {
    const held = typeof localStorage === "undefined" ? null : localStorage.getItem(CART_KEY);
    return held === null ? [] : readCart(JSON.parse(held));
  } catch {
    return [];
  }
}

// The cart kept, or let go of when it is empty; a browser that keeps
// nothing keeps it for the page shown alone.
export function keepDemoCart(lines: readonly CartLine[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (lines.length === 0) localStorage.removeItem(CART_KEY);
    else localStorage.setItem(CART_KEY, JSON.stringify(keptCart(lines)));
  } catch {
    // Nothing kept: the cart lasts as long as the page.
  }
}
