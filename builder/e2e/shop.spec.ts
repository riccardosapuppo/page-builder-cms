// The shop in Chromium against the run's CMS, whose checkout reaches no
// Stripe (the run gives it no key). From the mark's menu: a collection made
// from the Products preset in Collections; the Shop screen turning the
// shop on for it, its price taken at once, its currency chosen, saved and
// kept by the CMS; checkout said not set up, why, and how; no orders yet,
// and how they come. The collection's template: Insert offering Add to
// cart in This entry beside Field, drawn on the canvas as the site draws
// it, a price drawn as money beside it; published, a product's page where
// a visitor puts the product in the cart, the cart's page taking it. The
// shop turned off: Add to cart offered no more, the one placed drawn
// faintly, saying why, the price a number. axe on the Shop screen. The
// shop's settings are put back as they were found.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { makeEntry, saveDocument } from "./helpers/collections.ts";
import { cms, column, drawer, expect, heading, makePage, open, section, test, unique } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface ShopSettings {
  enabled: boolean;
  currency: string;
  productsCollectionId: number | null;
  priceField: string | null;
}

async function shopOf(request: APIRequestContext): Promise<ShopSettings & { checkout: { ready: boolean; reason: string | null } }> {
  return (await (await request.get(`${cms()}/api/shop`)).json()) as ShopSettings & { checkout: { ready: boolean; reason: string | null } };
}

async function putShop(request: APIRequestContext, settings: ShopSettings): Promise<void> {
  const changed = await request.put(`${cms()}/api/shop`, { data: settings });
  expect(changed.status(), await changed.text()).toBe(200);
}

interface Listed {
  id: number;
  name: string;
  prefix: string;
  fields: Array<{ key: string; type: string }>;
  template: { id: number };
}

// The collection of that name as the CMS lists it, if it does.
async function listed(request: APIRequestContext, name: string): Promise<Listed | undefined> {
  return ((await (await request.get(`${cms()}/api/collections`)).json()) as { collections: Listed[] }).collections.find((one) => one.name === name);
}

async function fromMenu(page: Page, item: "Collections" | "Shop"): Promise<Locator> {
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
  const screen = page.getByRole("dialog", { name: item });
  await expect(screen).toBeVisible();
  return screen;
}

let found: ShopSettings | null = null;
test.beforeEach(async ({ request }) => {
  const shop = await shopOf(request);
  found = { enabled: shop.enabled, currency: shop.currency, productsCollectionId: shop.productsCollectionId, priceField: shop.priceField };
});
test.afterEach(async ({ request }) => {
  if (found) await putShop(request, found);
});

