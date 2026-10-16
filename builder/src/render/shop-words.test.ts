// The shop as a page is drawn with it (./shop-words.ts), the twin of
// ShopWords (cms/app/models/shop_words.rb), which the render contract
// holds to it on the shop's fixtures; here, its rules one by one: which
// shop sells from a collection, and a number written as money or as a
// number.
import { expect, test } from "vitest";
import { numberOrPrice, sellingFrom } from "./shop-words.ts";

const shop = { enabled: true, currency: "GBP", productsCollectionId: 7, priceField: "price" };

test("a shop sells from a collection while it is on, in a currency of its list, naming that collection and a price field", () => {
  expect(sellingFrom(shop, 7)).toEqual({ currency: "GBP", priceField: "price" });
  expect(sellingFrom({ ...shop, currency: "EUR" }, 7)).toEqual({ currency: "EUR", priceField: "price" });
  for (const other of [
    { ...shop, enabled: false }, { ...shop, enabled: "true" }, { ...shop, currency: "JPY" }, { ...shop, currency: "gbp" },
    { ...shop, productsCollectionId: null }, { ...shop, productsCollectionId: "7" }, { ...shop, productsCollectionId: 0 }, { ...shop, productsCollectionId: 2 ** 53 },
    { ...shop, priceField: null }, { ...shop, priceField: 3 }, null, undefined, "on", [shop],
  ]) {
    expect(sellingFrom(other, 7), JSON.stringify(other)).toBeNull();
  }
  expect([sellingFrom(shop, 8), sellingFrom(shop, "7"), sellingFrom(shop, null), sellingFrom(shop, undefined)]).toEqual([null, null, null, null]);
});

test("the price of the collection the shop sells from is written as money; nothing for a value no price can be", () => {
  expect(numberOrPrice(1250.5, "price", 7, shop)).toBe("£1,250.50");
  expect(numberOrPrice(0, "price", 7, shop)).toBe("£0.00");
  expect(numberOrPrice(1.15, "price", 7, { ...shop, currency: "USD" })).toBe("$1.15");
  expect(numberOrPrice(1_000_000_000, "price", 7, { ...shop, currency: "EUR" })).toBe("€1,000,000,000.00");
  expect([numberOrPrice(-3, "price", 7, shop), numberOrPrice(1.155, "price", 7, shop), numberOrPrice("12", "price", 7, shop), numberOrPrice(undefined, "price", 7, shop), numberOrPrice(1e10, "price", 7, shop)])
    .toEqual([null, null, null, null, null]);
});

test("any other number is written as the site writes one: another field, another collection, the shop off or none", () => {
  expect(numberOrPrice(1250.5, "weight", 7, shop)).toBe("1,250.5");
  expect(numberOrPrice(1250.5, "price", 8, shop)).toBe("1,250.5");
  expect(numberOrPrice(1250.5, "price", 7, { ...shop, enabled: false })).toBe("1,250.5");
  expect(numberOrPrice(-3, "price", 7, null)).toBe("-3");
  expect(numberOrPrice(0.125, "price", 7, null)).toBeNull();
});
