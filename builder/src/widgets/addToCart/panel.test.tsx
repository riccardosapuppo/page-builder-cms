// Add to cart on the canvas and in the sidebar: in the template of the
// collection the shop sells from, the shop on, it draws its form as the
// site does, a price drawn as money beside it, and the form sends nothing;
// with the shop off, or in another collection's template, it is drawn
// faintly, saying why; its panel changes its words and whether it asks
// how many, and says what it draws; Insert offers it, in This entry
// beside Field, only there; pasted into a page, it is refused.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { newsCollection, newsEntry, siteOf } from "../../../test/site-entries.ts";
import { clipboardText } from "../../document/clipboard.ts";
import { Canvas } from "../../editor/Canvas.tsx";
import { pasteText } from "../../editor/clipboard.ts";
import { Palette } from "../../editor/Palette.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import type { OpenPage } from "../../editor/session.tsx";
import type { Field } from "../../shared/collection.ts";
import type { Block, PageDocument } from "../../shared/document.ts";
import type { ShopSettings } from "../../shared/shop.ts";
import { CART_OUTSIDE } from "../../shared/validate.ts";
import type { Capabilities } from "../../storage/adapter.ts";
import { cartNote } from "./panel.tsx";

const CAPABILITIES: Capabilities = { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true, collections: true, shop: true };
const FIELDS: Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100_000 },
  { key: "in-stock", label: "In stock", type: "toggle", required: false },
];
const products = newsCollection({ id: 7, name: "Swim kit", prefix: "kit", fields: FIELDS, sort: { by: "title", direction: "asc" } });
const cap = newsEntry(41, "Swim cap", "2026-10-01", { values: { price: 12.5, "in-stock": true } });
const ON: ShopSettings = { enabled: true, currency: "GBP", productsCollectionId: 7, priceField: "price" };
const widget = (id: string, type: string, props: Record<string, unknown>): Block => ({ id, type, props, children: [], style: { base: {} } }) as unknown as Block;
const document = (...widgets: Block[]): PageDocument => ({
  schemaVersion: 1,
  title: "Swim kit",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: widgets as never }] }],
});
const template: OpenPage = { id: 90, kind: "template", slug: null, home: false, published: null, revision: 1, links: { preview: "/preview/90", live: null }, collection: { id: 7, name: "Swim kit", prefix: "kit" } };
const page: OpenPage = { id: 5, kind: "page", slug: "shop", home: false, published: null, revision: 1, links: { preview: "/preview/5", live: null } };
const cart = widget("cart", "addToCart", { label: "Add to cart", quantity: true });
const price = widget("price", "field", { field: "price" });
const root = (id: string) => window.document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

function canvas(shop: ShopSettings | null, open: OpenPage = template) {
  const kit = editorKit({ document: document(price, cart), session: { current: open, capabilities: CAPABILITIES } });
  act(() => {
    kit.ui.getState().setSiteEntries(siteOf(products, [cap]));
    kit.ui.getState().setSiteShop(shop);
  });
  kit.render(<Canvas />);
  return kit;
}

