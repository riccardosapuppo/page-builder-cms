// What an Add to cart block draws (./drawing.ts), the twin of AddToCart
// (cms/app/models/add_to_cart.rb), which the render contract holds to it
// on the shop's fixtures; here, its rules one by one: a form for a product
// for sale, the words of one out of stock or with no price, and nothing
// for whatever is no product.
import { expect, test } from "vitest";
import type { ShownEntry } from "../../render/context.ts";
import { cartDrawing } from "./drawing.ts";

const shop = { enabled: true, currency: "GBP", productsCollectionId: 7, priceField: "price" };
const fields = [
  { key: "price", label: "Price", type: "number" },
  { key: "in-stock", label: "In stock", type: "toggle" },
];
const product = (values: Record<string, unknown>, more: Partial<ShownEntry> = {}): ShownEntry => ({ id: 41, collectionId: 7, fields, title: "Swim cap", slug: "swim-cap", values, ...more });

test("a product for sale draws its form: its entry, its button's words, and whether it asks how many", () => {
  expect(cartDrawing({ label: "Add to cart", quantity: true }, product({ price: 12, "in-stock": true }), shop)).toEqual({ state: "forSale", entryId: 41, label: "Add to cart", quantity: true });
  expect(cartDrawing({ label: "Buy one", quantity: false }, product({ price: 0, "in-stock": true }), shop)).toEqual({ state: "forSale", entryId: 41, label: "Buy one", quantity: false });
  // Props the schema does not take read as nothing: no words, no quantity.
  expect(cartDrawing({ label: 12, quantity: "yes" }, product({ price: 12, "in-stock": true }), shop)).toEqual({ state: "forSale", entryId: 41, label: "", quantity: false });
  // A collection with no toggle of stock sells every product with a price.
  expect(cartDrawing({ label: "Add", quantity: true }, product({ price: 12 }, { fields: [fields[0]!] }), shop)?.state).toBe("forSale");
});

test("a product out of stock, or with no price, says so where its button goes", () => {
  expect(cartDrawing({ label: "Add", quantity: true }, product({ price: 12, "in-stock": false }), shop)).toEqual({ state: "outOfStock", words: "Out of stock" });
  expect(cartDrawing({ label: "Add", quantity: true }, product({ price: 12 }), shop)).toEqual({ state: "outOfStock", words: "Out of stock" });
  expect(cartDrawing({ label: "Add", quantity: true }, product({ price: 12, "in-stock": "yes" }), shop)).toEqual({ state: "outOfStock", words: "Out of stock" });
  for (const price of [-3, 1.155, "12", undefined, null]) {
    expect(cartDrawing({ label: "Add", quantity: true }, product({ price, "in-stock": true }), shop), String(price)).toEqual({ state: "noPrice", words: "Not for sale" });
  }
  // The price read only while it is a number field of the collection.
  expect(cartDrawing({ label: "Add", quantity: true }, product({ price: 12, "in-stock": true }, { fields: [{ key: "price", label: "Price", type: "text" }] }), shop)?.state).toBe("noPrice");
});

test("nothing for whatever is no product: the shop off, another collection, values made up with no id, no entry", () => {
  const sale = product({ price: 12, "in-stock": true });
  expect(cartDrawing({ label: "Add", quantity: true }, sale, { ...shop, enabled: false })).toBeNull();
  expect(cartDrawing({ label: "Add", quantity: true }, sale, null)).toBeNull();
  expect(cartDrawing({ label: "Add", quantity: true }, { ...sale, collectionId: 8 }, shop)).toBeNull();
  const { id: _made, ...madeUp } = sale;
  expect(cartDrawing({ label: "Add", quantity: true }, madeUp, shop)).toBeNull();
  expect([0, -1, "41", 2 ** 53].map((id) => cartDrawing({ label: "Add", quantity: true }, { ...sale, id: id as number }, shop))).toEqual([null, null, null, null]);
  expect(cartDrawing({ label: "Add", quantity: true }, null, shop)).toBeNull();
  // Values that are no object, fields that are no list: read as none.
  expect(cartDrawing({ label: "Add", quantity: true }, { ...sale, values: "price", fields: "price" } as unknown as ShownEntry, shop)).toEqual({ state: "noPrice", words: "Not for sale" });
});
