// The demo's cart (./PageView.tsx, ./cart-page.ts, ./cart-view.tsx), with
// the shop's settings this browser keeps: on a product's page, a product
// for sale has its price as money and its form as the site draws it, and
// pressed, it goes into the cart this browser keeps, by the shop's rules,
// and the cart opens; one out of stock says so where the button goes; with
// the shop off, the price is a number and nothing is offered. The cart's
// page draws each line as the CMS's does, sets a line's quantity, takes it
// out, says a refusal above the cart, and its Checkout makes the demo's
// order, the cart losing what the order took, and opens the order, drawn
// with what the full system does.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { newsCollection, templateOf } from "../../test/site-entries.ts";
import type { Field } from "../shared/collection.ts";
import type { CartLine } from "../shared/shop.ts";
import { defaultSiteStyle, siteStyleChoices } from "../shared/site-tokens.ts";
import { StorageError, type Collection, type Entry, type Order, type StorageAdapter } from "../storage/adapter.ts";
import { WORDS } from "../storage/browser-rules.ts";
import { CART_KEY, readDemoCart } from "./cart-page.ts";
import { CART_VIEW_LINE, NO_ORDER_LINE, ORDER_LINE, ORDER_SAID, ORDER_TITLE, PageView, SHOP_OFF_LINE } from "./PageView.tsx";
import { cartAddress, orderAddress, type View } from "./views.ts";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FIELDS: readonly Field[] = [
  { key: "image", label: "Image", type: "image", required: false },
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

const product = (id: number, title: string, values: Entry["values"]): Entry => {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id, collectionId: 7, title, slug, values, revision: 1, lastSaveId: null, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z",
    published: { title, slug, values, draftRevision: 1, publishedAt: "2026-10-01T09:00:00.000Z" },
  } as Entry;
};

// Kit, its template published as version 2, with Swim cap (a picture, in
// stock), Tow float (in stock) and Enamel mug (out of stock); the shop on,
// in pounds, selling Kit, unless off; and what the demo's checkout was
// asked, the order it makes made of the lines for sale.
function storage(options: { on?: boolean; cap?: Entry["values"] } = {}) {
  const kit: Collection = newsCollection({ id: 7, name: "Kit", prefix: "kit", fields: [...FIELDS], sort: { by: "title", direction: "asc" }, template: { ...templateOf(90, "Kit"), published: { versionNumber: 2 } } as Collection["template"] });
  const entries = [
    product(41, "Swim cap", options.cap ?? { price: 12, "in-stock": true, image: { mediaId: "caps", alt: "Three swim caps" } }),
    product(42, "Tow float", { price: 24.5, "in-stock": true }),
    product(43, "Enamel mug", { price: 9.5, "in-stock": false }),
  ];
  const orders: Order[] = [];
  const asked: CartLine[][] = [];
  const adapter = {
    name: "browser",
    capabilities: { collections: true, shop: true },
    listPages: async () => [],
    listParts: async () => [],
    getSiteStyle: async () => ({ ...defaultSiteStyle(), customCss: "", updatedAt: null, choices: siteStyleChoices() }),
    listMedia: async () => [{ id: "caps", url: "blob:caps", width: 800, height: 600, alt: "Three swim caps" }],
    listCollections: async () => [kit],
    listEntries: async () => entries,
    getVersion: async (id: number, number: number) => {
      if (id !== 90 || number !== 2) throw new Error("There is nothing at this address.");
      return { document: TEMPLATE };
    },
    getShop: async () => ({ enabled: options.on !== false, currency: "GBP", productsCollectionId: 7, priceField: "price", checkout: { ready: false, reason: "browser" } }),
    getOrder: async (id: number) => {
      const found = orders.find((order) => order.id === id);
      if (!found) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
      return found;
    },
  } as unknown as StorageAdapter;
  const checkout = async (lines: readonly CartLine[]): Promise<Order> => {
    asked.push(lines.map((line) => ({ ...line })));
    const sold = lines.filter((line) => line.entryId !== 43).map((line) => {
      const entry = entries.find((one) => one.id === line.entryId)!;
      return { entryId: line.entryId, title: entry.title, unitAmount: Math.round((entry.values.price as number) * 100), quantity: line.quantity };
    });
    if (sold.length === 0) throw new StorageError({ kind: "refused", status: 409, code: "nothing_to_check_out", message: WORDS.nothingToCheckOut });
    const order: Order = { id: orders.length + 1, status: "demo", currency: "GBP", lines: sold, total: sold.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0), stripeSessionId: null, email: null, paidAt: null, createdAt: "2026-10-16T09:00:00.000Z", updatedAt: "2026-10-16T09:00:00.000Z" };
    orders.push(order);
    return order;
  };
  return { adapter, checkout, asked, orders };
}