test("in the template the shop sells from, Add to cart draws its form as the site does, the price as money, and the form sends nothing", () => {
  const kit = canvas(ON);
  expect(root("price").textContent).toBe("£12.50");
  const form = root("cart").querySelector("form")!;
  expect([form.getAttribute("method"), form.getAttribute("action")]).toEqual(["post", "/cart/items"]);
  expect(form.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe("41");
  expect(form.querySelector<HTMLInputElement>('input[name="quantity"]')?.value).toBe("1");
  expect(within(root("cart")).getByRole("button", { name: "Add to cart" })).toBeTruthy();
  expect(root("cart").querySelector(".field-none")).toBeNull();

  const sent = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener("submit", sent);
  fireEvent.click(within(root("cart")).getByRole("button", { name: "Add to cart" }));
  window.removeEventListener("submit", sent);
  expect(sent).not.toHaveBeenCalled();
  // The click selects the block, as any block's.
  expect(kit.store.getState().selection).toBe("cart");

  // Another currency, at once.
  act(() => kit.ui.getState().setSiteShop({ ...ON, currency: "EUR" }));
  expect(root("price").textContent).toBe("€12.50");
});

test("with the shop off, in another collection's template, or on made-up values, it is drawn faintly, saying why; the price is a number", () => {
  canvas({ ...ON, enabled: false });
  expect(root("cart").hasAttribute("hidden")).toBe(true);
  expect(root("cart").querySelector(".field-none")?.textContent).toBe("Add to cart: the shop is off, so it draws nothing");
  expect(root("price").textContent).toBe("12.5");
  window.document.body.innerHTML = "";

  canvas({ ...ON, productsCollectionId: 8 });
  expect(root("cart").querySelector(".field-none")?.textContent).toBe("Add to cart: the shop sells from another collection");
  window.document.body.innerHTML = "";

  const kit = editorKit({ document: document(price, cart), session: { current: template, capabilities: CAPABILITIES } });
  act(() => {
    kit.ui.getState().setSiteEntries(siteOf(products, []));
    kit.ui.getState().setSiteShop(ON);
  });
  kit.render(<Canvas />);
  expect(root("cart").querySelector(".field-none")?.textContent).toBe("Add to cart: drawn for an entry of this collection, and it has none yet");
  // Made-up values are the collection's: their price is money.
  expect(root("price").textContent).toBe("£0.00");
});

test("out of stock, it says so where its button goes, and is no button", () => {
  const kit = editorKit({ document: document(cart), session: { current: template, capabilities: CAPABILITIES } });
  act(() => {
    kit.ui.getState().setSiteEntries(siteOf(products, [newsEntry(41, "Swim cap", "2026-10-01", { values: { price: 12, "in-stock": false } })]));
    kit.ui.getState().setSiteShop(ON);
  });
  kit.render(<Canvas />);
  expect(root("cart").querySelector(".sw-btn-off")?.textContent).toBe("Out of stock");
  expect(root("cart").querySelector("button, form")).toBeNull();
});

test("its panel changes its words and whether it asks how many, and says what it draws", () => {
  const kit = editorKit({ document: document(cart), selection: "cart", session: { current: template, capabilities: CAPABILITIES } });
  act(() => {
    kit.ui.getState().setSiteEntries(siteOf(products, [cap]));
    kit.ui.getState().setSiteShop(ON);
  });
  kit.render(<BlockPanel id="cart" />);
  const words = screen.getByLabelText("Button text");
  fireEvent.change(words, { target: { value: "Buy a cap" } });
  fireEvent.keyDown(words, { key: "Enter" });
  expect(kit.block("cart")?.props).toEqual({ label: "Buy a cap", quantity: true });
  expect(kit.lastCommand()?.label).toBe("Changed Cart button text in Section 1");
  expect(screen.getByText("A quantity from 1 to 20 beside the button.")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Ask how many" }));
  expect(kit.block("cart")?.props).toEqual({ label: "Buy a cap", quantity: false });
  expect(screen.getByText("The button puts one in the cart.")).toBeTruthy();
  expect(screen.getByText("It puts the entry in a visitor's cart, at the price it published. Out of stock, or with no price, it says so where its button goes.")).toBeTruthy();

  // An empty text is refused at its field.
  fireEvent.change(words, { target: { value: " " } });
  fireEvent.blur(words);
  expect(kit.block("cart")?.props).toMatchObject({ label: "Buy a cap" });
});

test("what the panel says it draws, by the storage, the shop and the template's collection", () => {
  const collection = { id: 7, name: "Swim kit", fields: FIELDS };
  expect(cartNote(false, null, collection)).toBe("This storage keeps no shop: the block draws nothing.");
  expect(cartNote(true, null, collection)).toBe("");
  expect(cartNote(true, { ...ON, enabled: false }, collection)).toBe("The shop is off: the block draws nothing until it is on, in Shop, from the menu of the mark at the top left.");
  expect(cartNote(true, { ...ON, productsCollectionId: 8 }, collection)).toBe("The shop sells from another collection: on the entries of Swim kit the block draws nothing.");
  expect(cartNote(true, ON, { ...collection, fields: FIELDS.slice(0, 2) })).toBe("It puts the entry in a visitor's cart, at the price it published. With no price, it says so where its button goes.");
});

test("Insert offers Add to cart in This entry, beside Field, only in the template the shop sells from while it is on", () => {
  const entryKeys = () => within(screen.getByRole("group", { name: "This entry" })).getAllByRole("button").map((key) => key.textContent);
  const kit = editorKit({ document: document(widget("h", "heading", { level: 2, text: "Kit" })), selection: "h", session: { current: template, capabilities: CAPABILITIES } });
  act(() => {
    kit.ui.getState().setSiteEntries(siteOf(products, [cap]));
    kit.ui.getState().setSiteShop(ON);
  });
  kit.render(<Palette />);
  expect(entryKeys()).toEqual(["Field", "Add to cart"]);
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(kit.block(kit.store.getState().selection ?? "")).toMatchObject({ type: "addToCart", props: { label: "Add to cart", quantity: true } });

  act(() => kit.ui.getState().setSiteShop({ ...ON, enabled: false }));
  expect(entryKeys()).toEqual(["Field"]);
  act(() => kit.ui.getState().setSiteShop({ ...ON, productsCollectionId: 8 }));
  expect(entryKeys()).toEqual(["Field"]);
  window.document.body.innerHTML = "";

  const plain = editorKit({ document: document(), session: { current: page, capabilities: CAPABILITIES } });
  act(() => plain.ui.getState().setSiteShop(ON));
  plain.render(<Palette />);
  expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
});

test("Add to cart pasted into a page or a part is refused, the page unchanged; into a template it is pasted", () => {
  const kit = editorKit({ document: document(widget("h", "heading", { level: 2, text: "Kit" })), selection: "h", session: { current: page } });
  const before = kit.doc();
  expect(pasteText(kit.env, clipboardText(cart), "canvas", "page")).toEqual({ reason: "nesting", message: CART_OUTSIDE });
  expect(pasteText(kit.env, clipboardText(cart), "canvas", "footer")).toEqual({ reason: "nesting", message: CART_OUTSIDE });
  expect(kit.doc()).toBe(before);
  expect(kit.ui.getState().notice).toBe(CART_OUTSIDE);
  expect(pasteText(kit.env, clipboardText(cart), "canvas", "template")).toBeNull();
  expect(kit.doc().sections[0]?.children[0]?.children.map((block) => block.type)).toEqual(["heading", "addToCart"]);
});
