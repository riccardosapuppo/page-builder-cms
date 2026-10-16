// Add to cart on an entry's page as the demo draws it (./PageView.tsx),
// with the shop's settings this browser keeps: a product for sale has its
// price as money and its form as the site draws it, and under the form a
// line saying what the full system does with it; pressed, it sends
// nothing and says so again. One out of stock says so where the button
// goes, and has no line: there is nothing to send. With the shop off,
// the price is a number and nothing is offered.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { newsCollection, templateOf } from "../../test/site-entries.ts";
import type { Field } from "../shared/collection.ts";
import { defaultSiteStyle, siteStyleChoices } from "../shared/site-tokens.ts";
import type { Collection, Entry, StorageAdapter } from "../storage/adapter.ts";
import { CART_LINE, CART_NOT_SENT, PageView } from "./PageView.tsx";

afterEach(cleanup);

const FIELDS: readonly Field[] = [
  { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100000 },
  { key: "in-stock", label: "In stock", type: "toggle", required: false },
];
const leaf = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, style: { base: {} }, children: [] });
const TEMPLATE = {
  schemaVersion: 1,
  title: "Kit",
  sections: [{
    id: "s", type: "section", props: {}, style: { base: {} },
    children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [leaf("price", "field", { field: "price" }), leaf("cart", "addToCart", { label: "Add to cart", quantity: true })] }],
  }],
};

// Kit, its template published as version 2, and Swim cap published with
// these values; the shop on, in pounds, selling Kit, unless off.
function storage(values: Entry["values"], options: { on?: boolean } = {}): StorageAdapter {
  const kit: Collection = newsCollection({ id: 7, name: "Kit", prefix: "kit", fields: [...FIELDS], sort: { by: "title", direction: "asc" }, template: { ...templateOf(90, "Kit"), published: { versionNumber: 2 } } as Collection["template"] });
  const cap = {
    id: 41, collectionId: 7, title: "Swim cap", slug: "swim-cap", values, revision: 1, lastSaveId: null, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z",
    published: { title: "Swim cap", slug: "swim-cap", values, draftRevision: 1, publishedAt: "2026-10-01T09:00:00.000Z" },
  } as Entry;
  return {
    name: "browser",
    capabilities: { collections: true, shop: true },
    listPages: async () => [],
    listParts: async () => [],
    getSiteStyle: async () => ({ ...defaultSiteStyle(), customCss: "", updatedAt: null, choices: siteStyleChoices() }),
    listMedia: async () => [],
    listCollections: async () => [kit],
    listEntries: async () => [cap],
    getVersion: async (id: number, number: number) => {
      if (id !== 90 || number !== 2) throw new Error("There is nothing at this address.");
      return { document: TEMPLATE };
    },
    getShop: async () => ({ enabled: options.on !== false, currency: "GBP", productsCollectionId: 7, priceField: "price", checkout: { ready: false, reason: "browser" } }),
  } as unknown as StorageAdapter;
}

const cartRoot = () => document.querySelector<HTMLElement>('[data-block-type="addToCart"]');
const priceRoot = () => document.querySelector<HTMLElement>('[data-block-type="field"]');

test("a product for sale: its price in pounds, its form as the site draws it, and a line under it saying what the full system does; pressed, it sends nothing and says so", async () => {
  render(<PageView adapter={storage({ price: 12, "in-stock": true })} view={{ kind: "entry", entryId: 41 }} />);
  const button = await screen.findByRole("button", { name: "Add to cart" });
  expect(priceRoot()?.textContent).toBe("£12.00");
  const form = button.closest("form");
  expect(form?.getAttribute("action")).toBe("/cart/items");
  expect(screen.getByRole("spinbutton", { name: "Quantity" })).toHaveProperty("value", "1");
  const line = cartRoot()?.querySelector('[role="status"]');
  expect(line?.textContent).toBe(CART_LINE);

  let left = 0;
  form?.addEventListener("submit", (event) => {
    if (!event.defaultPrevented) left += 1;
  });
  fireEvent.click(button);
  expect(line?.textContent).toBe(CART_NOT_SENT);
  expect(left, "the form went nowhere").toBe(0);
});

test("a product out of stock says so where the button goes, and has no line: there is nothing to send", async () => {
  render(<PageView adapter={storage({ price: 12, "in-stock": false })} view={{ kind: "entry", entryId: 41 }} />);
  expect(await screen.findByText("Out of stock")).toBeTruthy();
  expect(cartRoot()?.querySelector("form")).toBeNull();
  expect(cartRoot()?.querySelector('[role="status"]'), "no line about a cart nothing goes in").toBeNull();
  expect(screen.queryByText(CART_LINE)).toBeNull();
});

test("with the shop off, the price is a number and Add to cart is not drawn, nor its line", async () => {
  render(<PageView adapter={storage({ price: 12, "in-stock": true }, { on: false })} view={{ kind: "entry", entryId: 41 }} />);
  expect(await screen.findByText("12")).toBeTruthy();
  expect(cartRoot()?.hidden).toBe(true);
  expect(cartRoot()?.childElementCount).toBe(0);
  expect(screen.queryByText(CART_LINE)).toBeNull();
});