test("a collection from the Products preset sold by the shop: its settings saved, checkout not set up and how, no orders yet; Add to cart in its template, and a visitor's cart", { tag: "@a11y" }, async ({ page, request }) => {
  const home = await makePage(request, "Shop home", [section("s", "Story", [column("c", [heading("h", "The club's kit")])])]);
  await open(page, home.id);

  // The products, from their preset.
  const collections = await fromMenu(page, "Collections");
  const name = `Kit ${unique("k").slice(-6)}`;
  await collections.getByRole("button", { name: "New collection" }).first().click();
  await collections.getByRole("textbox", { name: /^Name/ }).fill(name);
  await collections.getByRole("radio", { name: /^Products/ }).click();
  await collections.getByRole("button", { name: "Create collection" }).click();
  await expect(collections.getByRole("button", { name: "Write the first entry" })).toBeFocused();
  await collections.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(async () => (await listed(request, name))?.name ?? null, { message: "the CMS lists the new collection" }).toBe(name);
  const made = (await listed(request, name))!;
  const prefix = made.prefix;
  expect(made.fields.map((f) => [f.key, f.type])).toEqual([["summary", "paragraph"], ["image", "image"], ["body", "richText"], ["price", "number"], ["in-stock", "toggle"]]);

  // The shop: on, selling them, by their price, in euros.
  const shop = await fromMenu(page, "Shop");
  await expect(shop.getByRole("button", { name: /^Settings, / })).toHaveAttribute("aria-current", "true");
  const on = shop.getByRole("switch", { name: "The shop is on" });
  await on.focus();
  await on.press("Space");
  await expect(on).toBeChecked();
  await shop.getByLabel("Collection").selectOption(String(made.id));
  await expect(shop.getByLabel("Price")).toHaveValue("price");
  await shop.getByRole("radio", { name: "€ Euros" }).click();
  await shop.getByRole("button", { name: "Save changes" }).click();
  await expect(shop.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  expect(await shopOf(request)).toMatchObject({ enabled: true, currency: "EUR", productsCollectionId: made.id, priceField: "price", checkout: { ready: false } });
  await expect(shop.getByText("Checkout is not set up.")).toBeVisible();
  await expect(shop.getByText(/^STRIPE_SECRET_KEY is not set where the CMS runs/)).toBeVisible();
  await expect(shop.getByText(/^To set it up, you need a Stripe account in test mode/)).toBeVisible();
  expect(await shop.textContent()).not.toMatch(/\b(?:sk|rk)_(?:test|live)_[0-9A-Za-z]/);
  const audited = await axe(page, { include: ".dlg-shop" });
  expect(audited.serious, "the Shop screen's settings").toEqual([]);

  await shop.getByRole("button", { name: /^Orders/ }).click();
  // The empty state itself: its words are also the screen's count and the
  // Orders entry's line.
  await expect(shop.locator(".shop-empty-title")).toHaveText("No orders yet");
  await expect(shop.getByText(/^An order is made when a visitor checks out from the cart/)).toBeVisible();
  await shop.getByRole("button", { name: "Close", exact: true }).click();

  // A product, published.
  const cap = await makeEntry(request, { id: made.id, prefix, templateId: made.template.id }, { title: "Swim cap", slug: "swim-cap", values: { price: 12.5, "in-stock": true } });

  // The template, given a section with a heading: after the heading,
  // Insert offers Add to cart in This entry, beside Field.
  await saveDocument(request, made.template.id, name, [section("s", "Product", [column("c", [heading("h", "Our kit")])])], { publish: false });
  await open(page, made.template.id);
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  const thisEntry = insert.getByRole("group", { name: "This entry" });
  await expect(thisEntry.getByRole("button")).toHaveText(["Field", "Add to cart"]);
  await thisEntry.getByRole("button", { name: "Field" }).click();
  await page.getByRole("complementary", { name: "Settings" }).getByRole("combobox", { name: "Field", exact: true }).selectOption({ label: "Price" });
  await thisEntry.getByRole("button", { name: "Add to cart" }).click();
  const cart = page.locator('.canvas [data-block-type="addToCart"]');
  await expect(cart.locator('form[action="/cart/items"] input[name="entry"]')).toHaveValue(String(cap.id));
  await expect(cart.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("1");
  await expect(page.locator('.canvas [data-block-type="field"]').filter({ hasText: "€12.50" })).toHaveCount(1);
  // On the canvas the form sends nothing: a click on its button selects
  // the block (whose chip bears its name too).
  await cart.locator('form button[type="submit"]').click({ force: true });
  await expect(page).toHaveURL(new RegExp(`\\?page=${made.template.id}$`));
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");

  // A visitor's page: the price as money, the product put in the cart.
  const visitor = await page.context().newPage();
  await visitor.goto(`${cms()}/${prefix}/swim-cap`);
  await expect(visitor.locator('[data-block-type="field"]').filter({ hasText: "€12.50" })).toHaveCount(1);
  await visitor.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await visitor.getByRole("button", { name: "Add to cart" }).click();
  await expect(visitor).toHaveURL(`${cms()}/cart`);
  await expect(visitor.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Swim cap"]);
  await expect(visitor.locator(".sw-cart-total")).toHaveText("Total: €25.00");
  await visitor.close();

  // The shop off: Add to cart offered no more, the one placed drawn
  // faintly, saying why; the price a number.
  await putShop(request, { enabled: false, currency: "EUR", productsCollectionId: made.id, priceField: "price" });
  await open(page, made.template.id);
  await expect(cart.locator(".field-none")).toHaveText("Add to cart: the shop is off, so it draws nothing");
  await expect(page.locator('.canvas [data-block-type="field"]').filter({ hasText: "12.5" })).toHaveCount(1);
  const again = await drawer(page, "Insert");
  await expect(again.getByRole("group", { name: "This entry" }).getByRole("button")).toHaveText(["Field"]);
});
