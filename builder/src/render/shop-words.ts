// The shop as a page is drawn with it, for the blocks that draw a price (a
// Field block, ../widgets/field/, and a Collection list's cards,
// ../widgets/collectionList/) and for Add to cart (../widgets/addToCart/):
// whether it sells from a collection, in which currency and by which of
// its number fields. The twin of ShopWords (cms/app/models/shop_words.rb),
// held to it by the render contract.
//
// Read defensively, as a block is: the storage's settings were held to
// the shop's rules when they were saved (../shared/shop.ts), a fixture of
// the contract holds what no rule would let through.
import { isObject } from "../document/json.ts";
import { CURRENCIES, minorUnits, moneyWords, type Currency } from "../shared/shop.ts";
import { numberWords } from "./entry-words.ts";

// The shop selling from a collection: its currency and its price field.
export interface Selling {
  currency: Currency;
  priceField: string;
}

// The shop that sells from the collection `collectionId`: on, in a
// currency of its list, its products that collection and its price a
// field's key; null for any other shop, or none.
export function sellingFrom(shop: unknown, collectionId: unknown): Selling | null {
  if (!isObject(shop) || shop.enabled !== true) return null;
  const { currency, productsCollectionId, priceField } = shop;
  if (!(CURRENCIES as readonly unknown[]).includes(currency) || typeof priceField !== "string") return null;
  if (!Number.isSafeInteger(productsCollectionId) || (productsCollectionId as number) < 1 || productsCollectionId !== collectionId) return null;
  return { currency: currency as Currency, priceField };
}

// A number field's value as a page writes it: the price, in the shop's
// words for an amount ("£1,250.00"), when the field is the price of the
// collection the shop sells from, and nothing for a value no price can be
// (below zero, more than two decimals); any other number as the site
// writes one ("1,250.5"), the shop off included.
export function numberOrPrice(value: unknown, key: string, collectionId: unknown, shop: unknown): string | null {
  const selling = sellingFrom(shop, collectionId);
  if (selling === null || key !== selling.priceField) return numberWords(value);
  const minor = minorUnits(value);
  return minor === null ? null : moneyWords(minor, selling.currency);
}
