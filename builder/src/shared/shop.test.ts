// The shop's rules (./shop.ts) on the cases the CMS's twin reads too
// (contract/shop/cases.json, cms/test/models/shop_rules_test.rb): the
// settings' faults at their pointers, keywords and words, or the settings
// as they are kept; a price in the smallest unit and an amount in the
// site's words; a cart read back, changed, and priced from what its
// products published.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import {
  addToCart, afterOrder, checkShop, CURRENCIES, DEFAULT_SHOP, keptCart, minorUnits, moneyWords, priceCart, readCart, setQuantity,
  type CartLine, type Currency, type ShopCollection, type ShopProduct,
} from "./shop.ts";

interface Cases {
  collections: ShopCollection[];
  settings: Array<{ name: string; settings: unknown; faults: Array<[string, string, string]>; settled?: unknown }>;
  prices: Array<{ name: string; value: unknown; minor: number | null; words?: Partial<Record<Currency, string>> }>;
  amounts: Array<{ minor: number; currency: Currency; words: string }>;
  kept: Array<{ name: string; kept: unknown; lines: Array<[number, number]> }>;
  changes: Array<{ name: string; lines: Array<[number, number]>; add?: { entryId: unknown; quantity: unknown }; set?: { entryId: unknown; quantity: unknown }; result?: Array<[number, number]>; fault?: [string, string, string] }>;
  ordered: Array<{ name: string; lines: Array<[number, number]>; ordered: Array<[number, number]>; result: Array<[number, number]> }>;
  priced: Array<{ name: string; fields: Array<{ key: string; type: string }>; priceField: string; products: ShopProduct[]; lines: Array<[number, number]>; priced: unknown }>;
}

const cases = JSON.parse(readFileSync(join(repoRoot, "contract", "shop", "cases.json"), "utf8")) as Cases;
const lines = (pairs: Array<[number, number]>): CartLine[] => pairs.map(([entryId, quantity]) => ({ entryId, quantity }));
const collectionOf = (id: number) => cases.collections.find((collection) => collection.id === id) ?? null;

describe("the shop's settings", () => {
  test("every shared case finds the faults the CMS finds, at their pointers, keywords and words, or keeps the settings", () => {
    expect(cases.settings.length).toBeGreaterThan(20);
    for (const each of cases.settings) {
      const checked = checkShop(each.settings, collectionOf);
      const faults = checked.ok ? [] : checked.faults.map((fault) => [fault.pointer, fault.keyword, fault.message]);
      expect(faults, each.name).toEqual(each.faults);
      if (checked.ok) expect(checked.settings, each.name).toEqual(each.settled ?? each.settings);
    }
  });

  test("a new site's shop is off, in pounds, with no collection, and passes its own rules", () => {
    expect(DEFAULT_SHOP).toEqual({ enabled: false, currency: "GBP", productsCollectionId: null, priceField: null });
    expect(checkShop({ ...DEFAULT_SHOP }, () => null)).toEqual({ ok: true, settings: DEFAULT_SHOP });
    expect([...CURRENCIES]).toEqual(["GBP", "EUR", "USD"]);
  });
});

describe("money", () => {
  test("a price in the smallest unit of its currency, by its hundredths, and in the site's words", () => {
    expect(cases.prices.length).toBeGreaterThan(10);
    for (const each of cases.prices) {
      expect(minorUnits(each.value), each.name).toBe(each.minor);
      for (const [currency, words] of Object.entries(each.words ?? {})) expect(moneyWords(each.minor!, currency as Currency), `${each.name} in ${currency}`).toBe(words);
    }
  });

  test("an amount in the site's words", () => {
    for (const each of cases.amounts) expect(moneyWords(each.minor, each.currency), String(each.minor)).toBe(each.words);
  });
});

describe("the cart", () => {
  test("a cart read back from where it was kept, and kept again as it was read", () => {
    for (const each of cases.kept) {
      const read = readCart(each.kept);
      expect(keptCart(read), each.name).toEqual(each.lines);
    }
  });

  test("a product put in, a line's quantity set, each refused at its fault", () => {
    expect(cases.changes.length).toBeGreaterThan(15);
    for (const each of cases.changes) {
      const asked = each.add ?? each.set!;
      const changed = each.add ? addToCart(lines(each.lines), asked.entryId, asked.quantity) : setQuantity(lines(each.lines), asked.entryId, asked.quantity);
      if (each.fault) expect(changed, each.name).toEqual({ ok: false, fault: { pointer: each.fault[0], keyword: each.fault[1], message: each.fault[2] } });
      else expect(changed.ok ? keptCart(changed.lines) : changed, each.name).toEqual(each.result);
    }
  });

  test("a cart once an order made from it is paid: each product the order took loses the quantity it took, and what was put in since stays", () => {
    expect(cases.ordered.length).toBeGreaterThan(5);
    for (const each of cases.ordered) {
      const taken = each.ordered.map(([entryId, quantity]) => ({ entryId, quantity }));
      expect(keptCart(afterOrder(lines(each.lines), taken)), each.name).toEqual(each.result);
    }
  });

  test("a change leaves the cart it was given as it was", () => {
    const before = lines([[3, 1], [5, 2]]);
    const copy = structuredClone(before);
    addToCart(before, 3, 2);
    setQuantity(before, 5, 0);
    setQuantity(before, 9, 1);
    expect(before).toEqual(copy);
  });

  test("a cart priced from what its products published: each line's state, what it costs, the total and the lines an order takes", () => {
    for (const each of cases.priced) {
      const productOf = (id: number) => each.products.find((product) => product.id === id) ?? null;
      expect(priceCart(lines(each.lines), productOf, each.fields, each.priceField), each.name).toEqual(each.priced);
    }
  });
});