// A line's field, named by its label and the product a screen reader alone
// reads: jsdom's name for it drops the space a browser keeps between them.
const quantityOf = (title: string) => new RegExp(`^Quantity ?of ${title}$`);
const kept = (lines: Array<[number, number]>) => localStorage.setItem(CART_KEY, JSON.stringify(lines));
const cartRoot = () => document.querySelector<HTMLElement>('[data-block-type="addToCart"]');
const priceRoot = () => document.querySelector<HTMLElement>('[data-block-type="field"]');
const linesDrawn = () => [...document.querySelectorAll(".sw-cart-line")].map((line) => [
  line.querySelector(".sw-cart-title")?.textContent, ...[...line.querySelectorAll(".sw-cart-price, .sw-cart-state, .sw-cart-amount")].map((one) => one.textContent),
]);

function open(view: View, options: Parameters<typeof storage>[0] = {}) {
  const shop = storage(options);
  const went: string[] = [];
  render(<PageView adapter={shop.adapter} view={view} checkout={shop.checkout} go={(address) => went.push(address)} />);
  return { ...shop, went };
}

test("a product for sale: its price in pounds and its form as the site draws it; pressed, it goes into the cart this browser keeps, and the cart opens", async () => {
  const { went } = open({ kind: "entry", entryId: 41 });
  const button = await screen.findByRole("button", { name: "Add to cart" });
  expect(priceRoot()?.textContent).toBe("£12.00");
  expect(button.closest("form")?.getAttribute("action")).toBe("/cart/items");
  expect(cartRoot()?.querySelector('[role="status"]'), "no line under it: the demo's cart takes it").toBeNull();

  // Counted once the event has been through the page: a form sent.
  let left = 0;
  const count = (event: Event) => {
    if (!event.defaultPrevented) left += 1;
  };
  document.addEventListener("submit", count);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity" }), { target: { value: "2" } });
  fireEvent.click(button);
  expect(left, "the form went nowhere").toBe(0);
  expect(readDemoCart()).toEqual([{ entryId: 41, quantity: 2 }]);
  expect(went).toEqual([cartAddress]);
  // Again, two more, as the CMS's cart adds to a line, kept as ids and
  // quantities.
  fireEvent.click(button);
  expect(JSON.parse(localStorage.getItem(CART_KEY)!)).toEqual([[41, 4]]);
  document.removeEventListener("submit", count);
});

test("a quantity the shop's rules refuse is said above the page, and nothing is put in", async () => {
  const { went } = open({ kind: "entry", entryId: 41 });
  const button = await screen.findByRole("button", { name: "Add to cart" });
  kept([[41, 20]]);
  fireEvent.click(button);
  expect(readDemoCart()).toEqual([{ entryId: 41, quantity: 20 }]);
  expect(went).toEqual([cartAddress]);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity" }), { target: { value: "1.5" } });
  fireEvent.submit(button.closest("form")!);
  expect(screen.getByRole("status").textContent).toBe("The quantity is a whole number from 1 to 20.");
  expect(went).toHaveLength(1);
});

test("a product the cart cannot take is refused as the CMS's cart refuses it, saying why, and nothing is put in", async () => {
  const { went } = open({ kind: "entry", entryId: 41 });
  const button = await screen.findByRole("button", { name: "Add to cart" });
  const entry = button.closest("form")!.querySelector<HTMLInputElement>('input[name="entry"]')!;
  for (const [id, said] of [["43", "This product is out of stock."], ["99", "This product is no longer sold."], ["x", "That product could not be read."]] as const) {
    entry.value = id;
    fireEvent.submit(button.closest("form")!);
    expect(screen.getByRole("status").textContent, id).toBe(said);
  }
  expect(readDemoCart()).toEqual([]);
  expect(went).toEqual([]);
});

test("a product out of stock says so where the button goes, and there is nothing to send", async () => {
  open({ kind: "entry", entryId: 43 });
  expect(await screen.findByText("Out of stock")).toBeTruthy();
  expect(cartRoot()?.querySelector("form")).toBeNull();
});

