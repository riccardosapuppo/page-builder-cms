// What an Add to cart block draws, read from its props, the entry its
// template is drawn with and the shop: the twin of AddToCart
// (cms/app/models/add_to_cart.rb), held to it by the render contract.
//
// It draws for a product, an entry of the collection the shop sells from
// while the shop is on (../../render/shop-words.ts, sellingFrom), with its
// id: a form for one for sale, putting it in the visitor's cart; for one
// out of stock or with no price, the words that say so where the button
// goes (the shop's rules say which, ../../shared/shop.ts, productState).
// Nothing at all for any other entry, for values made up for a collection
// with none (no entry, no id), on a page with no entry, and with the shop
// off: what is not a product's.
import { isObject } from "../../document/json.ts";
import type { ShownEntry, ShownShop } from "../../render/context.ts";
import { sellingFrom } from "../../render/shop-words.ts";
import { productState } from "../../shared/shop.ts";

// Where the button goes, for a product that is not for sale.
export const CART_WORDS = { outOfStock: "Out of stock", noPrice: "Not for sale" } as const;

export type CartDrawing =
  | { state: "forSale"; entryId: number; label: string; quantity: boolean }
  | { state: "outOfStock" | "noPrice"; words: string };

// The entry's id, when it is one a page names a product by.
function entryId(entry: ShownEntry): number | null {
  return Number.isSafeInteger(entry.id) && (entry.id as number) >= 1 ? (entry.id as number) : null;
}

export function cartDrawing(props: Readonly<Record<string, unknown>>, entry: ShownEntry | null | undefined, shop: ShownShop | null | undefined): CartDrawing | null {
  if (!isObject(entry)) return null;
  const id = entryId(entry);
  const selling = id === null ? null : sellingFrom(shop, entry.collectionId);
  if (id === null || selling === null) return null;
  const fields = (Array.isArray(entry.fields) ? (entry.fields as readonly unknown[]) : [])
    .filter((field): field is { key: string; type: string } => isObject(field) && typeof field.key === "string" && typeof field.type === "string");
  const values = isObject(entry.values) ? entry.values : {};
  const state = productState({ id, title: typeof entry.title === "string" ? entry.title : "", values }, fields, selling.priceField);
  if (state === "forSale") return { state, entryId: id, label: typeof props.label === "string" ? props.label : "", quantity: props.quantity === true };
  if (state === "outOfStock" || state === "noPrice") return { state, words: CART_WORDS[state] };
  return null;
}
