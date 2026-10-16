// The Shop screen's words (./words.ts): each refusal of the settings by
// its keyword, at its member; the settings and the orders in a line; an
// order's items; whether checkout is set up; what asking Stripe again
// found, or why it was not asked.
import { expect, test } from "vitest";
import { KIT, NEWS, order } from "../../../test/fake-shop.ts";
import { StorageError } from "../../storage/adapter.ts";
import { settingIssues } from "./Settings.tsx";
import { CART_ADDRESS_WHERE, CART_PREFIX_WHERE, CHECKOUT_FULL_SYSTEM, CHECKOUT_HOW, CHECKOUT_READY, checkoutWords, currencyWords, emailOf, itemCount, itemsWords, OFF_WORDS, onWords, ordersLine, pricePicked, refreshedWords, refreshFailure, settingRefusal, settingsLine } from "./words.ts";

test("each keyword of the shop's rules and of the schema is said in words at its control; anything else, as the storage says it", () => {
  expect(settingRefusal("productsCollectionId", "collectionExists", "The site has no collection 9.")).toBe("That collection is not there any more: choose another.");
  expect(settingRefusal("productsCollectionId", "numberField", "The collection News has no number field to be the price.")).toBe("That collection has no number field to be the price: add one in Collections, or choose another collection.");
  expect(settingRefusal("priceField", "priceField", "Choose the products collection first.")).toBe("Choose the products collection first, then its price.");
  expect(settingRefusal("priceField", "priceField", "The collection Swim kit has no number field \"summary\".")).toBe("That collection has no such number field: choose another.");
  expect(settingRefusal("productsCollectionId", "required", "is required for a shop that is on")).toBe("A shop that is on sells from a collection: choose one.");
  expect(settingRefusal("priceField", "required", "is required for a shop that is on")).toBe("A shop that is on needs a price: choose a number field.");
  expect(settingRefusal("enabled", "required", "is required")).toBe("This cannot be empty.");
  expect(settingRefusal("currency", "enum", "must be one of GBP, EUR, USD")).toBe("Choose one of the three currencies.");
  expect(settingRefusal("enabled", "type", "must be true or false")).toBe("The shop is on or off.");
  expect(settingRefusal("productsCollectionId", "type", "must be a collection's id, or null")).toBe("Choose a collection of the list.");
  expect(settingRefusal("priceField", "type", "must be a field's key, or null")).toBe("Choose a number field of the list.");
  expect(settingRefusal("currency", "type", "must be a string")).toBe("must be a string");
  expect(settingRefusal("priceField", "another", "Something else.")).toBe("Something else.");
});

// The CMS's refusal to turn the shop on over a page or a collection that
// holds /cart, from before the shop reserved it: its words name which,
// and the screen adds where the editor changes it.
test("the cart's address held by a page or a collection is said at the switch: the storage's words, which name it, then where to free it", () => {
  const page = "The page \"Club news\" is at /cart, the address of the shop's cart: give the page another address and publish it before turning the shop on.";
  const collection = "The collection Notices has the prefix cart, so its entries are below /cart, the address of the shop's cart: give the collection another prefix before turning the shop on.";
  expect(settingRefusal("enabled", "cartAddress", page)).toBe(`${page} Open the page: its address is in the Page tab, under Title and address.`);
  expect(settingRefusal("enabled", "cartPrefix", collection)).toBe(`${collection} Its prefix is in Collections, on the collection's Settings tab.`);
  expect(settingIssues([{ pointer: "/enabled", keyword: "cartAddress", message: page }, { pointer: "/enabled", keyword: "cartPrefix", message: collection }]).enabled).toEqual([
    `${page} ${CART_ADDRESS_WHERE}`,
    `${collection} ${CART_PREFIX_WHERE}`,
  ]);
});

test("the refusals land at their members; one at no member is said above the controls", () => {
  const issues = settingIssues([
    { pointer: "/productsCollectionId", keyword: "collectionExists", message: "The site has no collection 9." },
    { pointer: "/priceField", keyword: "required", message: "is required for a shop that is on" },
    { pointer: "/extra", keyword: "additionalProperties", message: "is not a member this request takes" },
    { pointer: "", keyword: "type", message: "must be a JSON object" },
  ]);
  expect(issues).toEqual({
    enabled: [], currency: [],
    productsCollectionId: ["That collection is not there any more: choose another."],
    priceField: ["A shop that is on needs a price: choose a number field."],
    other: ["is not a member this request takes", "must be a JSON object"],
  });
});