test("with the shop off, the price is a number and Add to cart is not drawn; the cart's page says the shop is off", async () => {
  open({ kind: "entry", entryId: 41 }, { on: false });
  expect(await screen.findByText("12")).toBeTruthy();
  expect(cartRoot()?.hidden).toBe(true);
  expect(cartRoot()?.childElementCount).toBe(0);
  cleanup();
  open({ kind: "cart" }, { on: false });
  expect(await screen.findByText(SHOP_OFF_LINE)).toBeTruthy();
  expect(document.querySelector(".sw-cart")).toBeNull();
});

test("the cart's page draws each line as the CMS's does, in the site's frame, under the line saying what the full system does", async () => {
  kept([[41, 2], [43, 1], [99, 1]]);
  open({ kind: "cart" });
  expect(await screen.findByRole("heading", { level: 1, name: "Your cart" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "About this page" }).querySelector("p")?.textContent).toBe(CART_VIEW_LINE);
  expect(document.querySelector(".sw-cart-head p")?.textContent).toBe("You have 4 items in your cart.");
  expect(linesDrawn()).toEqual([
    ["Swim cap", "£12.00 each", "£24.00"],
    ["Enamel mug", "Out of stock: the checkout leaves it out."],
    ["A product no longer sold", "No longer sold: the checkout leaves it out."],
  ]);
  expect(document.querySelector(".sw-cart-total")?.textContent).toBe("Total £24.00");
  expect(document.querySelector<HTMLImageElement>('[data-entry-id="41"] .sw-cart-picture img')?.getAttribute("src")).toBe("blob:caps");
  expect(screen.getByRole("link", { name: "Swim cap" }).getAttribute("href")).toBe("/kit/swim-cap");
  expect(screen.getByRole("button", { name: "Checkout" })).toBeTruthy();
});