test("the settings and the orders, each in a line; the price a collection takes when it is chosen", () => {
  expect(settingsLine({ enabled: false, currency: "GBP", productsCollectionId: 7, priceField: "price" }, [KIT])).toBe("Off");
  expect(settingsLine({ enabled: true, currency: "USD", productsCollectionId: 7, priceField: "price" }, [KIT])).toBe("On, in dollars, from Swim kit");
  expect(settingsLine({ enabled: true, currency: "GBP", productsCollectionId: 9, priceField: "price" }, [KIT])).toBe("On, in pounds");
  expect([ordersLine([]), ordersLine([order(1, { status: "paid" })]), ordersLine([order(1), order(2, { status: "demo" }), order(3)])]).toEqual(["No orders yet", "1 order", "3 orders, 2 open"]);
  expect(pricePicked(KIT)).toBe("price");
  expect(pricePicked({ fields: [{ key: "cost", label: "Cost", type: "number", required: false }, { key: "price", label: "Price", type: "text", required: false }] })).toBe("cost");
  expect(pricePicked(NEWS)).toBeNull();
});

test("an order's items: each title, how many when more than one, the first three and how many more; the email once paid", () => {
  const line = (title: string, quantity: number) => ({ entryId: 1, title, unitAmount: 100, quantity });
  expect(itemsWords([line("Swim cap", 2), line("Tow float", 1)])).toBe("Swim cap × 2, Tow float");
  expect(itemsWords([line("A", 1), line("B", 3), line("C", 1), line("D", 1), line("E", 20)])).toBe("A, B × 3, C and 2 more");
  expect([itemCount([line("A", 1)]), itemCount([line("A", 2), line("B", 3)])]).toEqual(["1 item", "5 items"]);
  expect([emailOf(order(1, { status: "paid", email: "a@example.org" })), emailOf(order(2, { email: "early@example.org" })), emailOf(order(3, { status: "paid" }))]).toEqual(["a@example.org", null, null]);
});

test("checkout set up or not, why, and what to do: on the CMS, how it is set up; in the browser, what the full system does", () => {
  expect(checkoutWords({ ready: true, reason: null }, false)).toEqual({ state: CHECKOUT_READY, reason: null, how: null });
  expect(checkoutWords({ ready: false, reason: "STRIPE_SECRET_KEY is a live key." }, false)).toEqual({ state: "Checkout is not set up.", reason: "STRIPE_SECRET_KEY is a live key.", how: CHECKOUT_HOW });
  expect(checkoutWords({ ready: false, reason: "This storage is the browser's." }, true)).toEqual({ state: "Checkout is not set up.", reason: "This storage is the browser's.", how: CHECKOUT_FULL_SYSTEM });
  expect(CHECKOUT_HOW).toContain("STRIPE_SECRET_KEY");
  expect(CHECKOUT_HOW).toContain("test mode");
});

test("the switch and the currency, said as the storage does them: a visitor's cart and Stripe on the CMS; this browser's cart, and Stripe the full system's, in the browser", () => {
  expect(onWords(false)).toBe("On, the products are sold: Add to cart puts them in a visitor's cart, and prices are drawn in the shop's currency.");
  expect(onWords(true)).toBe("On, the products are sold: Add to cart puts them in the cart this browser keeps, and prices are drawn in the shop's currency.");
  expect(currencyWords(false)).toBe("Prices are written in it, and Stripe is asked to charge it.");
  expect(currencyWords(true)).toBe("Prices are written in it; in the full system, Stripe is asked to charge it.");
  expect(OFF_WORDS).toMatch(/^Off, nothing is sold:/);
});

test("what asking Stripe again found, and why it was not asked: 409, 502, the order gone, anything else", () => {
  expect(["paid", "expired", "open", "demo"].map((status) => refreshedWords({ status: status as never }))).toEqual([
    "Stripe says the order is paid.", "Stripe says the order's checkout expired unpaid.", "Stripe says the order is not paid yet.", "This order is the browser demo's: no payment was ever asked for.",
  ]);
  expect(refreshFailure(new StorageError({ kind: "refused", status: 409, code: "checkout_not_set_up", message: "Checkout is not set up on this CMS." }))).toBe(`Not asked: checkout is not set up on this CMS, so Stripe cannot be asked about the order. ${CHECKOUT_HOW}`);
  expect(refreshFailure(new StorageError({ kind: "unknown", cause: "server", status: 502, message: "failed on the server (502)." }))).toBe("Not asked: Stripe could not be reached, or did not answer as it should. Nothing changed: try again in a moment.");
  expect(refreshFailure(new StorageError({ kind: "not-found", message: "There is nothing at this address." }))).toBe("This order is no longer kept.");
  expect(refreshFailure(new StorageError({ kind: "unknown", cause: "network", status: null, message: "could not reach the CMS." }))).toBe("Not asked: could not reach the CMS.");
  expect(refreshFailure(new Error("Boom."))).toBe("Not asked: Boom.");
});