test("a line's quantity set, a line taken out, each kept; a quantity refused is said above the cart and changes nothing", async () => {
  kept([[41, 2], [42, 1]]);
  open({ kind: "cart" });
  const field = await screen.findByRole("spinbutton", { name: quantityOf("Swim cap") });
  fireEvent.change(field, { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Update Swim cap" }));
  expect(readDemoCart()).toEqual([{ entryId: 41, quantity: 5 }, { entryId: 42, quantity: 1 }]);
  expect(linesDrawn()[0]).toEqual(["Swim cap", "£12.00 each", "£60.00"]);
  expect((screen.getByRole("spinbutton", { name: quantityOf("Swim cap") }) as HTMLInputElement).value).toBe("5");

  fireEvent.change(screen.getByRole("spinbutton", { name: quantityOf("Tow float") }), { target: { value: "21" } });
  fireEvent.submit(screen.getByRole("button", { name: "Update Tow float" }).closest("form")!);
  expect(screen.getByRole("alert").textContent).toBe("The quantity is a whole number from 0 to 20.");
  expect(readDemoCart()).toEqual([{ entryId: 41, quantity: 5 }, { entryId: 42, quantity: 1 }]);

  fireEvent.click(screen.getByRole("button", { name: "Remove Swim cap" }));
  expect(readDemoCart()).toEqual([{ entryId: 42, quantity: 1 }]);
  expect(screen.queryByRole("alert"), "a change kept says nothing").toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove Tow float" }));
  expect(localStorage.getItem(CART_KEY), "an empty cart is let go of").toBeNull();
  expect(document.querySelector(".sw-cart-head p")?.textContent).toBe("Your cart is empty.");
  expect(screen.getByRole("link", { name: "See what the shop sells" }).getAttribute("href")).toBe("/");
});

test("Checkout makes the demo's order of the lines for sale, the cart keeps only what the order did not take, and the order opens", async () => {
  kept([[41, 2], [43, 1]]);
  const { asked, went } = open({ kind: "cart" });
  fireEvent.click(await screen.findByRole("button", { name: "Checkout" }));
  await act(async () => {});
  expect(asked).toEqual([[{ entryId: 41, quantity: 2 }, { entryId: 43, quantity: 1 }]]);
  expect(readDemoCart(), "the mug, out of stock, stays").toEqual([{ entryId: 43, quantity: 1 }]);
  expect(went).toEqual([orderAddress(1)]);
});

// Another tab of this browser writes the cart while this one shows it:
// each change here starts from the cart as kept at that moment, never
// from what this tab drew.
test("a line taken out, or its quantity set, keeps a product another tab put in since this tab drew the cart", async () => {
  kept([[41, 1]]);
  open({ kind: "cart" });
  await screen.findByRole("button", { name: "Remove Swim cap" });
  kept([[41, 1], [42, 1]]);
  fireEvent.click(screen.getByRole("button", { name: "Remove Swim cap" }));
  expect(readDemoCart(), "the float another tab put in stays").toEqual([{ entryId: 42, quantity: 1 }]);
  expect(linesDrawn().map((line) => line[0])).toEqual(["Tow float"]);
  kept([[42, 1], [43, 1]]);
  fireEvent.change(screen.getByRole("spinbutton", { name: quantityOf("Tow float") }), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Update Tow float" }));
  expect(readDemoCart()).toEqual([{ entryId: 42, quantity: 4 }, { entryId: 43, quantity: 1 }]);
});

test("a checkout orders the cart as kept when it is pressed, and leaves what another tab put in while the order was made", async () => {
  kept([[41, 1]]);
  const shop = storage();
  render(<PageView adapter={shop.adapter} view={{ kind: "cart" }} go={() => {}} checkout={async (lines) => {
    // Meanwhile, another tab: one more cap, and a float.
    kept([[41, 3], [42, 1]]);
    return shop.checkout(lines);
  }} />);
  await screen.findByRole("button", { name: "Checkout" });
  kept([[41, 2]]);
  fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
  await act(async () => {});
  expect(shop.asked, "the cart as kept when Checkout was pressed").toEqual([[{ entryId: 41, quantity: 2 }]]);
  expect(readDemoCart(), "the order took two caps; the cap and the float put in since stay").toEqual([{ entryId: 41, quantity: 1 }, { entryId: 42, quantity: 1 }]);
});

test("the cart another tab changed is drawn again here", async () => {
  kept([[41, 1]]);
  open({ kind: "cart" });
  await screen.findByRole("button", { name: "Remove Swim cap" });
  kept([[41, 1], [42, 2]]);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: CART_KEY }));
  });
  expect(linesDrawn().map((line) => line[0])).toEqual(["Swim cap", "Tow float"]);
  expect(document.querySelector(".sw-cart-head p")?.textContent).toBe("You have 3 items in your cart.");
  // Another key, or nothing kept of the site's at all (a cleared storage).
  localStorage.removeItem(CART_KEY);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(document.querySelector(".sw-cart-head p")?.textContent).toBe("Your cart is empty.");
});

test("a checkout with nothing for sale says why above the cart, as the CMS's does, and keeps the cart", async () => {
  kept([[43, 1]]);
  const { asked } = open({ kind: "cart" });
  expect(await screen.findByText(WORDS.nothingToCheckOut, { selector: ".sw-cart-closed" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Checkout" }), "no button for nothing to buy").toBeNull();
  expect(asked).toEqual([]);
});

test("an order is drawn with its lines and total, in plain words that it was made here and not paid, and what the full system does instead", async () => {
  kept([[41, 2], [42, 1]]);
  const { checkout } = open({ kind: "cart" });
  await screen.findByRole("button", { name: "Checkout" });
  cleanup();
  // The order the checkout made, opened as its address says.
  const shop = storage();
  const order = await shop.checkout(readDemoCart());
  render(<PageView adapter={shop.adapter} view={{ kind: "order", orderId: order.id }} checkout={checkout} go={() => {}} />);
  expect(await screen.findByRole("heading", { level: 1, name: ORDER_TITLE })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "About this page" }).querySelector("p")?.textContent).toBe(ORDER_LINE);
  expect(document.querySelector(".sw-cart-head p")?.textContent).toBe(ORDER_SAID);
  expect(linesDrawn()).toEqual([["Swim cap", "2 × £12.00", "£24.00"], ["Tow float", "1 × £24.50", "£24.50"]]);
  expect(document.querySelector(".sw-cart-total")?.textContent).toBe("Total £48.50");
  expect(screen.getByRole("link", { name: "Back to the shop" }).getAttribute("href")).toBe("/");
  cleanup();
  open({ kind: "order", orderId: 9 });
  expect(await screen.findByText(NO_ORDER_LINE)).toBeTruthy();
});
